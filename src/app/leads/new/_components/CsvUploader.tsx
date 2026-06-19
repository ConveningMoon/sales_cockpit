"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ImportResult {
  created: number;
  updated: number;
  leadIds: string[];
  errors: { row: number; message: string }[];
}

export function CsvUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [loading, setLoading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setRows(null);
    setRowCount(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });

      if (result.errors.length > 0) {
        toast.error(
          `El CSV tiene errores de formato: ${result.errors[0].message}`
        );
        return;
      }

      setRows(result.data);
      setRowCount(result.data.length);
    };
    reader.readAsText(file, "UTF-8");
  }

  async function handleImport() {
    if (!rows || rows.length === 0) return;
    setLoading(true);

    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const data = (await res.json()) as ImportResult & { error?: string };

      if (!res.ok) {
        toast.error(data.error ?? "Error al importar.");
        return;
      }

      const total = data.created + data.updated;
      const errCount = data.errors.length;

      if (total === 0 && errCount > 0) {
        toast.error(
          `Ningún lead importado. Primer error (fila ${data.errors[0].row}): ${data.errors[0].message}`
        );
        return;
      }

      const msg = [
        data.created > 0 && `${data.created} creado${data.created > 1 ? "s" : ""}`,
        data.updated > 0 && `${data.updated} actualizado${data.updated > 1 ? "s" : ""}`,
        errCount > 0 && `${errCount} con error`,
      ]
        .filter(Boolean)
        .join(", ");

      if (total === 1 && data.leadIds[0]) {
        toast.success(`Lead importado: ${msg}`);
        router.push(`/leads/${data.leadIds[0]}`);
      } else {
        toast.success(`Importación completa: ${msg}`);
        router.push("/");
      }
    } catch {
      toast.error("Error de red al importar.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setFileName(null);
    setRows(null);
    setRowCount(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const canImport = !!(rows && rows.length > 0);

  return (
    <div className="space-y-5 max-w-lg">
      <p className="text-sm text-muted-foreground">
        Exporta tus leads desde Linked Helper 2 como CSV y súbelo aquí. El sistema hace upsert por{" "}
        <code className="text-xs bg-muted/80 border border-border/40 px-1 py-0.5 rounded font-mono">
          lh_id
        </code>{" "}
        — los leads existentes se actualizan sin perder el estado ni la clasificación.
      </p>

      {/* Zona de carga */}
      <div
        className={[
          "rounded-xl border-2 border-dashed p-8 text-center space-y-3 transition-colors cursor-pointer",
          fileName
            ? "border-primary/35 bg-primary/5"
            : "border-border/50 bg-card hover:border-border hover:bg-card/80",
        ].join(" ")}
        onClick={() => !loading && !fileName && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          id="csv-input"
          onChange={handleFileChange}
          disabled={loading}
        />

        {!fileName ? (
          <>
            <p className="text-sm text-muted-foreground">
              Arrastra un CSV de LH2 o haz clic para seleccionar
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              disabled={loading}
              className="border-border/60 text-muted-foreground hover:text-foreground"
            >
              Seleccionar archivo
            </Button>
          </>
        ) : (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">{fileName}</p>
            {rowCount !== null && (
              <p className="text-xs text-muted-foreground">
                {rowCount} fila{rowCount !== 1 ? "s" : ""} detectada{rowCount !== 1 ? "s" : ""}
              </p>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
              disabled={loading}
            >
              Cambiar archivo
            </button>
          </div>
        )}
      </div>

      {canImport && (
        <Button
          onClick={handleImport}
          disabled={loading}
          className="font-semibold text-primary-foreground disabled:opacity-40 transition-all duration-150
                     enabled:hover:opacity-90 enabled:hover:shadow-[0_0_16px_hsl(248_82%_67%/0.35)]"
          style={!loading ? { background: "var(--gradient-brand)" } : undefined}
        >
          {loading
            ? "Importando…"
            : `Importar ${rowCount} lead${rowCount !== 1 ? "s" : ""}`}
        </Button>
      )}
    </div>
  );
}
