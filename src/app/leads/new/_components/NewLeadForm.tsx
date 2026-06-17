"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NewLeadForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const data = {
      full_name: (form.elements.namedItem("full_name") as HTMLInputElement).value.trim(),
      current_position: (form.elements.namedItem("current_position") as HTMLInputElement).value.trim() || undefined,
      current_company: (form.elements.namedItem("current_company") as HTMLInputElement).value.trim() || undefined,
      cs_city: (form.elements.namedItem("cs_city") as HTMLInputElement).value.trim() || undefined,
      cs_country: (form.elements.namedItem("cs_country") as HTMLInputElement).value.trim() || undefined,
      headline: (form.elements.namedItem("headline") as HTMLInputElement).value.trim() || undefined,
      summary: (form.elements.namedItem("summary") as HTMLTextAreaElement).value.trim() || undefined,
    };

    if (!data.full_name) {
      toast.error("El nombre es obligatorio.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json() as { id?: string; error?: string };

      if (!res.ok) {
        toast.error(json.error ?? "Error al crear el lead.");
        return;
      }

      toast.success(`Lead creado correctamente.`);
      router.push(`/leads/${json.id}`);
    } catch {
      toast.error("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      {/* Nombre */}
      <div className="space-y-1.5">
        <Label htmlFor="full_name">
          Nombre completo <span className="text-destructive">*</span>
        </Label>
        <Input
          id="full_name"
          name="full_name"
          placeholder="Ej: María García"
          required
          disabled={loading}
        />
      </div>

      {/* Cargo y empresa */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="current_position">Cargo</Label>
          <Input
            id="current_position"
            name="current_position"
            placeholder="Ej: Directora de Marketing"
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="current_company">Empresa</Label>
          <Input
            id="current_company"
            name="current_company"
            placeholder="Ej: Acme Corp"
            disabled={loading}
          />
        </div>
      </div>

      {/* Ciudad y país */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cs_city">Ciudad</Label>
          <Input
            id="cs_city"
            name="cs_city"
            placeholder="Ej: Buenos Aires"
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs_country">País</Label>
          <Input
            id="cs_country"
            name="cs_country"
            placeholder="Ej: Argentina"
            disabled={loading}
          />
        </div>
      </div>

      {/* Headline */}
      <div className="space-y-1.5">
        <Label htmlFor="headline">Headline (opcional)</Label>
        <Input
          id="headline"
          name="headline"
          placeholder="Ej: Ayudo empresas a crecer con marketing digital"
          disabled={loading}
        />
      </div>

      {/* Summary */}
      <div className="space-y-1.5">
        <Label htmlFor="summary">Summary de LinkedIn (opcional)</Label>
        <Textarea
          id="summary"
          name="summary"
          placeholder="Pega aquí el resumen del perfil de LinkedIn..."
          rows={5}
          disabled={loading}
          className="resize-y text-sm"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={loading}>
          {loading ? "Creando…" : "Crear lead"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
