// HTTP-Server: statische Seiten, kleine JSON-API, Audio-Ausschnitte, Socket.IO.
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Server } from "socket.io";
import QRCode from "qrcode";
import { parseFile } from "music-metadata";
import { config } from "./config.ts";
import { db } from "./db.ts";
import {
  APPLE_PRAEFIX, chartsLaden, duplikatVon, geschichteFuer, istApple, jahrNeuBerechnen, scannen, scanStatus,
  songHolen, statistik, vollerPfad, type SongZeile,
} from "./bibliothek.ts";
import {
  abgleichen, alleAbgleichen, AUDIO, deckAnlegen, deckUebersicht, deckAudioSetzen, deckLoeschen, deckSongs, deckUmbenennen, fehlendeSongs, listeHolen,
  listenFuerSong, listenLaden, listenUebersicht, type Audio,
} from "./listen.ts";
import { appleErgaenzen, appleStatus, appleUebernehmenNachId, deezerAbgleichen, deezerAbgleichStatus, fehlendeNachladen, vorschauSuchen } from "./apple.ts";
import { playlistImportieren } from "./playlist.ts";
import { ausschnittHolen } from "./audio.ts";
import { diagnose } from "./log.ts";
import { dienstLink, dienstName, liveTreffer } from "./vorschau.ts";
import {
  clientIp, cookieLoeschen, cookieSetzen, istHttps, loginErlaubt, loginFehlschlag, passwortPruefen, rolleAusCookie,
} from "./auth.ts";
import { einladungFuer, einladungGueltig, raumPruefenErlaubt, raumStatus, raeumeLaden, socketsEinrichten, songIstAufgedeckt } from "./raeume.ts";

// Letzte Absicherung: ein einzelner Fehler (Timer, Stream, Promise) darf nicht alle laufenden Spiele beenden
process.on("uncaughtException", (err) => console.error("[zeitstrahl] unbehandelter Fehler:", err));
process.on("unhandledRejection", (err) => console.error("[zeitstrahl] unbehandelte Ablehnung:", err));

const geraetGemeldet = new Map<string, number>();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// Secure-Cookie nur bei HTTPS – im IP-Betrieb (http://<IP>:3700) würde der Browser
// ein Secure-Cookie verwerfen und niemand käme über die Anmeldung hinaus.
const cookieSicher = (req: IncomingMessage) => istHttps(req) || config.basisUrl.startsWith("https://");

function sicherheitsHeader(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  // Matomo (falls eingerichtet): Skript und Zählaufrufe gehen an die eigene Matomo-Instanz
  const matomo = config.matomoUrl && config.matomoId ? ` ${new URL(config.matomoUrl).origin}` : "";
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; img-src 'self' data: blob: https://*.mzstatic.com https://*.dzcdn.net${matomo}; media-src 'self' blob: https://*.apple.com https://*.dzcdn.net; style-src 'self'; script-src 'self'${matomo}; connect-src 'self' ws: wss:${matomo}; frame-ancestors 'none'`,
  );
}

function json(res: ServerResponse, status: number, daten: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(daten));
}

async function body(req: IncomingMessage, max = 16_384): Promise<Record<string, unknown>> {
  let roh = "";
  for await (const teil of req) {
    roh += teil;
    if (roh.length > max) throw new Error("zu groß");
  }
  try {
    const d = JSON.parse(roh || "{}");
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

/** Weiter zu Apple/Deezer (nur deren Server, siehe appleUrl/deezerUrl); nicht zwischenspeichern, Links laufen ab. */
// Startseite: echte Songs (Cover, Titel, Jahr), die zwischen die Jahrzehnt-Karten fliegen. Zwei pro Jahrzehnt,
// Startseite: nur Jahre echter Songs – die Cover malt der Browser selbst, Titel werden nicht gezeigt.
// Die Auswahl gilt 10 Minuten.
let schaufensterStand: { bis: number; songs: Array<{ jahr: number }> } | null = null;
function schaufenster() {
  if (schaufensterStand && schaufensterStand.bis > Date.now()) return schaufensterStand.songs;
  const wahl = db.prepare("SELECT * FROM songs WHERE ausgeschlossen = 0 AND pruefen = 0 AND jahr BETWEEN ? AND ? ORDER BY random() LIMIT 2");
  const songs: Array<{ jahr: number }> = [];
  for (let d = 1950; d <= 2020; d += 10) {
    for (const z of wahl.all(d, d + 9) as unknown as SongZeile[]) songs.push({ jahr: z.jahr as number });
  }
  schaufensterStand = { bis: Date.now() + 10 * 60_000, songs };
  return songs;
}

function weiterleiten(res: ServerResponse, ziel: string): void {
  res.writeHead(302, { Location: ziel, "Cache-Control": "no-store" });
  res.end();
}

/** Datei mit Range-Unterstützung (iOS Safari verlangt das für Audio). */
function dateiSenden(req: IncomingMessage, res: ServerResponse, datei: string, typ: string, cache = "no-store"): void {
  const st = fs.statSync(datei);
  const range = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range ?? ""));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", typ);
  res.setHeader("Cache-Control", cache);
  if (range) {
    let start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
    let ende = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    if (!range[1]) ende = st.size - 1;
    if (start >= st.size || start < 0 || ende < start) {
      res.writeHead(416, { "Content-Range": `bytes */${st.size}` });
      res.end();
      return;
    }
    ende = Math.min(ende, st.size - 1);
    res.writeHead(206, { "Content-Range": `bytes ${start}-${ende}/${st.size}`, "Content-Length": ende - start + 1 });
    if (req.method === "HEAD") return void res.end();
    fs.createReadStream(datei, { start, end: ende }).on("error", () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { "Content-Length": st.size });
  if (req.method === "HEAD") return void res.end();
  fs.createReadStream(datei).on("error", () => res.destroy()).pipe(res);
}

function statisch(req: IncomingMessage, res: ServerResponse, pfad: string): boolean {
  const rel = pfad === "/" ? "/index.html" : pfad;
  const datei = path.resolve(config.publicOrdner, "." + decodeURIComponent(rel));
  if (!datei.startsWith(config.publicOrdner + path.sep)) return false;
  if (!fs.existsSync(datei) || !fs.statSync(datei).isFile()) return false;
  const typ = MIME[path.extname(datei)] ?? "application/octet-stream";
  // immer neu prüfen: sonst passt nach dem Ausrollen das alte Script nicht zur neuen Seite
  const st = fs.statSync(datei);
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { "Cache-Control": "no-cache" });
    res.end();
    return true;
  }
  dateiSenden(req, res, datei, typ, "no-cache");
  return true;
}

function adminSongs(url: URL): unknown {
  const filter = url.searchParams.get("filter") ?? "pruefen";
  const q = (url.searchParams.get("q") ?? "").trim();
  const jahrzehnt = Number(url.searchParams.get("jahrzehnt") ?? "");
  const bed: string[] = [];
  const params: Array<string | number> = [];
  if (Number.isInteger(jahrzehnt) && jahrzehnt >= 1900 && jahrzehnt <= 2100) {
    bed.push("jahr >= ? AND jahr < ?");
    params.push(jahrzehnt, jahrzehnt + 10);
  }
  if (filter === "pruefen") bed.push("pruefen = 1 AND ausgeschlossen = 0");
  else if (filter === "ohne") bed.push("jahr IS NULL");
  else if (filter === "aus") bed.push("ausgeschlossen = 1");
  else if (filter === "apple") bed.push(`pfad LIKE '${APPLE_PRAEFIX}%'`);
  if (q) {
    bed.push("(titel LIKE ? OR interpret LIKE ? OR album LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = bed.length ? `WHERE ${bed.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT id, titel, titel_anzeige, interpret, album, tag_jahr, mb_jahr, mb_geprueft, chart_jahr, chart_platz,
              manuell_jahr, jahr, jahr_quelle, pruef_grund, ausgeschlossen, pfad, geschichte
       FROM songs ${where} ORDER BY interpret, titel LIMIT 300`,
    )
    .all(...params);
}

// ---------- Song-Analyse (Admin) ----------

/** Analyse eines Songs für die Admin-Ansicht: was gefunden wurde und woher das Jahr kommt. */
function analyse(z: SongZeile): Record<string, unknown> {
  const doppelt = duplikatVon(z);
  return {
    id: z.id,
    datei: z.pfad,
    quelle: istApple(z) ? "apple" : "datei",
    appleUrl: istApple(z) ? dienstLink(z) : z.apple_url,
    titel: z.titel_anzeige,
    interpret: z.interpret,
    album: z.kompilation ? null : z.album,
    dauerS: Math.round(z.dauer_ms / 1000),
    tagJahr: z.tag_jahr,
    chartJahr: z.chart_jahr,
    chartPlatz: z.chart_platz,
    listenJahr: z.listen_jahr,
    jahr: z.jahr,
    jahrQuelle: z.jahr_quelle,
    pruefen: Boolean(z.pruefen),
    pruefGrund: z.pruef_grund,
    hatCover: Boolean(z.hat_cover),
    genre: z.genre,
    geschichte: geschichteFuer(z),
    fakten: geschichteFuer(z).split(/(?<=[.!?“])\s+/).filter(Boolean).slice(0, 3),
    listen: listenFuerSong(z.id),
    doppelt: doppelt ? { titel: doppelt.titel_anzeige, interpret: doppelt.interpret, datei: doppelt.pfad } : null,
  };
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  // Ohne Passwortpflicht ist jeder ohne Cookie Mitspieler mit vollen Rechten; mit Pflicht ist er niemand.
  const rolle = rolleAusCookie(req.headers.cookie) ?? (config.zugangMitPasswort ? null : "spieler");
  const p = url.pathname;
  const ohneAnmeldung = ["/api/login", "/api/logout", "/api/ich", "/api/geraet", "/api/einladung", "/api/statistik"];
  if (!rolle && !ohneAnmeldung.includes(p)) return json(res, 401, { fehler: "Bitte zuerst das Passwort eingeben." });

  if (p === "/api/login" && req.method === "POST") {
    const ip = clientIp(req);
    if (!loginErlaubt(ip)) return json(res, 429, { fehler: "Zu viele Versuche. Bitte in 10 Minuten erneut." });
    const d = await body(req);
    const r = passwortPruefen(String(d.passwort ?? ""));
    if (!r) {
      loginFehlschlag(ip);
      return json(res, 401, { fehler: "Passwort falsch." });
    }
    cookieSetzen(res, r, cookieSicher(req));
    return json(res, 200, { rolle: r });
  }
  if (p === "/api/logout" && req.method === "POST") {
    cookieLoeschen(res);
    return json(res, 200, { ok: true });
  }
  if (p === "/api/ich") return json(res, 200, { rolle });
  // Statistik (Matomo): nur Adresse und Website-ID; geladen wird erst nach Einwilligung im Banner
  if (p === "/api/statistik") return json(res, 200, config.matomoUrl && config.matomoId ? { url: config.matomoUrl, id: config.matomoId } : {});

  // Geräteprotokoll (nur Technik, keine Personendaten): welcher Browser, welche Größe, was unterstützt wird –
  // hilft bei Darstellungsproblemen auf Fernsehern. Höchstens eine Meldung pro IP und Minute.
  if (p === "/api/geraet" && req.method === "POST") {
    const ip = clientIp(req);
    const jetzt = Date.now();
    if ((geraetGemeldet.get(ip) ?? 0) > jetzt - 60_000) return json(res, 200, { ok: true });
    geraetGemeldet.set(ip, jetzt);
    if (geraetGemeldet.size > 500) geraetGemeldet.clear();
    const d = await body(req, 2_000);
    const text = (x: unknown) => String(x ?? "").replace(/[^\x20-\x7e]/g, "").slice(0, 300);
    diagnose("geraet", `${text(d.seite)} ${text(d.groesse)} | ${text(d.kann)} | ${text(d.ua)}`);
    return json(res, 200, { ok: true });
  }

  // Einladungslink aus dem QR-Code: meldet als Mitspieler an, ohne Passwort.
  if (p === "/api/einladung" && req.method === "POST") {
    const ip = clientIp(req);
    if (!loginErlaubt(ip)) return json(res, 429, { fehler: "Zu viele Versuche. Bitte in 10 Minuten erneut." });
    const d = await body(req);
    const raum = String(d.raum ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (!einladungGueltig(raum, String(d.einladung ?? ""))) {
      loginFehlschlag(ip);
      return json(res, 403, { fehler: "Einladung ungültig oder Raum geschlossen." });
    }
    // Wer schon angemeldet ist, behält seine Rolle; sonst gilt der QR-Code als Eintrittskarte (Gast)
    if (rolle) return json(res, 200, { rolle, raum });
    cookieSetzen(res, "gast", cookieSicher(req));
    return json(res, 200, { rolle: "gast", raum });
  }

  // Code-Eingabe: vorher prüfen, ob es das Spiel gibt (der Code allein reicht ohnehin zum Mitspielen)
  if (p === "/api/raum") {
    if (!raumPruefenErlaubt(clientIp(req))) return json(res, 429, { fehler: "Zu viele Versuche. Bitte in 10 Minuten erneut." });
    const code = (url.searchParams.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const st = code.length === 4 ? raumStatus(code) : null;
    return st ? json(res, 200, st) : json(res, 404, { fehler: "Raum nicht gefunden." });
  }

  if (p === "/api/bibliothek") return json(res, 200, { ...statistik(), listen: listenUebersicht() });
  if (p === "/api/schaufenster") return json(res, 200, schaufenster());

  if (p === "/api/qr") {
    const raum = (url.searchParams.get("raum") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const basis = config.basisUrl || `${istHttps(req) ? "https" : "http"}://${req.headers.host}`;
    // ohne Raum: Link zur Startseite (QR-Code auf der Startseite)
    const einladung = raum ? einladungFuer(raum) : null;
    if (raum && !einladung) return json(res, 404, { fehler: "Raum nicht gefunden." });
    // kurzer Link → grobes, leicht scanbares Raster (Weiterleitung siehe /s/…)
    const link = raum ? `${basis}/s/${raum}.${einladung}` : `${basis}/`;
    const svg = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "L", color: { dark: "#160c26", light: "#ffffff" } });
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    return void res.end(svg);
  }

  const audio = /^\/api\/audio\/([A-Za-z0-9_-]{10,64})$/.exec(p);
  if (audio) {
    const a = await ausschnittHolen(audio[1]);
    if (!a) return json(res, 404, { fehler: "Ausschnitt abgelaufen." });
    // Streaming: der Browser holt die Hörprobe direkt bei Apple/Deezer
    if ("url" in a) return weiterleiten(res, a.url);
    return dateiSenden(req, res, a.datei, "audio/mpeg", "private, max-age=600");
  }

  const cover = /^\/api\/cover\/([A-Za-z0-9_-]{8,32})$/.exec(p);
  if (cover) {
    const z = songHolen(cover[1]);
    const admin = url.searchParams.get("admin") === "1" && rolle === "admin";
    if (!z || !z.hat_cover || (!admin && !songIstAufgedeckt(z.id))) return json(res, 404, { fehler: "kein Cover" });
    // Apple/Deezer: Cover direkt vom Dienst (der Server speichert nichts)
    if (istApple(z)) {
      const ziel = z.cover_url ?? (await liveTreffer(z).catch(() => null))?.cover;
      return ziel ? weiterleiten(res, ziel) : json(res, 404, { fehler: "kein Cover" });
    }
    const meta = await parseFile(vollerPfad(z), { skipCovers: false, duration: false });
    const bild = meta.common.picture?.[0];
    if (!bild) return json(res, 404, { fehler: "kein Cover" });
    res.writeHead(200, { "Content-Type": bild.format || "image/jpeg", "Cache-Control": "private, max-age=86400" });
    return void res.end(Buffer.from(bild.data));
  }

  // Quelle von Hörprobe und Cover (Apple Music/Deezer verlangen einen Hinweis mit Link); erst nach dem Aufdecken
  const quelle = /^\/api\/quelle\/([A-Za-z0-9_-]{8,32})$/.exec(p);
  if (quelle) {
    const z = songHolen(quelle[1]);
    if (!z || !songIstAufgedeckt(z.id)) return json(res, 404, { fehler: "Nicht gefunden." });
    return json(res, 200, { dienst: dienstName(z), link: dienstLink(z) });
  }

  // Details für die Auflösungskarte: Album und die eigene Geschichte
  const details = /^\/api\/details\/([A-Za-z0-9_-]{8,32})$/.exec(p);
  if (details) {
    const z = songHolen(details[1]);
    if (!z || !songIstAufgedeckt(z.id)) return json(res, 404, { fehler: "Nicht gefunden." });
    return json(res, 200, {
      album: z.kompilation ? null : z.album,
      chartJahr: z.chart_jahr,
      chartPlatz: z.chart_platz,
      hatCover: Boolean(z.hat_cover),
      geschichte: z.geschichte?.trim() || null, // nur selbst gepflegte, keine automatischen Chart-Sätze
      appleUrl: dienstLink(z),
    });
  }

  // ---------- Admin ----------
  if (p.startsWith("/api/admin/")) {
    // Bibliothekspflege nur für den Admin (Anmeldung per Dreifachklick auf der Startseite)
    if (rolle !== "admin") return json(res, 403, { fehler: "Nur für den Admin." });
    const entfernen = /^\/api\/admin\/vorschau\/([A-Za-z0-9_-]{8,32})\/entfernen$/.exec(p);
    if (entfernen && req.method === "POST") {
      const z = songHolen(entfernen[1]);
      if (!z || !istApple(z)) return json(res, 404, { fehler: "Nur Apple-/Deezer-Vorschauen lassen sich entfernen." });
      await fsp.rm(vollerPfad(z), { force: true });
      db.prepare("DELETE FROM songs WHERE id = ?").run(z.id);
      return json(res, 200, { ok: true });
    }
    const analyseRoute = /^\/api\/admin\/analyse\/([A-Za-z0-9_-]{8,32})$/.exec(p);
    if (analyseRoute) {
      const z = songHolen(analyseRoute[1]);
      return z ? json(res, 200, analyse(z)) : json(res, 404, { fehler: "Song nicht gefunden." });
    }
    // ---------- Apple-Music-Vorschauen ----------
    if (p === "/api/admin/apple/suche") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length < 2) return json(res, 400, { fehler: "Bitte mindestens zwei Zeichen eingeben." });
      try {
        return json(res, 200, await vorschauSuchen(q));
      } catch (err) {
        return json(res, 502, { fehler: `Vorschau-Suche nicht erreichbar (${(err as Error).message}).` });
      }
    }
    if (p === "/api/admin/apple/uebernehmen" && req.method === "POST") {
      const daten = await body(req);
      const trackId = Number(daten.trackId);
      if (!Number.isSafeInteger(trackId) || trackId <= 0) return json(res, 400, { fehler: "Ungültige Song-ID." });
      try {
        const u = await appleUebernehmenNachId(trackId, daten.quelle === "deezer" ? "deezer" : undefined);
        return json(res, u.status === "neu" ? 201 : 200, { status: u.status, song: analyse(songHolen(u.song.id) as SongZeile) });
      } catch (err) {
        const status = (err as { status?: number }).status ?? 502;
        console.warn("[apple]", (err as Error).message);
        return json(res, status, { fehler: status === 502 ? `Übernehmen fehlgeschlagen (${(err as Error).message}).` : (err as Error).message });
      }
    }
    const listeRoute = /^\/api\/admin\/listen\/([a-z0-9-]{1,60})\/(audio|apple-ergaenzen)$/.exec(p);
    if (listeRoute && req.method === "POST") {
      if (!listeHolen(listeRoute[1])) return json(res, 404, { fehler: "Deck nicht gefunden." });
      if (listeRoute[2] === "audio") {
        const audio = String((await body(req)).audio) as Audio;
        if (!AUDIO.includes(audio)) return json(res, 400, { fehler: "Quelle ungültig." });
        deckAudioSetzen(listeRoute[1], audio);
        return json(res, 200, { ok: true });
      }
      if (appleStatus.laeuft) return json(res, 409, { fehler: "Es werden schon Vorschauen geholt." });
      void appleErgaenzen(listeRoute[1]).catch((e) => console.error("[apple]", e));
      return json(res, 202, { ok: true });
    }
    if (p === "/api/admin/status") return json(res, 200, { scan: scanStatus, apple: appleStatus, deezerAbgleich: deezerAbgleichStatus, bibliothek: statistik(), musikOrdner: config.musikOrdner });
    if (p === "/api/admin/scan" && req.method === "POST") {
      void scannen().then(alleAbgleichen).catch((e) => console.error("[scan]", e));
      return json(res, 202, { ok: true });
    }
    if (p === "/api/admin/songs") return json(res, 200, adminSongs(url));
    if (p === "/api/admin/listen") return json(res, 200, listenUebersicht());
    // ---------- Decks (welche Songs ins Spiel kommen) ----------
    if (p === "/api/admin/decks/playlist" && req.method === "POST") {
      const d = await body(req);
      try {
        const neu = await playlistImportieren(String(d.link ?? "").slice(0, 500));
        fehlendeNachladen();
        return json(res, 201, neu);
      } catch (err) {
        const status = (err as { status?: number }).status ?? 502;
        return json(res, status, { fehler: (err as Error).message });
      }
    }
    if (p === "/api/admin/decks" && req.method === "POST") {
      const d = await body(req);
      const name = String(d.name ?? "").trim();
      if (!name) return json(res, 400, { fehler: "Bitte einen Namen angeben." });
      return json(res, 201, { id: deckAnlegen(name, "eigen") });
    }
    const deck = /^\/api\/admin\/decks\/(deck-[a-f0-9]{12})(?:\/(songs|loeschen|umbenennen))?$/.exec(p);
    if (deck) {
      const l = listeHolen(deck[1]);
      if (!l) return json(res, 404, { fehler: "Deck nicht gefunden." });
      if (!deck[2] && req.method === "GET") {
        const a = abgleichen(l.id)!;
        return json(res, 200, {
          id: l.id, name: l.name, quelle: l.quelle,
          eintraege: l.eintraege.map((e, i) => {
            const sid = a.treffer.get(i);
            const s = sid ? songHolen(sid) : null;
            return { interpret: e.interpret, titel: e.titel, jahr: s?.jahr ?? e.jahr, songId: sid ?? null };
          }),
        });
      }
      if (req.method !== "POST") return json(res, 405, { fehler: "Methode nicht erlaubt." });
      const d = await body(req, 65_536);
      if (deck[2] === "loeschen") return json(res, 200, { ok: deckLoeschen(l.id) });
      if (deck[2] === "umbenennen") {
        const name = String(d.name ?? "").trim();
        return name ? json(res, 200, { ok: deckUmbenennen(l.id, name) }) : json(res, 400, { fehler: "Bitte einen Namen angeben." });
      }
      if (deck[2] === "songs") {
        const ids = (x: unknown) => (Array.isArray(x) ? x.map(String).filter((i) => /^[A-Za-z0-9_-]{8,32}$/.test(i)) : []);
        if (!deckSongs(l.id, ids(d.hinzu), ids(d.weg))) return json(res, 400, { fehler: "Nur eigene Decks lassen sich bearbeiten." });
        return json(res, 200, { ok: true });
      }
    }
    const uebersicht = /^\/api\/admin\/listen\/([a-z0-9-]{1,60})\/songs$/.exec(p);
    if (uebersicht) {
      const u = deckUebersicht(uebersicht[1]);
      return u ? json(res, 200, u) : json(res, 404, { fehler: "Deck nicht gefunden." });
    }
    const fehlend = /^\/api\/admin\/listen\/([a-z0-9-]{1,60})\/fehlend$/.exec(p);
    if (fehlend) {
      const f = fehlendeSongs(fehlend[1]);
      return f ? json(res, 200, f) : json(res, 404, { fehler: "Liste nicht gefunden." });
    }
    if (p === "/api/admin/listen/neu-laden" && req.method === "POST") return json(res, 200, { listen: listenLaden(), charts: chartsLaden() });
    const song = /^\/api\/admin\/songs\/([A-Za-z0-9_-]{8,32})$/.exec(p);
    if (song && req.method === "POST") {
      const z = songHolen(song[1]);
      if (!z) return json(res, 404, { fehler: "Song nicht gefunden." });
      const d = await body(req);
      if ("manuellJahr" in d) {
        const j = d.manuellJahr === null || d.manuellJahr === "" ? null : Number(d.manuellJahr);
        if (j !== null && (!Number.isInteger(j) || j < 1900 || j > 2100)) return json(res, 400, { fehler: "Jahr ungültig." });
        db.prepare("UPDATE songs SET manuell_jahr = ? WHERE id = ?").run(j, z.id);
      }
      if ("ausgeschlossen" in d) db.prepare("UPDATE songs SET ausgeschlossen = ? WHERE id = ?").run(d.ausgeschlossen ? 1 : 0, z.id);
      if ("geschichte" in d) {
        const g = d.geschichte === null ? null : String(d.geschichte).trim().slice(0, 600) || null;
        db.prepare("UPDATE songs SET geschichte = ? WHERE id = ?").run(g, z.id);
      }
      if (d.bestaetigen) db.prepare("UPDATE songs SET manuell_jahr = COALESCE(manuell_jahr, jahr) WHERE id = ?").run(z.id);
      jahrNeuBerechnen(songHolen(z.id) as SongZeile);
      return json(res, 200, songHolen(z.id));
    }
  }
  json(res, 404, { fehler: "Nicht gefunden." });
}

const server = http.createServer(async (req, res) => {
  sicherheitsHeader(res);
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (url.pathname === "/healthz") return json(res, 200, { ok: true, songs: statistik().songs });
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    // Kurzlink aus dem QR-Code → Spielerseite mit Einladung
    const kurz = /^\/s\/([A-Za-z0-9]{4,6})\.([A-Za-z0-9_-]{6,32})$/.exec(url.pathname);
    if (kurz) {
      res.writeHead(302, { Location: `/spielen.html?raum=${kurz[1].toUpperCase()}&einladung=${kurz[2]}`, "Cache-Control": "no-store" });
      return void res.end();
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { fehler: "Methode nicht erlaubt." });
    if (statisch(req, res, url.pathname)) return;
    json(res, 404, { fehler: "Nicht gefunden." });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { fehler: "Serverfehler." });
    else res.end();
  }
});

// Ping alle 5 s, nach 5 s ohne Antwort gilt die Verbindung als tot → Handys verbinden nach spätestens ~10 s neu.
// Verbindungs-Wiederherstellung: nach kurzen Aussetzern (Sperre, WLAN-Wechsel) behält das Gerät Raum und Daten.
const io = new Server(server, {
  serveClient: true,
  pingInterval: 5_000,
  pingTimeout: 5_000,
  maxHttpBufferSize: 64_000,
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: true },
});
// Passwortpflicht gilt auch für die Echtzeitverbindung
io.use((socket, next) => {
  if (!config.zugangMitPasswort || rolleAusCookie(socket.handshake.headers.cookie)) return next();
  next(new Error("nicht angemeldet"));
});
socketsEinrichten(io);

const charts = chartsLaden();
const anzahlListen = listenLaden();
setTimeout(() => fehlendeNachladen(), 15_000).unref();
setTimeout(() => void deezerAbgleichen(), 60_000).unref(); // Apple-Einträge nach und nach bei Deezer (Hauptquelle) abgleichen // nach dem Start fehlende Songs aller Decks ergänzen (Streaming)
raeumeLaden();
server.listen(config.port, config.host, () => {
  console.log(`[zeitstrahl] läuft auf http://${config.host}:${config.port} – Musik: ${config.musikOrdner}, Charts: ${charts}, Songlisten: ${anzahlListen}`);
  if (!config.produktion) console.log("[zeitstrahl] Entwicklungsmodus: Passwort 'zeitstrahl', Admin 'admin'");
  void scannen()
    .then((s) => (alleAbgleichen(), s))
    .then((s) => console.log(`[scan] ${s.gefunden} Dateien, ${s.neu} neu, ${s.entfernt} entfernt, ${s.fehler} Fehler`))
    .catch((e) => console.error("[scan]", e));
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
