import fs from "fs";
import path from "path";

// Cache en memoria — se limpia en cada cold start (Vercel destruye instancias al redeploy).
let _clasificacion: ParsedPrompt | null = null;
let _marketData: ParsedPrompt | null = null;
let _outreachSequence: ParsedPrompt | null = null;

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

export function getOutreachSequencePrompt(): ParsedPrompt {
  if (!_outreachSequence) {
    _outreachSequence = parsePromptFile(readPrompt("outreach-sequence.md"), "outreach-sequence.md");
  }
  return _outreachSequence;
}

export interface OutreachLeadFields {
  full_name: string | null;
  headline: string | null;
  current_position: string | null;
  current_company: string | null;
  cs_city: string | null;
  cs_country: string | null;
  cs_group: string | null;
  summary: string | null;
}

export function buildOutreachUserMessage(
  template: string,
  lead: OutreachLeadFields,
): string {
  const summary = (lead.summary ?? "").slice(0, 1000) || "(sin resumen)";
  return template
    .replace("{cs_group}", lead.cs_group ?? "")
    .replace("{full_name}", lead.full_name ?? "")
    .replace("{headline}", lead.headline ?? "")
    .replace("{role}", lead.current_position ?? "")
    .replace("{company}", lead.current_company ?? "")
    .replace("{city}", lead.cs_city ?? "(sin ciudad)")
    .replace("{country}", lead.cs_country ?? "")
    .replace("{summary}", summary);
}

// Elimina fences markdown y trailing commas antes de JSON.parse().
export function cleanJsonOutput(raw: string): string {
  return raw
    .replace(/^```json?\s*/im, "")
    .replace(/```\s*$/im, "")
    .replace(/,(\s*[}\]])/g, "$1")
    .trim();
}

// Extrae un objeto JSON de texto que puede traer prosa, narración o fences alrededor.
// El modelo a veces narra ("Con los datos recopilados, genero el JSON:") antes del objeto,
// o lo envuelve en ```json … ```. Estrategia:
//   1) si hay un fence ```json … ``` (o ``` … ```), usa su interior;
//   2) si no, escanea desde el primer "{" con emparejado de llaves balanceado
//      (respetando strings y escapes) hasta su "}" de cierre — no el ingenuo primer-a-último.
// Quita trailing commas. Lanza error claro si no hay objeto o si quedó truncado.
export function extractJsonObject(raw: string): string {
  let text = raw.trim();

  // 1) Interior de un fence de código cerrado, si existe
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  // 2) Escaneo de llaves balanceadas desde el primer "{"
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("No se encontró un objeto JSON en la respuesta del modelo.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) {
    throw new Error("Objeto JSON incompleto (posible truncación de la respuesta del modelo).");
  }

  const candidate = text.slice(start, end + 1);
  // Quitar trailing commas antes de } o ]
  return candidate.replace(/,(\s*[}\]])/g, "$1");
}
