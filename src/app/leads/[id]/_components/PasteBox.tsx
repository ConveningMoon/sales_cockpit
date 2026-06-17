"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  onPaste: (text: string) => Promise<void>;
  loading: boolean;
};

export function PasteBox({ onPaste, loading }: Props) {
  const [text, setText] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    await onPaste(trimmed);
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Pegar nueva respuesta del lead
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Pega aquí el último mensaje del lead..."
        rows={4}
        disabled={loading}
        className="resize-none text-sm"
      />
      <Button
        type="submit"
        disabled={loading || !text.trim()}
        className="w-full sm:w-auto"
      >
        {loading ? "Generando borrador…" : "Pegar y generar borrador"}
      </Button>
    </form>
  );
}
