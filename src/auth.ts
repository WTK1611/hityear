// Zugang für den privaten Kreis: ein gemeinsames Passwort (Mitspieler) und ein
// Admin-Passwort (Bibliothek). Sitzung als HMAC-signiertes HttpOnly-Cookie.
// Ein einzelner Prozess ohne Skalierung → Rate-Limit im Speicher reicht hier.
import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./config.ts";

/** gast = per QR-Einladung angemeldet: darf mitspielen, aber nicht die Bibliothek pflegen. */
export type Rolle = "spieler" | "admin" | "gast";
const COOKIE = "zs_sitzung";
const LAUFZEIT_MS = 1000 * 60 * 60 * 24 * 14;

function signatur(daten: string): string {
  return crypto.createHmac("sha256", config.sitzungsSchluessel).update(daten).digest("base64url");
}

function gleich(a: string, b: string): boolean {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

export function passwortPruefen(eingabe: string): Rolle | null {
  if (gleich(eingabe, config.adminPasswort)) return "admin";
  if (gleich(eingabe, config.passwort)) return "spieler";
  return null;
}

export function cookieSetzen(res: ServerResponse, rolle: Rolle, sicher: boolean): void {
  const ablauf = Date.now() + LAUFZEIT_MS;
  const daten = `${rolle}.${ablauf}`;
  const wert = `${daten}.${signatur(daten)}`;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${wert}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${LAUFZEIT_MS / 1000}${sicher ? "; Secure" : ""}`,
  );
}

export function cookieLoeschen(res: ServerResponse): void {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function rolleAusCookie(header: string | undefined): Rolle | null {
  if (!header) return null;
  const teil = header
    .split(/;\s*/)
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!teil) return null;
  const [rolle, ablauf, sig] = teil.split(".");
  if (!rolle || !ablauf || !sig) return null;
  if (!gleich(sig, signatur(`${rolle}.${ablauf}`))) return null;
  if (Number(ablauf) < Date.now()) return null;
  return rolle === "admin" || rolle === "spieler" || rolle === "gast" ? rolle : null;
}

/**
 * Client-IP. Hinter Caddy/nginx ist nur der Eintrag vertrauenswürdig, den der
 * eigene Proxy angehängt hat – also der RECHTE in X-Forwarded-For. Der linke ist
 * vom Angreifer frei wählbar.
 */
export function clientIp(req: IncomingMessage): string {
  if (config.hinterProxy) {
    const xff = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress ?? "?";
}

export function istHttps(req: IncomingMessage): boolean {
  return config.hinterProxy && String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https";
}

// ---------- Rate-Limit für Login-Versuche ----------
const versuche = new Map<string, { anzahl: number; seit: number }>();
const FENSTER_MS = 10 * 60_000;
const MAX = 10;

export function loginErlaubt(ip: string): boolean {
  const jetzt = Date.now();
  const v = versuche.get(ip);
  if (!v || jetzt - v.seit > FENSTER_MS) return true;
  return v.anzahl < MAX;
}

export function loginFehlschlag(ip: string): void {
  const jetzt = Date.now();
  const v = versuche.get(ip);
  if (!v || jetzt - v.seit > FENSTER_MS) versuche.set(ip, { anzahl: 1, seit: jetzt });
  else v.anzahl++;
}

setInterval(() => {
  const jetzt = Date.now();
  for (const [ip, v] of versuche) if (jetzt - v.seit > FENSTER_MS) versuche.delete(ip);
}, FENSTER_MS).unref();
