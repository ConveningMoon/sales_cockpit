"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Papa from "papaparse";
import { filterLh2Rows } from "@/lib/lh/parser";

type Props = { batchId: string };

type ImportResult = {
  added: number;
  updated: number;
  leadCount: number;
  errors: { row: number; message: string }[];
};

export function AddLeadsUploader({ batchId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFile(file: File) {
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      delimiter: ";",
      skipEmptyLines: "greedy",
      encoding: "UTF-8",
      complete(parsed) {
        const filtered = filterLh2Rows(parsed.data);
        if (filtered.length === 0) {
          toast.error("El archivo no contiene filas válidas (lh_id vacío).");
          return;
        }
        setRows(filtered);
        setFileName(file.name);
      },
      error(err) {
        toast.error(`Error al parsear el CSV: ${err.message}`);
      },
    });
  }

  async function handleImport() {
    if (!rows || rows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/add-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data: ImportResult = await res.json();
      if (!res.ok) {
        const errMsg = (data as unknown as { error?: string }).error ?? "Error al importar.";
        toast.error(errMsg);
        return;
      }
      setResult(data);
      if (data.errors.length > 0) {
        toast.warning(`${data.errors.length} fila${data.errors.length !== 1 ? "s" : ""} con error.`);
      }
      if (data.added > 0) {
        toast.success(`${data.added} lead${data.added !== 1 ? "s" : ""} nuevo${data.added !== 1 ? "s" : ""} agregado${data.added !== 1 ? "s" : ""}.`);
        router.refresh();
      } else {
        toast.info("Sin leads nuevos — todos ya existían en el batch.");
      }
    } catch {
      toast.error("Error de red al importar.");
    } finally {
      setImporting(false);
    }
  }

  const gradientBtn =
    "inline-flex items-center justify-center px-4 py-1.5 rounded-lg text-xs font-semibold " +
    "text-primary-foreground transition-all duration-150 hover:opacity-90 " +
    "hover:shadow-[0_0_14px_hsl(248_82%_67%/0.35)] disabled:opacity-40";

  return (
    <div className="space-y-3">
      {/* Zona de carga */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={[
          "rounded-lg border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors",
          rows
            ? "border-primary/40 bg-primary/5"
            : "border-border/40 hover:border-border/70",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {rows ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-primary">
              {rows.length} fila{rows.length !== 1 ? "s" : ""} listas — {fileName}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Haz clic para cambiar el archivo
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Arrastra un CSV de LH2 o haz clic para seleccionarlo
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              Mismo formato que la importación inicial · delimitador ;
            </p>
          </div>
        )}
      </div>

      {/* Botón de importar */}
      {rows && !result && (
        <button
          onClick={handleImport}
          disabled={importing}
          className={gradientBtn}
          style={{ background: "var(--gradient-brand)" }}
        >
          {importing
            ? "Importando…"
            : `Agregar ${rows.length} lead${rows.length !== 1 ? "s" : ""} al batch`}
        </button>
      )}

      {/* Resultado */}
      {result && (
        <div className="rounded-lg border border-border/40 bg-background/50 px-4 py-3 text-xs space-y-1">
          <p className="font-semibold text-foreground">
            Importación completada — {result.leadCount} leads en el batch
          </p>
          <div className="flex gap-4 text-muted-foreground">
            <span>
              <span className="text-emerald-400 font-semibold">{result.added}</span> nuevo{result.added !== 1 ? "s" : ""}
            </span>
            <span>
              <span className="text-zinc-400 font-semibold">{result.updated}</span> ya existían
            </span>
            {result.errors.length > 0 && (
              <span>
                <span className="text-rose-400 font-semibold">{result.errors.length}</span> con error
              </span>
            )}
          </div>
          {result.added > 0 && (
            <p className="text-[11px] text-muted-foreground/70 pt-1">
              El pipeline está listo para clasificar y generar secuencias para los nuevos leads.
            </p>
          )}
          <button
            onClick={() => { setRows(null); setResult(null); setFileName(""); }}
            className="mt-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 transition-colors"
          >
            Agregar más leads
          </button>
        </div>
      )}
    </div>
  );
}
