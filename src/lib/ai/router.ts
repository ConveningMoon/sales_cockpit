import { createServerClient } from "@/lib/supabase/server";
import type { AICallOptions, AICallResult, AIRouterConfig } from "./types";
import type { AiTaskType } from "@/types/database";
import { getModel, DEFAULT_MODELS } from "./models";
import { AnthropicProvider, OpenRouterProvider } from "./provider";

const anthropicProvider = new AnthropicProvider();
const openRouterProvider = new OpenRouterProvider();

const WEB_SEARCH_COST_USD: Record<"anthropic" | "openrouter", number> = {
  anthropic: 0.01,    // $10 / 1000 búsquedas (Anthropic nativo)
  openrouter: 0.005,  // $0.005 / req (plugin Exa)
};

// Mantenido para compatibilidad con el healthcheck
export function getRouterConfig(taskType: AiTaskType): AIRouterConfig {
  const modelId = DEFAULT_MODELS[taskType];
  const config = getModel(modelId);
  return {
    model: config.id,
    provider: config.provider,
    costPerInputToken: config.costPerInputToken,
    costPerOutputToken: config.costPerOutputToken,
  };
}

export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const modelId = options.model ?? DEFAULT_MODELS[options.taskType];
  const modelConfig = getModel(modelId);

  if (options.webSearch && !modelConfig.supportsWebSearch) {
    throw new Error(
      `[AI Router] El modelo "${modelConfig.label}" (${modelId}) no soporta búsqueda web. ` +
        `Elige un modelo con supportsWebSearch=true o desactiva el flag.`
    );
  }

  const provider =
    modelConfig.provider === "anthropic" ? anthropicProvider : openRouterProvider;

  const raw = await provider.complete({
    systemPrompt: options.systemPrompt,
    userMessage: options.userMessage,
    model: modelId,
    maxTokens: options.maxTokens ?? 2048,
    webSearch: options.webSearch ?? false,
  });

  const tokenCostUsd =
    raw.inputTokens * modelConfig.costPerInputToken +
    raw.outputTokens * modelConfig.costPerOutputToken +
    raw.cachedTokens * modelConfig.costPerCacheReadToken;

  const webSearchCostUsd =
    raw.webSearchRequests > 0
      ? raw.webSearchRequests * WEB_SEARCH_COST_USD[modelConfig.provider]
      : 0;

  const costUsd = tokenCostUsd + webSearchCostUsd;

  // Registrar en ai_usage de forma no bloqueante
  logAiUsage({
    taskType: options.taskType,
    model: modelId,
    provider: modelConfig.provider,
    leadId: options.leadId,
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    cachedTokens: raw.cachedTokens,
    costUsd,
  }).catch((err) =>
    console.error("[AI Router] Error al registrar ai_usage:", err)
  );

  return {
    content: raw.content,
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    cachedTokens: raw.cachedTokens,
    webSearchRequests: raw.webSearchRequests,
    webSearchCostUsd,
    model: modelId,
    provider: modelConfig.provider,
    costUsd,
  };
}

async function logAiUsage(params: {
  taskType: AiTaskType;
  model: string;
  provider: string;
  leadId?: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
}) {
  const supabase = createServerClient();
  const { error } = await supabase.from("ai_usage").insert({
    task_type: params.taskType,
    model: params.model,
    provider: params.provider,
    lead_id: params.leadId ?? null,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cached_tokens: params.cachedTokens,
    cost_usd: params.costUsd,
  });
  if (error) throw error;
}
