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
  marketBatchInFlight: boolean;
  outreachBatchInFlight: boolean;
};

const POLL_INTERVAL_MS = 5000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function statusLabel(s: BatchStatus): string {
  const map: Record<BatchStatus, string> = {
    pending:         "Pendiente de clasificación",
    classifying:     "Clasificando leads…",
    fetching_market: "Obteniendo datos de mercado…",
    generating:      "Listo para generar secuencias",
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

const gradientBtn =
  "font-semibold text-primary-foreground disabled:opacity-40 transition-all duration-150 " +
  "enabled:hover:opacity-90 enabled:hover:shadow-[0_0_14px_hsl(248_82%_67%/0.35)]";

export function BatchPipeline({
  batchId,
  initialStatus,
  leadCount,
  errorMessage,
  marketBatchInFlight,
  outreachBatchInFlight,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<BatchStatus>(initialStatus);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [noMarketDataCount, setNoMarketDataCount] = useState(0);
  const [generatedCount, setGeneratedCount] = useState(0);

  function showError(data: { error?: string; stage?: string; context?: unknown }, fallback: string) {
    const parts = [
      data.error ?? fallback,
      data.stage ? `[etapa: ${data.stage}]` : null,
      data.context ? `Contexto: ${JSON.stringify(data.context)}` : null,
    ].filter(Boolean).join(" — ");
    setLocalError(parts);
    toast.error(parts);
    setStatus("error");
    router.refresh();
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

        const d = data!;
        classified += d.classified ?? 0;
        const total = d.total ?? leadCount;
        setProgress(`${classified} / ${total} clasificado${classified !== 1 ? "s" : ""}`);

        if (d.errors && d.errors.length > 0) {
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

  async function resetAndRetryMarket() {
    setRunning(true);
    setLocalError(null);
    try {
      const { ok, data } = await safeFetch<{ ok?: boolean; error?: string }>(
        `/api/batches/${batchId}/reset-market`,
        { method: "POST" },
      );
      if (!ok) {
        const msg = (data?.error) ?? "Error al reintentar datos de mercado.";
        setLocalError(msg);
        toast.error(msg);
        setStatus("error");
        return;
      }
      setStatus("fetching_market");
    } finally {
      setRunning(false);
    }
    await runMarketData();
  }

  async function runMarketData() {
    setRunning(true);
    setLocalError(null);

    try {
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

  async function runGenerate() {
    setRunning(true);
    setLocalError(null);

    try {
      // 1. Submit (idempotente: si ya hay job devuelve alreadySubmitted)
      setProgress("Enviando secuencias a la cola de Anthropic…");
      const submit = await safeFetch<{
        submitted?: number;
        noMarketDataCount?: number;
        outreachBatchId?: string;
        alreadySubmitted?: boolean;
        done?: boolean;    // true si 0 leads A/B → ya avanzó a done
        error?: string;
        stage?: string;
        context?: unknown;
      }>(`/api/batches/${batchId}/generate`, { method: "POST" });

      if (!submit.ok) {
        showError(submit.data ?? {}, "Error al enviar el batch de secuencias.");
        return;
      }
      const sd = submit.data!;

      // Sin leads A/B — ya avanzó directo a done
      if (sd.done) {
        toast.success("Sin leads A/B para generar. Pipeline completo.");
        setStatus("done");
        setProgress(null);
        router.refresh();
        return;
      }

      const noMd = sd.noMarketDataCount ?? 0;
      if (noMd > 0) {
        toast.warning(
          `${noMd} lead${noMd !== 1 ? "s" : ""} del grupo A se generará${noMd !== 1 ? "n" : ""} sin datos de mercado.`,
        );
      }
      if (sd.submitted) {
        toast.success(`${sd.submitted} lead${sd.submitted !== 1 ? "s" : ""} enviado${sd.submitted !== 1 ? "s" : ""} a la cola.`);
      }

      // 2. Poll loop — el batch corre en Anthropic
      while (true) {
        await sleep(POLL_INTERVAL_MS);
        const poll = await safeFetch<{
          status?: "in_progress" | "ended";
          done?: boolean;
          processed?: number;
          failed?: number;
          counts?: { succeeded: number; errored: number; expired: number; canceled: number; processing: number };
          errors?: { leadId: string; detail: string }[];
          error?: string;
          stage?: string;
          context?: unknown;
        }>(`/api/batches/${batchId}/generate/poll`, { method: "POST" });

        if (!poll.ok) {
          showError(poll.data ?? {}, "Error al consultar el batch de secuencias.");
          return;
        }
        const pd = poll.data!;

        if (pd.status === "in_progress") {
          const c = pd.counts;
          const listas = c ? c.succeeded + c.errored + c.expired + c.canceled : 0;
          const total = sd.submitted ?? leadCount;
          setProgress(`Generando secuencias… ${listas} / ${total} listas`);
          continue;
        }

        // ended
        const generated = pd.processed ?? 0;
        setGeneratedCount(generated);
        setNoMarketDataCount(noMd);

        if (pd.failed && pd.failed > 0) {
          const first = pd.errors?.[0];
          const detail = first ? ` (lead ${first.leadId}: ${first.detail})` : "";
          toast.warning(`Generación: ${generated} ok, ${pd.failed} con error.${detail}`);
        } else {
          toast.success(`${generated} secuencia${generated !== 1 ? "s" : ""} generada${generated !== 1 ? "s" : ""}.`);
        }
        setStatus("done");
        setProgress(null);
        router.refresh();
        break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de red en la generación.";
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

      {/* Error */}
      {status === "error" && (localError ?? errorMessage) && (
        <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900/60 rounded-lg px-4 py-3 whitespace-pre-wrap wrap-break-word">
          {localError ?? errorMessage}
        </p>
      )}

      {/* Acciones por etapa */}
      <div className="flex flex-wrap gap-3 items-center">
        {status === "pending" && (
          <Button
            onClick={runClassify}
            disabled={running}
            className={gradientBtn}
            style={!running ? { background: "var(--gradient-brand)" } : undefined}
          >
            {running ? "Clasificando…" : `Clasificar ${leadCount} lead${leadCount !== 1 ? "s" : ""}`}
          </Button>
        )}

        {status === "classifying" && !running && (
          <Button
            onClick={runClassify}
            disabled={running}
            className={gradientBtn}
            style={{ background: "var(--gradient-brand)" }}
          >
            Retomar clasificación
          </Button>
        )}

        {status === "fetching_market" && (
          <Button
            onClick={runMarketData}
            disabled={running}
            className={gradientBtn}
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
          <Button
            onClick={runGenerate}
            disabled={running}
            className={gradientBtn}
            style={!running ? { background: "var(--gradient-brand)" } : undefined}
          >
            {running
              ? "Generando secuencias…"
              : outreachBatchInFlight
                ? "Verificar progreso de generación"
                : "Generar secuencias"}
          </Button>
        )}

        {status === "error" && (
          <Button
            onClick={resetAndRetryMarket}
            disabled={running}
            className={gradientBtn}
            style={!running ? { background: "var(--gradient-brand)" } : undefined}
          >
            {running ? "Reintentando mercado…" : "Reintentar datos de mercado"}
          </Button>
        )}

        {status === "done" && (
          <>
            <a
              href={`/api/batches/${batchId}/export`}
              download
              className={
                "inline-flex items-center justify-center h-9 px-4 rounded-md text-sm " +
                "font-semibold text-primary-foreground transition-all duration-150 " +
                "hover:opacity-90 hover:shadow-[0_0_14px_hsl(248_82%_67%/0.35)]"
              }
              style={{ background: "var(--gradient-brand)" }}
            >
              Exportar CSV para LH2
            </a>
            {generatedCount > 0 && (
              <span className="text-xs text-emerald-400">
                {generatedCount} lead{generatedCount !== 1 ? "s" : ""} con secuencias
                {noMarketDataCount > 0 && (
                  <span className="text-amber-400 ml-1">
                    ({noMarketDataCount} grupo A sin datos de mercado)
                  </span>
                )}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
