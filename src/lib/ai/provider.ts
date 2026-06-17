import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ProviderCallParams, ProviderResult } from "./types";

export interface AiProvider {
  complete(params: ProviderCallParams): Promise<ProviderResult>;
}

// ---------------------------------------------------------------------------
// Proveedor Anthropic (directo, ANTHROPIC_API_KEY)
// Soporta: caching nativo (cache_control), web search nativa (Sonnet+)
// ---------------------------------------------------------------------------
export class AnthropicProvider implements AiProvider {
  private client: Anthropic;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("[AnthropicProvider] ANTHROPIC_API_KEY no está definida en el entorno.");
    }
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async complete(params: ProviderCallParams): Promise<ProviderResult> {
    // web_search_20260209 es un tool nativo de Anthropic sin input_schema — el cast doble
    // es necesario porque Anthropic.Tool lo requiere pero el tool nativo no lo tiene.
    const tools: Anthropic.MessageCreateParams["tools"] = params.webSearch
      ? [{ type: "web_search_20260209", name: "web_search" } as unknown as Anthropic.Tool]
      : undefined;

    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: [
        {
          type: "text",
          text: params.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: params.userMessage }],
      ...(tools ? { tools } : {}),
    });

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const usage = response.usage as Anthropic.Usage & {
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      server_tool_use?: { web_search_requests?: number };
    };

    return {
      content,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cachedTokens: usage.cache_read_input_tokens ?? 0,
      webSearchRequests: usage.server_tool_use?.web_search_requests ?? 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Proveedor OpenRouter (OPENROUTER_API_KEY, base https://openrouter.ai/api/v1)
// Compatible con OpenAI. Kimi, DeepSeek, Gemini y cualquier modelo del catálogo.
// Búsqueda web vía plugin Exa: plugins: [{ id: "web" }].
// Caching: pass-through automático donde el modelo lo soporta (sin cache_control explícito).
// ---------------------------------------------------------------------------
export class OpenRouterProvider implements AiProvider {
  private client: OpenAI;

  constructor() {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("[OpenRouterProvider] OPENROUTER_API_KEY no está definida en el entorno.");
    }
    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "http://localhost:4010",
        "X-Title": "ITMANO Sales Cockpit",
      },
    });
  }

  async complete(params: ProviderCallParams): Promise<ProviderResult> {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userMessage },
      ],
      max_tokens: params.maxTokens,
    };

    if (params.webSearch) {
      body.plugins = [{ id: "web" }];
    }

    // El SDK de OpenAI devuelve ChatCompletion | Stream según los params.
    // Nunca usamos stream aquí — el cast a OpenAI.ChatCompletion es seguro en runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = (await this.client.chat.completions.create(body as any)) as OpenAI.ChatCompletion;

    const choice = response.choices[0];
    const msg = choice?.message as {
      content?: string | null;
      reasoning?: string | null;
      tool_calls?: unknown[];
    };
    // Kimi K2.6 y similares: el campo `content` tiene la respuesta final;
    // `reasoning` tiene el pensamiento interno. Con maxTokens bajo puede
    // ocurrir que reasoning consuma todos los tokens antes de llegar a content.
    const content = msg?.content ?? msg?.reasoning ?? "";

    const usage = response.usage as {
      prompt_tokens: number;
      completion_tokens: number;
      prompt_tokens_details?: { cached_tokens?: number };
    } | undefined;

    return {
      content,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
      webSearchRequests: params.webSearch ? 1 : 0,
    };
  }
}
