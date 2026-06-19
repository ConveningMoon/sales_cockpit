"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Error de autenticación.");
      }
    } catch {
      setError("Error de red. Vuelve a intentarlo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-4">
        {/* Logo + marca */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div
            className="w-10 h-10 rounded-xl"
            style={{ background: "var(--gradient-brand)" }}
          />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            ITMANO Sales Cockpit
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border bg-card p-8 space-y-5 shadow-[0_4px_24px_hsl(238_16%_4%/0.6)]"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground
                         placeholder:text-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-ring/60 focus:border-ring/40
                         transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg text-sm font-semibold py-2.5 text-primary-foreground
                       disabled:opacity-50 transition-all duration-150
                       hover:opacity-90 hover:shadow-[0_0_14px_hsl(248_82%_67%/0.35)]
                       cursor-pointer"
            style={{ background: "var(--gradient-brand)" }}
          >
            {loading ? "Verificando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}
