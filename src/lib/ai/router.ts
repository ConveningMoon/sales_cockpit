import { createServerClient } from "@/lib/supabase/server";
import type { AICallOptions, AICallResult, AIRouterConfig, ProviderResult } from "./types";
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

  const startMs = Date.now();
  let raw: ProviderResult;

  try {
    raw = await provider.complete({
      systemPrompt: options.systemPrompt,
      userMessage: options.userMessage,
      model: modelId,
      maxTokens: options.maxTokens ?? 2048,
      webSearch: options.webSearch ?? false,
      webSearchMaxUses: options.webSearchMaxUses,
    });
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const errorDetail = err instanceof Error
      ? `${err.name}: ${err.message}`
      : String(err);

    console.error(`[AI] FALLO | ${options.taskType} | ${modelId} | ${durationMs}ms`, {
      error: errorDetail,
      context: options.context ?? null,
      webSearch: options.webSearch ?? false,
    });

    // Log del intento fallido — no bloqueante, no oculta el error original
    logAiUsage({
      taskType: options.taskType,
      model: modelId,
      provider: modelConfig.provider,
      leadId: options.leadId,
      status: "error",
      errorDetail,
      durationMs,
      context: options.context,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
    }).catch((logErr) =>
      console.error("[AI Router] Error al registrar ai_usage (intento fallido):", logErr)
    );

    throw err;
  }

  const durationMs = Date.now() - startMs;

  const tokenCostUsd =
    raw.inputTokens * modelConfig.costPerInputToken +
    raw.outputTokens * modelConfig.costPerOutputToken +
    raw.cachedTokens * modelConfig.costPerCacheReadToken;

  const webSearchCostUsd =
    raw.webSearchRequests > 0
      ? raw.webSearchRequests * WEB_SEARCH_COST_USD[modelConfig.provider]
      : 0;

  const costUsd = tokenCostUsd + webSearchCostUsd;

  console.log(
    `[AI] OK | ${options.taskType} | ${modelId} | ${durationMs}ms | ` +
    `in=${raw.inputTokens} out=${raw.outputTokens} cached=${raw.cachedTokens} ` +
    `searches=${raw.webSearchRequests} cost=$${costUsd.toFixed(4)}`
  );

  logAiUsage({
    taskType: options.taskType,
    model: modelId,
    provider: modelConfig.provider,
    leadId: options.leadId,
    status: "ok",
    durationMs,
    context: options.context,
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
  status: "ok" | "error";
  errorDetail?: string;
  durationMs?: number;
  context?: Record<string, unknown>;
}) {
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("ai_usage") as any).insert({
    task_type: params.taskType,
    model: params.model,
    provider: params.provider,
    lead_id: params.leadId ?? null,
    input_tokens: params.inputTokens || null,
    output_tokens: params.outputTokens || null,
    cached_tokens: params.cachedTokens || null,
    cost_usd: params.costUsd || null,
    status: params.status,
    error_detail: params.errorDetail ?? null,
    duration_ms: params.durationMs ?? null,
    context: params.context ?? null,
  });
  if (error) throw error;
}
