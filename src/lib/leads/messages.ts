import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MessageInsert } from "@/types/database";

export async function insertMessage(
  supabase: SupabaseClient<Database>,
  payload: MessageInsert
): Promise<{ id: string; sent_at: string }> {
  const { data, error } = await supabase
    .from("messages")
    .insert(payload)
    .select("id, sent_at")
    .single();

  if (error || !data) {
    throw new Error(`insertMessage: ${error?.message ?? "sin datos"}`);
  }

  return { id: data.id as string, sent_at: data.sent_at as string };
}
