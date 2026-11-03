// Bestenliste über alle Spiele: je Name (ohne Groß-/Kleinschreibung) werden die Punkte aufsummiert.
// Punkte eines Spiels = Karten im Zeitstrahl + ⭐-Zusatzpunkte.
import { db } from "./db.ts";
import type { Spiel } from "./game.ts";

db.exec(`CREATE TABLE IF NOT EXISTS bestenliste (
  schluessel TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  punkte     INTEGER NOT NULL DEFAULT 0,
  spiele     INTEGER NOT NULL DEFAULT 0,
  siege      INTEGER NOT NULL DEFAULT 0,
  geaendert  INTEGER NOT NULL
)`);

export interface BestenEintrag {
  name: string;
  punkte: number;
  spiele: number;
  siege: number;
}

export const schluessel = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
export const spielPunkte = (p: Spiel["spieler"][number]) => p.zeitstrahl.length + (p.punkte ?? 0);

/** Ein beendetes Spiel einmalig eintragen (der Merker steckt im Spiel und übersteht Neustarts). */
export function spielEintragen(s: Spiel): void {
  if (s.phase !== "ende") {
    s.bestenlisteEingetragen = false;
    return;
  }
  if (s.bestenlisteEingetragen) return;
  s.bestenlisteEingetragen = true;
  const eintragen = db.prepare(`
    INSERT INTO bestenliste (schluessel, name, punkte, spiele, siege, geaendert) VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(schluessel) DO UPDATE SET name = excluded.name, punkte = punkte + excluded.punkte,
      spiele = spiele + 1, siege = siege + excluded.siege, geaendert = excluded.geaendert`);
  for (const p of s.spieler) {
    if (p.bot) continue; // Bots kommen nicht in die Bestenliste
    const k = schluessel(p.name);
    if (k) eintragen.run(k, p.name.trim(), spielPunkte(p), Number(s.gewinner.includes(p.id)), Date.now());
  }
}

export function bestenliste(anzahl = 5): BestenEintrag[] {
  return db.prepare("SELECT name, punkte, spiele, siege FROM bestenliste ORDER BY punkte DESC, siege DESC, spiele ASC, name LIMIT ?").all(anzahl) as unknown as BestenEintrag[];
}
