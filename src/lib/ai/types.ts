import type { AiTaskType } from "@/types/database";

export type { AiTaskType };

export interface AIRouterConfig {
  model: string;
  provider: "anthropic";
  costPerInputToken: number;
  costPerOutputToken: number;
}

export interface AICallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  model: string;
  provider: "anthropic";
  costUsd: number;
}

export interface AICallOptions {
  taskType: AiTaskType;
  systemPrompt: string;
  userMessage: string;
  leadId?: string;
  maxTokens?: number;
}
