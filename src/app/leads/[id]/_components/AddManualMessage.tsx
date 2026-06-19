"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  leadId: string;
  onMessageAdded: (msg: { id: string; direction: string; body: string; sent_at: string }) => void;
  onCancel: () => void;
};

export function AddManualMessage({ leadId, onMessageAdded, onCancel }: Props) {
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [body, setBody] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      toast.error("El cuerpo del mensaje no puede estar vacío.");
      return;
    }

    setLoading(true);
    try {
      let sentAt: string | undefined;
      if (dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) {
          toast.error("Fecha inválida. Usa el formato del selector.");
          setLoading(false);
          return;
        }
        sentAt = d.toISOString();
      }

      const res = await fetch(`/api/leads/${leadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          body: body.trim(),
          ...(sentAt ? { sent_at: sentAt } : {}),
          no_draft: true,
        }),
      });

      const data = (await res.json()) as {
        message?: { id: string; direction: string; sent_at: string };
        error?: string;
      };

      if (!res.ok) {
        toast.error(data.error ?? "Error al agregar el mensaje.");
        return;
      }

      if (data.message) {
        toast.success("Mensaje agregado.");
        onMessageAdded({
          id: data.message.id,
          direction: data.message.direction,
          body: body.trim(),
          sent_at: data.message.sent_at,
        });
      }
    } catch {
      toast.error("Error de red.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border/60 bg-card p-4 space-y-4"
    >
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
        Agregar mensaje anterior
      </p>

      {/* Dirección */}
      <div className="space-y-2">
        <Label className="text-xs">Dirección</Label>
        <div className="flex gap-2">
          {(["inbound", "outbound"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              disabled={loading}
              className={[
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                direction === d
                  ? "border-primary/50 text-primary"
                  : "bg-background/60 border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
              ].join(" ")}
              style={direction === d ? { background: "hsl(248 82% 67% / 0.12)" } : undefined}
            >
              {d === "inbound" ? "↓ del lead" : "↑ mío"}
            </button>
          ))}
        </div>
      </div>

      {/* Cuerpo */}
      <div className="space-y-1.5">
        <Label htmlFor="manual-body" className="text-xs">
          Mensaje
        </Label>
        <Textarea
          id="manual-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Texto del mensaje…"
          disabled={loading}
          className="resize-y text-sm bg-background/50 border-border/40 focus:border-primary/40"
        />
      </div>

      {/* Fecha opcional */}
      <div className="space-y-1.5">
        <Label htmlFor="manual-date" className="text-xs text-muted-foreground">
          Fecha{" "}
          <span className="font-normal">(opcional — si no se indica, se usa ahora)</span>
        </Label>
        <input
          id="manual-date"
          type="datetime-local"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          disabled={loading}
          className="flex h-8 w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1
                     text-xs text-foreground
                     focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40
                     disabled:cursor-not-allowed disabled:opacity-50
                     transition-colors"
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={loading || !body.trim()}
          className="h-7 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          style={body.trim() && !loading ? { background: "var(--gradient-brand)" } : undefined}
        >
          {loading ? "Guardando…" : "Agregar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={loading}
          className="h-7 text-xs border-border/50 text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
