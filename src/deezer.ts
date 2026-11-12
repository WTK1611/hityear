// Deezer als Rückfall, wenn Apple Music einen Song nicht (oder ohne Vorschau) kennt.
// Die öffentliche Deezer-API liefert je Song einen 30-Sekunden-Ausschnitt (ohne Konto, ohne Schlüssel).
// Die Vorschau-Links sind signiert und laufen nach kurzer Zeit ab → sofort laden.
// Treffer haben dieselbe Form wie Apple-Treffer und landen genauso als Vorschau in der Bibliothek.
import type { AppleTreffer } from "./apple.ts";

interface DeezerTrack {
  id: number;
  readable?: boolean;
  title: string;
  title_short?: string;
  link?: string;
  preview?: string;
  release_date?: string;
  artist?: { name: string };
  album?: { title?: string; cover_xl?: string; cover_big?: string };
}

// Deezer erlaubt etwa 50 Abfragen in 5 Sekunden – mit 150 ms Abstand bleiben es höchstens ~33.
let naechste = 0;
async function drosseln(): Promise<void> {
  const jetzt = Date.now();
  const start = Math.max(jetzt, naechste);
  naechste = start + 150;
  if (start > jetzt) await new Promise((r) => setTimeout(r, start - jetzt));
}

/** Nur Deezer-Server ansprechen (Vorschau-, Cover- und Song-Links kommen aus der Antwort). */
function deezerUrl(roh: string | undefined): string | null {
  if (!roh) return null;
  try {
    const u = new URL(roh);
    return u.protocol === "https:" && /(^|\.)(deezer\.com|dzcdn\.net)$/.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

function treffer(t: DeezerTrack): AppleTreffer | null {
  const vorschau = deezerUrl(t.preview);
  if (!vorschau || !t.id || t.readable === false || !t.artist?.name) return null;
  const jahr = Number(t.release_date?.slice(0, 4));
  return {
    quelle: "deezer",
    trackId: t.id,
    interpret: t.artist.name,
    titel: t.title_short || t.title,
    album: t.album?.title ?? null,
    jahr: Number.isInteger(jahr) && jahr >= 1920 ? jahr : null,
    genre: null,
    vorschau,
    cover: deezerUrl(t.album?.cover_xl ?? t.album?.cover_big),
    link: deezerUrl(t.link),
  };
}

async function abfragen(pfad: string, fehltErlaubt = false): Promise<unknown> {
  await drosseln();
  const res = await fetch(`https://api.deezer.com/${pfad}`, { signal: AbortSignal.timeout(15_000) });
  if (fehltErlaubt && res.status === 404) return null;
  if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
  const daten = (await res.json()) as { error?: { message?: string; code?: number } };
  if (fehltErlaubt && daten.error?.code === 800) return null;
  if (daten.error) throw new Error(daten.error.code === 4 ? "Deezer drosselt gerade – bitte kurz warten" : `Deezer: ${daten.error.message ?? "Fehler"}`);
  return daten;
}

export async function deezerSuchen(begriff: string): Promise<AppleTreffer[]> {
  const q = new URLSearchParams({ q: begriff.slice(0, 200), limit: "15" });
  const daten = (await abfragen(`search?${q}`)) as { data?: DeezerTrack[] };
  return (daten.data ?? []).map(treffer).filter((t): t is AppleTreffer => t !== null);
}

export async function deezerTrack(id: number): Promise<AppleTreffer | null> {
  const daten = await abfragen(`track/${id}`, true);
  return daten ? treffer(daten as DeezerTrack) : null;
}
