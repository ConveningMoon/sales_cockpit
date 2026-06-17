import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que Turbopack intente bundlear estos paquetes server-side
  // que usan imports node:* (cuyos nombres son inválidos como archivos en Windows)
  serverExternalPackages: ["@anthropic-ai/sdk", "openai"],
  // Incluye prompts/ en el bundle de las funciones serverless de Vercel.
  // Necesario porque draft.ts lee respuesta-lead.md con fs.readFileSync en runtime.
  // Editar el .md + redeploy es suficiente para actualizar el prompt en producción.
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**"],
  },
};

export default nextConfig;
