import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { LeadInsert } from "@/types/database";

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const b = rawBody as Record<string, unknown>;
  const fullName = typeof b.full_name === "string" ? b.full_name.trim() : "";

  if (!fullName) {
    return NextResponse.json(
      { error: "full_name es requerido." },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const lhId = `manual_${crypto.randomUUID()}`;

  const nameParts = fullName.split(" ");
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || null;

  const newLead: LeadInsert = {
    lh_id: lhId,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    profile_url:
      typeof b.profile_url === "string" ? b.profile_url.trim() || null : null,
    headline:
      typeof b.headline === "string" ? b.headline.trim() || null : null,
    summary:
      typeof b.summary === "string" ? b.summary.trim() || null : null,
    current_company:
      typeof b.current_company === "string"
        ? b.current_company.trim() || null
        : null,
    current_position:
      typeof b.current_position === "string"
        ? b.current_position.trim() || null
        : null,
    location_name: null,
    followers: null,
    website: null,
    has_premium: false,
    languages: null,
    cs_group: null,
    cs_city:
      typeof b.cs_city === "string" ? b.cs_city.trim() || null : null,
    cs_country:
      typeof b.cs_country === "string" ? b.cs_country.trim() || null : null,
    lead_status: "without_answer",
    closing_reason: null,
    answer_quality: null,
    score: null,
    batch_id: null,
    notes: null,
    raw_profile: null,
  };

  const { data, error } = await supabase
    .from("leads")
    .insert(newLead)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `Error al crear lead: ${error?.message ?? "desconocido"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id as string }, { status: 201 });
}
