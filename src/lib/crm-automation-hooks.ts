// Server-only. Where the CRM's data modules tell the automations something
// happened. Each hook queues the work for right after the current
// transaction commits (db.onCommit): a failing automation never undoes or
// blocks what a person just saved. The engine is imported lazily, so the
// data modules and crm-automations.ts don't import each other.

import { onCommit } from "./db";
import type { CrmWriter } from "./crm-core";

type Client = object;

const engine = () => import("./crm-automations");

/** A lead entered the CRM. */
export function afterContactCreated(client: Client, contactId: string, via: "manual" | "whatsapp" | "anuncio" | "importacao"): Promise<void> {
  return onCommit(client, async () => (await engine()).onNewLead(contactId, via));
}

/** Leads got a (new) owner. `bulk` = one action moved many (lote, carteira, importação). */
export function afterOwnersAssigned(client: Client, items: { contactId: string; ownerId: string | null }[], by: CrmWriter, bulk = false): Promise<void> {
  if (items.length === 0) return Promise.resolve();
  return onCommit(client, async () => (await engine()).onOwnersAssigned(items, by, bulk));
}

/** An opportunity entered a stage. */
export function afterDealStage(client: Client, dealId: string, stage: string): Promise<void> {
  return onCommit(client, async () => (await engine()).onDealStage(dealId, stage));
}

/** A task was created. */
export function afterTaskCreated(client: Client, taskId: string): Promise<void> {
  return onCommit(client, async () => (await engine()).onTaskCreated(taskId));
}

/** A WhatsApp message arrived from an existing contact. */
export function afterInbound(client: Client, contactId: string, at: Date): Promise<void> {
  return onCommit(client, async () => (await engine()).onInbound(contactId, at));
}
