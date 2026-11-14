import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getCompanyDetail, updateCompany, type CompanyInput } from "@/lib/crm-companies";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    const company = await getCompanyDetail(id);
    if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    return NextResponse.json({ company });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/companies/[id] GET");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as CompanyInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    if (!(await updateCompany(id, body))) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/companies/[id] PATCH");
  }
}
