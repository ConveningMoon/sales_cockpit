import Link from "next/link";
import { BatchCsvUploader } from "../_components/BatchCsvUploader";

export default function NuevoBatchPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/batches"
            className="text-sm text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            ← Batches
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium text-foreground">Nuevo batch</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-semibold mb-1 text-foreground">Nuevo batch de outreach</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Sube el CSV de LH2, clasifica los leads con IA y genera los datos de mercado por geografía.
        </p>
        <BatchCsvUploader />
      </main>
    </div>
  );
}
