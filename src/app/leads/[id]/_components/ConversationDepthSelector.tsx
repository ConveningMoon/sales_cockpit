"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CONVERSATION_DEPTHS } from "@/lib/ui-helpers";

type Props = {
  leadId: string;
  current: string | null;
};

export function ConversationDepthSelector({ leadId, current }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);

  async function handleSelect(key: string | null) {
    const prev = selected;
    setSelected(key);
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_depth: key }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Error al guardar.");
        setSelected(prev);
        return;
      }
      router.refresh();
    } catch {
      toast.error("Error de red.");
      setSelected(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-2">
        Profundidad de conversación
      </p>
      <div className="space-y-1">
        {CONVERSATION_DEPTHS.map((d) => {
          const active = selected === d.key;
          return (
            <button
              key={d.key}
              onClick={() => handleSelect(active ? null : d.key)}
              disabled={saving}
              className={[
                "w-full text-left px-2.5 py-2 rounded-lg border text-xs transition-all duration-100",
                "disabled:opacity-50",
                active
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/30 bg-background/30 text-muted-foreground hover:border-border/60 hover:text-foreground",
              ].join(" ")}
            >
              <span className="font-medium">{d.ordinal}. {d.label}</span>
              <span className="block text-[10px] mt-0.5 opacity-70 leading-snug">
                {d.description}
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <button
          onClick={() => handleSelect(null)}
          disabled={saving}
          className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-1 disabled:opacity-40"
        >
          × Limpiar
        </button>
      )}
    </div>
  );
}
