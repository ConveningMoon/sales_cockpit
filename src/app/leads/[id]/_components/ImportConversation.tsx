"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseConversationText } from "@/lib/ai/conversation-parser";

type RawMsg = { direction: "inbound" | "outbound"; body: string; timestamp_raw: string };

type Draft = { id: string; body: string; model: string };

type Props = {
  leadId: string;
  leadFullName: string;
  myNameDefault: string;
  onImported: (result: { newMessages: ImportedMessage[]; draft: Draft | null }) => void;
};

export type ImportedMessage = {
  id?: string;
  direction: "inbound" | "outbound";
  body: string;
  sent_at: string;
};

type Step = "idle" | "preview" | "importing";

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

  // Edición inline de cuerpo de mensaje en preview
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");

  function reset() {
    setStep("idle");
    setRawText("");
    setMyName(myNameDefault);
    setPreview([]);
    setEditingIdx(null);
    setEditingBody("");
  }

  function handleToggle() {
    if (open) reset();
    setOpen((v) => !v);
  }

  function handleParse() {
    if (!rawText.trim()) {
      toast.error("Pega el texto de la conversación antes de continuar.");
      return;
    }
    if (!myName.trim()) {
      toast.error("Escribe tu nombre en LinkedIn antes de continuar.");
      return;
    }

    // Parseo determinista en el cliente — sin round-trip al servidor
    const parsed = parseConversationText(rawText, myName.trim(), leadFullName);

    if (parsed.length === 0) {
      toast.warning("No se detectaron mensajes. Verifica el texto y los nombres.");
      return;
    }

    setPreview(parsed);
    setStep("preview");
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
    if (editingIdx === idx) {
      setEditingIdx(null);
      setEditingBody("");
    }
    setPreview((prev) => prev.filter((_, i) => i !== idx));
  }

  function startEdit(idx: number, body: string) {
    setEditingIdx(idx);
    setEditingBody(body);
  }

  function cancelEdit() {
    setEditingIdx(null);
    setEditingBody("");
  }

  function saveBodyEdit(idx: number) {
    const trimmed = editingBody.trim();
    if (!trimmed) {
      toast.error("El cuerpo no puede quedar vacío.");
      return;
    }
    setPreview((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, body: trimmed } : m))
    );
    setEditingIdx(null);
    setEditingBody("");
  }

  async function handleImport() {
    if (preview.length === 0) {
      toast.error("No hay mensajes para importar.");
      return;
    }
    if (editingIdx !== null) {
      toast.error("Termina de editar el mensaje antes de importar.");
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
          {step === "idle" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="import-my-name">Tu nombre en LinkedIn</Label>
                <Input
                  id="import-my-name"
                  value={myName}
                  onChange={(e) => setMyName(e.target.value)}
                  placeholder="Ej: Dylan Vergara"
                />
                <p className="text-xs text-muted-foreground">
                  Tal como aparece en la conversación de LinkedIn. Se usa para identificar
                  tus mensajes (outbound) vs. los del lead (inbound).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="import-raw-text">
                  Conversación{" "}
                  <span className="text-muted-foreground font-normal">
                    (pega el texto copiado de LinkedIn)
                  </span>
                </Label>
                <Textarea
                  id="import-raw-text"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={8}
                  placeholder={`${leadFullName}\n\nApr 20\n\nDylan Vergara sent the following messages at 10:22 AM\nHola [nombre], vi tu perfil y...`}
                  className="resize-y text-sm font-mono"
                />
              </div>

              <Button
                onClick={handleParse}
                disabled={!rawText.trim() || !myName.trim()}
                size="sm"
              >
                Parsear conversación
              </Button>
            </>
          )}

          {/* Paso 2 — Preview, corrección e importación */}
          {(step === "preview" || step === "importing") && (
            <>
              <div>
                <p className="text-sm font-medium mb-1">
                  {preview.length} mensaje{preview.length !== 1 ? "s" : ""} detectado
                  {preview.length !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Revisa las direcciones y el cuerpo. Clic en el chip para cambiar
                  dirección. Usa ✎ para editar el texto (útil cuando LinkedIn duplica
                  firmas). Usa ✕ para eliminar filas de ruido.
                </p>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {preview.map((msg, idx) => {
                  const isEditing = editingIdx === idx;
                  return (
                    <div
                      key={idx}
                      className={`rounded-md px-3 py-2 text-sm border ${
                        msg.direction === "outbound"
                          ? "bg-primary/5 border-primary/20"
                          : "bg-muted border-border"
                      }`}
                    >
                      <div className="flex gap-2 items-start">
                        {/* Chip de dirección */}
                        <button
                          onClick={() => toggleDirection(idx)}
                          disabled={step === "importing" || isEditing}
                          className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                            msg.direction === "outbound"
                              ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                              : "bg-muted-foreground/10 border-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/20"
                          } disabled:cursor-default`}
                          title="Clic para cambiar dirección"
                        >
                          {msg.direction === "outbound" ? "↑ outbound" : "↓ inbound"}
                        </button>

                        {/* Cuerpo — display o editor */}
                        {isEditing ? (
                          <div className="flex-1 space-y-1.5">
                            <Textarea
                              value={editingBody}
                              onChange={(e) => setEditingBody(e.target.value)}
                              rows={4}
                              className="text-xs resize-y"
                              autoFocus
                            />
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => saveBodyEdit(idx)}
                              >
                                Guardar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2"
                                onClick={cancelEdit}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="flex-1 whitespace-pre-wrap leading-snug text-xs line-clamp-3">
                            {msg.body}
                          </p>
                        )}

                        {/* Acciones — solo cuando no está editando */}
                        {!isEditing && (
                          <div className="shrink-0 flex gap-1.5 mt-0.5">
                            <button
                              onClick={() => startEdit(idx, msg.body)}
                              disabled={step === "importing"}
                              className="text-muted-foreground hover:text-foreground transition-colors text-xs leading-none"
                              title="Editar cuerpo"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => deleteRow(idx)}
                              disabled={step === "importing"}
                              className="text-muted-foreground hover:text-destructive transition-colors text-xs leading-none"
                              title="Eliminar esta fila"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 flex-wrap pt-1">
                <Button
                  onClick={handleImport}
                  disabled={step === "importing" || preview.length === 0 || editingIdx !== null}
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
