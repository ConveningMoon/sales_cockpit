"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { statusBadgeClass, statusLabel } from "@/lib/ui-helpers";

const PIPELINE_STATUSES = [
  "without_answer",
  "opener_answered",
  "fu1_sent",
  "fu2_sent",
  "in_follow_up",
  "interested",
  "in_demo",
  "in_strategy",
  "client",
] as const;

const CLOSED_STATUSES = ["closed", "passive_discard", "rejected"] as const;

type Props = {
  leadId: string;
  currentStatus: string;
};

export function StatusSelector({ leadId, currentStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [isPending, startTransition] = useTransition();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === status) return;

    const prev = status;
    setStatus(next); // optimistic

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_status: next }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error ?? "Error al actualizar el estado.");
        setStatus(prev); // revert
        return;
      }

      toast.success(`Status → "${statusLabel(next)}".`);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      toast.error("Error de red al actualizar el estado.");
      setStatus(prev);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Badge semántico del estado actual */}
      <span
        className={`text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 ${statusBadgeClass(status)}`}
      >
        {statusLabel(status)}
      </span>

      {/* Select nativo con optgroup.
          color-scheme:dark hace que el popup nativo de opciones use
          fondo oscuro/texto claro en todos los navegadores. */}
      <select
        value={status}
        onChange={handleChange}
        disabled={isPending}
        className={[
          "h-7 rounded-md border border-border/50 px-2 text-xs",
          "focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40",
          "hover:border-border transition-colors cursor-pointer",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        ].join(" ")}
        style={{
          colorScheme: "dark",
          backgroundColor: "hsl(var(--background))",
          color: "hsl(var(--foreground))",
        }}
        aria-label="Change lead status"
      >
        <optgroup label="── Pipeline ──">
          {PIPELINE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </optgroup>
        <optgroup label="── Closed ──">
          {CLOSED_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
