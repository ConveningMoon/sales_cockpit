import fs from "fs";
import path from "path";

// Cache en memoria — se limpia en cada cold start (Vercel destruye instancias al redeploy).
let _clasificacion: ParsedPrompt | null = null;
let _marketData: ParsedPrompt | null = null;

interface ParsedPrompt {
  system: string;
  userTemplate: string;
}

function readPrompt(filename: string): string {
  const filePath = path.join(process.cwd(), "prompts", filename);
  return fs.readFileSync(filePath, "utf-8");
}

function parsePromptFile(content: string, filename: string): ParsedPrompt {
  const systemMatch = content.match(/## SYSTEM\s*([\s\S]*?)(?=## USER)/);
  const userMatch = content.match(/## USER[^\n]*\n+```[^\n]*\n([\s\S]*?)```/);

  if (!systemMatch || !userMatch) {
    throw new Error(
      `[prompts] Formato inválido en ${filename}: faltan ## SYSTEM o ## USER con bloque de código.`
    );
  }

  return {
    system: systemMatch[1].trim(),
    userTemplate: userMatch[1].trim(),
  };
}

export function getClasificacionPrompt(): ParsedPrompt {
  if (!_clasificacion) {
    _clasificacion = parsePromptFile(readPrompt("clasificacion.md"), "clasificacion.md");
  }
  return _clasificacion;
}

export function getMarketDataPrompt(): ParsedPrompt {
  if (!_marketData) {
    _marketData = parsePromptFile(readPrompt("market-data.md"), "market-data.md");
  }
  return _marketData;
}

// Elimina fences markdown y trailing commas antes de JSON.parse().
export function cleanJsonOutput(raw: string): string {
  return raw
    .replace(/^```json?\s*/im, "")
    .replace(/```\s*$/im, "")
    .replace(/,(\s*[}\]])/g, "$1")
    .trim();
}
