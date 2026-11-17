import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { createCompany, listCompanies, type CompanyInput } from "@/lib/crm-companies";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  const page = Math.max(1, Math.floor(Number(p.get("page")) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(p.get("pageSize")) || 25)));
  try {
    return NextResponse.json(
      await listCompanies({ q: p.get("q") ?? undefined, segment: p.get("segment") || undefined, city: p.get("city") || undefined }, page, pageSize)
    );
  } catch (err) {
    return crmErrorResponse(err, "api/crm/companies GET");
  }
}

export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as CompanyInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "editContacts");
    return NextResponse.json({ id: await createCompany(body, actor) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/companies POST");
  }
}
