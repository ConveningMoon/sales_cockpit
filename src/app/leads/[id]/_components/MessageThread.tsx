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
  return new Date(iso).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
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
      <p className="text-sm text-muted-foreground py-4 text-center">
        Sin mensajes registrados todavía.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        const isOutbound = msg.direction === "outbound";
        const isEditing = editingId === msg.id;

        return (
          <div
            key={msg.id}
            className={`rounded-lg px-4 py-3 text-sm ${
              isOutbound
                ? "bg-primary/10 border border-primary/20 ml-6"
                : "bg-muted border border-border mr-6"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {isOutbound ? "Dylan" : "Lead"}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDate(msg.sent_at)}
                </span>
                {!isEditing && (
                  <button
                    onClick={() => startEdit(msg)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors hover:underline underline-offset-2 disabled:opacity-50"
                    disabled={saving || editingId !== null}
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-2 mt-2">
                <Textarea
                  value={editingBody}
                  onChange={(e) => setEditingBody(e.target.value)}
                  rows={Math.max(3, editingBody.split("\n").length)}
                  disabled={saving}
                  className="resize-y text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveEdit(msg.id)}
                    disabled={saving || !editingBody.trim()}
                  >
                    {saving ? "Guardando…" : "Guardar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
