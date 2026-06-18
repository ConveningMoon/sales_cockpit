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
  // body es el texto editable; se inicializa con el draft y se resetea
  // solo cuando llega un draft con distinto id (nuevo borrador generado).
  const [body, setBody] = useState(draft?.body ?? "");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (draft) setBody(draft.body);
  }, [draft]); // se ejecuta cuando llega un nuevo draft del servidor; el usuario puede editar sin reset

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
      <div className="space-y-2 rounded-lg border border-border p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Generando borrador…
        </p>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="space-y-3 rounded-lg border border-border p-4 bg-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Borrador
        </p>
        <span className="text-xs text-muted-foreground">{draft.model}</span>
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        className="resize-y text-sm leading-relaxed"
        disabled={sending}
      />

      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={!body.trim() || sending}
        >
          Copiar
        </Button>
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!body.trim() || sending}
        >
          {sending ? "Guardando…" : "Marcar enviado"}
        </Button>
      </div>
    </div>
  );
}
