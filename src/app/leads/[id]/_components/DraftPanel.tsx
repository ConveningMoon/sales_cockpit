"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type Draft = {
  id: string;
  body: string;
  model: string;
};

type Props = {
  leadId: string;
  draft: Draft | null;
  loading: boolean;
};

export function DraftPanel({ leadId, draft, loading }: Props) {
  const router = useRouter();
  const [body, setBody] = useState(draft?.body ?? "");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (draft) setBody(draft.body);
  }, [draft]);

  async function handleCopy() {
    if (!body.trim()) return;
    await navigator.clipboard.writeText(body);
    toast.success("Borrador copiado al portapapeles");
  }

  async function handleSend() {
    if (!draft || !body.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draft.id, body }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          `Error al marcar enviado: ${(data as Record<string, string>).error ?? res.status}`
        );
        return;
      }

      toast.success("Mensaje marcado como enviado. Volviendo a la bandeja…");
      router.push("/");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-primary/20 bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--gradient-brand)" }}
          />
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
            Generando borrador…
          </p>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      </div>
    );
  }

  if (!draft) return null;

  const hasText = body.trim().length > 0;

  return (
    <div className="rounded-xl border border-primary/25 bg-card p-5 shadow-[0_2px_16px_hsl(248_82%_67%/0.08)]">
      {/* Cabecera */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: "var(--gradient-brand)" }}
          />
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
            Borrador
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground/50 font-mono">
          {draft.model}
        </span>
      </div>

      {/* Editor del borrador */}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={9}
        className="resize-y text-sm leading-relaxed bg-background/50 border-border/40
                   focus:border-primary/40 focus:ring-1 focus:ring-primary/25 transition-colors"
        disabled={sending}
      />

      {/* Acciones */}
      <div className="flex gap-2 flex-wrap mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={!hasText || sending}
          className="border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          Copiar
        </Button>
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!hasText || sending}
          className="font-semibold text-primary-foreground transition-all duration-150
                     disabled:opacity-40
                     enabled:hover:opacity-90 enabled:hover:shadow-[0_0_14px_hsl(248_82%_67%/0.35)]"
          style={hasText && !sending ? { background: "var(--gradient-brand)" } : undefined}
        >
          {sending ? "Guardando…" : "Marcar enviado"}
        </Button>
      </div>
    </div>
  );
}
