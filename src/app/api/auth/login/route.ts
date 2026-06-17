import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";

// Rate limiter en memoria por IP.
// En Vercel (serverless) se resetea en cada cold start — la protección principal
// es el delay mínimo en fallos (frena fuerza bruta a <2 req/s) + contraseña robusta.
const failures = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const FAILURE_DELAY_MS = 500;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const e = failures.get(ip);
  return !!e && e.resetAt > now && e.count >= MAX_FAILURES;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const e = failures.get(ip);
  if (!e || e.resetAt <= now) {
    failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    e.count++;
  }
}

function clearFailures(ip: string): void {
  failures.delete(ip);
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos fallidos. Espera 15 minutos." },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const password = (body as Record<string, unknown>)?.password;
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Contraseña requerida." }, { status: 400 });
  }

  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    console.error("[auth/login] APP_PASSWORD no está configurada.");
    return NextResponse.json({ error: "Error de configuración del servidor." }, { status: 500 });
  }

  // Comparación en tiempo constante — buffers de igual longitud siempre,
  // para no filtrar información por timing cuando las longitudes difieren.
  const inputBuf = Buffer.from(password, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  const dummy = Buffer.alloc(inputBuf.length);

  let correct: boolean;
  if (inputBuf.length !== expectedBuf.length) {
    timingSafeEqual(inputBuf, dummy); // consumir tiempo igual de todas formas
    correct = false;
  } else {
    correct = timingSafeEqual(inputBuf, expectedBuf);
  }

  if (!correct) {
    recordFailure(ip);
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  clearFailures(ip);

  const token = await createSessionToken();
  const isProduction = process.env.NODE_ENV === "production";

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 días
  });
  return res;
}
