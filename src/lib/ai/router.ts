import type { AICallOptions, AICallResult, AIRouterConfig, AiTaskType } from "./types";

// Ruteo de modelos por tipo de tarea (ver CLAUDE.md § 3)
// Clasificación y extracción → Haiku (costo bajo)
// Generación de mensajes y borradores → Sonnet (calidad)
const MODEL_ROUTING: Record<AiTaskType, AIRouterConfig> = {
  clasificacion: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
    costPerInputToken: 1.0 / 1_000_000,
    costPerOutputToken: 5.0 / 1_000_000,
  },
  market_data: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
    costPerInputToken: 1.0 / 1_000_000,
    costPerOutputToken: 5.0 / 1_000_000,
  },
  outreach: {
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    costPerInputToken: 3.0 / 1_000_000,
    costPerOutputToken: 15.0 / 1_000_000,
  },
  draft: {
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    costPerInputToken: 3.0 / 1_000_000,
    costPerOutputToken: 15.0 / 1_000_000,
  },
  other: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
    costPerInputToken: 1.0 / 1_000_000,
    costPerOutputToken: 5.0 / 1_000_000,
  },
};

export function getRouterConfig(taskType: AiTaskType): AIRouterConfig {
  return MODEL_ROUTING[taskType];
}

// Stub: la implementación real se cablea en el Slice 2 una vez confirmada la auth del SDK.
export async function callAI(options: AICallOptions): Promise<AICallResult> {
  throw new Error(
    `[AI Router] Stub activo para tarea "${options.taskType}". ` +
      "La implementación real se integra en el Slice 2 tras confirmar la autenticación del SDK."
  );
}
