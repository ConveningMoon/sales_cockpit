"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BatchCsvUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [batchName, setBatchName] = useState("");
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
        toast.error(`El CSV tiene errores: ${result.errors[0].message}`);
        return;
      }
      setRows(result.data);
      setRowCount(result.data.length);
      // Pre-rellenar nombre del batch con el nombre del archivo
      if (!batchName) {
        setBatchName(file.name.replace(/\.csv$/i, ""));
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  async function handleCreate() {
    if (!rows || rows.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          name: batchName.trim() || undefined,
        }),
      });

      const data = (await res.json()) as {
        batchId?: string;
        leadCount?: number;
        errors?: { row: number; message: string }[];
        error?: string;
      };

      if (!res.ok) {
        toast.error(data.error ?? "Error al crear el batch.");
        return;
      }

      const errCount = data.errors?.length ?? 0;
      if (errCount > 0) {
        toast.warning(`Batch creado con ${errCount} fila${errCount !== 1 ? "s" : ""} con error.`);
      } else {
        toast.success(`${data.leadCount} lead${data.leadCount !== 1 ? "s" : ""} importado${data.leadCount !== 1 ? "s" : ""}.`);
      }

      router.push(`/batches/${data.batchId}`);
    } catch {
      toast.error("Error de red al crear el batch.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 max-w-lg">
      <p className="text-sm text-muted-foreground">
        Exporta los leads desde Linked Helper 2 como CSV y súbelos aquí para iniciar el pipeline
        de clasificación y generación de secuencia de outreach.
      </p>

      {/* Nombre del batch */}
      <div className="space-y-1.5">
        <Label htmlFor="batch-name" className="text-xs font-medium text-muted-foreground">
          Nombre del batch{" "}
          <span className="font-normal">(se pre-rellena con el nombre del archivo)</span>
        </Label>
        <Input
          id="batch-name"
          value={batchName}
          onChange={(e) => setBatchName(e.target.value)}
          placeholder="Ej: Campaña España junio 2026"
          disabled={loading}
          className="text-sm bg-background/50 border-border/40 focus:border-primary/40"
        />
      </div>

      {/* Zona de carga */}
      <div
        className={[
          "rounded-xl border-2 border-dashed p-8 text-center space-y-3 transition-colors",
          fileName
            ? "border-primary/35 bg-primary/5"
            : "border-border/50 bg-card hover:border-border cursor-pointer",
        ].join(" ")}
        onClick={() => !loading && !fileName && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
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
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
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
              onClick={(e) => { e.stopPropagation(); setFileName(null); setRows(null); setRowCount(null); if (inputRef.current) inputRef.current.value = ""; }}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
              disabled={loading}
            >
              Cambiar archivo
            </button>
          </div>
        )}
      </div>

      {rows && rows.length > 0 && (
        <Button
          onClick={handleCreate}
          disabled={loading}
          className="font-semibold text-primary-foreground disabled:opacity-40 transition-all duration-150
                     enabled:hover:opacity-90 enabled:hover:shadow-[0_0_16px_hsl(248_82%_67%/0.35)]"
          style={!loading ? { background: "var(--gradient-brand)" } : undefined}
        >
          {loading
            ? "Creando batch…"
            : `Crear batch con ${rowCount} lead${rowCount !== 1 ? "s" : ""}`}
        </Button>
      )}
    </div>
  );
}
