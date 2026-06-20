import type { AiTaskType } from "@/types/database";

export type { AiTaskType };

export type AiProviderType = "anthropic" | "openrouter";

export interface AIRouterConfig {
  model: string;
  provider: AiProviderType;
  costPerInputToken: number;
  costPerOutputToken: number;
}

export interface AICallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  webSearchRequests: number;
  webSearchCostUsd: number;
  model: string;
  provider: AiProviderType;
  costUsd: number;
}

export interface AICallOptions {
  taskType: AiTaskType;
  systemPrompt: string;
  userMessage: string;
  model?: string;
  webSearch?: boolean;
  webSearchMaxUses?: number;
  leadId?: string;
  maxTokens?: number;
}

export interface ProviderResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  webSearchRequests: number;
}

export interface ProviderCallParams {
  systemPrompt: string;
  userMessage: string;
  model: string;
  maxTokens: number;
  webSearch: boolean;
  webSearchMaxUses?: number;
}
