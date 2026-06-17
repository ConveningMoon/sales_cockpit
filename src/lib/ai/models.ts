import type { AiTaskType } from "@/types/database";

export interface ModelConfig {
  id: string;
  label: string;
  provider: "anthropic" | "openrouter";
  supportsCaching: boolean;
  supportsWebSearch: boolean;
  costPerInputToken: number;
  costPerOutputToken: number;
  costPerCacheReadToken: number;
}

export const MODELS: Record<string, ModelConfig> = {
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    supportsCaching: true,
    supportsWebSearch: true,
    costPerInputToken: 3.0 / 1_000_000,
    costPerOutputToken: 15.0 / 1_000_000,
    costPerCacheReadToken: 0.30 / 1_000_000,
  },
  "claude-haiku-4-5-20251001": {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    supportsCaching: true,
    supportsWebSearch: false,
    costPerInputToken: 1.0 / 1_000_000,
    costPerOutputToken: 5.0 / 1_000_000,
    costPerCacheReadToken: 0.10 / 1_000_000,
  },
  "moonshotai/kimi-k2.6": {
    id: "moonshotai/kimi-k2.6",
    label: "Kimi K2.6",
    provider: "openrouter",
    supportsCaching: false,
    supportsWebSearch: true,
    costPerInputToken: 0.68 / 1_000_000,
    costPerOutputToken: 3.41 / 1_000_000,
    costPerCacheReadToken: 0.34 / 1_000_000,
  },
  "deepseek/deepseek-v4-flash": {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    provider: "openrouter",
    supportsCaching: true,
    supportsWebSearch: true,
    costPerInputToken: 0.09 / 1_000_000,
    costPerOutputToken: 0.18 / 1_000_000,
    costPerCacheReadToken: 0.02 / 1_000_000,
  },
  "google/gemini-2.5-flash-lite": {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    provider: "openrouter",
    supportsCaching: true,
    supportsWebSearch: true,
    costPerInputToken: 0.10 / 1_000_000,
    costPerOutputToken: 0.40 / 1_000_000,
    costPerCacheReadToken: 0.01 / 1_000_000,
  },
};

export const DEFAULT_MODELS: Record<AiTaskType, string> = {
  clasificacion: "claude-haiku-4-5-20251001",
  market_data: "claude-haiku-4-5-20251001",
  outreach: "claude-sonnet-4-6",
  draft: "claude-sonnet-4-6",
  other: "claude-haiku-4-5-20251001",
};

export const MODEL_LIST: ModelConfig[] = Object.values(MODELS);

export function getModel(id: string): ModelConfig {
  const config = MODELS[id];
  if (!config) {
    throw new Error(
      `[AI Router] Modelo desconocido: "${id}". Modelos disponibles: ${Object.keys(MODELS).join(", ")}`
    );
  }
  return config;
}
