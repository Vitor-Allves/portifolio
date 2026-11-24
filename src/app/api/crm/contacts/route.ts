import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { maskConversations, requireCap, requireOwnerChange, visibleTo } from "@/lib/crm-access";
import {
  contactFiltersFromSearch,
  createContact,
  listContacts,
  listContactsPage,
  pageFromSearch,
  type NewContactInput,
} from "@/lib/crm";

export const runtime = "nodejs";

/**
 * Without ?page: every active contact, for the Kanban board.
 * With ?page: one page of the contact list, filtered (?q, stage, owner,
 * source, segment, city, consent, company, tag, archived=1, sort, pageSize).
 */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const params = req.nextUrl.searchParams;
  try {
    if (!params.has("page")) return NextResponse.json({ contacts: await maskConversations(actor, await listContacts(visibleTo(actor))) });
    const { page, pageSize, sort } = pageFromSearch(params);
    const result = await listContactsPage({ ...contactFiltersFromSearch(params, actor.userId), visibleTo: visibleTo(actor) }, page, pageSize, sort);
    return NextResponse.json({ ...result, rows: await maskConversations(actor, result.rows) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts GET");
  }
}

export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as NewContactInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "editContacts");
    requireOwnerChange(actor, body.ownerId ?? undefined, null);
    const id = await createContact({ ...body, allowParallel: actor.caps.assignAnyOwner && body.allowParallel === true }, actor);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts POST");
  }
}
