import Link from "next/link";
import { NewLeadTabs } from "./_components/NewLeadTabs";

export default function NuevoLeadPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Bandeja
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">Nuevo lead</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-semibold mb-6">Agregar lead</h1>
        <NewLeadTabs />
      </main>
    </div>
  );
}
