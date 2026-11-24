// Server-only Postgres connection. Requires a database attached to the
// Vercel project (Storage tab → Connect Database → a Postgres provider,
// e.g. Neon) — see docs/client-access-setup.md.

import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { companyKey as crmCompanyKey } from "./crm-types";
import { DEFAULT_OPTIONS, DEFAULT_TAGS, LOST_REASON_OLD_LABELS } from "./crm-catalog";
import { AUTOMATION_DEFS } from "./crm-automation-defs";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export class DbConfigError extends Error {
  constructor() {
    super(
      "No database connection string configured (DATABASE_URL / POSTGRES_URL)"
    );
    this.name = "DbConfigError";
  }
}

function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new DbConfigError();
  }

  pool = new Pool({ connectionString: withExplicitSslMode(connectionString) });
  // Lets Vercel's Fluid Compute runtime reuse/drain this pool correctly
  // across invocations instead of leaking connections per cold start.
  attachDatabasePool(pool);
  return pool;
}

/**
 * pg treats sslmode=prefer/require/verify-ca as verify-full today and warns
 * on every cold start that the next major version will switch them to the
 * weaker libpq meaning. Spelling out verify-full keeps today's behavior
 * (certificate and host checked) and silences the warning; any other mode
 * (or none) is left exactly as configured.
 */
export function withExplicitSslMode(connectionString: string): string {
  return connectionString.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/i, "$1verify-full");
}

// Bump this whenever a new statement is added below. ensureSchema() checks
// this against schema_migrations before doing anything else, so a cold
// serverless instance that finds the schema already at the current version
// pays for exactly 2 round-trips instead of the full ~30-statement sequence
// — on Vercel Hobby's 10s function timeout, running the whole sequence on
// every cold start was enough by itself to time out requests (observed in
// production as 504s on GET /analise/, no code involved past getDb()).
const SCHEMA_VERSION = 25;

/**
 * Whether this deployment may change the database structure. Vercel preview
 * deployments still share the production database (until each preview gets
 * its own Neon branch), so a preview must never migrate it: only a published
 * release does. Local runs, tests and CI have no VERCEL_ENV and migrate their
 * own database. A preview that gets its own database branch can opt in with
 * ALLOW_SCHEMA_MIGRATIONS=1.
 */
export function schemaChangesAllowed(env: Record<string, string | undefined> = process.env): boolean {
  const target = env.VERCEL_ENV;
  if (!target || target === "production") return true;
  return env.ALLOW_SCHEMA_MIGRATIONS === "1";
}

async function ensureSchema(): Promise<void> {
  const db = getPool();
  const allowed = schemaChangesAllowed();
  if (allowed) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }
  const { rows: migrationRows } = await db
    .query<{ version: number }>(`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`)
    .catch(() => ({ rows: [] as { version: number }[] }));
  const current = migrationRows[0]?.version ?? 0;
  if (current >= SCHEMA_VERSION) return;
  if (!allowed) {
    // Runs on the structure that's there; what needs the newer one fails
    // on its own instead of changing the production database from a preview.
    console.warn(
      `[db] database at schema v${current}, this code expects v${SCHEMA_VERSION}: structure changes are disabled on ${process.env.VERCEL_ENV} deployments and happen only when the release is published.`
    );
    return;
  }
  // Each block below runs only when the database is behind it, and records
  // its version as soon as it finishes. A first request after a deploy then
  // pays only for the new statements (the whole chain from v1 took >10s from
  // São Paulo to Neon and timed out until one attempt got through), and an
  // attempt cut short by the timeout resumes at the next block instead of
  // starting over. Every statement stays idempotent regardless.
  const done = (version: number) =>
    db.query(`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`, [version]);

  if (current < 5) {

    await db.query(`
      CREATE TABLE IF NOT EXISTS client_access (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        label TEXT NOT NULL,
        account_ids TEXT[] NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at TIMESTAMPTZ
      )
    `);
    // Added after the table already existed in some deployments — CREATE
    // TABLE IF NOT EXISTS above won't add it retroactively, so it's a
    // separate, idempotent statement. Defaults to "nothing hidden" (same
    // filters/columns/sections a client already saw) for every existing row.
    await db.query(`
      ALTER TABLE client_access
      ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb
    `);

    // Client logins moved from one shared password per client (on client_access
    // itself) to one or more named logins per client, each individually
    // revocable. The column above stays (harmless, unused after migration) so
    // this is non-destructive; new client_access rows no longer need a value
    // for it.
    await db.query(`ALTER TABLE client_access ALTER COLUMN password_hash DROP NOT NULL`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS client_access_users (
        id TEXT PRIMARY KEY,
        client_access_id TEXT NOT NULL REFERENCES client_access(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at TIMESTAMPTZ
      )
    `);
    // One-time backfill: every pre-existing client_access row had its own
    // password_hash directly. Carry that hash into a named user (named after
    // the client itself) so the client's existing password keeps working
    // unchanged after the split — safe to run on every boot since it only
    // touches clients that don't have a migrated user yet.
    await db.query(`
      INSERT INTO client_access_users (id, client_access_id, name, password_hash, created_at)
      SELECT ca.id || '-legacy', ca.id, ca.label, ca.password_hash, ca.created_at
      FROM client_access ca
      WHERE ca.password_hash IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM client_access_users u WHERE u.client_access_id = ca.id
        )
    `);

    // Named logins for the internal Legado team, replacing the single shared
    // ANALYTICS_DASHBOARD_PASSWORD for day-to-day use (that env var still
    // works too, as a bootstrap admin login that can't be locked out).
    await db.query(`
      CREATE TABLE IF NOT EXISTS internal_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at TIMESTAMPTZ
      )
    `);

    // Admin-authored, named filter presets for the Relatórios tab — "filters"
    // holds a ReportFilters (period, compare, and account/campaign/ad set/
    // objective/status id lists, each `null` meaning "no restriction" rather
    // than a frozen list). Not security-sensitive like a login credential, so
    // deleting one is a real DELETE rather than a soft revoke.
    await db.query(`
      CREATE TABLE IF NOT EXISTS report_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        filters JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // ---------------------------------------------------------------------
    // Username-based login (replaces e-mail/shared-password login). Every
    // account — staff or client — gets a username, unique across the WHOLE
    // platform, not just within its own table. Two tables can't share a
    // single UNIQUE constraint in Postgres, so `usernames` is a thin registry
    // table whose PRIMARY KEY is the actual source of truth for global
    // uniqueness; the `username` column on each account table is a
    // denormalized copy kept in sync (and still individually indexed, for
    // fast case-insensitive login lookups without a join). Every write that
    // touches both goes through withTransaction() so they can never drift.
    // ---------------------------------------------------------------------
    await db.query(`
      CREATE TABLE IF NOT EXISTS usernames (
        username_lower TEXT PRIMARY KEY,
        owner_table TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS username TEXT`);
    await db.query(`ALTER TABLE internal_users ALTER COLUMN email DROP NOT NULL`);
    // The original bare UNIQUE constraint (email NOT NULL UNIQUE) is now too
    // strict since e-mail is optional — replaced with a partial unique index
    // that only applies when an e-mail is actually present.
    await db.query(`ALTER TABLE internal_users DROP CONSTRAINT IF EXISTS internal_users_email_key`);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS internal_users_email_unique_idx
      ON internal_users (lower(email)) WHERE email IS NOT NULL
    `);
    // Role taxonomy expanded from {admin, analyst} to 4 fixed profiles —
    // remapped below so every existing row keeps equivalent access
    // (old "admin" had full access including managing other users, which is
    // exactly what "administrador_geral" means now).
    await db.query(`UPDATE internal_users SET role = 'administrador_geral' WHERE role = 'admin'`);
    await db.query(`UPDATE internal_users SET role = 'analista' WHERE role = 'analyst'`);
    // Companies (Meta ad account ids) this staff member may access — same
    // representation client_access already uses for the same purpose, so
    // every data-scoping code path that already understands "a list of
    // allowed Meta account ids" needs no new logic to also understand staff
    // scoping. Ignored entirely for role = administrador_geral (always sees
    // every account, same as the old unconditional admin behavior).
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS account_ids TEXT[] NOT NULL DEFAULT '{}'`);
    // Same shape as client_access.permissions (hiddenFilters/hiddenColumns/
    // hiddenSections/disabledActions) — staff below administrador_geral can
    // now be restricted the same way a client can.
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb`);
    // Bumped on every password reset/change and on revoke — embedded in the
    // signed session token at login time; a mismatch against the current DB
    // value means the token was issued before a reset/revoke and is rejected
    // immediately, without waiting for its 12h expiry.
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1`);
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false`);
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT`);
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false`);
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS totp_recovery_hashes TEXT[] NOT NULL DEFAULT '{}'`);

    await db.query(`ALTER TABLE client_access_users ADD COLUMN IF NOT EXISTS username TEXT`);
    await db.query(`ALTER TABLE client_access_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1`);
    await db.query(`ALTER TABLE client_access_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false`);
    // NULL = inherit the parent company's permissions (client_access.permissions,
    // the common case); set = this person's own override, entirely replacing
    // the company's permissions for them specifically.
    await db.query(`ALTER TABLE client_access_users ADD COLUMN IF NOT EXISTS permissions_override JSONB`);

    await migrateUsernamesAndRoles(db);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS internal_users_username_unique_idx ON internal_users (lower(username))
    `);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS client_access_users_username_unique_idx ON client_access_users (lower(username))
    `);
    await db.query(`ALTER TABLE internal_users ALTER COLUMN username SET NOT NULL`);
    await db.query(`ALTER TABLE client_access_users ALTER COLUMN username SET NOT NULL`);

    // Append-only trail for every access-management action (user create,
    // permission/role/company change, password reset, revoke, session
    // termination, report generation/download, 2FA events). Never holds
    // passwords, tokens or TOTP secrets — see audit-log.ts.
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        actor_label TEXT NOT NULL,
        actor_kind TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        target_label TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC)`);

    // Optional per-client consultant contact for the "Falar com meu
    // consultor" WhatsApp button — null means fall back to the Legado's own
    // general number (see consultant-whatsapp.ts).
    await db.query(`ALTER TABLE client_access ADD COLUMN IF NOT EXISTS consultant_name TEXT`);
    await db.query(`ALTER TABLE client_access ADD COLUMN IF NOT EXISTS consultant_whatsapp TEXT`);

    // Monthly media budget per client (Visão geral's "Orçamento do mês"
    // card) — one row per client/month, upserted from the admin panel.
    await db.query(`
      CREATE TABLE IF NOT EXISTS client_budgets (
        client_access_id TEXT NOT NULL REFERENCES client_access (id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        amount NUMERIC NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (client_access_id, year, month)
      )
    `);

    // Global, admin_geral-only flag: which report indicator ids are "uso
    // interno" (never auto-checked for anyone, and only an admin with
    // canIncludeInternalIndicators can check them at all) — presence of a row
    // IS the flag, there is no boolean column. Starts empty (nothing flagged)
    // until an administrador_geral marks something via the admin screen.
    await db.query(`
      CREATE TABLE IF NOT EXISTS report_internal_indicators (
        indicator_id TEXT PRIMARY KEY
      )
    `);

    // "Lembrar esta seleção para este cliente" — one remembered report
    // type+indicator selection per client, shared by the whole team (never
    // per-person). Only ever written for a report resolved to exactly ONE
    // client; a multi-client/consolidated export has nothing to key this on
    // and relies on "Salvar como modelo" instead.
    await db.query(`
      CREATE TABLE IF NOT EXISTS report_client_selections (
        client_access_id TEXT PRIMARY KEY REFERENCES client_access (id) ON DELETE CASCADE,
        report_type TEXT NOT NULL,
        indicators JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_label TEXT NOT NULL
      )
    `);

    // A template now also carries the report type + indicator selection
    // chosen when it was saved (not just filters) — NULL indicators means a
    // template saved before this existed, which keeps resolving to the
    // viewer's own default selection, exactly as before this column existed.
    await db.query(`ALTER TABLE report_templates ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'tecnico'`);
    await db.query(`ALTER TABLE report_templates ADD COLUMN IF NOT EXISTS indicators JSONB`);

    // CRM de prospecção (área /crm) — one row per WhatsApp contact. `phone` is
    // digits only with country code, the same shape WhatsApp's own wa_id uses.
    // The last_* / unread_count columns are denormalized from crm_messages so
    // the Kanban board loads with one query instead of aggregating messages.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_contacts (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        company TEXT,
        source TEXT NOT NULL DEFAULT 'outro',
        referred_by TEXT,
        consent_source TEXT,
        stage TEXT NOT NULL DEFAULT 'novo',
        owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        next_action TEXT,
        next_action_at TIMESTAMPTZ,
        ad_referral JSONB,
        last_message_at TIMESTAMPTZ,
        last_message_preview TEXT,
        last_inbound_at TIMESTAMPTZ,
        unread_count INTEGER NOT NULL DEFAULT 0,
        stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_messages (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE,
        wa_message_id TEXT UNIQUE,
        direction TEXT NOT NULL,
        type TEXT NOT NULL,
        body TEXT,
        media_id TEXT,
        media_mime TEXT,
        template_name TEXT,
        status TEXT,
        error TEXT,
        sent_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- Arrival order: WhatsApp timestamps are whole seconds and leads often
        -- send several messages in the same second.
        seq BIGSERIAL
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_messages_contact_idx ON crm_messages (contact_id, created_at, seq)`);
    // Timeline of everything that happened to a contact besides messages
    // (created, stage/owner/next-action changes, notes). user_name is kept
    // alongside user_id so history still reads right after a user is removed.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_events (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        user_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        user_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- Events written in one transaction share now(); seq keeps their order.
        seq BIGSERIAL
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_events_contact_idx ON crm_events (contact_id, created_at, seq)`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_quick_replies (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // v5 — CRM fase 1: empresas, campos do lead, consentimento, descadastro,
    // arquivamento e importação de planilhas. Additive only: no column is
    // dropped and the legacy crm_contacts.company text stays as it was.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_imports (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_by_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        row_count INTEGER NOT NULL DEFAULT 0,
        created_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        undone_at TIMESTAMPTZ,
        undone_by_name TEXT
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        -- companyKey(name): accents/case/punctuation/legal suffix ignored
        name_key TEXT NOT NULL UNIQUE,
        segment TEXT,
        city TEXT,
        website TEXT,
        notes TEXT,
        import_id TEXT REFERENCES crm_imports (id) ON DELETE SET NULL,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES crm_companies (id) ON DELETE SET NULL`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS email TEXT`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS job_title TEXT`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS segment TEXT`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS city TEXT`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS consent_status TEXT NOT NULL DEFAULT 'nao_informado'`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS import_id TEXT REFERENCES crm_imports (id) ON DELETE SET NULL`);
    // A lead may now arrive with only an e-mail (spreadsheets, events).
    await db.query(`ALTER TABLE crm_contacts ALTER COLUMN phone DROP NOT NULL`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_email_key ON crm_contacts (lower(email)) WHERE email IS NOT NULL`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_contacts_company_idx ON crm_contacts (company_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_contacts_import_idx ON crm_contacts (import_id) WHERE import_id IS NOT NULL`);
    // Backfill 1: whoever already had "como aceitou ser contatado" filled in
    // agreed to be contacted. Idempotent (only touches untouched rows).
    await db.query(
      `UPDATE crm_contacts SET consent_status = 'sim', consent_at = created_at
       WHERE consent_source IS NOT NULL AND consent_status = 'nao_informado' AND consent_at IS NULL`
    );
    // Backfill 1b: leads that wrote to the number first (history says the
    // contact was created by an inbound WhatsApp message or ad) — same rule as
    // new inbound leads in recordInbound.
    await db.query(
      `UPDATE crm_contacts c
       SET consent_status = 'sim', consent_source = 'Iniciou a conversa pelo WhatsApp', consent_at = c.created_at
       WHERE c.consent_status = 'nao_informado' AND c.consent_at IS NULL AND c.consent_source IS NULL
         AND EXISTS (
           SELECT 1 FROM crm_events e
           WHERE e.contact_id = c.id AND e.kind = 'created' AND e.payload->>'via' IN ('whatsapp', 'anuncio')
         )`
    );
    // Backfill 2: every company name typed so far becomes a company record,
    // spellings of the same name collapsing into one (companyKey). The text
    // column itself is left untouched. Idempotent: ON CONFLICT + company_id IS NULL.
    const legacy = await db.query<{ id: string; company: string }>(
      `SELECT id, company FROM crm_contacts WHERE company_id IS NULL AND company IS NOT NULL AND btrim(company) <> '' ORDER BY created_at`
    );
    for (const row of legacy.rows) {
      const name = row.company.trim().replace(/\s+/g, " ");
      const key = crmCompanyKey(name);
      if (!key) continue;
      await db.query(
        `INSERT INTO crm_companies (id, name, name_key) VALUES ($1, $2, $3) ON CONFLICT (name_key) DO NOTHING`,
        [randomUUID(), name, key]
      );
      await db.query(
        `UPDATE crm_contacts SET company_id = (SELECT id FROM crm_companies WHERE name_key = $2) WHERE id = $1 AND company_id IS NULL`,
        [row.id, key]
      );
    }

    await done(5);
  }

  if (current < 6) {
    // v6 — CRM fase 2: oportunidades (negócios com valor) e tarefas. The funnel
    // moves from contacts to opportunities; every contact gets one carrying its
    // current stage/owner, and every "próxima ação" becomes a task. The legacy
    // contact columns (stage, next_action, next_action_at) stay; contact.stage
    // is kept in sync with the contact's main opportunity from here on.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_deals (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        value_cents BIGINT,
        stage TEXT NOT NULL DEFAULT 'novo',
        owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        expected_close_at TIMESTAMPTZ,
        lost_reason TEXT,
        lost_note TEXT,
        stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        closed_at TIMESTAMPTZ,
        import_id TEXT REFERENCES crm_imports (id) ON DELETE SET NULL,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_deals_contact_idx ON crm_deals (contact_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_deals_stage_idx ON crm_deals (stage, closed_at)`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_tasks (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE,
        deal_id TEXT REFERENCES crm_deals (id) ON DELETE SET NULL,
        kind TEXT NOT NULL DEFAULT 'tarefa',
        title TEXT NOT NULL,
        due_at TIMESTAMPTZ,
        -- true = a day without a set time ("dia todo")
        all_day BOOLEAN NOT NULL DEFAULT true,
        owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        done_at TIMESTAMPTZ,
        done_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        done_by_name TEXT,
        result TEXT,
        canceled_at TIMESTAMPTZ,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_tasks_pending_idx ON crm_tasks (due_at) WHERE done_at IS NULL AND canceled_at IS NULL`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_tasks_contact_idx ON crm_tasks (contact_id)`);
    // Backfill 1: one opportunity per contact that has none yet (idempotent:
    // a contact that already has an opportunity is skipped).
    await db.query(
      `INSERT INTO crm_deals (id, contact_id, title, stage, owner_id, stage_changed_at, closed_at, import_id, created_at, updated_at)
       SELECT 'mig-' || c.id, c.id, COALESCE(co.name, c.company, c.name), c.stage, c.owner_id, c.stage_changed_at,
              CASE WHEN c.stage IN ('ganho', 'perdido') THEN c.stage_changed_at END, c.import_id, c.created_at, c.updated_at
       FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id
       WHERE NOT EXISTS (SELECT 1 FROM crm_deals d WHERE d.contact_id = c.id)
       ON CONFLICT (id) DO NOTHING`
    );
    // Backfill 2: each "próxima ação" becomes a pending task on that
    // opportunity (fixed id, so a rerun never duplicates it).
    await db.query(
      `INSERT INTO crm_tasks (id, contact_id, deal_id, kind, title, due_at, all_day, owner_id, created_by_name, created_at, updated_at)
       SELECT 'mig-' || c.id, c.id,
              (SELECT d.id FROM crm_deals d WHERE d.contact_id = c.id ORDER BY d.created_at LIMIT 1),
              'tarefa', COALESCE(c.next_action, 'Próxima ação'), c.next_action_at, true, c.owner_id, 'Migração', c.updated_at, c.updated_at
       FROM crm_contacts c
       WHERE c.next_action IS NOT NULL OR c.next_action_at IS NOT NULL
       ON CONFLICT (id) DO NOTHING`
    );

    await done(6);
  }

  if (current < 7) {
    // v7 — CRM profiles (Fase 3): each staff member's access to the CRM,
    // separate from the Intelligence role. Backfilled once from that role
    // (administrador_geral/administrador → administrador, gestor → gestor,
    // analista → comercial); only rows never set are touched, so a rerun
    // keeps whatever an administrator chose since. See crm-permissions.ts.
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS crm_role TEXT`);
    await db.query(
      `UPDATE internal_users SET crm_role = CASE role
         WHEN 'administrador_geral' THEN 'administrador'
         WHEN 'administrador' THEN 'administrador'
         WHEN 'gestor' THEN 'gestor'
         ELSE 'comercial' END
       WHERE crm_role IS NULL`
    );

    await done(7);
  }

  if (current < 8) {
    // v8 — Campanhas (Fase 5): a campaign is one approved WhatsApp template
    // sent to a filtered audience. Recipients are frozen when sending starts
    // (one row per contact, so nobody gets the same campaign twice) and each
    // sent message points back to its campaign. Only adds; nothing existing
    // changes. See crm-campaigns.ts.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'rascunho',
        template_name TEXT,
        template_language TEXT,
        template_body TEXT,
        params JSONB NOT NULL DEFAULT '[]'::jsonb,
        audience JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_by_name TEXT,
        started_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        -- Why sending stopped on its own (e.g. Meta's rate limit), shown on the screen.
        pause_reason TEXT
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_campaign_recipients (
        campaign_id TEXT NOT NULL REFERENCES crm_campaigns (id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pendente',
        skip_reason TEXT,
        wa_message_id TEXT,
        error TEXT,
        claimed_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        PRIMARY KEY (campaign_id, contact_id)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_campaign_recipients_status_idx ON crm_campaign_recipients (campaign_id, status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_campaign_recipients_contact_idx ON crm_campaign_recipients (contact_id)`);
    await db.query(`ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES crm_campaigns (id) ON DELETE SET NULL`);

    await done(8);
  }

  if (current < 9) {
    // v9 — Personalização do CRM (especificação v1.0, Fase 1): the lists that
    // lived in code (origens, motivos de perda, tipos de tarefa) move to the
    // database with the same codes, so every existing record keeps its
    // value; new lists (segmentos, serviços, motivos de ganho) and tags join
    // them. Nothing is deleted: an option or tag is archived, never removed.
    // Seeds come from crm-catalog.ts (DEFAULT_OPTIONS, DEFAULT_TAGS), inserted once.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_options (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        sort INTEGER NOT NULL DEFAULT 0,
        -- A fallback the code relies on (e.g. source "outro"): can't be archived.
        locked BOOLEAN NOT NULL DEFAULT false,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (kind, id)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_tags (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        color TEXT NOT NULL DEFAULT 'cinza',
        sort INTEGER NOT NULL DEFAULT 0,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_tags_label_key ON crm_tags (category, lower(label))`);
    // Which contact has which tag, who applied it and how (manual, importação,
    // campanha, automação). A tag is never deleted, so no cascade from it.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_contact_tags (
        contact_id TEXT NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES crm_tags (id),
        applied_via TEXT NOT NULL DEFAULT 'manual',
        applied_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        applied_by_name TEXT,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (contact_id, tag_id)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_contact_tags_tag_idx ON crm_contact_tags (tag_id)`);

    for (const [kind, list] of Object.entries(DEFAULT_OPTIONS)) {
      for (const [i, o] of list.entries()) {
        await db.query(
          `INSERT INTO crm_options (kind, id, label, sort, locked) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (kind, id) DO NOTHING`,
          [kind, o.id, o.label, i, o.locked ?? false]
        );
      }
    }
    // Segments were free text: the ones already in use become the list.
    await db.query(
      `INSERT INTO crm_options (kind, id, label, sort)
       SELECT 'segment', 'seg-' || md5(lower(s)), s, (row_number() OVER (ORDER BY lower(s)))::int
       FROM (SELECT DISTINCT btrim(segment) AS s FROM crm_companies WHERE btrim(COALESCE(segment, '')) <> ''
             UNION SELECT DISTINCT btrim(segment) FROM crm_contacts WHERE btrim(COALESCE(segment, '')) <> '') x
       ON CONFLICT (kind, id) DO NOTHING`
    );
    for (const [i, t] of DEFAULT_TAGS.entries()) {
      await db.query(
        `INSERT INTO crm_tags (id, category, label, color, sort) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [t.id, t.category, t.label, t.color, i]
      );
    }

    await done(9);
  }

  if (current < 10) {
    // v10 — Fase 1, entrega 2 (especificação v1.0): the fields the spec adds
    // to contacts, companies and opportunities. Only columns and one table are
    // added; every new column is optional, so existing rows stay valid as
    // they are. The only backfill copies each opportunity's origin from its
    // contact (that is where the origin lived until now).
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS temperature TEXT`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS service_interest TEXT`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS return_at DATE`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS is_decision_maker BOOLEAN NOT NULL DEFAULT false`);

    await db.query(`ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS legal_name TEXT`);
    // 14 characters, no punctuation, upper case (the alphanumeric CNPJ from
    // July 2026 included). One company per CNPJ; companies without one are
    // still matched by name.
    await db.query(`ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS cnpj TEXT`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_cnpj_key ON crm_companies (cnpj) WHERE cnpj IS NOT NULL`);
    await db.query(`ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS state TEXT`);
    await db.query(`ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS address TEXT`);
    await db.query(`ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL`);
    // Situação comercial (prospeccao, negociacao, cliente_ativo, ex_cliente, inativa); null = not set yet.
    await db.query(`ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS status TEXT`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_company_tags (
        company_id TEXT NOT NULL REFERENCES crm_companies (id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES crm_tags (id),
        applied_via TEXT NOT NULL DEFAULT 'manual',
        applied_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        applied_by_name TEXT,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (company_id, tag_id)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_company_tags_tag_idx ON crm_company_tags (tag_id)`);

    await db.query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS service TEXT`);
    await db.query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS negotiated_cents BIGINT`);
    await db.query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS source TEXT`);
    await db.query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS temperature TEXT`);
    await db.query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS won_reason TEXT`);
    await db.query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS won_note TEXT`);
    await db.query(
      `UPDATE crm_deals d SET source = c.source FROM crm_contacts c WHERE c.id = d.contact_id AND d.source IS NULL`
    );

    await done(10);
  }

  if (current < 11) {
    // v11 — Fase 2, entrega 1 (especificação v1.0): equipe. Each person's
    // individual permission exceptions on top of their CRM profile, plus
    // cargo and departamento. Only columns are added; everyone starts with
    // no exceptions, so every profile keeps exactly what it could do before.
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS crm_permissions JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS crm_job_title TEXT`);
    // A crm_options id of kind "department" (Personalização → Departamentos).
    await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS crm_department TEXT`);
    for (const [i, o] of DEFAULT_OPTIONS.department.entries()) {
      await db.query(
        `INSERT INTO crm_options (kind, id, label, sort, locked) VALUES ('department', $1, $2, $3, $4) ON CONFLICT (kind, id) DO NOTHING`,
        [o.id, o.label, i, o.locked ?? false]
      );
    }

    await done(11);
  }

  if (current < 12) {
    // v12 — Fase 2, entrega 2: the Auditoria screen and each person's
    // activity read the history across all contacts, newest first, and by
    // who did it. Indexes only.
    await db.query(`CREATE INDEX IF NOT EXISTS crm_events_created_idx ON crm_events (created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_events_user_idx ON crm_events (user_id, created_at DESC)`);

    await done(12);
  }

  if (current < 13) {
    // v13 — Fase 3, entrega 1 (especificação v1.0): tarefas e agenda. Only
    // additions: existing tasks keep everything they have and get status
    // from done_at / canceled_at. A task may now have no contact (linked to
    // a company only, or an internal activity), so contact_id loses NOT NULL.
    await db.query(`ALTER TABLE crm_options ADD COLUMN IF NOT EXISTS color TEXT`);
    await db.query(`ALTER TABLE crm_tasks ALTER COLUMN contact_id DROP NOT NULL`);
    await db.query(`ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES crm_companies (id) ON DELETE SET NULL`);
    await db.query(`ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS description TEXT`);
    // A crm_options id of kind "priority" (Personalização → Prioridades).
    await db.query(`ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'media'`);
    // pendente | em_andamento | concluida | cancelada (done_at / canceled_at keep the when and who).
    await db.query(`ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente'`);
    // In-app reminder: minutes before the task (all-day tasks: before 08:00 that day), the instant, and when its owner dismissed it.
    await db.query(`ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS remind_minutes INTEGER`);
    await db.query(`ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ`);
    await db.query(`ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS reminder_dismissed_at TIMESTAMPTZ`);
    await db.query(
      `UPDATE crm_tasks SET status = CASE WHEN canceled_at IS NOT NULL THEN 'cancelada' ELSE 'concluida' END
       WHERE status = 'pendente' AND (canceled_at IS NOT NULL OR done_at IS NOT NULL)`
    );
    await db.query(`CREATE INDEX IF NOT EXISTS crm_tasks_company_idx ON crm_tasks (company_id) WHERE company_id IS NOT NULL`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_tasks_owner_due_idx ON crm_tasks (owner_id, due_at)`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS crm_tasks_remind_idx ON crm_tasks (owner_id, remind_at)
       WHERE remind_at IS NOT NULL AND reminder_dismissed_at IS NULL AND done_at IS NULL AND canceled_at IS NULL`
    );
    // Each task's own history (who created, edited, rescheduled, started, finished it).
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_task_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES crm_tasks (id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        user_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        user_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_task_events_task_idx ON crm_task_events (task_id, created_at)`);
    // The spec's task types and the priorities join the lists (after what is
    // already there, so the current order stays); every type gets a color.
    for (const kind of ["task_kind", "priority"] as const) {
      for (const o of DEFAULT_OPTIONS[kind]) {
        await db.query(
          `INSERT INTO crm_options (kind, id, label, locked, color, sort)
           VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(max(sort), -1) + 1 FROM crm_options WHERE kind = $1))
           ON CONFLICT (kind, id) DO UPDATE SET color = COALESCE(crm_options.color, EXCLUDED.color)`,
          [kind, o.id, o.label, o.locked ?? false, o.color ?? null]
        );
      }
    }

    await done(13);
  }

  if (current < 14) {
    // v14 — Fase 3, entrega 2 (especificação v1.0): automações. New tables
    // only. Every automation starts "desativada": nothing changes for the
    // team until an Administrador turns one on. Automations never send
    // messages — they create tasks, reminders, history lines and notices.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_automations (
        id TEXT PRIMARY KEY,
        -- ativa | pausada | desativada
        status TEXT NOT NULL DEFAULT 'desativada',
        -- The template's adjustable parameters (prazo, responsável, tipo de tarefa...); defaults live in code.
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_run_at TIMESTAMPTZ,
        last_run_summary JSONB,
        updated_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        updated_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // One line per execution. (automation, dedupe_key) is unique, so the same
    // lead / opportunity / task is never handled twice by the same rule; a
    // failure gets its own key, so it can be tried again.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_automation_runs (
        id TEXT PRIMARY KEY,
        automation_id TEXT NOT NULL REFERENCES crm_automations (id),
        dedupe_key TEXT NOT NULL,
        -- ok | ignorada | falha
        status TEXT NOT NULL,
        detail TEXT,
        contact_id TEXT REFERENCES crm_contacts (id) ON DELETE SET NULL,
        deal_id TEXT REFERENCES crm_deals (id) ON DELETE SET NULL,
        task_id TEXT REFERENCES crm_tasks (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (automation_id, dedupe_key)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_automation_runs_created_idx ON crm_automation_runs (created_at DESC)`);
    // Notices in the bell (lead atribuído, alerta, interesse em campanha).
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES internal_users (id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        contact_id TEXT REFERENCES crm_contacts (id) ON DELETE CASCADE,
        automation_id TEXT REFERENCES crm_automations (id),
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_notifications_unread_idx ON crm_notifications (user_id, created_at DESC) WHERE read_at IS NULL`);
    for (const a of AUTOMATION_DEFS) {
      await db.query(`INSERT INTO crm_automations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [a.id]);
    }

    await done(14);
  }

  if (current < 15) {
    // v15 — Fase 4, entrega 1 (especificação v1.0): conversas. Who is
    // answering a conversation right now (atendimento — not the same as the
    // lead's owner) and since when; the "Atendimento" tags. Only additions:
    // no conversation starts with someone attending it.
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS attendant_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL`);
    await db.query(`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS attendant_since TIMESTAMPTZ`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_contacts_attendant_idx ON crm_contacts (attendant_id) WHERE attendant_id IS NOT NULL`);
    // Response times read messages by period.
    await db.query(`CREATE INDEX IF NOT EXISTS crm_messages_created_idx ON crm_messages (created_at)`);
    for (const [i, t] of DEFAULT_TAGS.filter((t) => t.category === "atendimento").entries()) {
      await db.query(
        `INSERT INTO crm_tags (id, category, label, color, sort) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [t.id, t.category, t.label, t.color, i]
      );
    }

    await done(15);
  }

  if (current < 16) {
    // v16 — Fase 4, entrega 2 (especificação v1.0): públicos salvos de
    // campanha (the filters, under a name). A new table only; the sign-up
    // period and the contacts taken out by hand live in each campaign's
    // audience (JSONB), which needs no change.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_campaign_audiences (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        -- accent/case-insensitive name: saving the same name again replaces the filters
        name_key TEXT NOT NULL UNIQUE,
        audience JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await done(16);
  }

  if (current < 17) {
    // v17 — Fase 5, entrega 1 (especificação v1.0): clientes ativos. New
    // tables only, all empty: nobody becomes a client until someone says so
    // (no backfill from won opportunities or from companies marked "Cliente
    // ativo").
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_clients (
        id TEXT PRIMARY KEY,
        -- one client per company
        company_id TEXT NOT NULL UNIQUE REFERENCES crm_companies (id),
        owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        -- onboarding | ativo | pausado | encerrado
        status TEXT NOT NULL DEFAULT 'onboarding',
        started_on DATE,
        ended_on DATE,
        end_reason TEXT,
        notes TEXT,
        -- the won opportunity it came from, if any
        deal_id TEXT REFERENCES crm_deals (id) ON DELETE SET NULL,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_clients_owner_idx ON crm_clients (owner_id)`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_contracts (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES crm_clients (id) ON DELETE CASCADE,
        -- ids from Personalização → Serviços (crm_options kind 'service')
        services TEXT[] NOT NULL DEFAULT '{}',
        starts_on DATE NOT NULL,
        -- NULL = sem prazo
        ends_on DATE,
        value_cents BIGINT,
        -- mensal | unico
        billing TEXT NOT NULL DEFAULT 'mensal',
        -- vigente | encerrado | cancelado
        status TEXT NOT NULL DEFAULT 'vigente',
        notes TEXT,
        deal_id TEXT REFERENCES crm_deals (id) ON DELETE SET NULL,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_contracts_client_idx ON crm_contracts (client_id)`);
    // A won opportunity becomes at most one contract, even with two clicks at once.
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_contracts_deal_key ON crm_contracts (deal_id) WHERE deal_id IS NOT NULL`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_client_events (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES crm_clients (id) ON DELETE CASCADE,
        -- created | edited | status | contract_added | contract_edited | note
        kind TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        user_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        user_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_client_events_client_idx ON crm_client_events (client_id, created_at DESC)`);

    await done(17);
  }

  if (current < 18) {
    // v18 — Fase 5, entrega 2 (especificação v1.0): acompanhamento mensal dos
    // clientes ativos (one per client per month) and notices in the bell that
    // open a client (contract near its end). New table + one nullable column.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_client_reports (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES crm_clients (id) ON DELETE CASCADE,
        -- first day of the reference month
        month DATE NOT NULL,
        -- serviços realizados (ids from Personalização → Serviços)
        services TEXT[] NOT NULL DEFAULT '{}',
        activities TEXT,
        results TEXT,
        attention TEXT,
        next_actions TEXT,
        -- responsável pelo acompanhamento
        owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        updated_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        updated_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (client_id, month)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_client_reports_month_idx ON crm_client_reports (month)`);
    await db.query(`ALTER TABLE crm_notifications ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES crm_clients (id) ON DELETE CASCADE`);

    await done(18);
  }

  if (current < 19) {
    // v19 — Fase 6, entrega 2 (especificação v1.0): metas mensais da equipe e
    // de cada pessoa. One number per month, person (NULL = a equipe) and
    // indicator; what was achieved is never stored, it is counted with the
    // Painel's own definitions. New table only.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_goals (
        id TEXT PRIMARY KEY,
        -- first day of the month
        month DATE NOT NULL,
        -- NULL = the whole team
        user_id TEXT REFERENCES internal_users (id) ON DELETE CASCADE,
        -- leads | meetings | proposals | won | wonValue
        metric TEXT NOT NULL,
        -- a count, or centavos for wonValue
        target BIGINT NOT NULL CHECK (target >= 0),
        updated_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        updated_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_goals_one_idx ON crm_goals (month, (COALESCE(user_id, '')), metric)`);

    await done(19);
  }

  if (current < 20) {
    // v20 — Fase 7, entrega 1 (especificação v1.0): clientes ativos ligados
    // ao Legado Intelligence (client_access) e o histórico de cada
    // sincronização dos indicadores de mídia. The Intelligence stays the
    // official source; nothing here is ever overwritten — each sync is a new
    // row. New column + new table only.
    await db.query(`ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS client_access_id TEXT REFERENCES client_access (id) ON DELETE SET NULL`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_clients_client_access_idx ON crm_clients (client_access_id) WHERE client_access_id IS NOT NULL`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_media_syncs (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES crm_clients (id) ON DELETE CASCADE,
        -- the Intelligence client it came from, at the time
        client_access_id TEXT REFERENCES client_access (id) ON DELETE SET NULL,
        client_access_label TEXT NOT NULL,
        -- first day of the reference month, and the days actually covered
        month DATE NOT NULL,
        period_from DATE NOT NULL,
        period_to DATE NOT NULL,
        -- meta_ads = Meta Marketing API, read the same way the Intelligence does
        source TEXT NOT NULL,
        account_ids TEXT[] NOT NULL,
        -- accounts that couldn't be read this time (the numbers leave them out)
        missing_accounts TEXT[] NOT NULL DEFAULT '{}',
        totals JSONB NOT NULL,
        campaigns JSONB NOT NULL,
        synced_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        synced_by_name TEXT,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_media_syncs_client_idx ON crm_media_syncs (client_id, month, synced_at DESC)`);

    await done(20);
  }

  if (current < 21) {
    // v21 — Evolução v1.0 (funil e tabulação): the funnel's stages become a
    // list in Personalização (10 stages; the six old codes are kept and only
    // renamed, so no opportunity or history row is rewritten), each option
    // may carry attributes (meta: a stage's probability, a reason's group),
    // and closing an opportunity records its tabulação. New column values
    // only describe what was already there.
    await db.query(`ALTER TABLE crm_options ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb`);
    for (const [i, o] of DEFAULT_OPTIONS.stage.entries()) {
      await db.query(
        `INSERT INTO crm_options (kind, id, label, sort, locked, color, meta) VALUES ('stage', $1, $2, $3, $4, $5, $6)
         ON CONFLICT (kind, id) DO UPDATE SET sort = EXCLUDED.sort, locked = EXCLUDED.locked, meta = EXCLUDED.meta, color = COALESCE(crm_options.color, EXCLUDED.color)`,
        [o.id, o.label, i, o.locked ?? false, o.color ?? null, JSON.stringify(o.meta ?? {})]
      );
    }
    for (const o of DEFAULT_OPTIONS.lost_reason) {
      await db.query(
        `INSERT INTO crm_options (kind, id, label, locked, meta, sort)
         VALUES ('lost_reason', $1, $2, $3, $4, (SELECT COALESCE(max(sort), -1) + 1 FROM crm_options WHERE kind = 'lost_reason'))
         ON CONFLICT (kind, id) DO UPDATE SET meta = EXCLUDED.meta,
           label = CASE WHEN crm_options.label = $5 THEN EXCLUDED.label ELSE crm_options.label END`,
        [o.id, o.label, o.locked ?? false, JSON.stringify(o.meta ?? {}), LOST_REASON_OLD_LABELS[o.id] ?? o.label]
      );
    }
    // Reasons the team created themselves count as a commercial loss.
    await db.query(`UPDATE crm_options SET meta = meta || '{"group": "negativo"}'::jsonb WHERE kind = 'lost_reason' AND NOT (meta ? 'group')`);
    await db.query(`
      ALTER TABLE crm_deals
        ADD COLUMN IF NOT EXISTS probability SMALLINT CHECK (probability BETWEEN 0 AND 100),
        ADD COLUMN IF NOT EXISTS won_result TEXT,
        ADD COLUMN IF NOT EXISTS close_group TEXT,
        ADD COLUMN IF NOT EXISTS closed_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS closed_by_name TEXT,
        ADD COLUMN IF NOT EXISTS return_on DATE
    `);
    // Closed opportunities get the group their reason now belongs to.
    await db.query(`UPDATE crm_deals SET close_group = 'positivo' WHERE stage = 'ganho' AND close_group IS NULL`);
    await db.query(
      `UPDATE crm_deals d SET close_group = COALESCE((SELECT o.meta->>'group' FROM crm_options o WHERE o.kind = 'lost_reason' AND o.id = d.lost_reason), 'negativo')
       WHERE d.stage = 'perdido' AND d.close_group IS NULL`
    );
    await db.query(`CREATE INDEX IF NOT EXISTS crm_deals_close_idx ON crm_deals (close_group, closed_at)`);

    await done(21);
  }

  if (current < 22) {
    // v22 — Evolução v1.0 (responsabilidades): a Comercial sees every lead but
    // works only on their own; taking someone else's lead (or handing one's
    // own to a colleague) is a request a Gestor approves or refuses. New
    // table only: who asked, from whom to whom, why, who decided, when.
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_transfer_requests (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE,
        from_owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        from_owner_name TEXT,
        to_owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        to_owner_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'recusada', 'cancelada')),
        requested_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        requested_by_name TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        decided_by_name TEXT,
        decided_at TIMESTAMPTZ,
        decision_note TEXT
      )
    `);
    // One open request per lead at a time.
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_transfer_requests_pending_idx ON crm_transfer_requests (contact_id) WHERE status = 'pendente'`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_transfer_requests_status_idx ON crm_transfer_requests (status, requested_at DESC)`);
    await done(22);
  }

  if (current < 23) {
    // v23 — Evolução v1.0 (cadastros, item 2): more of what the spec asks a
    // lead and a company to carry, the diagnóstico comercial (every save is a
    // new version, the old ones stay) and documents attached to the records
    // (kept in the database, up to 4 MB each). New columns are empty and new
    // tables start empty: nothing existing is rewritten.
    await db.query(`
      ALTER TABLE crm_contacts
        ADD COLUMN IF NOT EXISTS alt_phone TEXT,
        ADD COLUMN IF NOT EXISTS potential TEXT CHECK (potential IN ('alto', 'medio', 'baixo')),
        ADD COLUMN IF NOT EXISTS need TEXT
    `);
    await db.query(`ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS phone TEXT, ADD COLUMN IF NOT EXISTS email TEXT`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_diagnostics (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE,
        deal_id TEXT REFERENCES crm_deals (id) ON DELETE SET NULL,
        version INTEGER NOT NULL,
        data JSONB NOT NULL,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (contact_id, version)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_files (
        id TEXT PRIMARY KEY,
        contact_id TEXT REFERENCES crm_contacts (id) ON DELETE CASCADE,
        company_id TEXT REFERENCES crm_companies (id) ON DELETE CASCADE,
        deal_id TEXT REFERENCES crm_deals (id) ON DELETE SET NULL,
        client_id TEXT REFERENCES crm_clients (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 4194304),
        sha256 TEXT NOT NULL,
        content BYTEA NOT NULL,
        uploaded_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        uploaded_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        archived_at TIMESTAMPTZ,
        archived_by_name TEXT,
        CHECK (num_nonnulls(contact_id, company_id, client_id) = 1)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_files_contact_idx ON crm_files (contact_id, created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_files_company_idx ON crm_files (company_id, created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_files_client_idx ON crm_files (client_id, created_at DESC)`);
    await done(23);
  }

  if (current < 24) {
    // v24 — Evolução v1.0 (propostas, item 3): proposals with a sequential
    // number, their versions (a sent version is never changed: editing makes
    // the next one), the timeline (sent, viewed, link, PDF, status), the
    // client's approvals / refusals with their evidence, templates, and a
    // small settings table (the discount limit). All new and empty.
    await db.query(`CREATE SEQUENCE IF NOT EXISTS crm_proposal_number_seq`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_by_name TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_proposal_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        intro TEXT,
        payment_terms TEXT,
        billing_period TEXT NOT NULL DEFAULT 'mensal' CHECK (billing_period IN ('mensal', 'trimestral', 'semestral', 'anual')),
        execution_term TEXT,
        notes TEXT,
        valid_days INTEGER NOT NULL DEFAULT 15 CHECK (valid_days BETWEEN 1 AND 365),
        service_ids TEXT[] NOT NULL DEFAULT '{}',
        archived_at TIMESTAMPTZ,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_proposals (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL UNIQUE DEFAULT nextval('crm_proposal_number_seq'),
        deal_id TEXT NOT NULL REFERENCES crm_deals (id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE,
        company_id TEXT REFERENCES crm_companies (id) ON DELETE SET NULL,
        template_id TEXT REFERENCES crm_proposal_templates (id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'em_elaboracao'
          CHECK (status IN ('em_elaboracao', 'enviada', 'visualizada', 'em_negociacao', 'aprovada', 'recusada', 'expirada', 'cancelada')),
        version INTEGER NOT NULL DEFAULT 1,
        sent_version INTEGER,
        total_cents BIGINT NOT NULL DEFAULT 0,
        monthly_cents BIGINT NOT NULL DEFAULT 0,
        one_time_cents BIGINT NOT NULL DEFAULT 0,
        discount_pct NUMERIC(5, 1) NOT NULL DEFAULT 0,
        discount_authorized_pct NUMERIC(5, 1),
        discount_authorized_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        discount_authorized_by_name TEXT,
        discount_authorized_at TIMESTAMPTZ,
        issue_date DATE NOT NULL,
        valid_until DATE NOT NULL,
        share_token TEXT UNIQUE,
        share_token_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        viewed_at TIMESTAMPTZ,
        decided_at TIMESTAMPTZ,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_proposals_deal_idx ON crm_proposals (deal_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_proposals_contact_idx ON crm_proposals (contact_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_proposals_status_idx ON crm_proposals (status, valid_until)`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_proposal_versions (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL REFERENCES crm_proposals (id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        content JSONB NOT NULL,
        -- sha256 of the content (canonical JSON): what an approval refers to
        content_hash TEXT NOT NULL,
        reason TEXT,
        changes JSONB NOT NULL DEFAULT '[]',
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        sent_at TIMESTAMPTZ,
        UNIQUE (proposal_id, version)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_proposal_events (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL REFERENCES crm_proposals (id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        version INTEGER,
        payload JSONB NOT NULL DEFAULT '{}',
        actor_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        actor_name TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_proposal_events_idx ON crm_proposal_events (proposal_id, created_at DESC)`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_proposal_approvals (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL REFERENCES crm_proposals (id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('aprovada', 'recusada')),
        name TEXT NOT NULL,
        email TEXT,
        document TEXT,
        comment TEXT,
        content_hash TEXT NOT NULL,
        -- cliente = online, through the link; equipe = recorded in the CRM
        via TEXT NOT NULL CHECK (via IN ('cliente', 'equipe')),
        recorded_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        recorded_by_name TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_proposal_approvals_idx ON crm_proposal_approvals (proposal_id, created_at DESC)`);
    await done(24);
  }

  if (current < 25) {
    // v25 — Evolução v1.0 (contratos e operação, itens 8 e 9): contracts get a
    // number (the existing ones numbered in the order they were created — the
    // only change to existing rows), the proposal they came from, payment
    // terms, due day, term, renewal, cancellation rules, sales and operations
    // owners and the signed document; clients get the onboarding checklist,
    // deliverables and satisfaction records (new tables, empty).
    await db.query(`CREATE SEQUENCE IF NOT EXISTS crm_contract_number_seq`);
    await db.query(`
      ALTER TABLE crm_contracts
        ADD COLUMN IF NOT EXISTS number INTEGER,
        ADD COLUMN IF NOT EXISTS proposal_id TEXT REFERENCES crm_proposals (id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS one_time_cents BIGINT,
        ADD COLUMN IF NOT EXISTS payment_terms TEXT,
        ADD COLUMN IF NOT EXISTS due_day SMALLINT CHECK (due_day BETWEEN 1 AND 31),
        ADD COLUMN IF NOT EXISTS term_months SMALLINT CHECK (term_months BETWEEN 1 AND 120),
        ADD COLUMN IF NOT EXISTS renewal TEXT CHECK (renewal IN ('automatica', 'manual', 'sem_renovacao')),
        ADD COLUMN IF NOT EXISTS cancellation_rules TEXT,
        ADD COLUMN IF NOT EXISTS sales_owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS ops_owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS signed_file_id TEXT REFERENCES crm_files (id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS signed_on DATE
    `);
    await db.query(`
      UPDATE crm_contracts k SET number = n.rn
      FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM crm_contracts) n
      WHERE n.id = k.id AND k.number IS NULL
    `);
    await db.query(`SELECT setval('crm_contract_number_seq', GREATEST((SELECT COALESCE(max(number), 0) FROM crm_contracts), 1), (SELECT count(*) > 0 FROM crm_contracts))`);
    await db.query(`ALTER TABLE crm_contracts ALTER COLUMN number SET DEFAULT nextval('crm_contract_number_seq')`);
    await db.query(`ALTER TABLE crm_contracts ALTER COLUMN number SET NOT NULL`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_contracts_number_key ON crm_contracts (number)`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_contracts_proposal_key ON crm_contracts (proposal_id) WHERE proposal_id IS NOT NULL`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_client_onboarding (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES crm_clients (id) ON DELETE CASCADE,
        item TEXT NOT NULL,
        label TEXT NOT NULL,
        sort SMALLINT NOT NULL DEFAULT 0,
        owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        due_on DATE,
        done_at TIMESTAMPTZ,
        done_by_name TEXT,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (client_id, item)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_client_deliverables (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES crm_clients (id) ON DELETE CASCADE,
        contract_id TEXT REFERENCES crm_contracts (id) ON DELETE SET NULL,
        service TEXT,
        title TEXT NOT NULL,
        description TEXT,
        owner_id TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        due_on DATE,
        status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'entregue', 'cancelado')),
        delivered_at TIMESTAMPTZ,
        created_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_client_deliverables_client_idx ON crm_client_deliverables (client_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_client_deliverables_due_idx ON crm_client_deliverables (status, due_on)`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS crm_client_satisfaction (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES crm_clients (id) ON DELETE CASCADE,
        score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 10),
        comment TEXT,
        recorded_by TEXT REFERENCES internal_users (id) ON DELETE SET NULL,
        recorded_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS crm_client_satisfaction_idx ON crm_client_satisfaction (client_id, created_at DESC)`);
    await done(25);
  }
}

function slugifyUsernameCandidate(raw: string): string {
  const base = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  const withLetter = /^[a-z]/.test(base) ? base : `u${base}`;
  return withLetter.length >= 3 ? withLetter : `${withLetter}usr`;
}

/**
 * One-time (per-row) backfill: assigns a unique username to every
 * pre-existing internal_users/client_access_users row that doesn't have one
 * yet, registers it in the global `usernames` table, and remaps the old
 * 2-value role column. Existing password hashes are left completely
 * untouched — this never resets anyone's password, only adds a login name
 * to accounts that could previously only log in by e-mail (staff) or a
 * shared per-client password (clients). Safe to run on every boot: rows
 * that already have a username are skipped entirely (`WHERE username IS
 * NULL`), and candidate generation re-checks the registry table for every
 * single insert, so re-running after a partial failure just resumes.
 */
async function migrateUsernamesAndRoles(db: Pool): Promise<void> {
  const taken = new Set<string>();
  {
    const { rows } = await db.query<{ username_lower: string }>(`SELECT username_lower FROM usernames`);
    for (const r of rows) taken.add(r.username_lower);
  }

  async function claimUsername(base: string, ownerTable: string, ownerId: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    taken.add(candidate);
    await db.query(
      `INSERT INTO usernames (username_lower, owner_table, owner_id) VALUES ($1,$2,$3)
       ON CONFLICT (username_lower) DO NOTHING`,
      [candidate, ownerTable, ownerId]
    );
    return candidate;
  }

  const { rows: staffRows } = await db.query<{ id: string; name: string; email: string | null }>(
    `SELECT id, name, email FROM internal_users WHERE username IS NULL`
  );
  for (const row of staffRows) {
    const emailLocalPart = row.email?.split("@")[0] ?? "";
    const base = slugifyUsernameCandidate(emailLocalPart || row.name);
    const username = await claimUsername(base, "internal_users", row.id);
    await db.query(`UPDATE internal_users SET username = $1 WHERE id = $2`, [username, row.id]);
  }

  const { rows: clientUserRows } = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM client_access_users WHERE username IS NULL`
  );
  for (const row of clientUserRows) {
    const base = slugifyUsernameCandidate(row.name);
    const username = await claimUsername(base, "client_access_users", row.id);
    await db.query(`UPDATE client_access_users SET username = $1 WHERE id = $2`, [username, row.id]);
  }
}

/** Runs schema setup once per warm instance, then returns the pool. */
export async function getDb(): Promise<Pool> {
  const db = getPool();
  if (!schemaReady) {
    schemaReady = ensureSchema().catch((err) => {
      schemaReady = null; // let the next call retry instead of caching a failure
      throw err;
    });
  }
  await schemaReady;
  return db;
}

/**
 * Runs `fn` inside a single BEGIN/COMMIT client transaction, rolling back on
 * any thrown error. Required whenever a write touches more than one table
 * that must never drift apart — chiefly the `usernames` registry plus
 * `internal_users`/`client_access_users` (claim-or-rename a username and
 * write the owning row atomically), and revoke/reset flows that bump
 * `session_version` together with other account fields.
 */
// Work to do once a transaction has committed (automations, Fase 3): queued
// with onCommit by code running inside withTransaction, run right after
// COMMIT, never after a ROLLBACK. A failure there is logged and never undoes
// or fails what was just saved.
const inTransaction = new WeakSet<object>();
const afterCommit = new WeakMap<object, (() => Promise<void>)[]>();

async function runQuietly(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error("[db] after-commit work failed", err);
  }
}

/** Runs `fn` after the transaction `client` is in commits (or now, when `client` isn't in one). */
export async function onCommit(client: object, fn: () => Promise<void>): Promise<void> {
  if (!inTransaction.has(client)) return runQuietly(fn);
  afterCommit.set(client, [...(afterCommit.get(client) ?? []), fn]);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await getDb();
  const pool = getPool();
  const client = await pool.connect();
  let result: T;
  let queued: (() => Promise<void>)[] = [];
  inTransaction.add(client);
  try {
    await client.query("BEGIN");
    result = await fn(client);
    await client.query("COMMIT");
    queued = afterCommit.get(client) ?? [];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    inTransaction.delete(client);
    afterCommit.delete(client);
    client.release();
  }
  for (const work of queued) await runQuietly(work);
  return result;
}
