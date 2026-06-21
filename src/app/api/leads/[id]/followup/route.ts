import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateFollowup, type FuType } from "@/lib/ai/followup";

const VALID_FU_TYPES: FuType[] = ["fu1", "fu2"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const b = rawBody as Record<string, unknown>;
  const fuType = b.fu_type as FuType | undefined;

  if (!fuType || !VALID_FU_TYPES.includes(fuType)) {
    return NextResponse.json(
      { error: `fu_type inválido. Valores permitidos: ${VALID_FU_TYPES.join(", ")}.` },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  try {
    const result = await generateFollowup({ leadId, fuType, supabase });
    return NextResponse.json({ body: result.body, model: result.model, fu_type: fuType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[followup] lead=${leadId} fu_type=${fuType} — ERROR: ${msg}`);
    return NextResponse.json(
      { error: msg, stage: "followup_generation", context: { lead_id: leadId, fu_type: fuType } },
      { status: 500 }
    );
  }
}
