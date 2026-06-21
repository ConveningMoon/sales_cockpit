"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface MessageStats {
  sent: number;
  replied: number;
}

interface Lh2Stats {
  opener: MessageStats;
  fu1: MessageStats;
  fu2: MessageStats;
}

type Props = {
  batchId: string;
  initial: Lh2Stats | null;
};

const KEYS = ["opener", "fu1", "fu2"] as const;
const LABELS: Record<(typeof KEYS)[number], string> = {
  opener: "Opener",
  fu1: "FU1",
  fu2: "FU2",
};

const empty: MessageStats = { sent: 0, replied: 0 };

function replyRate(s: MessageStats): string {
  if (!s.sent) return "—";
  return `${((s.replied / s.sent) * 100).toFixed(1)}%`;
}

export function Lh2StatsForm({ batchId, initial }: Props) {
  const router = useRouter();
  const [stats, setStats] = useState<Lh2Stats>(
    initial ?? { opener: { ...empty }, fu1: { ...empty }, fu2: { ...empty } },
  );
  const [saved, setSaved] = useState<Lh2Stats>(
    initial ?? { opener: { ...empty }, fu1: { ...empty }, fu2: { ...empty } },
  );
  const [saving, setSaving] = useState(false);

  const isDirty = JSON.stringify(stats) !== JSON.stringify(saved);

  function setField(key: (typeof KEYS)[number], field: keyof MessageStats, raw: string) {
    const value = Math.max(0, parseInt(raw, 10) || 0);
    setStats((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lh2_stats: stats }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar.");
        return;
      }
      setSaved(stats);
      toast.success("Estadísticas de LH2 guardadas.");
      router.refresh();
    } catch {
      toast.error("Error de red al guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      const res = await fetch(`/api/batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lh2_stats: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Error al limpiar.");
        return;
      }
      const cleared = { opener: { ...empty }, fu1: { ...empty }, fu2: { ...empty } };
      setStats(cleared);
      setSaved(cleared);
      toast.success("Estadísticas eliminadas.");
      router.refresh();
    } catch {
      toast.error("Error de red al limpiar.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = [
    "w-16 h-7 px-2 rounded-md border border-border/40 text-xs text-center tabular-nums",
    "bg-background/50 text-foreground",
    "focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40",
  ].join(" ");

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        Ingresa los datos de envío y respuesta de LH2 para calcular las tasas de respuesta de esta campaña.
      </p>

      <div className="space-y-2">
        {/* Header */}
        <div className="grid grid-cols-[80px_1fr_1fr_56px] gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
          <span />
          <span>Enviados</span>
          <span>Respondidos</span>
          <span>Tasa</span>
        </div>

        {KEYS.map((key) => (
          <div key={key} className="grid grid-cols-[80px_1fr_1fr_56px] gap-2 items-center">
            <span className="text-xs font-medium text-foreground">{LABELS[key]}</span>
            <input
              type="number"
              min={0}
              value={stats[key].sent || ""}
              placeholder="0"
              onChange={(e) => setField(key, "sent", e.target.value)}
              className={inputCls}
              style={{ colorScheme: "dark" }}
            />
            <input
              type="number"
              min={0}
              value={stats[key].replied || ""}
              placeholder="0"
              onChange={(e) => setField(key, "replied", e.target.value)}
              className={inputCls}
              style={{ colorScheme: "dark" }}
            />
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {replyRate(stats[key])}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        {isDirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className={[
              "px-4 py-1.5 rounded-lg text-xs font-semibold text-primary-foreground",
              "transition-all duration-150 hover:opacity-90 disabled:opacity-40",
              "hover:shadow-[0_0_14px_hsl(248_82%_67%/0.35)]",
            ].join(" ")}
            style={{ background: "var(--gradient-brand)" }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        )}
        {!isDirty && initial && (
          <button
            onClick={handleClear}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border/50 hover:border-border transition-colors disabled:opacity-40"
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}
