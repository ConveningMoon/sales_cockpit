"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Message = {
  id: string;
  direction: string;
  body: string;
  sent_at: string;
};

type Props = {
  leadId: string;
  messages: Message[];
  onMessageUpdated: (id: string, body: string) => void;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isThisYear = d.getFullYear() === now.getFullYear();

  if (isToday) {
    return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    ...(isThisYear ? {} : { year: "numeric" }),
  });
}

export function MessageThread({ leadId, messages, onMessageUpdated }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(msg: Message) {
    setEditingId(msg.id);
    setEditingBody(msg.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingBody("");
  }

  async function saveEdit(messageId: string) {
    const trimmed = editingBody.trim();
    if (!trimmed) {
      toast.error("El mensaje no puede estar vacío.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          (data as Record<string, string>).error ?? "Error al guardar el mensaje."
        );
        return;
      }

      onMessageUpdated(messageId, trimmed);
      setEditingId(null);
      setEditingBody("");
      toast.success("Mensaje actualizado.");
    } catch {
      toast.error("Error de red al guardar el mensaje.");
    } finally {
      setSaving(false);
    }
  }

  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sin mensajes registrados todavía.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {messages.map((msg) => {
        const isOutbound = msg.direction === "outbound";
        const isEditing = editingId === msg.id;

        return (
          <div
            key={msg.id}
            className={[
              "rounded-xl px-4 py-3 text-sm",
              "transition-colors duration-100",
              isOutbound
                ? "bg-primary/8 border border-primary/20 ml-8 hover:bg-primary/10"
                : "bg-card border border-border mr-8 hover:border-border/80",
            ].join(" ")}
          >
            {/* Cabecera de mensaje */}
            <div className="flex items-center justify-between mb-2 gap-2">
              <span
                className={[
                  "text-[10px] font-semibold uppercase tracking-[0.08em]",
                  isOutbound ? "text-primary/80" : "text-muted-foreground",
                ].join(" ")}
              >
                {isOutbound ? "Tú" : "Lead"}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
                  {formatDate(msg.sent_at)}
                </span>
                {!isEditing && (
                  <button
                    onClick={() => startEdit(msg)}
                    className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors hover:underline underline-offset-2 disabled:opacity-30"
                    disabled={saving || editingId !== null}
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-2 mt-1">
                <Textarea
                  value={editingBody}
                  onChange={(e) => setEditingBody(e.target.value)}
                  rows={Math.max(3, editingBody.split("\n").length)}
                  disabled={saving}
                  className="resize-y text-sm bg-background/60 border-border/50 focus:border-primary/40"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveEdit(msg.id)}
                    disabled={saving || !editingBody.trim()}
                    className="h-7 text-xs"
                  >
                    {saving ? "Guardando…" : "Guardar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="h-7 text-xs border-border/50"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">
                {msg.body}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
