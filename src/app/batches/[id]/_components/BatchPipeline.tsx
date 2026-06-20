"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { safeFetch } from "@/lib/http/safeFetch";
import type { BatchStatus } from "@/types/database";

type Props = {
  batchId: string;
  initialStatus: BatchStatus;
  leadCount: number;
  errorMessage: string | null;
  // true si ya hay un job de market data en vuelo (permite "Verificar progreso")
  marketBatchInFlight: boolean;
};

const POLL_INTERVAL_MS = 5000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

export function BatchPipeline({ batchId, initialStatus, leadCount, errorMessage, marketBatchInFlight }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<BatchStatus>(initialStatus);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // Detalle de error local — se muestra antes de que router.refresh() cargue el de DB
  const [localError, setLocalError] = useState<string | null>(null);

  function showError(data: { error?: string; stage?: string; context?: unknown }, fallback: string) {
    const parts = [
      data.error ?? fallback,
      data.stage ? `[etapa: ${data.stage}]` : null,
      data.context ? `Contexto: ${JSON.stringify(data.context)}` : null,
    ].filter(Boolean).join(" — ");
    setLocalError(parts);
    toast.error(parts);
    setStatus("error");
    router.refresh(); // cargar error_message de DB
  }

  async function runClassify() {
    setRunning(true);
    setLocalError(null);
    setStatus("classifying");
    let classified = 0;

    try {
      while (true) {
        const { ok, data } = await safeFetch<{
          classified?: number;
          total?: number;
          remaining?: number;
          done?: boolean;
          errors?: { leadId: string; message: string }[];
          error?: string;
          stage?: string;
          context?: unknown;
        }>(`/api/batches/${batchId}/classify`, { method: "POST" });

        if (!ok) {
          showError(data ?? {}, "Error en la clasificación.");
          return;
        }

        // safeFetch lanza si el body no es JSON; si llegamos aquí con ok=true, data != null
        const d = data!;
        classified += d.classified ?? 0;
        const total = d.total ?? leadCount;
        setProgress(`${classified} / ${total} clasificado${classified !== 1 ? "s" : ""}`);

        if (d.errors && d.errors.length > 0) {
          // Mostrar el primer error con detalle; resumir el resto
          const first = d.errors[0].message;
          const extra = d.errors.length > 1 ? ` (+${d.errors.length - 1} más)` : "";
          toast.warning(`Clasificación parcial: ${first}${extra}`);
        }

        if (d.done) break;
      }

      toast.success("Clasificación completada.");
      setStatus("fetching_market");
      setProgress(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de red durante la clasificación.";
      setLocalError(msg);
      toast.error(msg);
      setStatus("error");
    } finally {
      setRunning(false);
    }
  }

  async function runMarketData() {
    setRunning(true);
    setLocalError(null);

    try {
      // 1. Submit (idempotente: si ya hay job en vuelo devuelve alreadySubmitted)
      setProgress("Enviando geografías a la cola de Anthropic…");
      const submit = await safeFetch<{
        done?: boolean;
        submitted?: number;
        cached?: number;
        total?: number;
        alreadySubmitted?: boolean;
        error?: string;
        stage?: string;
        context?: unknown;
      }>(`/api/batches/${batchId}/market-data/submit`, { method: "POST" });

      if (!submit.ok) {
        showError(submit.data ?? {}, "Error al enviar el batch de market data.");
        return;
      }
      const sd = submit.data!;

      // Nada que buscar (todo en caché o sin leads A/B) → ya avanzó a generating
      if (sd.done) {
        toast.success("Datos de mercado listos (todo en caché).");
        setStatus("generating");
        setProgress(null);
        router.refresh();
        return;
      }

      if (sd.submitted) {
        toast.success(`${sd.submitted} geografía${sd.submitted !== 1 ? "s" : ""} en cola${sd.cached ? ` (${sd.cached} en caché)` : ""}.`);
      }

      // 2. Poll loop — el batch corre en Anthropic, no en Vercel (sin timeout)
      while (true) {
        await sleep(POLL_INTERVAL_MS);
        const poll = await safeFetch<{
          status?: "in_progress" | "ended";
          done?: boolean;
          processed?: number;
          failed?: number;
          total?: number;
          counts?: { succeeded: number; errored: number; expired: number; canceled: number; processing: number };
          errors?: { geography: string; detail: string }[];
          error?: string;
          stage?: string;
          context?: unknown;
        }>(`/api/batches/${batchId}/market-data/poll`, { method: "POST" });

        if (!poll.ok) {
          showError(poll.data ?? {}, "Error al consultar el batch de market data.");
          return;
        }
        const pd = poll.data!;

        if (pd.status === "in_progress") {
          const c = pd.counts;
          const listas = c ? c.succeeded + c.errored + c.expired + c.canceled : 0;
          setProgress(`Procesando mercado (batch async)… ${listas} / ${pd.total ?? "?"} listas`);
          continue;
        }

        // ended
        if (pd.failed && pd.failed > 0) {
          const first = pd.errors?.[0];
          const detail = first ? ` Primera: "${first.geography}": ${first.detail}` : "";
          toast.warning(`Mercado: ${pd.processed} ok, ${pd.failed} con error.${detail}`);
        } else {
          toast.success(`Datos de mercado obtenidos (${pd.processed}).`);
        }
        setStatus("generating");
        setProgress(null);
        router.refresh();
        break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de red en market data.";
      setLocalError(msg);
      toast.error(msg);
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

      {/* Error — se muestra el detalle local inmediato o el de DB tras router.refresh() */}
      {status === "error" && (localError ?? errorMessage) && (
        <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900/60 rounded-lg px-4 py-3 whitespace-pre-wrap wrap-break-word">
          {localError ?? errorMessage}
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
            {running
              ? "Procesando mercado…"
              : marketBatchInFlight
                ? "Verificar progreso del mercado"
                : "Obtener datos de mercado"}
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
