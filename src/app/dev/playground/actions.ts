"use server";

import { callAI } from "@/lib/ai/router";
import type { AICallResult } from "@/lib/ai/types";

export interface PlaygroundParams {
  model: string;
  webSearch: boolean;
  systemPrompt: string;
  userMessage: string;
}

export interface PlaygroundResult {
  ok: true;
  result: AICallResult;
}

export interface PlaygroundError {
  ok: false;
  error: string;
}

export async function runPlayground(
  params: PlaygroundParams
): Promise<PlaygroundResult | PlaygroundError> {
  if (process.env.NODE_ENV !== "development") {
    return { ok: false, error: "El playground solo está disponible en modo desarrollo." };
  }
  if (!params.userMessage.trim()) {
    return { ok: false, error: "El mensaje de usuario no puede estar vacío." };
  }
  try {
    const result = await callAI({
      taskType: "other",
      systemPrompt: params.systemPrompt,
      userMessage: params.userMessage,
      model: params.model,
      webSearch: params.webSearch,
      maxTokens: 1024,
    });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
