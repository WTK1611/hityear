// Öffentliche Playlists von Deezer und Apple Music als Decks importieren.
// Übernommen werden nur Interpret und Titel – die Songs werden wie bei importierten Songlisten mit der
// Bibliothek abgeglichen, fehlende holt „Fehlende online laden“ (Jahr kommt dabei aus Apple/Deezer).
// Deezer: öffentliche API ohne Schlüssel. Apple Music hat keine freie Playlist-API; die öffentliche
// Playlist-Seite enthält die Songliste aber als JSON (bis zu 100 Songs).
import { deckAnlegen, deckHerkunft, type ListenEintrag } from "./listen.ts";

const MAX_SONGS = 1000;

function fehler(text: string, status = 400): Error {
  return Object.assign(new Error(text), { status });
}

type Quelle = { art: "deezer"; id: string; url: string } | { art: "apple"; url: string };

/** Link prüfen und auf eine feste Form bringen (damit dieselbe Playlist nicht doppelt kommt). */
export function playlistErkennen(roh: string): Quelle {
  let u: URL;
  try {
    u = new URL(roh.trim());
  } catch {
    throw fehler("Bitte den Link zur Playlist einfügen (Teilen → Link kopieren).");
  }
  if (u.protocol !== "https:") throw fehler("Bitte einen https-Link einfügen.");
  if (u.hostname === "link.deezer.com" || u.hostname === "deezer.page.link") {
    throw fehler("Kurzlinks von Deezer gehen nicht – bitte die Playlist im Browser öffnen und den langen Link kopieren.");
  }
  if (/(^|\.)deezer\.com$/.test(u.hostname)) {
    const id = /\/playlist\/(\d{1,15})/.exec(u.pathname)?.[1];
    if (!id) throw fehler("Das ist kein Deezer-Playlist-Link (…deezer.com/…/playlist/123…).");
    return { art: "deezer", id, url: `https://www.deezer.com/playlist/${id}` };
  }
  if (u.hostname === "music.apple.com") {
    const m = /^\/([a-z]{2})\/playlist\/(?:[^/]+\/)?(pl\.[A-Za-z0-9.-]{8,80})$/.exec(u.pathname.replace(/\/$/, ""));
    if (!m) throw fehler("Das ist kein Apple-Music-Playlist-Link (music.apple.com/de/playlist/…/pl.…).");
    return { art: "apple", url: `https://music.apple.com/${m[1]}/playlist/x/${m[2]}` };
  }
  throw fehler("Unterstützt werden Playlist-Links von Deezer und Apple Music.");
}

async function holen(url: string): Promise<Response> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { "user-agent": "Mozilla/5.0 (Macintosh) party-music", "accept-language": "de" },
  });
  if (res.status === 404) throw fehler("Playlist nicht gefunden – ist sie öffentlich?", 404);
  if (!res.ok) throw fehler(`Dienst antwortet mit HTTP ${res.status}`, 502);
  return res;
}

async function deezerPlaylist(id: string): Promise<{ name: string; eintraege: ListenEintrag[] }> {
  const kopf = (await (await holen(`https://api.deezer.com/playlist/${id}`)).json()) as { title?: string; public?: boolean; error?: { message?: string } };
  if (kopf.error || !kopf.title) throw fehler("Deezer kennt diese Playlist nicht – ist sie öffentlich?", 404);
  const eintraege: ListenEintrag[] = [];
  for (let index = 0; eintraege.length < MAX_SONGS; index += 100) {
    const seite = (await (await holen(`https://api.deezer.com/playlist/${id}/tracks?index=${index}&limit=100`)).json()) as {
      data?: Array<{ title?: string; title_short?: string; artist?: { name?: string } }>;
      next?: string;
    };
    for (const t of seite.data ?? []) {
      const titel = (t.title_short || t.title || "").trim();
      const interpret = (t.artist?.name ?? "").trim();
      if (titel && interpret) eintraege.push({ interpret, titel, jahr: null });
    }
    if (!seite.next || !seite.data?.length) break;
  }
  return { name: kopf.title, eintraege };
}

async function applePlaylist(url: string): Promise<{ name: string; eintraege: ListenEintrag[] }> {
  const html = await (await holen(url)).text();
  if (html.length > 8_000_000) throw fehler("Antwort von Apple ist zu groß.", 502);
  const json = /<script type="application\/json" id="serialized-server-data">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!json) throw fehler("Apple Music liefert für diese Playlist keine Songliste.", 502);
  const eintraege: ListenEintrag[] = [];
  const gesehen = new Set<string>();
  // <title>‎Name – Playlist – Apple Music</title>
  const kopf = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  let name = kopf.replace(/[\u200e\u200f]/g, "").split(/\s+–\s+/)[0]?.trim() || "Apple-Music-Playlist";
  const laufen = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(laufen);
    if (!o || typeof o !== "object") return;
    const k = o as Record<string, unknown>;
    if (typeof k.id === "string" && k.id.startsWith("track-lockup") && typeof k.title === "string" && typeof k.artistName === "string") {
      if (!gesehen.has(k.id)) {
        gesehen.add(k.id);
        eintraege.push({ interpret: k.artistName.trim(), titel: k.title.trim(), jahr: null });
      }
      return;
    }
    Object.values(k).forEach(laufen);
  };
  laufen(JSON.parse(json));
  name = name.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  return { name, eintraege: eintraege.slice(0, MAX_SONGS) };
}

/** Playlist laden und als Deck anlegen. */
export async function playlistImportieren(link: string): Promise<{ id: string; name: string; songs: number }> {
  const quelle = playlistErkennen(link);
  if (deckHerkunft().has(quelle.url)) throw fehler("Diese Playlist ist schon als Deck vorhanden.", 409);
  const { name, eintraege } = quelle.art === "deezer" ? await deezerPlaylist(quelle.id) : await applePlaylist(quelle.url);
  if (!eintraege.length) throw fehler("Die Playlist enthält keine lesbaren Songs.", 502);
  const id = deckAnlegen(name.trim() || "Playlist", "playlist", eintraege, quelle.url);
  return { id, name, songs: eintraege.length };
}
