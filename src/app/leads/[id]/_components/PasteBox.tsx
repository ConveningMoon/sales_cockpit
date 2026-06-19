"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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

  const hasText = text.trim().length > 0;

  return (
    <div className="rounded-xl border border-primary/25 bg-card/90 p-4 shadow-[0_0_24px_hsl(248_82%_67%/0.06)]">
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
          Nueva respuesta del lead
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pega aquí el último mensaje del lead…"
          rows={4}
          disabled={loading}
          className="resize-none text-sm bg-background/50 border-border/40
                     focus:border-primary/50 focus:ring-1 focus:ring-primary/30
                     placeholder:text-muted-foreground/50 transition-colors"
        />
        <Button
          type="submit"
          disabled={loading || !hasText}
          className="w-full sm:w-auto font-semibold text-primary-foreground
                     transition-all duration-150
                     disabled:opacity-40
                     enabled:hover:opacity-90 enabled:hover:shadow-[0_0_16px_hsl(248_82%_67%/0.35)]"
          style={hasText && !loading ? { background: "var(--gradient-brand)" } : undefined}
        >
          {loading ? "Generando borrador…" : "Pegar y generar borrador"}
        </Button>
      </form>
    </div>
  );
}
