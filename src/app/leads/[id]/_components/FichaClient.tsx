"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { MessageThread } from "./MessageThread";
import { PasteBox } from "./PasteBox";
import { DraftPanel } from "./DraftPanel";
import { ImportConversation } from "./ImportConversation";
import { AddManualMessage } from "./AddManualMessage";

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
  leadFullName: string;
  myName: string;
  initialMessages: Message[];
  initialDraft: Draft;
};

export function FichaClient({
  leadId,
  leadFullName,
  myName,
  initialMessages,
  initialDraft,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [loading, setLoading] = useState(false);
  const [showAddManual, setShowAddManual] = useState(false);

  useEffect(() => {
    setMessages(initialMessages);
    setDraft(initialDraft);
    setShowAddManual(false);
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

  function handleManualMessageAdded(msg: {
    id: string;
    direction: string;
    body: string;
    sent_at: string;
  }) {
    setMessages((prev) =>
      [...prev, msg].sort((a, b) => a.sent_at.localeCompare(b.sent_at))
    );
    setShowAddManual(false);
  }

  function handleConversationImported(result: {
    newMessages: { id?: string; direction: string; body: string; sent_at: string }[];
    draft: { id: string; body: string; model: string } | null;
  }) {
    if (result.draft) setDraft(result.draft);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* ── Hilo de conversación ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
            Hilo de conversación
          </h3>
          {!showAddManual && (
            <button
              onClick={() => setShowAddManual(true)}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
            >
              + Agregar mensaje
            </button>
          )}
        </div>

        {showAddManual && (
          <div className="mb-4">
            <AddManualMessage
              leadId={leadId}
              onMessageAdded={handleManualMessageAdded}
              onCancel={() => setShowAddManual(false)}
            />
          </div>
        )}

        <MessageThread
          leadId={leadId}
          messages={messages}
          onMessageUpdated={handleMessageUpdated}
        />
      </section>

      <Separator className="opacity-30" />

      {/* ── Importar conversación ── */}
      <section>
        <ImportConversation
          leadId={leadId}
          leadFullName={leadFullName}
          myNameDefault={myName}
          onImported={handleConversationImported}
        />
      </section>

      <Separator className="opacity-30" />

      {/* ── Banco de trabajo: pegar + borrador ── */}
      <section className="space-y-4">
        <PasteBox onPaste={handlePaste} loading={loading} />

        {(loading || draft) && (
          <DraftPanel leadId={leadId} draft={draft} loading={loading} />
        )}
      </section>
    </div>
  );
}
