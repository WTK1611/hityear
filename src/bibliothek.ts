// Musikbibliothek: Ordner scannen, Tags lesen, Erscheinungsjahr bestimmen,
// Stapel für ein Spiel ziehen.
import fs from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseFile } from "music-metadata";
import { db } from "./db.ts";
import { config } from "./config.ts";
import { anzeigeTitel, hauptInterpret, istVerdaechtigerTitel, schluessel } from "./normalisieren.ts";
import { GENRES, type Genre, type Karte } from "./game.ts";

export const ENDUNGEN = new Set([".mp3", ".m4a", ".mp4", ".aac", ".flac", ".ogg", ".opus"]);

/** Apple-Music-Vorschauen (30 s) liegen im Apple-Ordner. */
export const APPLE_PRAEFIX = "@apple/";

/** Zu durchsuchende Wurzeln: Musikordner (nur lesend), Apple-Vorschauen. */
function wurzeln(): Array<{ ordner: string; praefix: string }> {
  return [
    { ordner: config.musikOrdner, praefix: "" },
    { ordner: config.appleOrdner, praefix: APPLE_PRAEFIX },
  ];
}

export interface SongZeile {
  id: string;
  pfad: string;
  mtime: number;
  groesse: number;
  titel: string;
  titel_anzeige: string;
  interpret: string;
  album: string | null;
  dauer_ms: number;
  tag_jahr: number | null;
  mb_jahr: number | null;
  mb_geprueft: number;
  chart_jahr: number | null;
  chart_platz: number | null;
  manuell_jahr: number | null;
  jahr: number | null;
  jahr_quelle: string | null;
  pruefen: number;
  pruef_grund: string | null;
  hat_cover: number;
  kompilation: number;
  ausgeschlossen: number;
  geschichte: string | null;
  genre: string | null;
  listen_jahr: number | null;
  apple_url: string | null;
  /** Cover bei Apple/Deezer (für Streaming) */
  cover_url: string | null;
  /** passender Deezer-Song zu einem Apple-Eintrag (Hauptquelle), null = keiner gefunden oder noch nicht gesucht */
  deezer_id: number | null;
  deezer_url: string | null;
  /** wann zuletzt bei Deezer gesucht wurde (ms), null = noch nie */
  deezer_geprueft: number | null;
  /** früher Hintergrundfakt (Wikipedia), wird nicht mehr genutzt */
  fakt: string | null;
  fakt_geholt: number | null;
}

// ---------- Jahrescharts (Fallback-Jahr + Chartplatz auf der Karte) ----------

interface ChartTreffer {
  jahr: number;
  platz: number;
}
const charts = new Map<string, ChartTreffer>();

export function csvZeile(zeile: string): string[] {
  const felder: string[] = [];
  let feld = "";
  let inAnf = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (inAnf) {
      if (c === '"' && zeile[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (c === '"') inAnf = false;
      else feld += c;
    } else if (c === '"') inAnf = true;
    else if (c === ",") {
      felder.push(feld);
      feld = "";
    } else feld += c;
  }
  felder.push(feld);
  return felder;
}

export function chartsLaden(): number {
  charts.clear();
  const dateien = [config.chartsDatei];
  const extra = process.env.ZEITSTRAHL_CHARTS;
  if (extra) {
    try {
      for (const n of readdirSync(extra)) if (/charts.*\.csv$/i.test(n)) dateien.push(path.join(extra, n));
    } catch {
      /* Freigabe nicht eingebunden */
    }
  }
  const zeilen: string[] = [];
  for (const d of dateien) {
    try {
      const text = readFileSync(d, "utf8").replace(/^\uFEFF/, "");
      // nur Dateien im Format year,pos,artist,title[,…]
      if (!/^year,pos,artist,title/i.test(text)) continue;
      zeilen.push(...text.split(/\r?\n/).slice(1));
    } catch {
      /* fehlt */
    }
  }
  for (const z of zeilen) {
    if (!z.trim()) continue;
    const [jahr, platz, interpret, titel] = csvZeile(z);
    const k = `${hauptInterpret(interpret)}|${schluessel(titel)}`;
    const neu = { jahr: Number(jahr), platz: Number(platz) };
    const alt = charts.get(k);
    // frühestes Chartjahr, bei gleichem Jahr der beste Platz
    if (!alt || neu.jahr < alt.jahr || (neu.jahr === alt.jahr && neu.platz < alt.platz)) charts.set(k, neu);
  }
  return charts.size;
}

export function chartSuche(interpret: string, titel: string): ChartTreffer | null {
  return charts.get(`${hauptInterpret(interpret)}|${schluessel(anzeigeTitel(titel))}`) ?? null;
}

// ---------- Jahr bestimmen (PRD §9) ----------

export function jahrBestimmen(z: Pick<SongZeile, "tag_jahr" | "mb_jahr" | "mb_geprueft" | "chart_jahr" | "manuell_jahr" | "kompilation" | "titel"> & { listen_jahr?: number | null }): {
  jahr: number | null;
  quelle: string | null;
  pruefen: boolean;
  grund: string | null;
} {
  if (z.manuell_jahr) return { jahr: z.manuell_jahr, quelle: "manuell", pruefen: false, grund: null };
  const tag = z.tag_jahr ?? null;
  const mb = z.mb_jahr ?? null;
  const chart = z.chart_jahr ?? null;
  const liste = z.listen_jahr ?? null;
  const gruende: string[] = [];
  let jahr: number | null = null;
  let quelle: string | null = null;

  if (mb && (!tag || mb <= tag)) {
    jahr = mb;
    quelle = "musicbrainz";
    if (tag && tag - mb >= 2) gruende.push(`Tag ${tag}, MusicBrainz ${mb}`);
  } else if (tag) {
    jahr = tag;
    quelle = "tag";
    if (mb && mb > tag) gruende.push(`MusicBrainz ${mb} später als Tag ${tag}`);
  } else if (liste) {
    jahr = liste;
    quelle = "liste";
    gruende.push("nur Jahr aus Songliste bekannt");
  } else if (chart) {
    jahr = chart;
    quelle = "charts";
    gruende.push("nur Chartjahr bekannt");
  }
  // Sampler/Remaster: Songlisten führen das Originaljahr. Ist es früher als Tag/MB, gewinnt es.
  if (liste && jahr && quelle !== "liste" && liste < jahr) {
    gruende.push(`${quelle === "tag" ? "Tag" : "MusicBrainz"} ${jahr}, Songliste ${liste}`);
    jahr = liste;
    quelle = "liste";
  }
  if (!jahr) gruende.push("kein Jahr gefunden");
  if (jahr && chart && chart - jahr >= 3 && quelle !== "charts") gruende.push(`Chartjahr ${chart}`);
  if (z.mb_geprueft && !mb && quelle === "tag") {
    if (z.kompilation) gruende.push("Kompilation ohne MusicBrainz-Treffer");
    else if (istVerdaechtigerTitel(z.titel)) gruende.push("Remaster/Live im Titel");
  }
  return { jahr, quelle, pruefen: gruende.length > 0, grund: gruende.join("; ") || null };
}

const jahrUpdate = db.prepare(
  "UPDATE songs SET jahr = ?, jahr_quelle = ?, pruefen = ?, pruef_grund = ? WHERE id = ?",
);

export function jahrNeuBerechnen(z: SongZeile): void {
  const r = jahrBestimmen(z);
  jahrUpdate.run(r.jahr, r.quelle, r.pruefen ? 1 : 0, r.grund, z.id);
}

// ---------- Scan ----------

export interface ScanStatus {
  laeuft: boolean;
  gefunden: number;
  verarbeitet: number;
  neu: number;
  entfernt: number;
  fehler: number;
  gestartet: number | null;
  beendet: number | null;
}

export const scanStatus: ScanStatus = {
  laeuft: false,
  gefunden: 0,
  verarbeitet: 0,
  neu: 0,
  entfernt: 0,
  fehler: 0,
  gestartet: null,
  beendet: null,
};

async function* dateienFinden(ordner: string): AsyncGenerator<string> {
  let eintraege;
  try {
    eintraege = await fs.readdir(ordner, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of eintraege) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) yield* dateienFinden(p);
    else if (e.isFile() && ENDUNGEN.has(path.extname(e.name).toLowerCase())) yield p;
  }
}

function songId(relPfad: string): string {
  // opak und stabil; verrät weder Pfad noch Titel
  return crypto.createHmac("sha256", "zeitstrahl-song").update(relPfad).digest("base64url").slice(0, 16);
}

function tagJahr(common: { year?: number; date?: string; originalyear?: number; originaldate?: string }): number | null {
  const kandidaten = [common.originalyear, common.originaldate?.slice(0, 4), common.year, common.date?.slice(0, 4)]
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 1900 && n <= new Date().getFullYear() + 1);
  return kandidaten.length ? Math.min(...kandidaten) : null;
}

const einfuegen = db.prepare(`
  INSERT INTO songs (id, pfad, mtime, groesse, titel, titel_anzeige, interpret, album, dauer_ms, tag_jahr,
                     chart_jahr, chart_platz, hat_cover, kompilation, genre)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(pfad) DO UPDATE SET
    mtime = excluded.mtime, groesse = excluded.groesse, titel = excluded.titel,
    titel_anzeige = excluded.titel_anzeige, interpret = excluded.interpret, album = excluded.album,
    dauer_ms = excluded.dauer_ms, tag_jahr = excluded.tag_jahr, chart_jahr = excluded.chart_jahr,
    chart_platz = excluded.chart_platz, hat_cover = excluded.hat_cover, kompilation = excluded.kompilation,
    genre = excluded.genre,
    mb_geprueft = CASE WHEN songs.titel = excluded.titel AND songs.interpret = excluded.interpret
                       THEN songs.mb_geprueft ELSE 0 END
`);

/** Eine Datei lesen (Tags, Dauer, Cover, Chartjahr), in die Datenbank schreiben und das Jahr bestimmen. */
export async function songEinlesen(voll: string, rel: string): Promise<SongZeile> {
  const st = await fs.stat(voll);
  const meta = await parseFile(voll, { duration: true, skipCovers: false });
  if (!meta.format.duration && !meta.format.codec) throw new Error("keine lesbare Audiodatei");
  const c = meta.common;
  const ausName = ausDateiname(rel);
  const titel = (c.title ?? ausName?.titel ?? path.basename(voll, path.extname(voll))).trim();
  const albumKuenstler = /various|verschiedene|diverse/i.test(c.albumartist ?? "") ? undefined : c.albumartist;
  const interpret = (c.artist ?? ausName?.interpret ?? albumKuenstler ?? "Unbekannt").trim();
  const chart = chartSuche(interpret, titel);
  einfuegen.run(
    songId(rel),
    rel,
    Math.floor(st.mtimeMs),
    st.size,
    titel,
    anzeigeTitel(titel),
    interpret,
    c.album ?? null,
    Math.round((meta.format.duration ?? 0) * 1000),
    tagJahr(c),
    chart?.jahr ?? null,
    chart?.platz ?? null,
    c.picture && c.picture.length > 0 ? 1 : 0,
    c.compilation || /various|verschiedene|diverse/i.test(c.albumartist ?? "") ? 1 : 0,
    c.genre?.map((g) => g.trim()).filter(Boolean).join(", ") ?? "", // "" = gelesen, kein Genre im Tag
  );
  const z = db.prepare("SELECT * FROM songs WHERE pfad = ?").get(rel) as unknown as SongZeile;
  jahrNeuBerechnen(z);
  return songHolen(z.id) as SongZeile;
}

/** Apple-/Deezer-Vorschau ohne Datei (Streaming): Zeile aus den Angaben des Dienstes, Größe 0. */
export function streamZeileAnlegen(rel: string, t: { titel: string; interpret: string; album: string | null; genre: string | null; cover: string | null }): SongZeile {
  const chart = chartSuche(t.interpret, t.titel);
  einfuegen.run(songId(rel), rel, 0, 0, t.titel, anzeigeTitel(t.titel), t.interpret, t.album, 30_000, null, chart?.jahr ?? null, chart?.platz ?? null, t.cover ? 1 : 0, 0, t.genre ?? "");
  const z = db.prepare("SELECT * FROM songs WHERE pfad = ?").get(rel) as unknown as SongZeile;
  jahrNeuBerechnen(z);
  return songHolen(z.id) as SongZeile;
}

export async function scannen(): Promise<ScanStatus> {
  if (scanStatus.laeuft) return scanStatus;
  Object.assign(scanStatus, { laeuft: true, gefunden: 0, verarbeitet: 0, neu: 0, entfernt: 0, fehler: 0, gestartet: Date.now(), beendet: null });
  try {
    const bekannt = new Map<string, { mtime: number; groesse: number; ohneGenre: boolean }>();
    for (const r of db.prepare("SELECT pfad, mtime, groesse, genre FROM songs").all() as Array<{ pfad: string; mtime: number; groesse: number; genre: string | null }>) {
      // genre NULL: vor Einführung des Genres eingelesen → einmal neu lesen
      bekannt.set(r.pfad, { mtime: r.mtime, groesse: r.groesse, ohneGenre: r.genre === null });
    }
    const gesehen = new Set<string>();
    for (const { ordner, praefix } of wurzeln()) {
      for await (const voll of dateienFinden(ordner)) {
        const rel = praefix + path.relative(ordner, voll).split(path.sep).join("/");
        gesehen.add(rel);
        scanStatus.gefunden++;
        try {
          const st = await fs.stat(voll);
          const alt = bekannt.get(rel);
          if (alt && !alt.ohneGenre && alt.mtime === Math.floor(st.mtimeMs) && alt.groesse === st.size) {
            scanStatus.verarbeitet++;
            continue;
          }
          await songEinlesen(voll, rel);
          if (!alt) scanStatus.neu++;
        } catch (err) {
          scanStatus.fehler++;
          console.warn(`[scan] ${rel}: ${(err as Error).message}`);
        }
        scanStatus.verarbeitet++;
      }
    }
    const loeschen = db.prepare("DELETE FROM songs WHERE pfad = ?");
    for (const [pfad, b] of bekannt) {
      // Vorschauen nur zum Streamen (groesse 0) haben absichtlich keine Datei
      if (!gesehen.has(pfad) && !(pfad.startsWith(APPLE_PRAEFIX) && b.groesse === 0)) {
        loeschen.run(pfad);
        scanStatus.entfernt++;
      }
    }
  } finally {
    scanStatus.laeuft = false;
    scanStatus.beendet = Date.now();
  }
  return scanStatus;
}

export function songHolen(id: string): SongZeile | null {
  return (db.prepare("SELECT * FROM songs WHERE id = ?").get(id) as unknown as SongZeile) ?? null;
}

export function istApple(z: Pick<SongZeile, "pfad">): boolean {
  return z.pfad.startsWith(APPLE_PRAEFIX);
}

export function vollerPfad(z: Pick<SongZeile, "pfad">): string {
  const [basis, rel] = istApple(z) ? [config.appleOrdner, z.pfad.slice(APPLE_PRAEFIX.length)] : [config.musikOrdner, z.pfad];
  const p = path.resolve(basis, rel);
  if (!p.startsWith(basis + path.sep)) throw new Error("Pfad außerhalb der Bibliothek");
  return p;
}

/**
 * Gleicher Song (Interpret + Titel) schon in der Bibliothek – aus derselben Quelle?
 * Eigene Datei und Apple-Vorschau desselben Songs dürfen nebeneinander stehen (Quelle je Deck).
 */
export function duplikatVon(z: SongZeile): SongZeile | null {
  const k = `${hauptInterpret(z.interpret)}|${schluessel(z.titel_anzeige)}`;
  const kandidaten = db
    .prepare(`SELECT * FROM songs WHERE id != ? AND ausgeschlossen = 0 AND pfad ${istApple(z) ? "" : "NOT "}LIKE '${APPLE_PRAEFIX}%'`)
    .all(z.id) as unknown as SongZeile[];
  return kandidaten.find((s) => `${hauptInterpret(s.interpret)}|${schluessel(s.titel_anzeige)}` === k) ?? null;
}

// ---------- Stapel ziehen ----------

export interface Auswahl {
  jahrzehnte: number[];
  genres?: Genre[];
  nurChartHits: boolean;
  /** Nur Apple-/Deezer-Vorschauen (Räume, die nicht der Admin eröffnet hat): keine eigenen Dateien */
  nurStreaming?: boolean;
  /** Song-IDs eines Decks (Songliste); leer/undefined = ganze Bibliothek. */
  songIds?: string[] | null;
}

/** Bedingung für eine Genre-Gruppe (LIKE ist für ASCII ohne Groß/klein) */
function genreSql(g: Genre, params: Array<number | string>): string {
  const teile = GENRES[g].map((w) => {
    params.push(`%${w}%`);
    return "genre LIKE ?";
  });
  return `(${teile.join(" OR ")})`;
}

function auswahlSql(a: Auswahl): { sql: string; params: Array<number | string> } {
  const bed = ["ausgeschlossen = 0", "jahr IS NOT NULL"];
  const params: Array<number | string> = [];
  if (a.nurChartHits) bed.push("chart_platz IS NOT NULL");
  if (a.nurStreaming) bed.push(`pfad LIKE '${APPLE_PRAEFIX}%'`);
  if (a.songIds) {
    // IDs sind base64url (16 Zeichen) – trotzdem streng prüfen, dann als Literale einsetzen
    const ids = a.songIds.filter((i) => /^[A-Za-z0-9_-]{8,32}$/.test(i));
    bed.push(ids.length ? `id IN (${ids.map((i) => `'${i}'`).join(",")})` : "0");
  }
  if (a.jahrzehnte.length) {
    bed.push(`(${a.jahrzehnte.map(() => "(jahr >= ? AND jahr < ?)").join(" OR ")})`);
    for (const j of a.jahrzehnte) params.push(j, j + 10);
  }
  if (a.genres?.length) bed.push(`(${a.genres.map((g) => genreSql(g, params)).join(" OR ")})`);
  return { sql: bed.join(" AND "), params };
}

export function anzahlVerfuegbar(a: Auswahl): number {
  const { sql, params } = auswahlSql(a);
  return (db.prepare(`SELECT COUNT(*) AS n FROM songs WHERE ${sql}`).get(...params) as { n: number }).n;
}

/**
 * Gemischter Stapel. Songs, die lange nicht (oder nie) gespielt wurden, kommen
 * zuerst dran – so wiederholt sich über mehrere Spiele möglichst wenig.
 * Gleiche Titel vom selben Interpreten (Duplikate) nur einmal.
 */
export function stapelZiehen(a: Auswahl, max = 400): Karte[] {
  const { sql, params } = auswahlSql(a);
  const zeilen = db
    .prepare(
      `SELECT s.id, s.pfad, s.jahr, s.titel_anzeige, s.interpret,
              COALESCE((SELECT MAX(zeitpunkt) FROM gespielt g WHERE g.song_id = s.id), 0) AS zuletzt
       FROM songs s WHERE ${sql}`,
    )
    .all(...params) as Array<{ id: string; pfad: string; jahr: number; titel_anzeige: string; interpret: string; zuletzt: number }>;

  // zufällig mischen, dann stabil nach „zuletzt gespielt“ sortieren
  for (let i = zeilen.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [zeilen[i], zeilen[j]] = [zeilen[j], zeilen[i]];
  }
  zeilen.sort((x, y) => x.zuletzt - y.zuletzt);
  // gibt es einen Song als eigene Datei und als Apple-Vorschau, gewinnt die Datei
  const mitDatei = new Set(zeilen.filter((z) => !z.pfad.startsWith(APPLE_PRAEFIX)).map((z) => `${hauptInterpret(z.interpret)}|${schluessel(z.titel_anzeige)}`));

  const gesehen = new Set<string>();
  const karten: Karte[] = [];
  for (const z of zeilen) {
    const k = `${hauptInterpret(z.interpret)}|${schluessel(z.titel_anzeige)}`;
    if (gesehen.has(k) || (z.pfad.startsWith(APPLE_PRAEFIX) && mitDatei.has(k))) continue;
    gesehen.add(k);
    karten.push({ songId: z.id, jahr: z.jahr, titel: z.titel_anzeige, interpret: z.interpret });
    if (karten.length >= max) break;
  }
  // Stapel wird von hinten gezogen (pop) → am wenigsten gespielte nach hinten
  karten.reverse();
  return karten;
}

const gespieltEintrag = db.prepare("INSERT INTO gespielt (song_id, zeitpunkt) VALUES (?, ?)");
export function alsGespieltMarkieren(songId: string): void {
  gespieltEintrag.run(songId, Date.now());
}

export function statistik(): {
  songs: number;
  mitJahr: number;
  pruefen: number;
  chartHits: number;
  jahrzehnte: Array<{ jahrzehnt: number; anzahl: number }>;
  genres: Array<{ genre: Genre; anzahl: number }>;
} {
  const g = db
    .prepare(
      `SELECT COUNT(*) AS songs,
              SUM(jahr IS NOT NULL AND ausgeschlossen = 0) AS mitJahr,
              SUM(pruefen = 1 AND ausgeschlossen = 0) AS pruefen,
              SUM(chart_platz IS NOT NULL AND jahr IS NOT NULL AND ausgeschlossen = 0) AS chartHits
       FROM songs`,
    )
    .get() as { songs: number; mitJahr: number | null; pruefen: number | null; chartHits: number | null };
  const jz = db
    .prepare(
      `SELECT (jahr / 10) * 10 AS jahrzehnt, COUNT(*) AS anzahl FROM songs
       WHERE jahr IS NOT NULL AND ausgeschlossen = 0 GROUP BY 1 ORDER BY 1`,
    )
    .all() as Array<{ jahrzehnt: number; anzahl: number }>;
  const genres = (Object.keys(GENRES) as Genre[]).map((genre) => ({ genre, anzahl: anzahlVerfuegbar({ jahrzehnte: [], nurChartHits: false, genres: [genre] }) }));
  return { songs: g.songs, mitJahr: g.mitJahr ?? 0, pruefen: g.pruefen ?? 0, chartHits: g.chartHits ?? 0, jahrzehnte: jz, genres };
}

// ---------- Geschichte (Auflösungskarte) ----------

/**
 * Kurze Geschichte zum Song: die gepflegte (Admin) oder eine aus Fakten in
 * eigenen Worten zusammengesetzte.
 */
export function geschichteFuer(z: SongZeile): string {
  if (z.geschichte?.trim()) return z.geschichte.trim();
  const saetze: string[] = [];
  const jahr = z.jahr ?? z.tag_jahr;
  if (z.album && !z.kompilation && jahr) saetze.push(`Erschienen ${jahr} auf dem Album „${z.album}“.`);
  else if (jahr) saetze.push(`Veröffentlicht ${jahr}.`);
  if (z.chart_platz && z.chart_jahr) {
    saetze.push(
      z.chart_platz === 1
        ? `In Deutschland der meistverkaufte Song des Jahres ${z.chart_jahr} – Platz 1 der Jahrescharts.`
        : z.chart_platz <= 10
          ? `Ein Riesenhit: Platz ${z.chart_platz} der deutschen Jahrescharts ${z.chart_jahr}.`
          : `In den deutschen Jahrescharts ${z.chart_jahr} auf Platz ${z.chart_platz}.`,
    );
  }
  if (z.jahr && z.tag_jahr && z.tag_jahr - z.jahr >= 2) {
    saetze.push(`Die Aufnahme in deiner Sammlung stammt von ${z.tag_jahr} – das Original ist ${z.tag_jahr - z.jahr} Jahre älter.`);
  }
  return saetze.join(" ");
}

/** „01 - Interpret - Titel.mp3“ / „Interpret - Titel.m4a“ → {interpret, titel} (für ungetaggte Sampler) */
export function ausDateiname(pfad: string): { interpret: string; titel: string } | null {
  const name = path.basename(pfad, path.extname(pfad)).replace(/^\s*(\d{1,3}[\s._-]+)+/, "").replace(/_/g, " ");
  const teile = name.split(/\s+[-–]\s+/);
  if (teile.length < 2 || !teile[0].trim() || !teile[1].trim()) return null;
  return { interpret: teile[0].trim(), titel: teile.slice(1).join(" - ").trim() };
}
