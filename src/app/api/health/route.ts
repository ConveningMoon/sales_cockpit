import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getRouterConfig } from "@/lib/ai/router";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Supabase
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("ai_usage").select("id").limit(1);
    checks.supabase = error ? { ok: false, detail: error.message } : { ok: true };
  } catch (e) {
    checks.supabase = { ok: false, detail: String(e) };
  }

  // Router — verifica configuración sin llamar a la IA
  try {
    const sonnet = getRouterConfig("draft");
    const haiku = getRouterConfig("clasificacion");
    checks.ai_router = {
      ok: true,
      detail: `${sonnet.model} (generacion) · ${haiku.model} (clasificacion) · proveedores: anthropic + openrouter`,
    };
  } catch (e) {
    checks.ai_router = { ok: false, detail: String(e) };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok: allOk, checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  );
}
