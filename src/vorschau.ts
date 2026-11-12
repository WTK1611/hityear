// Hörproben und Cover von Apple Music/Deezer beim Spielen: immer ein frischer Link beim Dienst –
// der Browser lädt direkt dort, der Server leitet nur weiter und speichert nichts.
import { db } from "./db.ts";
import { appleNachId, appleSuchen, besterTreffer, type AppleTreffer } from "./apple.ts";
import { deezerSuchen, deezerTrack } from "./deezer.ts";
import { APPLE_PRAEFIX, istApple, type SongZeile } from "./bibliothek.ts";
import { anzeigeTitel, hauptInterpret } from "./normalisieren.ts";
import type { Pruefergebnis } from "./deckpruefung.ts";

type Dienst = { deezer: boolean; id: number };

/**
 * Wo die Hörprobe herkommt, in Reihenfolge: Deezer ist die Hauptquelle, Apple Music die Ausweichquelle.
 * Dienst und Track-ID stecken im Pfad (@apple/123.m4a bzw. @apple/deezer-123.m4a); Apple-Einträge mit
 * gefundenem Deezer-Song (deezer_id) spielen zuerst bei Deezer.
 */
function diensteVon(z: SongZeile): Dienst[] {
  const m = /^(deezer-)?(\d+)\.m4a$/.exec(z.pfad.slice(APPLE_PRAEFIX.length));
  if (!istApple(z) || !m) return [];
  const pfad = { deezer: Boolean(m[1]), id: Number(m[2]) };
  return !pfad.deezer && z.deezer_id ? [{ deezer: true, id: z.deezer_id }, pfad] : [pfad];
}

/** Anzeigename des Dienstes für den Quellenhinweis („Apple Music“/„Deezer“), null bei eigenen Dateien. */
export function dienstName(z: Pick<SongZeile, "id" | "pfad" | "deezer_id"> | null): "Apple Music" | "Deezer" | null {
  if (!z || !istApple(z)) return null;
  const aktuell = cache.get(z.id);
  if (aktuell && aktuell.bis > Date.now()) return aktuell.t.quelle === "deezer" ? "Deezer" : "Apple Music";
  return z.pfad.includes("/deezer-") || z.deezer_id ? "Deezer" : "Apple Music";
}

/** Link zum Song beim Dienst, der die Hörprobe liefert (für das Quellen-Badge). */
export function dienstLink(z: Pick<SongZeile, "id" | "pfad" | "deezer_id" | "deezer_url" | "apple_url">): string | null {
  if (!istApple(z)) return null;
  const aktuell = cache.get(z.id);
  if (aktuell && aktuell.bis > Date.now()) return aktuell.t.link;
  return z.deezer_id ? z.deezer_url : z.apple_url;
}

// Deezer-Links sind signiert und laufen ab (exp=… im Link), Apple-Links halten lange
const cache = new Map<string, { t: AppleTreffer; bis: number; erneuert: number; geprueftBis: number }>();
const inArbeit = new Map<string, Promise<AppleTreffer>>();
const inPruefung = new Map<string, Promise<AppleTreffer>>();
class VorschauFehlt extends Error {}

function gueltigBis(t: AppleTreffer): number {
  const exp = Number(/exp=(\d+)/.exec(t.vorschau)?.[1]);
  return exp ? exp * 1000 - 5 * 60_000 : Date.now() + 6 * 3600_000;
}

/** Nur Antwort-Header prüfen: keine Musik herunterladen oder speichern, auch nicht bei Weiterleitungen. */
async function linkPruefen(roh: string): Promise<boolean> {
  let url = new URL(roh);
  const signal = AbortSignal.timeout(6000);
  for (let i = 0; i < 4; i++) {
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !/(^|\.)(apple\.com|mzstatic\.com|deezer\.com|dzcdn\.net)$/.test(url.hostname)) throw new Error("Unbekanntes Vorschau-Ziel");
    const res = await fetch(url.href, { method: "HEAD", redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const ziel = res.headers.get("location");
      if (!ziel) throw new Error("Weiterleitung ohne Ziel");
      url = new URL(ziel, url);
      continue;
    }
    if ([404, 410].includes(res.status)) return false;
    // Auch 403 kann nur den Server/HEAD betreffen. Solche Antworten sperren keinen Song.
    if (!res.ok) throw new Error(`Vorschau-Prüfung HTTP ${res.status}`);
    if (!/^(audio\/|application\/octet-stream)/i.test(res.headers.get("content-type") ?? "")) throw new Error("Vorschau-Prüfung ohne Audio-Antwort");
    return true;
  }
  throw new Error("Zu viele Vorschau-Weiterleitungen");
}

/** Aktueller Treffer; die Deckprüfung prüft zusätzlich den Link und drosselt auch Apple-Lookups. */
export function liveTreffer(z: SongZeile, erneuern = false, pruefen = false): Promise<AppleTreffer> {
  // Die Wiedergabe darf nicht auf eine langsame HEAD-Prüfung oder deren Ersatzsuche warten.
  const arbeit = pruefen ? inPruefung : inArbeit;
  const laeuft = arbeit.get(z.id);
  if (laeuft) return laeuft;
  const laden = inArbeit.get(z.id);
  if (pruefen && laden) return laden.then(() => liveTreffer(z, false, true));
  const c = cache.get(z.id);
  // „Erneut versuchen“ kann einen vom CDN abgewiesenen Link verwerfen.
  // Gleichzeitige Geräte und Range-Anfragen teilen die Erneuerung für eine Sekunde.
  if (c && c.bis > Date.now() && (!erneuern || Date.now() - c.erneuert < 1000) && (!pruefen || c.geprueftBis > Date.now())) return Promise.resolve(c.t);
  if (!pruefen) cache.delete(z.id);
  const p = (async () => {
    const dienste = diensteVon(z);
    if (!dienste.length) throw new Error("keine Apple-/Deezer-Vorschau");
    let t: AppleTreffer | null = null;
    let fehler: unknown = null;
    const verworfen = new Set<string>();
    const annehmen = async (kandidat: AppleTreffer | null): Promise<AppleTreffer | null> => {
      if (!kandidat || verworfen.has(kandidat.vorschau)) return null;
      if (!pruefen) return kandidat;
      try { if (await linkPruefen(kandidat.vorschau)) return kandidat; }
      catch (e) { fehler = e; }
      verworfen.add(kandidat.vorschau);
      return null;
    };
    // Ein vorhandener Link wird zuerst tatsächlich geprüft, dann bei Bedarf neu aufgelöst.
    if (pruefen && c && c.bis > Date.now()) t = await annehmen(c.t);
    for (const d of dienste) {
      if (t) break;
      let dienstFehler = false;
      const kandidat = await (d.deezer ? deezerTrack(d.id) : appleNachId(d.id, !pruefen)).catch((e) => { dienstFehler = true; fehler = e; return null; });
      t = await annehmen(kandidat);
      if (t) break;
      // Deezer kennt den Song nicht mehr: künftig wieder Apple nennen und nutzen (der Abgleich sucht später neu)
      if (d.deezer && !kandidat && !dienstFehler && dienste.length > 1) db.prepare("UPDATE songs SET deezer_id = NULL, deezer_url = NULL WHERE id = ?").run(z.id);
    }
    // Katalog-IDs können verschwinden. Auch reine Deezer-Einträge brauchen dann
    // eine Ausweichquelle. Nur Treffer mit passendem Interpret UND Titel verwenden;
    // Song-ID, Jahr und Spielkarte bleiben unverändert. Es werden keine Medien gespeichert.
    if (!t) {
      const begriff = `${hauptInterpret(z.interpret)} ${anzeigeTitel(z.titel)}`;
      for (const suchen of [deezerSuchen, appleSuchen]) {
        let liste = await suchen(begriff).catch((e) => { fehler = e; return []; });
        // Maximal drei passende Ersatzaufnahmen je Dienst prüfen.
        for (let i = 0; i < 3 && !t; i++) {
          const kandidat = besterTreffer(liste.filter(k => !verworfen.has(k.vorschau)), z.interpret, z.titel);
          if (!kandidat) break;
          t = await annehmen(kandidat);
          liste = liste.filter(k => k !== kandidat);
        }
        if (t) break;
      }
    }
    if (!t) throw fehler instanceof Error ? fehler : new VorschauFehlt("bei Deezer und Apple nicht (mehr) verfügbar");
    const bis = gueltigBis(t);
    // Eine inzwischen vom Spieler angeforderte Erneuerung hat Vorrang vor einer älteren HEAD-Prüfung.
    if (!pruefen || (!inArbeit.has(z.id) && (!cache.has(z.id) || cache.get(z.id) === c))) {
      cache.set(z.id, { t, bis, erneuert: erneuern ? Date.now() : 0, geprueftBis: pruefen ? Math.min(bis, Date.now() + 5 * 60_000) : 0 });
    }
    if (t.cover && t.cover !== z.cover_url) db.prepare("UPDATE songs SET cover_url = ? WHERE id = ?").run(t.cover, z.id);
    return t;
  })().catch(err => {
    // Eine reine HEAD-Störung darf einen bislang nutzbaren Wiedergabelink nicht verwerfen.
    if (pruefen && err instanceof VorschauFehlt && cache.get(z.id) === c) cache.delete(z.id);
    throw err;
  }).finally(() => arbeit.delete(z.id));
  arbeit.set(z.id, p);
  return p;
}

/** Vorabprüfung eines Deck-Songs; Netzfehler werden nur kurz gemerkt und sperren keine Songs. */
export async function vorschauPruefen(z: SongZeile): Promise<Pruefergebnis> {
  try {
    const treffer = await liveTreffer(z, false, true);
    return { art: "bereit", bis: Math.max(Date.now() + 1000, Math.min(gueltigBis(treffer), Date.now() + 5 * 60_000)) };
  } catch (err) {
    const fehlt = err instanceof VorschauFehlt;
    return { art: fehlt ? "fehlt" : "unklar", bis: Date.now() + (fehlt ? 5 * 60_000 : 60_000) };
  }
}

// abgelaufene Einträge wegräumen
setInterval(() => {
  const jetzt = Date.now();
  for (const [k, c] of cache) if (c.bis < jetzt) cache.delete(k);
}, 30 * 60_000).unref();
