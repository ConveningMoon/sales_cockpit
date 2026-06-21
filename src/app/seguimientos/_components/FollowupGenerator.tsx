"use client";

import { useState } from "react";
import { toast } from "sonner";

type Props = {
  leadId: string;
  fuType: "fu1" | "fu2";
};

export function FollowupGenerator({ leadId, fuType }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [body, setBody] = useState("");

  async function generate() {
    setStatus("loading");
    try {
      const res = await fetch(`/api/leads/${leadId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fu_type: fuType }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error al generar el mensaje.");
        setStatus("idle");
        return;
      }
      setBody(data.body);
      setStatus("done");
    } catch {
      toast.error("Error de red al generar el mensaje.");
      setStatus("idle");
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Mensaje copiado al portapapeles.");
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto manualmente.");
    }
  }

  if (status === "idle") {
    return (
      <button
        onClick={generate}
        className={[
          "rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground shrink-0",
          "transition-all duration-150 hover:opacity-90",
          "hover:shadow-[0_0_10px_hsl(248_82%_67%/0.3)]",
        ].join(" ")}
        style={{ background: "var(--gradient-brand)" }}
      >
        Generar {fuType.toUpperCase()}
      </button>
    );
  }

  if (status === "loading") {
    return (
      <div className="w-full mt-2 space-y-1.5 animate-pulse">
        <div className="h-16 rounded-lg bg-muted/60" />
      </div>
    );
  }

  // done
  return (
    <div className="w-full mt-2 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className={[
          "w-full rounded-lg border border-primary/25 px-3 py-2 text-xs resize-none",
          "bg-primary/8 text-foreground",
          "focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40",
          "leading-relaxed",
        ].join(" ")}
      />
      <div className="flex gap-2">
        <button
          onClick={copyToClipboard}
          className={[
            "flex-1 rounded-lg py-1.5 text-xs font-semibold text-primary-foreground",
            "transition-all duration-150 hover:opacity-90",
          ].join(" ")}
          style={{ background: "var(--gradient-brand)" }}
        >
          Copiar
        </button>
        <button
          onClick={() => { setStatus("idle"); setBody(""); }}
          className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground border border-border/50 hover:border-border transition-colors"
        >
          Regenerar
        </button>
      </div>
    </div>
  );
}
