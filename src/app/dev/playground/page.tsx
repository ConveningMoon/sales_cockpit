"use client";

import { useState, useTransition } from "react";
import { MODEL_LIST } from "@/lib/ai/models";
import { ITMANO_BASE_SYSTEM_PROMPT } from "@/lib/ai/voice";
import { runPlayground } from "./actions";
import type { AICallResult } from "@/lib/ai/types";

export default function PlaygroundPage() {
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [webSearch, setWebSearch] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(ITMANO_BASE_SYSTEM_PROMPT);
  const [userMessage, setUserMessage] = useState("");
  const [result, setResult] = useState<AICallResult | null>(null);
  const [error, setError] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const selectedModel = MODEL_LIST.find((m) => m.id === modelId);

  function handleModelChange(id: string) {
    setModelId(id);
    const m = MODEL_LIST.find((m) => m.id === id);
    if (m && !m.supportsWebSearch) setWebSearch(false);
  }

  function handleSubmit() {
    setError("");
    setResult(null);
    startTransition(async () => {
      const res = await runPlayground({ model: modelId, webSearch, systemPrompt, userMessage });
      if (res.ok) {
        setResult(res.result);
      } else {
        setError(res.error);
      }
    });
  }

  const totalCostUsd = result ? result.costUsd : 0;
  const tokenCostUsd = result ? result.costUsd - result.webSearchCostUsd : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">AI Playground</h1>
          <p className="text-sm text-gray-400 mt-1">Solo disponible en modo desarrollo. Los resultados se registran en ai_usage.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controles */}
          <div className="space-y-4">
            {/* Modelo */}
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Modelo
              </label>
              <select
                value={modelId}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              >
                {MODEL_LIST.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.provider})
                  </option>
                ))}
              </select>
              {selectedModel && (
                <p className="mt-1 text-xs text-gray-500">
                  ${(selectedModel.costPerInputToken * 1_000_000).toFixed(2)}/1M input ·{" "}
                  ${(selectedModel.costPerOutputToken * 1_000_000).toFixed(2)}/1M output
                  {selectedModel.supportsCaching ? " · caching ✓" : ""}
                </p>
              )}
            </div>

            {/* Búsqueda web */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={webSearch}
                disabled={!selectedModel?.supportsWebSearch}
                onClick={() => setWebSearch((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
                  ${webSearch ? "bg-blue-600" : "bg-gray-600"}
                  ${!selectedModel?.supportsWebSearch ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
                    ${webSearch ? "translate-x-4" : "translate-x-0.5"}`}
                />
              </button>
              <span className="text-sm text-gray-300">
                Búsqueda web
                {!selectedModel?.supportsWebSearch && (
                  <span className="ml-2 text-xs text-gray-500">(no soportado por este modelo)</span>
                )}
                {webSearch && selectedModel && (
                  <span className="ml-2 text-xs text-gray-500">
                    {selectedModel.provider === "anthropic"
                      ? "($0.01/búsqueda — Claude nativo)"
                      : "($0.005/req — OpenRouter/Exa)"}
                  </span>
                )}
              </span>
            </div>

            {/* System prompt */}
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                System prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={8}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:border-blue-500 resize-y"
              />
            </div>

            {/* Mensaje */}
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Mensaje de usuario
              </label>
              <textarea
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                rows={4}
                placeholder="Escribe tu prompt aquí..."
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={isPending || !userMessage.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
            >
              {isPending ? "Llamando..." : "Enviar"}
            </button>
          </div>

          {/* Resultado */}
          <div className="space-y-4">
            {error && (
              <div className="bg-red-950 border border-red-800 rounded-md p-4">
                <p className="text-sm font-medium text-red-400 mb-1">Error</p>
                <p className="text-sm text-red-300 whitespace-pre-wrap font-mono">{error}</p>
              </div>
            )}

            {isPending && (
              <div className="bg-gray-800 border border-gray-700 rounded-md p-8 flex items-center justify-center">
                <p className="text-sm text-gray-400 animate-pulse">Generando respuesta...</p>
              </div>
            )}

            {result && !isPending && (
              <>
                {/* Respuesta */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Respuesta
                  </label>
                  <div className="bg-gray-800 border border-gray-700 rounded-md p-4 text-sm text-gray-100 whitespace-pre-wrap min-h-32 font-mono">
                    {result.content}
                  </div>
                </div>

                {/* Tokens */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                    Uso de tokens
                  </label>
                  <div className="bg-gray-800 border border-gray-700 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-b border-gray-700">
                          <td className="px-3 py-2 text-gray-400">Input</td>
                          <td className="px-3 py-2 text-right text-gray-100">{result.inputTokens.toLocaleString()}</td>
                        </tr>
                        <tr className="border-b border-gray-700">
                          <td className="px-3 py-2 text-gray-400">Output</td>
                          <td className="px-3 py-2 text-right text-gray-100">{result.outputTokens.toLocaleString()}</td>
                        </tr>
                        {result.cachedTokens > 0 && (
                          <tr className="border-b border-gray-700">
                            <td className="px-3 py-2 text-gray-400">Cache read</td>
                            <td className="px-3 py-2 text-right text-green-400">{result.cachedTokens.toLocaleString()}</td>
                          </tr>
                        )}
                        {result.webSearchRequests > 0 && (
                          <tr className="border-b border-gray-700">
                            <td className="px-3 py-2 text-gray-400">Búsquedas web</td>
                            <td className="px-3 py-2 text-right text-blue-400">{result.webSearchRequests}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Costo */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                    Costo estimado
                  </label>
                  <div className="bg-gray-800 border border-gray-700 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-b border-gray-700">
                          <td className="px-3 py-2 text-gray-400">Tokens</td>
                          <td className="px-3 py-2 text-right text-gray-100">${tokenCostUsd.toFixed(6)}</td>
                        </tr>
                        {result.webSearchCostUsd > 0 && (
                          <tr className="border-b border-gray-700">
                            <td className="px-3 py-2 text-gray-400">Búsqueda web</td>
                            <td className="px-3 py-2 text-right text-blue-400">${result.webSearchCostUsd.toFixed(4)}</td>
                          </tr>
                        )}
                        <tr>
                          <td className="px-3 py-2 text-gray-300 font-medium">Total</td>
                          <td className="px-3 py-2 text-right text-white font-medium">${totalCostUsd.toFixed(6)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {result.model} · {result.provider}
                  </p>
                </div>
              </>
            )}

            {!result && !isPending && !error && (
              <div className="bg-gray-800 border border-gray-700 border-dashed rounded-md p-8 flex items-center justify-center">
                <p className="text-sm text-gray-500">El resultado aparecerá aquí.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
