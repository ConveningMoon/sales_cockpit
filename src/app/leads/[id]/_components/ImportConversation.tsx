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
  const [leadNameDisplay, setLeadNameDisplay] = useState(leadFullName);
  const [preview, setPreview] = useState<RawMsg[]>([]);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");

  function reset() {
    setStep("idle");
    setRawText("");
    setMyName(myNameDefault);
    setLeadNameDisplay(leadFullName);
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

    const parsed = parseConversationText(rawText, myName.trim());

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
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
          Importar conversación de LinkedIn
        </h3>
        <button
          onClick={handleToggle}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
        >
          {open ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {open && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
          {step === "idle" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="import-my-name" className="text-xs">
                    Tu nombre en LinkedIn
                  </Label>
                  <Input
                    id="import-my-name"
                    value={myName}
                    onChange={(e) => setMyName(e.target.value)}
                    placeholder="Ej: Dylan Vergara"
                    className="text-sm bg-background/50 border-border/40 focus:border-primary/40"
                  />
                  <p className="text-[11px] text-muted-foreground/70">
                    Tal como aparece en la conversación. Tus mensajes se marcan como outbound.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="import-lead-name" className="text-xs text-muted-foreground">
                    Nombre del lead{" "}
                    <span className="font-normal">(referencia)</span>
                  </Label>
                  <Input
                    id="import-lead-name"
                    value={leadNameDisplay}
                    onChange={(e) => setLeadNameDisplay(e.target.value)}
                    placeholder="Ej: Jordi Fernández"
                    className="text-sm bg-background/50 border-border/40 focus:border-primary/40"
                  />
                  <p className="text-[11px] text-muted-foreground/70">
                    Solo visual — el parseo no depende de coincidencia exacta.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="import-raw-text" className="text-xs text-muted-foreground">
                  Conversación{" "}
                  <span className="font-normal">(pega el texto copiado de LinkedIn)</span>
                </Label>
                <Textarea
                  id="import-raw-text"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={8}
                  placeholder={`${leadFullName}\n\nApr 20\n\nDylan Vergara sent the following messages at 10:22 AM\nHola [nombre], vi tu perfil y...`}
                  className="resize-y text-sm font-mono bg-background/50 border-border/40 focus:border-primary/40"
                />
              </div>

              <Button
                onClick={handleParse}
                disabled={!rawText.trim() || !myName.trim()}
                size="sm"
                className="font-semibold text-primary-foreground disabled:opacity-40"
                style={rawText.trim() && myName.trim() ? { background: "var(--gradient-brand)" } : undefined}
              >
                Parsear conversación
              </Button>
            </>
          )}

          {(step === "preview" || step === "importing") && (
            <>
              <div>
                <p className="text-sm font-medium mb-0.5">
                  {preview.length} mensaje{preview.length !== 1 ? "s" : ""} detectado
                  {preview.length !== 1 ? "s" : ""}
                </p>
                <p className="text-[11px] text-muted-foreground/70">
                  Chip de dirección para cambiar inbound/outbound. ✎ para editar texto. ✕ para eliminar.
                </p>
              </div>

              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {preview.map((msg, idx) => {
                  const isEditing = editingIdx === idx;
                  return (
                    <div
                      key={idx}
                      className={[
                        "rounded-lg px-3 py-2 text-xs border",
                        msg.direction === "outbound"
                          ? "bg-primary/6 border-primary/20"
                          : "bg-card border-border/60",
                      ].join(" ")}
                    >
                      <div className="flex gap-2 items-start">
                        {/* Chip de dirección */}
                        <button
                          onClick={() => toggleDirection(idx)}
                          disabled={step === "importing" || isEditing}
                          className={[
                            "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors disabled:cursor-default",
                            msg.direction === "outbound"
                              ? "border-primary/35 text-primary hover:bg-primary/15"
                              : "border-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/15",
                          ].join(" ")}
                          style={
                            msg.direction === "outbound"
                              ? { background: "hsl(248 82% 67% / 0.10)" }
                              : undefined
                          }
                          title="Clic para cambiar dirección"
                        >
                          {msg.direction === "outbound" ? "↑ out" : "↓ in"}
                        </button>

                        {isEditing ? (
                          <div className="flex-1 space-y-1.5">
                            <Textarea
                              value={editingBody}
                              onChange={(e) => setEditingBody(e.target.value)}
                              rows={4}
                              className="text-xs resize-y bg-background/50 border-border/40 focus:border-primary/40"
                              autoFocus
                            />
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                className="h-6 text-[10px] px-2 font-semibold text-primary-foreground"
                                style={{ background: "var(--gradient-brand)" }}
                                onClick={() => saveBodyEdit(idx)}
                              >
                                Guardar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2 border-border/50"
                                onClick={cancelEdit}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="flex-1 whitespace-pre-wrap leading-snug line-clamp-3 text-foreground/80">
                            {msg.body}
                          </p>
                        )}

                        {!isEditing && (
                          <div className="shrink-0 flex gap-2 mt-0.5">
                            <button
                              onClick={() => startEdit(idx, msg.body)}
                              disabled={step === "importing"}
                              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors text-xs leading-none"
                              title="Editar cuerpo"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => deleteRow(idx)}
                              disabled={step === "importing"}
                              className="text-muted-foreground/50 hover:text-destructive transition-colors text-xs leading-none"
                              title="Eliminar fila"
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
                  className="font-semibold text-primary-foreground disabled:opacity-40"
                  style={
                    step !== "importing" && preview.length > 0 && editingIdx === null
                      ? { background: "var(--gradient-brand)" }
                      : undefined
                  }
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
                  className="border-border/50 text-muted-foreground hover:text-foreground"
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
