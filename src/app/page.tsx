export default function CockpitPage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">ITMANO Sales Cockpit</h1>
      <p className="mt-2 text-gray-500">Slice 1 completado — fundaciones listas.</p>
      <a href="/api/health" className="mt-4 inline-block text-sm text-blue-600 underline">
        Ver estado del sistema →
      </a>
    </main>
  );
}
