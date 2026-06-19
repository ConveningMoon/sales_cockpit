import Link from "next/link";
import { NewLeadTabs } from "./_components/NewLeadTabs";

export default function NuevoLeadPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            ← Bandeja
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium text-foreground">Nuevo lead</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-semibold mb-6 text-foreground">Agregar lead</h1>
        <NewLeadTabs />
      </main>
    </div>
  );
}
