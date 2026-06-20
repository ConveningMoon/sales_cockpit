"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { BatchStatus } from "@/types/database";

type Props = {
  batchId: string;
  initialStatus: BatchStatus;
  leadCount: number;
  errorMessage: string | null;
};

function statusLabel(s: BatchStatus): string {
  const map: Record<BatchStatus, string> = {
    pending:         "Pendiente de clasificación",
    classifying:     "Clasificando leads…",
    fetching_market: "Obteniendo datos de mercado…",
    generating:      "Listo para generación",
    done:            "Completo",
    error:           "Error",
  };
  return map[s] ?? s;
}

function statusBadgeClass(s: BatchStatus): string {
  const map: Record<BatchStatus, string> = {
    pending:         "bg-zinc-800 text-zinc-300 border border-zinc-700/60",
    classifying:     "bg-indigo-950 text-indigo-300 border border-indigo-800/60",
    fetching_market: "bg-blue-950 text-blue-300 border border-blue-800/60",
    generating:      "bg-teal-950 text-teal-300 border border-teal-800/60",
    done:            "bg-emerald-900 text-emerald-200 border border-emerald-700/60",
    error:           "bg-rose-950 text-rose-400 border border-rose-900/60",
  };
  return map[s] ?? "bg-zinc-800 text-zinc-300 border border-zinc-700";
}

export function BatchPipeline({ batchId, initialStatus, leadCount, errorMessage }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<BatchStatus>(initialStatus);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function runClassify() {
    setRunning(true);
    setStatus("classifying");
    let classified = 0;

    try {
      while (true) {
        const res = await fetch(`/api/batches/${batchId}/classify`, { method: "POST" });
        const data = (await res.json()) as {
          classified?: number;
          total?: number;
          remaining?: number;
          done?: boolean;
          errors?: { leadId: string; message: string }[];
          error?: string;
        };

        if (!res.ok) {
          toast.error(data.error ?? "Error en la clasificación.");
          setStatus("error");
          return;
        }

        classified += data.classified ?? 0;
        const total = data.total ?? leadCount;
        setProgress(`${classified} / ${total} clasificado${classified !== 1 ? "s" : ""}`);

        if (data.errors && data.errors.length > 0) {
          toast.warning(`${data.errors.length} lead${data.errors.length !== 1 ? "s" : ""} con error de clasificación (marcado${data.errors.length !== 1 ? "s" : ""} como NO_ESCRIBIR).`);
        }

        if (data.done) break;
      }

      toast.success("Clasificación completada.");
      setStatus("fetching_market");
      setProgress(null);
      router.refresh();
    } catch {
      toast.error("Error de red durante la clasificación.");
      setStatus("error");
    } finally {
      setRunning(false);
    }
  }

  async function runMarketData() {
    setRunning(true);
    let processed = 0;
    let cached = 0;

    try {
      while (true) {
        const res = await fetch(`/api/batches/${batchId}/market-data`, { method: "POST" });
        const data = (await res.json()) as {
          done?: boolean;
          total?: number;
          processed?: number;
          cached?: number;
          remaining?: number;
          country?: string;
          city?: string | null;
          error?: string;
        };

        if (!res.ok) {
          toast.error(data.error ?? "Error al obtener datos de mercado.");
          setStatus("error");
          return;
        }

        if (data.processed) processed += data.processed;
        if (data.cached) cached += data.cached;

        if (data.country) {
          const geo = [data.city, data.country].filter(Boolean).join(", ");
          setProgress(`Mercado: ${geo}${data.cached ? " (caché)" : " ✓"} — ${processed + cached} / ${data.total ?? "?"}`);
        }

        if (data.done) break;
      }

      toast.success("Datos de mercado obtenidos.");
      setStatus("generating");
      setProgress(null);
      router.refresh();
    } catch {
      toast.error("Error de red al obtener datos de mercado.");
      setStatus("error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Estado actual */}
      <div className="flex items-center gap-3">
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${statusBadgeClass(status)}`}>
          {statusLabel(status)}
        </span>
        {running && progress && (
          <span className="text-xs text-muted-foreground">{progress}</span>
        )}
      </div>

      {/* Error */}
      {status === "error" && errorMessage && (
        <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900/60 rounded-lg px-4 py-3">
          {errorMessage}
        </p>
      )}

      {/* Acciones por etapa */}
      <div className="flex flex-wrap gap-3">
        {(status === "pending") && (
          <Button
            onClick={runClassify}
            disabled={running}
            className="font-semibold text-primary-foreground disabled:opacity-40 transition-all duration-150
                       enabled:hover:opacity-90 enabled:hover:shadow-[0_0_14px_hsl(248_82%_67%/0.35)]"
            style={!running ? { background: "var(--gradient-brand)" } : undefined}
          >
            {running ? "Clasificando…" : `Clasificar ${leadCount} lead${leadCount !== 1 ? "s" : ""}`}
          </Button>
        )}

        {(status === "classifying" && !running) && (
          <Button
            onClick={runClassify}
            disabled={running}
            className="font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-brand)" }}
          >
            Retomar clasificación
          </Button>
        )}

        {status === "fetching_market" && (
          <Button
            onClick={runMarketData}
            disabled={running}
            className="font-semibold text-primary-foreground disabled:opacity-40 transition-all duration-150
                       enabled:hover:opacity-90 enabled:hover:shadow-[0_0_14px_hsl(248_82%_67%/0.35)]"
            style={!running ? { background: "var(--gradient-brand)" } : undefined}
          >
            {running ? "Obteniendo mercado…" : "Obtener datos de mercado"}
          </Button>
        )}

        {status === "generating" && (
          <p className="text-sm text-muted-foreground italic">
            Listo para generación de secuencias — disponible en Push B.
          </p>
        )}

        {status === "done" && (
          <p className="text-sm text-emerald-400">
            Pipeline completo. El export CSV estará disponible en Push B.
          </p>
        )}
      </div>
    </div>
  );
}
