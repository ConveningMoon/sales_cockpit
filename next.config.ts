import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que Turbopack intente bundlear estos paquetes server-side
  // que usan imports node:* (cuyos nombres son inválidos como archivos en Windows)
  serverExternalPackages: ["@anthropic-ai/sdk", "openai"],
};

export default nextConfig;
