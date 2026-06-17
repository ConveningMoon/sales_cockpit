// Gestión de sesiones con Web Crypto (crypto.subtle).
// Funciona en Edge Runtime (middleware) y Node.js — no depende del módulo crypto de Node.
const ALG = { name: "HMAC", hash: "SHA-256" } as const;
const SESSION_DURATION_S = 60 * 60 * 24 * 7; // 7 días

export const SESSION_COOKIE = "app-session";

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET no está configurado");
  const keyBytes = new TextEncoder().encode(secret);
  return crypto.subtle.importKey("raw", keyBytes, ALG, false, ["sign", "verify"]);
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64urlEncode(str: string): string {
  return b64urlFromBytes(new TextEncoder().encode(str));
}

// Retorno explícito de Uint8Array<ArrayBuffer> requerido por TS 5.7+ para pasar como BufferSource
function b64urlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function createSessionToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64urlEncode(
    JSON.stringify({ sub: "dylan", iat: now, exp: now + SESSION_DURATION_S })
  );
  const signingInput = `${header}.${payload}`;
  const key = await getKey();
  const sig = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

// Verifica firma (constant-time vía subtle.verify) y expiración.
// Devuelve false en cualquier error para evitar exponer detalles.
export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [header, payload, sig] = parts;

    const signingInput = `${header}.${payload}`;
    const key = await getKey();
    const valid = await crypto.subtle.verify(
      ALG,
      key,
      b64urlToBytes(sig),
      new TextEncoder().encode(signingInput)
    );
    if (!valid) return false;

    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof decoded.exp === "number" && decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
