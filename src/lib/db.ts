// Server-only Postgres connection. Requires a database attached to the
// Vercel project (Storage tab → Connect Database → a Postgres provider,
// e.g. Neon) — see docs/client-access-setup.md.

import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { companyKey as crmCompanyKey } from "./crm-types";

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

  pool = new Pool({ connectionString });
  // Lets Vercel's Fluid Compute runtime reuse/drain this pool correctly
  // across invocations instead of leaking connections per cold start.
  attachDatabasePool(pool);
  return pool;
}

// Bump this whenever a new statement is added below. ensureSchema() checks
// this against schema_migrations before doing anything else, so a cold
// serverless instance that finds the schema already at the current version
// pays for exactly 2 round-trips instead of the full ~30-statement sequence
// — on Vercel Hobby's 10s function timeout, running the whole sequence on
// every cold start was enough by itself to time out requests (observed in
// production as 504s on GET /analise/, no code involved past getDb()).
const SCHEMA_VERSION = 8;

async function ensureSchema(): Promise<void> {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const { rows: migrationRows } = await db.query<{ version: number }>(
    `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`
  );
  const current = migrationRows[0]?.version ?? 0;
  if (current >= SCHEMA_VERSION) return;
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
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await getDb();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
