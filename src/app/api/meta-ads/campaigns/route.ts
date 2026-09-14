import { NextRequest, NextResponse } from "next/server";
import { getDashboardData, isValidDatePreset, MetaApiError } from "@/lib/meta-ads";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const datePresetParam = req.nextUrl.searchParams.get("date_preset") ?? "last_30d";
  if (!isValidDatePreset(datePresetParam)) {
    return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  }

  try {
    const data = await getDashboardData(datePresetParam);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/meta-ads/campaigns]", err);
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json(
      { error: "Não foi possível carregar os dados de campanhas da Meta agora." },
      { status }
    );
  }
}
