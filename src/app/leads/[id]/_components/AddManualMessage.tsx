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
      // Convertir fecha opcional a ISO; si vacía, el endpoint usa now() (sobrescribiremos
      // con la fecha histórica si se proporcionó)
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
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 space-y-4">
      <p className="text-sm font-medium">Agregar mensaje anterior</p>

      {/* Dirección */}
      <div className="space-y-1.5">
        <Label>Dirección</Label>
        <div className="flex gap-2">
          {(["inbound", "outbound"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                direction === d
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:bg-muted"
              }`}
            >
              {d === "inbound" ? "↓ inbound (del lead)" : "↑ outbound (tuyo)"}
            </button>
          ))}
        </div>
      </div>

      {/* Cuerpo */}
      <div className="space-y-1.5">
        <Label htmlFor="manual-body">Mensaje</Label>
        <Textarea
          id="manual-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Texto del mensaje…"
          disabled={loading}
          className="resize-y text-sm"
        />
      </div>

      {/* Fecha opcional */}
      <div className="space-y-1.5">
        <Label htmlFor="manual-date">
          Fecha{" "}
          <span className="text-muted-foreground font-normal">(opcional — si no se indica, se usa ahora)</span>
        </Label>
        <input
          id="manual-date"
          type="datetime-local"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          disabled={loading}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading || !body.trim()}>
          {loading ? "Guardando…" : "Agregar"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
