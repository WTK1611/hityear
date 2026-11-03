// Hörproben und Cover von Apple Music/Deezer beim Spielen: immer ein frischer Link beim Dienst –
// der Browser lädt direkt dort, der Server leitet nur weiter und speichert nichts.
import { db } from "./db.ts";
import { appleNachId, type AppleTreffer } from "./apple.ts";
import { deezerTrack } from "./deezer.ts";
import { APPLE_PRAEFIX, istApple, type SongZeile } from "./bibliothek.ts";

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
export function dienstName(z: Pick<SongZeile, "pfad" | "deezer_id"> | null): "Apple Music" | "Deezer" | null {
  if (!z || !istApple(z)) return null;
  return z.pfad.includes("/deezer-") || z.deezer_id ? "Deezer" : "Apple Music";
}

/** Link zum Song beim Dienst, der die Hörprobe liefert (für das Quellen-Badge). */
export function dienstLink(z: Pick<SongZeile, "pfad" | "deezer_id" | "deezer_url" | "apple_url">): string | null {
  if (!istApple(z)) return null;
  return z.deezer_id ? z.deezer_url : z.apple_url;
}

// Deezer-Links sind signiert und laufen ab (exp=… im Link), Apple-Links halten lange
const cache = new Map<string, { t: AppleTreffer; bis: number }>();
const inArbeit = new Map<string, Promise<AppleTreffer>>();

function gueltigBis(t: AppleTreffer): number {
  const exp = Number(/exp=(\d+)/.exec(t.vorschau)?.[1]);
  return exp ? exp * 1000 - 5 * 60_000 : Date.now() + 6 * 3600_000;
}

/** Aktueller Treffer beim Dienst (Hörprobe, Cover, Link); merkt sich den Cover-Link in der Datenbank. */
export function liveTreffer(z: SongZeile): Promise<AppleTreffer> {
  const c = cache.get(z.id);
  if (c && c.bis > Date.now()) return Promise.resolve(c.t);
  let p = inArbeit.get(z.id);
  if (!p) {
    p = (async () => {
      const dienste = diensteVon(z);
      if (!dienste.length) throw new Error("keine Apple-/Deezer-Vorschau");
      let t: AppleTreffer | null = null;
      let fehler: unknown = null;
      for (const d of dienste) {
        t = await (d.deezer ? deezerTrack(d.id) : appleNachId(d.id)).catch((e) => ((fehler = e), null));
        if (t) break;
        // Deezer kennt den Song nicht mehr: künftig wieder Apple nennen und nutzen (der Abgleich sucht später neu)
        if (d.deezer && !fehler && dienste.length > 1) db.prepare("UPDATE songs SET deezer_id = NULL, deezer_url = NULL WHERE id = ?").run(z.id);
      }
      if (!t) throw fehler instanceof Error ? fehler : new Error("bei Deezer und Apple nicht (mehr) verfügbar");
      cache.set(z.id, { t, bis: gueltigBis(t) });
      if (t.cover && t.cover !== z.cover_url) db.prepare("UPDATE songs SET cover_url = ? WHERE id = ?").run(t.cover, z.id);
      return t;
    })().finally(() => inArbeit.delete(z.id));
    inArbeit.set(z.id, p);
  }
  return p;
}

// abgelaufene Einträge wegräumen
setInterval(() => {
  const jetzt = Date.now();
  for (const [k, c] of cache) if (c.bis < jetzt) cache.delete(k);
}, 30 * 60_000).unref();
