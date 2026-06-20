// Helper de fetch seguro: lee la respuesta como texto primero, luego intenta JSON.parse.
// Si la respuesta no es JSON (ej. página de error 504 de Vercel), lanza con el cuerpo crudo
// para que el caller pueda mostrarlo verbatim — nunca "Unexpected token 'A'".
// Para errores HTTP con body JSON válido (nuestros propios 500/409), devuelve ok:false
// con los datos parseados para que el caller acceda a {error, stage, context}.

export interface SafeResponse<T> {
  ok: boolean;
  status: number;
  statusText: string;
  data: T | null;
  rawBody: string;
}

export async function safeFetch<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<SafeResponse<T>> {
  const res = await fetch(url, init);
  const rawBody = await res.text();

  let data: T | null = null;
  try {
    data = JSON.parse(rawBody) as T;
  } catch {
    // Respuesta no-JSON — el gateway (Vercel/CDN) mató la función antes de que
    // la app pudiera responder. Lanzamos para que el catch del caller lo muestre.
    throw new Error(
      `HTTP ${res.status} ${res.statusText} — respuesta no-JSON:\n${rawBody.slice(0, 500)}`,
    );
  }

  return { ok: res.ok, status: res.status, statusText: res.statusText, data, rawBody };
}
