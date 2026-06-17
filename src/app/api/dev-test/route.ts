import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/router";
import { createServerClient } from "@/lib/supabase/server";
import { ITMANO_BASE_SYSTEM_PROMPT } from "@/lib/ai/voice";

// Endpoint temporal solo para verificación del Slice 2.
// Eliminar una vez confirmado que todo funciona.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Solo disponible en desarrollo." }, { status: 403 });
  }

  const model = req.nextUrl.searchParams.get("model") ?? "claude-sonnet-4-6";
  const webSearch = req.nextUrl.searchParams.get("web") === "1";
  const msg = req.nextUrl.searchParams.get("msg") ?? "Responde con una sola palabra: OK";

  try {
    const result = await callAI({
      taskType: "other",
      systemPrompt: ITMANO_BASE_SYSTEM_PROMPT,
      userMessage: msg,
      model,
      webSearch,
      maxTokens: 2048,
    });

    return NextResponse.json({
      ok: true,
      model: result.model,
      provider: result.provider,
      content: result.content,
      tokens: {
        input: result.inputTokens,
        output: result.outputTokens,
        cached: result.cachedTokens,
      },
      webSearch: {
        requests: result.webSearchRequests,
        costUsd: result.webSearchCostUsd,
      },
      costUsd: result.costUsd,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// Devuelve filas recientes de ai_spend_monthly
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Solo disponible en desarrollo." }, { status: 403 });
  }
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("ai_spend_monthly" as "ai_usage")
    .select("*")
    .limit(20);
  return NextResponse.json({ ok: !error, data, error: error?.message });
}
