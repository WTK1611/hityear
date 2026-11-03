// Songlisten (PRD F-LIB-6): CSV mit Interpret, Titel, Jahr → Abgleich mit der
// eigenen Bibliothek → spielbares Deck aus den Treffern + Liste fehlender Songs.
// Quellen: data/listen/*.csv und optional ZEITSTRAHL_LISTEN (z. B. Synology-Freigabe „charts“).
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { db } from "./db.ts";
import { config } from "./config.ts";
import { APPLE_PRAEFIX, ausDateiname, csvZeile, jahrNeuBerechnen, songHolen, type SongZeile } from "./bibliothek.ts";
import { anzeigeTitel, hauptInterpret, schluessel } from "./normalisieren.ts";

export interface ListenEintrag {
  interpret: string;
  titel: string;
  jahr: number | null;
  /** nur bei eigenen Decks: fester Song aus der Bibliothek */
  songId?: string | null;
}

export type Quelle = "datei" | "katalog" | "playlist" | "eigen";

/**
 * Woher die Musik eines Decks kommt: 30-s-Vorschauen (gesucht wird bei Apple, sonst Deezer) oder eigene Dateien.
 * Das frühere „beide“ (und jedes Deck ohne Eintrag) gilt als Vorschau.
 */
export type Audio = "apple" | "dateien";
export const AUDIO: readonly Audio[] = ["apple", "dateien"];

export function deckAudio(id: string): Audio {
  const r = db.prepare("SELECT audio FROM deck_audio WHERE id = ?").get(id) as { audio: Audio } | undefined;
  return r?.audio === "dateien" ? "dateien" : "apple";
}

export function deckAudioSetzen(id: string, audio: Audio): boolean {
  if (!listen.has(id) || !AUDIO.includes(audio)) return false;
  db.prepare("INSERT INTO deck_audio (id, audio) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET audio = excluded.audio").run(id, audio);
  return true;
}

export interface Liste {
  id: string;
  name: string;
  quelle: Quelle;
  eintraege: ListenEintrag[];
}

const listen = new Map<string, Liste>();

const SPALTEN = {
  interpret: ["artist", "interpret", "künstler", "kuenstler"],
  titel: ["title", "titel", "song"],
  jahr: ["year", "jahr"],
};

function spalte(kopf: string[], namen: string[]): number {
  return kopf.findIndex((k) => namen.includes(k.trim().toLowerCase()));
}

function dateiLesen(datei: string): Liste | null {
  const zeilen = fs.readFileSync(datei, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((z) => z.trim());
  if (zeilen.length < 2) return null;
  const trenner = zeilen[0].includes(";") && !zeilen[0].includes(",") ? ";" : ",";
  const zerlegen = (z: string) => (trenner === "," ? csvZeile(z) : z.split(";"));
  const kopf = zerlegen(zeilen[0]);
  const iA = spalte(kopf, SPALTEN.interpret);
  const iT = spalte(kopf, SPALTEN.titel);
  const iJ = spalte(kopf, SPALTEN.jahr);
  if (iA < 0 || iT < 0) return null; // z. B. Jahrescharts-Datei mit anderem Aufbau
  const eintraege = zeilen.slice(1).map((z) => {
    const f = zerlegen(z);
    const jahr = iJ >= 0 ? Number(f[iJ]) : NaN;
    return { interpret: (f[iA] ?? "").trim(), titel: (f[iT] ?? "").trim(), jahr: Number.isInteger(jahr) ? jahr : null };
  }).filter((e) => e.interpret && e.titel);
  const id = path.basename(datei, path.extname(datei)).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 60);
  const name = path.basename(datei, path.extname(datei)).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { id, name, quelle: "datei", eintraege };
}

/** CSV-Text (Interpret/Titel/Jahr in beliebiger Spaltenfolge) → Einträge. */
export function csvEintraege(text: string): ListenEintrag[] {
  const zeilen = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((z) => z.trim());
  if (zeilen.length < 2) return [];
  const kopf = csvZeile(zeilen[0]);
  const iA = spalte(kopf, SPALTEN.interpret);
  const iT = spalte(kopf, SPALTEN.titel);
  const iJ = spalte(kopf, SPALTEN.jahr);
  if (iA < 0 || iT < 0) return [];
  return zeilen
    .slice(1)
    .map((z) => {
      const f = csvZeile(z);
      const jahr = iJ >= 0 ? Number(f[iJ]) : NaN;
      return { interpret: (f[iA] ?? "").trim().slice(0, 200), titel: (f[iT] ?? "").trim().slice(0, 200), jahr: Number.isInteger(jahr) && jahr > 1800 ? jahr : null };
    })
    .filter((e) => e.interpret && e.titel)
    .slice(0, 2000);
}

/** Decks aus der Datenbank (importierte Songlisten, Playlists, eigene) in den Speicher holen. */
function dbListenLaden(): void {
  const eintraege = db.prepare("SELECT deck_id, interpret, titel, jahr, song_id FROM deck_eintraege ORDER BY deck_id, nr").all() as Array<{
    deck_id: string; interpret: string; titel: string; jahr: number | null; song_id: string | null;
  }>;
  const nachListe = new Map<string, ListenEintrag[]>();
  for (const e of eintraege) {
    const l = nachListe.get(e.deck_id) ?? [];
    l.push({ interpret: e.interpret, titel: e.titel, jahr: e.jahr, songId: e.song_id });
    nachListe.set(e.deck_id, l);
  }
  for (const p of db.prepare("SELECT id, name, quelle FROM decks").all() as Array<{ id: string; name: string; quelle: Quelle }>) {
    listen.set(p.id, { id: p.id, name: deckAnzeigeName(p.name), quelle: p.quelle, eintraege: nachListe.get(p.id) ?? [] });
  }
}

export function listeHolen(id: string): Liste | null {
  return listen.get(id) ?? null;
}

// ---------- Decks pflegen ----------

const neueId = () => "deck-" + crypto.randomBytes(6).toString("hex");

export function deckAnlegen(name: string, quelle: "eigen" | "katalog" | "playlist", eintraege: ListenEintrag[] = [], herkunft: string | null = null): string {
  const id = neueId();
  db.prepare("INSERT INTO decks (id, name, quelle, herkunft, erstellt) VALUES (?, ?, ?, ?, ?)").run(id, deckAnzeigeName(name).slice(0, 80), quelle, herkunft, Date.now());
  const ein = db.prepare("INSERT INTO deck_eintraege (deck_id, nr, interpret, titel, jahr, song_id) VALUES (?, ?, ?, ?, ?, ?)");
  eintraege.forEach((e, i) => ein.run(id, i + 1, e.interpret, e.titel, e.jahr, e.songId ?? null));
  listenLaden();
  alleAbgleichen();
  return id;
}

export function deckHerkunft(): Set<string> {
  return new Set((db.prepare("SELECT herkunft FROM decks WHERE herkunft IS NOT NULL").all() as Array<{ herkunft: string }>).map((r) => r.herkunft));
}

export function deckLoeschen(id: string): boolean {
  const r = db.prepare("DELETE FROM decks WHERE id = ?").run(id);
  db.prepare("DELETE FROM deck_eintraege WHERE deck_id = ?").run(id);
  db.prepare("DELETE FROM deck_audio WHERE id = ?").run(id);
  listenLaden();
  return r.changes > 0;
}

export function deckUmbenennen(id: string, name: string): boolean {
  const r = db.prepare("UPDATE decks SET name = ? WHERE id = ?").run(name.slice(0, 80), id);
  listenLaden();
  return r.changes > 0;
}

/** Eigenes Deck: Songs der Bibliothek hinzufügen oder entfernen. */
export function deckSongs(id: string, hinzu: string[], weg: string[]): boolean {
  const p = db.prepare("SELECT quelle FROM decks WHERE id = ?").get(id) as { quelle: string } | undefined;
  if (!p || p.quelle !== "eigen") return false;
  const vorhanden = new Set((db.prepare("SELECT song_id FROM deck_eintraege WHERE deck_id = ?").all(id) as Array<{ song_id: string }>).map((r) => r.song_id));
  let nr = (db.prepare("SELECT COALESCE(MAX(nr), 0) AS n FROM deck_eintraege WHERE deck_id = ?").get(id) as { n: number }).n;
  const ein = db.prepare("INSERT INTO deck_eintraege (deck_id, nr, interpret, titel, jahr, song_id) VALUES (?, ?, ?, ?, ?, ?)");
  for (const sid of hinzu.slice(0, 2000)) {
    if (vorhanden.has(sid)) continue;
    const s = songHolen(sid);
    if (!s) continue;
    ein.run(id, ++nr, s.interpret, s.titel_anzeige, s.jahr, s.id);
    vorhanden.add(sid);
  }
  const raus = db.prepare("DELETE FROM deck_eintraege WHERE deck_id = ? AND song_id = ?");
  for (const sid of weg) raus.run(id, sid);
  listenLaden();
  return true;
}

export function listenLaden(): number {
  listen.clear();
  const ordner = [path.join(path.dirname(config.chartsDatei), "listen")];
  if (process.env.ZEITSTRAHL_LISTEN) ordner.push(path.resolve(process.env.ZEITSTRAHL_LISTEN));
  for (const o of ordner) {
    let dateien: string[] = [];
    try {
      dateien = fs.readdirSync(o).filter((n) => /\.csv$/i.test(n) && !n.startsWith("."));
    } catch {
      continue;
    }
    for (const n of dateien) {
      try {
        const l = dateiLesen(path.join(o, n));
        if (l && l.eintraege.length) listen.set(l.id, { ...l, name: deckAnzeigeName(l.name) });
      } catch (err) {
        console.warn(`[listen] ${n}: ${(err as Error).message}`);
      }
    }
  }
  const jahresHits = jahresHitsLesen();
  if (jahresHits.eintraege.length) {
    const name = "Deutschlands Jahreshits";
    listen.set(JAHRES_HITS_ID, { id: JAHRES_HITS_ID, name, quelle: "datei", eintraege: jahresHits.eintraege });
  }
  dbListenLaden();
  return listen.size;
}

/**
 * Fertiges Deck aus den deutschen Single-Jahrescharts (year,pos,artist,title; data/jahrescharts.csv und
 * ZEITSTRAHL_CHARTS/charts*.csv). Ein Song, der in mehreren Jahren in den Charts war, steht nur einmal drin.
 * Ohne Jahr: Das Chartjahr ist nicht immer das Erscheinungsjahr und darf das Jahr der Songs nicht überschreiben.
 */
const JAHRES_HITS_ID = "jahres-hits";
function jahresHitsLesen(): { eintraege: ListenEintrag[]; von: number; bis: number } {
  const dateien = [config.chartsDatei];
  if (process.env.ZEITSTRAHL_CHARTS) {
    try {
      for (const n of fs.readdirSync(process.env.ZEITSTRAHL_CHARTS)) if (/charts.*\.csv$/i.test(n)) dateien.push(path.join(process.env.ZEITSTRAHL_CHARTS, n));
    } catch {
      /* Freigabe nicht eingebunden */
    }
  }
  const gesehen = new Set<string>();
  const eintraege: ListenEintrag[] = [];
  let von = Infinity, bis = -Infinity;
  for (const d of dateien) {
    let text: string;
    try {
      text = fs.readFileSync(d, "utf8").replace(/^\uFEFF/, "");
    } catch {
      continue;
    }
    if (!/^year,pos,artist,title/i.test(text)) continue;
    for (const z of text.split(/\r?\n/).slice(1)) {
      const [jahrText, , interpret = "", titel = ""] = csvZeile(z);
      if (!interpret.trim() || !titel.trim()) continue;
      const jahr = Number(jahrText);
      if (Number.isInteger(jahr)) {
        von = Math.min(von, jahr);
        bis = Math.max(bis, jahr);
      }
      const key = k(interpret, titel);
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      eintraege.push({ interpret: interpret.trim(), titel: titel.trim(), jahr: null });
    }
  }
  return { eintraege, von, bis };
}

const k = (interpret: string, titel: string) => `${hauptInterpret(interpret)}|${schluessel(anzeigeTitel(titel))}`;

/** Bedeutungstragende Wörter eines Interpreten (für unscharfen Abgleich, z. B. bei Samplern). */
function interpretWoerter(s: string): Set<string> {
  return new Set(schluessel(s.replace(/\b(feat\.?|ft\.?|featuring|vs\.?|und|and|with|mit)\b/gi, " ")).split(" ").filter((w) => w.length >= 3));
}

export { ausDateiname };

interface Kandidat { id: string; woerter: Set<string> }

/**
 * Abgleich einer Liste mit der Bibliothek. Reihenfolge:
 * 1. Interpret + Titel exakt (normalisiert)
 * 2. gleicher Titel und mindestens ein gemeinsames Interpret-Wort (Sampler, „feat.“, „The …“)
 * 3. dasselbe mit Interpret/Titel aus dem Dateinamen (schlecht getaggte Sampler)
 * Nur Songs aus der Quelle des Decks.
 */
export function abgleichen(id: string): { liste: Liste; treffer: Map<number, string>; ids: string[] } | null {
  const liste = listen.get(id);
  if (!liste) return null;
  const exakt = new Map<string, string>();
  const nachTitel = new Map<string, Kandidat[]>();
  const merken = (sid: string, interpret: string, titel: string) => {
    const key = k(interpret, titel);
    if (!exakt.has(key)) exakt.set(key, sid);
    const t = schluessel(anzeigeTitel(titel));
    if (!t) return;
    const liste = nachTitel.get(t) ?? [];
    liste.push({ id: sid, woerter: interpretWoerter(interpret) });
    nachTitel.set(t, liste);
  };
  const audio = deckAudio(id);
  const filter = audio === "apple" ? `AND pfad LIKE '${APPLE_PRAEFIX}%'` : `AND pfad NOT LIKE '${APPLE_PRAEFIX}%'`;
  const aktiv = new Set<string>();
  const sql = `SELECT id, interpret, titel, pfad FROM songs WHERE ausgeschlossen = 0 ${filter} ORDER BY pfad LIKE '${APPLE_PRAEFIX}%'`;
  for (const s of db.prepare(sql).all() as Array<{ id: string; interpret: string; titel: string; pfad: string }>) {
    aktiv.add(s.id);
    merken(s.id, s.interpret, s.titel);
    const d = ausDateiname(s.pfad);
    if (d) merken(s.id, d.interpret, d.titel);
  }
  const treffer = new Map<number, string>();
  liste.eintraege.forEach((e, i) => {
    // eigenes Deck: fester Song – kommt er nicht aus der Quelle des Decks, denselben Song dort suchen
    if (e.songId && aktiv.has(e.songId)) {
      treffer.set(i, e.songId);
      return;
    }
    let sid = exakt.get(k(e.interpret, e.titel));
    if (!sid) {
      const w = interpretWoerter(e.interpret);
      const kandidaten = nachTitel.get(schluessel(anzeigeTitel(e.titel))) ?? [];
      sid = kandidaten.find((c) => [...w].some((x) => c.woerter.has(x)))?.id;
    }
    if (sid) {
      treffer.set(i, sid);
      if (e.jahr) listenJahrMerken(sid, e.jahr);
    }
  });
  return { liste, treffer, ids: [...new Set(treffer.values())] };
}

const listenJahrSetzen = db.prepare("UPDATE songs SET listen_jahr = ? WHERE id = ? AND (listen_jahr IS NULL OR listen_jahr > ?)");
/** Originaljahr aus der Songliste am Song vermerken (frühestes gewinnt) und Jahr neu bestimmen. */
function listenJahrMerken(songId: string, jahr: number): void {
  if (listenJahrSetzen.run(jahr, songId, jahr).changes > 0) jahrNeuBerechnen(songHolen(songId) as SongZeile);
}

/** Anzeigename eines Decks: Leerraum aufräumen, höchstens 80 Zeichen. */
export function deckAnzeigeName(name: string): string {
  return name.replace(/\s{2,}/g, " ").trim().slice(0, 80);
}

export function listenUebersicht(): Array<{ id: string; name: string; quelle: Quelle; audio: Audio; gesamt: number; treffer: number }> {
  return [...listen.values()]
    .map((l) => {
      const a = abgleichen(l.id)!;
      return { id: l.id, name: deckAnzeigeName(l.name), quelle: l.quelle, audio: deckAudio(l.id), gesamt: l.eintraege.length, treffer: a.ids.length };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Alle Einträge eines Decks mit Treffer in der Bibliothek (vorhanden) oder ohne (fehlt). */
export function deckUebersicht(id: string): Array<{ interpret: string; titel: string; jahr: number | null; songId: string | null; quelle: "datei" | "apple" | "deezer" | null }> | null {
  const a = abgleichen(id);
  if (!a) return null;
  return a.liste.eintraege.map((e, i) => {
    const sid = a.treffer.get(i) ?? null;
    const s = sid ? songHolen(sid) : null;
    return { interpret: e.interpret, titel: e.titel, jahr: s?.jahr ?? e.jahr, songId: sid, quelle: s ? (s.pfad.startsWith(`${APPLE_PRAEFIX}deezer-`) ? "deezer" : s.pfad.startsWith(APPLE_PRAEFIX) ? "apple" : "datei") : null };
  });
}

export function fehlendeSongs(id: string): ListenEintrag[] | null {
  const a = abgleichen(id);
  if (!a) return null;
  return a.liste.eintraege.filter((_, i) => !a.treffer.has(i));
}

/** In welchen Songlisten steht dieser Song (mit dem dort genannten Jahr)? */
export function listenFuerSong(songId: string): Array<{ name: string; jahr: number | null }> {
  const ergebnis: Array<{ name: string; jahr: number | null }> = [];
  for (const l of listen.keys()) {
    const a = abgleichen(l);
    if (!a) continue;
    for (const [i, sid] of a.treffer) {
      if (sid === songId) {
        ergebnis.push({ name: a.liste.name, jahr: a.liste.eintraege[i].jahr });
        break;
      }
    }
  }
  return ergebnis;
}

export function listenSongIds(id: string): string[] {
  return abgleichen(id)?.ids ?? [];
}

/** Beim Start und nach jedem Scan: alle Listen abgleichen, damit Listenjahre gesetzt sind. */
export function alleAbgleichen(): void {
  for (const l of listen.keys()) abgleichen(l);
}
