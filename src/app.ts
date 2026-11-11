// Native Apps verwenden eigene Sitzungen statt Drittanbieter-Cookies im WebView.
// Medienfreigaben sind kurzlebig und gelten ausschließlich für einen konkreten GET-Pfad.
import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./config.ts";
import { rolleAusCookie, type Rolle } from "./auth.ts";

const ROLLEN = new Set<Rolle>(["spieler", "admin", "gast"]);
const signieren = (zweck: string, daten: string) => crypto.createHmac("sha256", config.sitzungsSchluessel).update(`${zweck}:${daten}`).digest("base64url");
function erzeugen(zweck: string, daten: object): string {
  const roh = Buffer.from(JSON.stringify(daten)).toString("base64url");
  return `${roh}.${signieren(zweck, roh)}`;
}
function pruefen(zweck: string, wert: unknown): { rolle: Rolle; bis: number; pfad?: string } | null {
  if (typeof wert !== "string" || wert.length > 4096) return null;
  const teile = wert.split(".");
  if (teile.length !== 2) return null;
  const [roh, sig] = teile;
  const echt = Buffer.from(signieren(zweck, roh));
  const gegeben = Buffer.from(sig);
  if (gegeben.length !== echt.length || !crypto.timingSafeEqual(gegeben, echt)) return null;
  try {
    const d = JSON.parse(Buffer.from(roh, "base64url").toString("utf8"));
    return ROLLEN.has(d.rolle) && Number.isSafeInteger(d.bis) && d.bis > Date.now() ? d : null;
  } catch { return null; }
}

export function appSitzungErstellen(rolle: Rolle): string {
  return erzeugen("app-sitzung", { rolle, bis: Date.now() + 14 * 24 * 60 * 60_000 });
}
export function rolleAusAppSitzung(wert: unknown): Rolle | null {
  return pruefen("app-sitzung", wert)?.rolle ?? null;
}
export function rolleAusAnfrage(req: IncomingMessage): Rolle | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return rolleAusAppSitzung(auth.slice(7));
  return rolleAusCookie(req.headers.cookie);
}
export function istAppAnfrage(req: IncomingMessage): boolean {
  return req.headers["x-hityear-app"] === "1" && config.appUrspruenge.includes(req.headers.origin ?? "");
}

/** Nur die konfigurierten App-Ursprünge erhalten Zugriff; keine Cookies oder beliebigen Ursprünge. */
export function appCors(req: IncomingMessage, res: ServerResponse): boolean {
  res.setHeader("Vary", "Origin");
  if (!config.appUrspruenge.includes(req.headers.origin ?? "")) return false;
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin!);
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
  if (req.method !== "OPTIONS") return false;
  res.writeHead(204, {
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Hityear-App, Range",
    "Access-Control-Max-Age": "600",
  });
  res.end();
  return true;
}

function medienPfad(pfad: unknown): string | null {
  if (typeof pfad !== "string" || pfad.length > 1024 || !pfad.startsWith("/api/")) return null;
  const url = new URL(pfad, "https://intern.invalid");
  if (!/^\/api\/(?:qr|audio\/[A-Za-z0-9_-]{10,64}|cover\/[A-Za-z0-9_-]{8,32})$/.test(url.pathname)) return null;
  if (url.hash || url.searchParams.has("appFreigabe")) return null;
  url.search = url.searchParams.toString();
  return url.pathname + url.search;
}
export function appMedienFreigeben(pfad: unknown, rolle: Rolle): string | null {
  const sauber = medienPfad(pfad);
  if (!sauber) return null;
  const freigabe = erzeugen("app-medien", { rolle, pfad: sauber, bis: Date.now() + 5 * 60_000 });
  return `${sauber}${sauber.includes("?") ? "&" : "?"}appFreigabe=${encodeURIComponent(freigabe)}`;
}
export function rolleAusMedienFreigabe(req: IncomingMessage, url: URL): Rolle | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const d = pruefen("app-medien", url.searchParams.get("appFreigabe"));
  if (!d) return null;
  const ziel = new URL(url);
  ziel.searchParams.delete("appFreigabe");
  const pfad = medienPfad(ziel.pathname + ziel.search);
  return pfad && pfad === d.pfad ? d.rolle : null;
}
