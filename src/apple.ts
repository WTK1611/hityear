// Hörproben von Deezer (Hauptquelle) und Apple Music (Ausweichquelle) neben den eigenen Dateien.
// Beide liefern je Song einen 30-Sekunden-Ausschnitt ohne Konto. Gespeichert wird nur eine Zeile in der Datenbank;
// Hörprobe und Cover kommen beim Spielen direkt vom Dienst (vorschau.ts).
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { APPLE_PRAEFIX, duplikatVon, jahrNeuBerechnen, songEinlesen, songHolen, streamZeileAnlegen, type SongZeile } from "./bibliothek.ts";
import { alleAbgleichen, fehlendeSongs, listeHolen, listenUebersicht } from "./listen.ts";
import { abstand, anzeigeTitel, hauptInterpret, kompakt, schluessel } from "./normalisieren.ts";
import { deezerSuchen, deezerTrack } from "./deezer.ts";

export interface AppleTreffer {
  /** fehlt = Apple Music; „deezer“ = Rückfall, wenn Apple den Song nicht hat */
  quelle?: "deezer";
  trackId: number;
  interpret: string;
  titel: string;
  album: string | null;
  jahr: number | null;
  genre: string | null;
  vorschau: string;
  cover: string | null;
  link: string | null;
}

interface ItunesTrack {
  trackId: number;
  artistName: string;
  trackName: string;
  collectionName?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
}

// Apple drosselt die Suche (etwa 20 Abfragen pro Minute) → Abstand halten.
let naechste = 0;
async function drosseln(): Promise<void> {
  const jetzt = Date.now();
  const start = Math.max(jetzt, naechste);
  naechste = start + 3100;
  if (start > jetzt) await new Promise((r) => setTimeout(r, start - jetzt));
}

/** Nur Apple-Server ansprechen (Vorschau- und Cover-URLs kommen aus der Antwort). */
function appleUrl(roh: string | undefined): string | null {
  if (!roh) return null;
  try {
    const u = new URL(roh);
    return u.protocol === "https:" && /(^|\.)(apple\.com|mzstatic\.com)$/.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

function treffer(t: ItunesTrack): AppleTreffer | null {
  const vorschau = appleUrl(t.previewUrl);
  if (!vorschau || !t.trackId) return null;
  const jahr = Number(t.releaseDate?.slice(0, 4));
  return {
    trackId: t.trackId,
    interpret: t.artistName,
    titel: t.trackName,
    album: t.collectionName ?? null,
    // Apple nennt teils Platzhalter (1900) – solche Jahre verwerfen
    jahr: Number.isInteger(jahr) && jahr >= 1920 ? jahr : null,
    genre: t.primaryGenreName ?? null,
    vorschau,
    cover: appleUrl(t.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/600x600bb.jpg")),
    link: appleUrl(t.trackViewUrl?.replace(/[?&]uo=\d+/, "")),
  };
}

async function itunes(pfad: string, params: Record<string, string>, eilig = false): Promise<AppleTreffer[]> {
  if (!eilig) await drosseln();
  const q = new URLSearchParams({ country: config.appleLand, ...params });
  const res = await fetch(`https://itunes.apple.com/${pfad}?${q}`, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 403 || res.status === 429) throw new Error("Apple drosselt gerade – bitte kurz warten");
  if (!res.ok) throw new Error(`Apple HTTP ${res.status}`);
  const daten = (await res.json()) as { results?: ItunesTrack[] };
  return (daten.results ?? []).map(treffer).filter((t): t is AppleTreffer => t !== null);
}

/** Ein Song per ID, ohne Wartezeit (beim Spielen; einzelne Abrufe liegen weit unter Apples Grenze). */
export async function appleNachId(trackId: number, eilig = true): Promise<AppleTreffer | null> {
  return (await itunes("lookup", { id: String(trackId), entity: "song" }, eilig))[0] ?? null;
}

export function appleSuchen(begriff: string): Promise<AppleTreffer[]> {
  return itunes("search", { term: begriff.slice(0, 200), media: "music", entity: "song", limit: "15" });
}

/** Erst Deezer (Hauptquelle); findet Deezer nichts mit Vorschau, dann Apple Music. */
export async function vorschauSuchen(begriff: string): Promise<AppleTreffer[]> {
  const deezer = await deezerSuchen(begriff).catch(() => []);
  return deezer.length ? deezer : appleSuchen(begriff);
}

/** Fast gleich: gleich, oder bei längeren Wörtern 1–2 Tippfehler. */
const fastGleich = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && abstand(a, b) <= (Math.min(a.length, b.length) >= 10 ? 2 : 1));

/**
 * Wie gut passt ein Treffer zu Interpret + Titel einer Liste? 0 = gar nicht, 1 = tolerant, 2 = genau.
 * Tolerant: Sonderzeichen egal, Klammertext zählt mit, kleine Tippfehler, Interpret darf auch im Titel stehen
 * (Listen schreiben z. B. „Bob Sinclair“, „Verdammt lch lieb' dich“, „Dilemma (feat. Kelly Rowland) Nelly“).
 */
function passung(t: AppleTreffer, interpret: string, titel: string): number {
  const ziel = hauptInterpret(interpret);
  const zielTitel = schluessel(anzeigeTitel(titel));
  const k = hauptInterpret(t.interpret);
  if (schluessel(anzeigeTitel(t.titel)) === zielTitel && (k === ziel || k.includes(ziel) || ziel.includes(k))) return 2;

  const tk = kompakt(anzeigeTitel(t.titel)), tkk = kompakt(anzeigeTitel(t.titel), true);
  const zk = kompakt(anzeigeTitel(titel)), zkk = kompakt(anzeigeTitel(titel), true);
  const teile = (x: string) => x.split(/\s*(?:,|;|\/|&| feat\.? | ft\.? | featuring | x | und | and )\s*/i).map((y) => kompakt(y)).filter(Boolean);
  const ik = teile(t.interpret)[0] ?? "", alleInterpreten = kompakt(`${interpret} ${titel}`, true);
  const zielInterpreten = teile(interpret);
  const interpretPasst = zielInterpreten.some((z) => fastGleich(z, ik) || (z.length >= 4 && (z.includes(ik) || ik.includes(z)))) || (ik.length >= 4 && alleInterpreten.includes(ik));
  if (!interpretPasst) return 0;
  // Titel: kompakt gleich (mit oder ohne Klammertext), Tippfehler, oder Interpret hinten im Listentitel angehängt
  const titelPasst = fastGleich(tk, zk) || fastGleich(tkk, zkk) || tk === zkk || tkk === zk || (zk.endsWith(ik) && fastGleich(tk, zk.slice(0, -ik.length)));
  return titelPasst ? 1 : 0;
}

/** Bester Treffer für Interpret + Titel einer Liste: genaue vor toleranten Treffern, Originale vor Live/Remix, ältestes Release. */
export function besterTreffer(liste: AppleTreffer[], interpret: string, titel: string): AppleTreffer | null {
  const passend = liste.map((t) => ({ t, p: passung(t, interpret, titel) })).filter((x) => x.p > 0);
  // Live, Remix, Karaoke und Neuaufnahmen nach hinten, dann frühestes Jahr
  const schlecht = (t: AppleTreffer) => (/\b(live|remix(es)?|karaoke|instrumental|re-?recorded|cover)\b/i.test(`${t.titel} ${t.album ?? ""}`) ? 1 : 0);
  passend.sort((a, b) => b.p - a.p || schlecht(a.t) - schlecht(b.t) || (a.t.jahr ?? 9999) - (b.t.jahr ?? 9999));
  return passend[0]?.t ?? null;
}

export interface Uebernahme {
  status: "neu" | "vorhanden";
  song: SongZeile;
}

/** Einen Apple-Treffer in die Bibliothek übernehmen (nichts doppelt: gleicher Song als Vorschau → vorhanden). */
/** automatisch: Nachladen fehlender Deck-Songs (nur Einträge, keine Dateien) */
export async function appleUebernehmen(t: AppleTreffer, automatisch = false): Promise<Uebernahme> {
  // Es werden nur Einträge angelegt, nie Dateien: Hörproben werden immer direkt vom Dienst gestreamt
  const name = t.quelle === "deezer" ? `deezer-${t.trackId}.m4a` : `${t.trackId}.m4a`;
  const rel = APPLE_PRAEFIX + name;
  const schon = db.prepare("SELECT * FROM songs WHERE pfad = ?").get(rel) as unknown as SongZeile | undefined;
  if (schon) return { status: "vorhanden", song: schon };

  const z = streamZeileAnlegen(rel, t);
  const doppelt = duplikatVon(z);
  if (doppelt) {
    await fsp.rm(path.join(config.appleOrdner, name), { force: true });
    db.prepare("DELETE FROM songs WHERE id = ?").run(z.id);
    return { status: "vorhanden", song: doppelt };
  }
  db.prepare("UPDATE songs SET apple_url = ?, cover_url = ? WHERE id = ?").run(t.link, t.cover, z.id);
  // Apple/Deezer nennen oft das Jahr der Wiederveröffentlichung → zählt wie ein Datei-Tag;
  // ein früheres Jahr aus der Songliste (Originaljahr) gewinnt, sonst landet der Song ggf. in der Prüfliste
  if (t.jahr) {
    db.prepare("UPDATE songs SET tag_jahr = ? WHERE id = ?").run(t.jahr, z.id);
    jahrNeuBerechnen(songHolen(z.id) as SongZeile);
  }
  return { status: "neu", song: songHolen(z.id) as SongZeile };
}

export async function appleUebernehmenNachId(trackId: number, quelle?: "deezer"): Promise<Uebernahme> {
  const t = quelle === "deezer" ? await deezerTrack(trackId) : (await itunes("lookup", { id: String(trackId), entity: "song" }))[0];
  if (!t) throw Object.assign(new Error(`Bei ${quelle === "deezer" ? "Deezer" : "Apple"} nicht gefunden (oder ohne Vorschau).`), { status: 404 });
  const u = await appleUebernehmen(t);
  alleAbgleichen();
  return u;
}

// ---------- Fehlende Songs eines Decks automatisch ergänzen ----------

export const appleStatus = {
  laeuft: false,
  deck: "" as string,
  offen: 0,
  erledigt: 0,
  neu: 0,
  deezer: 0,
  ohneTreffer: 0,
  fehler: 0,
  letzterFehler: "",
};

/** Schon erfolglos gesucht (bis zum Neustart nicht automatisch wiederholen) */
const ohneTreffer = new Set<string>();
/** Wird nach neuen Songs aufgerufen (höchstens alle paar Sekunden), z. B. damit die Lobby die Songzahl neu zeigt */
export const beiNeuenSongs = new Set<() => void>();
let gemeldet = 0;
function neueMelden(sofort = false): void {
  if (!sofort && Date.now() - gemeldet < 5000) return;
  gemeldet = Date.now();
  for (const f of beiNeuenSongs) f();
}

/** Deezer zuerst, Apple nur für den Rest; automatisch = parallel und ohne die schon erfolglos gesuchten Songs */
export async function appleErgaenzen(deckId: string, automatisch = false): Promise<void> {
  if (appleStatus.laeuft) return;
  const fehlend = fehlendeSongs(deckId)?.filter((e) => !automatisch || !ohneTreffer.has(`${e.interpret}|${e.titel}`));
  if (!fehlend?.length) return;
  Object.assign(appleStatus, { laeuft: true, deck: listeHolen(deckId)?.name ?? deckId, offen: fehlend.length, erledigt: 0, neu: 0, deezer: 0, ohneTreffer: 0, fehler: 0, letzterFehler: "" });
  try {
    const einer = async (e: (typeof fehlend)[number]) => {
      try {
        const begriff = `${hauptInterpret(e.interpret)} ${anzeigeTitel(e.titel)}`;
        // Deezer ist die Hauptquelle (und erlaubt viele Abfragen), Apple (~20 je Minute) hilft nur aus
        const t = besterTreffer(await deezerSuchen(begriff).catch(() => []), e.interpret, e.titel) ??
          besterTreffer(await appleSuchen(begriff), e.interpret, e.titel);
        if (!t) {
          appleStatus.ohneTreffer++;
          ohneTreffer.add(`${e.interpret}|${e.titel}`);
        } else if ((await appleUebernehmen(t, automatisch)).status === "neu") {
          appleStatus.neu++;
          if (t.quelle === "deezer") appleStatus.deezer++;
          alleAbgleichen();
          neueMelden();
        }
      } catch (err) {
        appleStatus.fehler++;
        appleStatus.letzterFehler = (err as Error).message;
        console.warn(`[apple] ${e.interpret} – ${e.titel}: ${(err as Error).message}`);
        if (/drosselt/.test(appleStatus.letzterFehler)) await new Promise((r) => setTimeout(r, 60_000));
      }
      appleStatus.erledigt++;
    };
    // automatisch: mehrere Suchen gleichzeitig (die Drosseln in deezer.ts/itunes() halten die Grenzen ein)
    const rest = [...fehlend];
    await Promise.all(
      Array.from({ length: automatisch ? 6 : 1 }, async () => {
        while (rest.length) await einer(rest.shift() as (typeof fehlend)[number]);
      }),
    );
  } finally {
    alleAbgleichen();
    appleStatus.laeuft = false;
  }
}

// ---------- Fehlende Songs aller Decks automatisch ergänzen (für Streaming) ----------
// Kostet nur Einträge in der Datenbank (keine Dateien), dauert wegen Apples Drossel aber ~3 s je Song.

const warteschlange: string[] = [];
let arbeitet = false;

/** Decks (ohne Angabe: alle mit Quelle Apple/Deezer und fehlenden Songs) in die Warteschlange; vorne = als Nächstes. */
export function fehlendeNachladen(deckIds?: string[], vorne = false): void {
  const ids = deckIds ?? listenUebersicht().filter((l) => l.audio === "apple" && l.treffer < l.gesamt).map((l) => l.id);
  for (const id of ids) {
    if (!listeHolen(id) || listenUebersicht().find((l) => l.id === id)?.audio !== "apple") continue;
    const i = warteschlange.indexOf(id);
    if (i >= 0) warteschlange.splice(i, 1);
    if (vorne) warteschlange.unshift(id);
    else warteschlange.push(id);
  }
  void abarbeiten();
}

async function abarbeiten(): Promise<void> {
  if (arbeitet) return;
  arbeitet = true;
  try {
    while (warteschlange.length) {
      // läuft gerade ein Durchlauf aus dem Admin, erst warten
      while (appleStatus.laeuft) await new Promise((r) => setTimeout(r, 5000));
      const id = warteschlange.shift() as string;
      await appleErgaenzen(id, true).catch((e) => console.error("[apple]", e));
      neueMelden(true);
    }
  } finally {
    arbeitet = false;
  }
}

// ---------- Bestehende Apple-Einträge bei Deezer abgleichen (Deezer = Hauptquelle) ----------
// Je Apple-Eintrag einmal bei Deezer suchen; passt ein Treffer, spielt der Song künftig von Deezer,
// Apple bleibt als Ausweichquelle. Ohne Treffer wird frühestens nach 30 Tagen erneut gesucht.

export const deezerAbgleichStatus = { laeuft: false, offen: 0, erledigt: 0, gefunden: 0, ohneTreffer: 0, fehler: 0 };
const NOCHMAL_NACH_MS = 30 * 24 * 3600_000;

export async function deezerAbgleichen(): Promise<void> {
  if (deezerAbgleichStatus.laeuft) return;
  const offen = db.prepare(
    `SELECT id, interpret, titel FROM songs WHERE pfad LIKE ? AND pfad NOT LIKE ? AND deezer_id IS NULL
       AND (deezer_geprueft IS NULL OR deezer_geprueft < ?) ORDER BY deezer_geprueft IS NOT NULL, id`,
  ).all(`${APPLE_PRAEFIX}%`, `${APPLE_PRAEFIX}deezer-%`, Date.now() - NOCHMAL_NACH_MS) as Array<{ id: string; interpret: string; titel: string }>;
  if (!offen.length) return;
  Object.assign(deezerAbgleichStatus, { laeuft: true, offen: offen.length, erledigt: 0, gefunden: 0, ohneTreffer: 0, fehler: 0 });
  console.log(`[deezer] Abgleich: ${offen.length} Apple-Einträge`);
  const setzen = db.prepare("UPDATE songs SET deezer_id = ?, deezer_url = ?, cover_url = COALESCE(?, cover_url), deezer_geprueft = ? WHERE id = ?");
  const geprueft = db.prepare("UPDATE songs SET deezer_geprueft = ? WHERE id = ?");
  try {
    const rest = [...offen];
    // drei Suchen gleichzeitig; die Drossel in deezer.ts hält Deezers Grenze ein
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (rest.length) {
        const s = rest.shift() as (typeof offen)[number];
        try {
          const t = besterTreffer(await deezerSuchen(`${hauptInterpret(s.interpret)} ${anzeigeTitel(s.titel)}`), s.interpret, s.titel);
          if (t) {
            setzen.run(t.trackId, t.link, t.cover, Date.now(), s.id);
            deezerAbgleichStatus.gefunden++;
          } else {
            geprueft.run(Date.now(), s.id);
            deezerAbgleichStatus.ohneTreffer++;
          }
        } catch (err) {
          deezerAbgleichStatus.fehler++;
          // gedrosselt: kurz Pause, der Song bleibt offen und kommt beim nächsten Lauf wieder dran
          if (/drosselt/.test((err as Error).message)) await new Promise((r) => setTimeout(r, 30_000));
        }
        if (++deezerAbgleichStatus.erledigt % 250 === 0) console.log(`[deezer] Abgleich: ${deezerAbgleichStatus.erledigt}/${offen.length}, ${deezerAbgleichStatus.gefunden} gefunden`);
      }
    }));
  } finally {
    deezerAbgleichStatus.laeuft = false;
    const st = deezerAbgleichStatus;
    console.log(`[deezer] Abgleich fertig: ${st.gefunden} gefunden, ${st.ohneTreffer} ohne Treffer, ${st.fehler} Fehler`);
  }
}

/** Beim Start: halbfertige Downloads wegräumen. */
try {
  for (const n of fs.readdirSync(config.appleOrdner)) if (n.startsWith(".tmp-")) fs.rmSync(path.join(config.appleOrdner, n), { force: true });
} catch {
  /* Ordner gibt es noch nicht */
}
