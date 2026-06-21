"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Props = {
  leadId: string;
  initialNotes: string | null;
};

export function LeadNotes({ leadId, initialNotes }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(initialNotes ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = value !== saved;

  async function save() {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error ?? "Error al guardar notas.");
        return;
      }
      setSaved(value);
      toast.success("Notas guardadas.");
      router.refresh();
    } catch {
      toast.error("Error de red al guardar notas.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
        Notas
      </label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Observaciones, contexto, próximos pasos…"
        className={[
          "w-full rounded-lg border px-3 py-2 text-xs resize-none",
          "bg-background/50 text-foreground placeholder:text-muted-foreground/40",
          "focus:outline-none focus:ring-1 focus:ring-primary/30",
          "transition-colors leading-relaxed",
          isDirty ? "border-primary/40" : "border-border/40",
        ].join(" ")}
      />
      {isDirty && (
        <button
          onClick={save}
          disabled={isSaving}
          className={[
            "w-full rounded-lg py-1.5 text-xs font-semibold text-primary-foreground",
            "transition-all duration-150 hover:opacity-90 disabled:opacity-60",
          ].join(" ")}
          style={{ background: "var(--gradient-brand)" }}
        >
          {isSaving ? "Guardando…" : "Guardar notas"}
        </button>
      )}
    </div>
  );
}
