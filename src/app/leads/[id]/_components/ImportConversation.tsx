"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RawMsg = { direction: "inbound" | "outbound"; body: string; timestamp_raw: string };

type Draft = { id: string; body: string; model: string };

type Props = {
  leadId: string;
  leadFullName: string;
  myNameDefault: string;
  onImported: (result: { newMessages: ImportedMessage[]; draft: Draft | null }) => void;
};

export type ImportedMessage = {
  id?: string; // no viene del preview, viene del import result si queremos refrescar
  direction: "inbound" | "outbound";
  body: string;
  sent_at: string;
};

type Step = "idle" | "parsing" | "preview" | "importing";

export function ImportConversation({
  leadId,
  leadFullName,
  myNameDefault,
  onImported,
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [rawText, setRawText] = useState("");
  const [myName, setMyName] = useState(myNameDefault);
  const [preview, setPreview] = useState<RawMsg[]>([]);

  function reset() {
    setStep("idle");
    setRawText("");
    setMyName(myNameDefault);
    setPreview([]);
  }

  function handleToggle() {
    if (open) reset();
    setOpen((v) => !v);
  }

  async function handleParse() {
    if (!rawText.trim()) {
      toast.error("Pega el texto de la conversación antes de continuar.");
      return;
    }
    if (!myName.trim()) {
      toast.error("Escribe tu nombre en LinkedIn antes de continuar.");
      return;
    }

    setStep("parsing");
    try {
      const res = await fetch(`/api/leads/${leadId}/parse-conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: rawText, my_name: myName.trim() }),
      });

      const data = (await res.json()) as { messages?: RawMsg[]; error?: string };

      if (!res.ok || !data.messages) {
        toast.error(data.error ?? "Error al parsear la conversación.");
        setStep("idle");
        return;
      }

      if (data.messages.length === 0) {
        toast.warning("No se detectaron mensajes. Verifica el texto pegado.");
        setStep("idle");
        return;
      }

      setPreview(data.messages);
      setStep("preview");
    } catch {
      toast.error("Error de red al parsear.");
      setStep("idle");
    }
  }

  function toggleDirection(idx: number) {
    setPreview((prev) =>
      prev.map((m, i) =>
        i === idx
          ? { ...m, direction: m.direction === "inbound" ? "outbound" : "inbound" }
          : m
      )
    );
  }

  function deleteRow(idx: number) {
    setPreview((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleImport() {
    if (preview.length === 0) {
      toast.error("No hay mensajes para importar.");
      return;
    }

    setStep("importing");
    try {
      const res = await fetch(`/api/leads/${leadId}/import-conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: preview }),
      });

      const data = (await res.json()) as {
        inserted?: number;
        skipped?: number;
        draft?: Draft | null;
        draft_error?: string;
        error?: string;
      };

      if (!res.ok) {
        toast.error(data.error ?? "Error al importar la conversación.");
        setStep("preview");
        return;
      }

      const { inserted = 0, skipped = 0 } = data;

      const parts = [
        inserted > 0 && `${inserted} mensaje${inserted !== 1 ? "s" : ""} importado${inserted !== 1 ? "s" : ""}`,
        skipped > 0 && `${skipped} omitido${skipped !== 1 ? "s" : ""} (ya existían)`,
      ].filter(Boolean);

      toast.success(parts.join(", ") || "Sin cambios.");

      if (data.draft_error) {
        toast.warning(`Borrador no generado: ${data.draft_error}`);
      }

      // Notificar al padre para actualizar el estado sin reload completo
      // Los mensajes no tienen sent_at preciso desde aquí (no los devuelve el import endpoint);
      // el padre puede hacer un reload o recibir los datos mínimos para trigger un refetch.
      onImported({ newMessages: [], draft: data.draft ?? null });

      reset();
      setOpen(false);
    } catch {
      toast.error("Error de red al importar.");
      setStep("preview");
    }
  }

  return (
    <div className="space-y-3">
      {/* Header con toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Importar conversación de LinkedIn
        </h3>
        <button
          onClick={handleToggle}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          {open ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          {/* Paso 1 — Pegar texto */}
          {(step === "idle" || step === "parsing") && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="import-my-name">Tu nombre en LinkedIn</Label>
                <Input
                  id="import-my-name"
                  value={myName}
                  onChange={(e) => setMyName(e.target.value)}
                  placeholder="Ej: Dylan Vergara"
                  disabled={step === "parsing"}
                />
                <p className="text-xs text-muted-foreground">
                  Tal como aparece en la conversación de LinkedIn. Se usa para identificar
                  tus mensajes (outbound) vs. los del lead (inbound).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="import-raw-text">
                  Conversación{" "}
                  <span className="text-muted-foreground font-normal">(pega el texto copiado de LinkedIn)</span>
                </Label>
                <Textarea
                  id="import-raw-text"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={8}
                  placeholder={`${leadFullName}\n\nApr 20\n\nDylan Vergara sent the following messages at 10:22 AM\nHola [nombre], vi tu perfil y...`}
                  disabled={step === "parsing"}
                  className="resize-y text-sm font-mono"
                />
              </div>

              <Button
                onClick={handleParse}
                disabled={step === "parsing" || !rawText.trim() || !myName.trim()}
                size="sm"
              >
                {step === "parsing" ? "Parseando…" : "Parsear conversación"}
              </Button>
            </>
          )}

          {/* Paso 2 — Preview y corrección */}
          {(step === "preview" || step === "importing") && (
            <>
              <div>
                <p className="text-sm font-medium mb-1">
                  {preview.length} mensaje{preview.length !== 1 ? "s" : ""} detectado{preview.length !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Revisa las direcciones. Haz clic en <strong>inbound</strong> /
                  <strong> outbound</strong> para corregir. Usa ✕ para eliminar filas de ruido.
                </p>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {preview.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`rounded-md px-3 py-2 text-sm border flex gap-2 items-start ${
                      msg.direction === "outbound"
                        ? "bg-primary/5 border-primary/20"
                        : "bg-muted border-border"
                    }`}
                  >
                    {/* Chip de dirección — click para toggle */}
                    <button
                      onClick={() => toggleDirection(idx)}
                      disabled={step === "importing"}
                      className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                        msg.direction === "outbound"
                          ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                          : "bg-muted-foreground/10 border-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/20"
                      }`}
                      title="Clic para cambiar dirección"
                    >
                      {msg.direction === "outbound" ? "↑ outbound" : "↓ inbound"}
                    </button>

                    {/* Cuerpo del mensaje */}
                    <p className="flex-1 whitespace-pre-wrap leading-snug text-xs line-clamp-3">
                      {msg.body}
                    </p>

                    {/* Botón eliminar */}
                    <button
                      onClick={() => deleteRow(idx)}
                      disabled={step === "importing"}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors text-xs leading-none mt-0.5"
                      title="Eliminar esta fila"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 flex-wrap pt-1">
                <Button
                  onClick={handleImport}
                  disabled={step === "importing" || preview.length === 0}
                  size="sm"
                >
                  {step === "importing"
                    ? "Importando…"
                    : `Confirmar e importar ${preview.length} mensaje${preview.length !== 1 ? "s" : ""}`}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("idle")}
                  disabled={step === "importing"}
                >
                  ← Volver a editar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
