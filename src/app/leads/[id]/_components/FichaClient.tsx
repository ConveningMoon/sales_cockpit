"use client";

import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { MessageThread } from "./MessageThread";
import { PasteBox } from "./PasteBox";
import { DraftPanel } from "./DraftPanel";

type Message = {
  id: string;
  direction: string;
  body: string;
  sent_at: string;
};

type Draft = {
  id: string;
  body: string;
  model: string;
} | null;

type Props = {
  leadId: string;
  initialMessages: Message[];
  initialDraft: Draft;
};

export function FichaClient({ leadId, initialMessages, initialDraft }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [loading, setLoading] = useState(false);

  // Sincronizar si cambia el lead (navegación entre fichas)
  useEffect(() => {
    setMessages(initialMessages);
    setDraft(initialDraft);
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePaste(text: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: "inbound", body: text }),
      });

      const data = (await res.json()) as {
        message?: { id: string; direction: string; sent_at: string };
        draft?: { id: string; body: string; model: string } | null;
        draft_error?: string;
        error?: string;
      };

      if (!res.ok) {
        toast.error(data.error ?? "Error al registrar el mensaje.");
        return;
      }

      if (data.message) {
        setMessages((prev) => [
          ...prev,
          {
            id: data.message!.id,
            direction: "inbound",
            body: text,
            sent_at: data.message!.sent_at,
          },
        ]);
      }

      if (data.draft) {
        setDraft(data.draft);
      } else if (data.draft_error) {
        toast.warning(
          `Mensaje registrado, pero el borrador falló: ${data.draft_error}`
        );
      }
    } catch {
      toast.error("Error de red al registrar el mensaje.");
    } finally {
      setLoading(false);
    }
  }

  function handleMessageUpdated(id: string, body: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body } : m)));
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Hilo de conversación
        </h3>
        <MessageThread
          leadId={leadId}
          messages={messages}
          onMessageUpdated={handleMessageUpdated}
        />
      </section>

      <Separator />

      <section>
        <PasteBox onPaste={handlePaste} loading={loading} />
      </section>

      {(loading || draft) && (
        <>
          <Separator />
          <section>
            <DraftPanel leadId={leadId} draft={draft} loading={loading} />
          </section>
        </>
      )}
    </div>
  );
}
