"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CLOSING_REASONS,
  ANSWER_QUALITIES,
  answerQualityBadgeClass,
  answerQualityLabel,
} from "@/lib/ui-helpers";

type Props = {
  leadId: string;
  currentClosingReason: string | null;
  currentAnswerQuality: string | null;
};

const selectClass = [
  "h-7 w-full rounded-md border border-border/50 px-2 text-xs",
  "focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40",
  "hover:border-border transition-colors cursor-pointer",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

const selectStyle = {
  colorScheme: "dark" as const,
  backgroundColor: "hsl(var(--background))",
  color: "hsl(var(--foreground))",
};

export function LeadTracking({ leadId, currentClosingReason, currentAnswerQuality }: Props) {
  const router = useRouter();
  const [closingReason, setClosingReason] = useState(currentClosingReason ?? "");
  const [answerQuality, setAnswerQuality] = useState(currentAnswerQuality ?? "");
  const [isPending, startTransition] = useTransition();

  // field: "closing_reason" | "answer_quality"; valor "" => null (limpiar)
  async function patch(
    field: "closing_reason" | "answer_quality",
    value: string,
    setLocal: (v: string) => void,
    prev: string,
    successMsg: string,
  ) {
    setLocal(value); // optimista
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value === "" ? null : value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error ?? "Error al actualizar.");
        setLocal(prev); // revert
        return;
      }
      toast.success(successMsg);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Error de red al actualizar.");
      setLocal(prev);
    }
  }

  return (
    <div className="space-y-3">
      {/* Calidad de la respuesta */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-1 flex items-center gap-1.5">
          Calidad de respuesta
          {answerQuality && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${answerQualityBadgeClass(answerQuality)}`}>
              {answerQualityLabel(answerQuality)}
            </span>
          )}
        </label>
        <select
          value={answerQuality}
          onChange={(e) =>
            patch("answer_quality", e.target.value, setAnswerQuality, answerQuality,
              e.target.value === "" ? "Calidad de respuesta limpiada." : "Calidad de respuesta actualizada.")
          }
          disabled={isPending}
          className={selectClass}
          style={selectStyle}
          aria-label="Calidad de la respuesta del lead"
        >
          <option value="">Sin calificar</option>
          {ANSWER_QUALITIES.map((q) => (
            <option key={q.key} value={q.key}>{q.label}</option>
          ))}
        </select>
      </div>

      {/* Razón de cierre */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-1 block">
          Razón de cierre
        </label>
        <select
          value={closingReason}
          onChange={(e) =>
            patch("closing_reason", e.target.value, setClosingReason, closingReason,
              e.target.value === "" ? "Razón de cierre limpiada." : "Razón de cierre actualizada.")
          }
          disabled={isPending}
          className={selectClass}
          style={selectStyle}
          aria-label="Razón de cierre del lead"
        >
          <option value="">Sin razón</option>
          {CLOSING_REASONS.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
