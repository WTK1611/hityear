// Text-Normalisierung für den Abgleich (Charts, Songlisten) und die Titelanzeige.

/** Entfernt Zusätze wie „- Remastered 2009“, „(Radio Edit)“ für die Anzeige. */
export function anzeigeTitel(titel: string): string {
  const zusatz =
    /\s*[-–(\[]\s*(\d{4}\s+)?(digital(ly)?\s+)?(remaster(ed)?|radio edit|single version|album version|mono|stereo|edit|version|mix\s+\d{4}|\d{4}\s+remaster)[^)\]]*[)\]]?\s*$/i;
  let t = titel.trim();
  for (let i = 0; i < 3; i++) {
    const neu = t.replace(zusatz, "").trim();
    if (neu === t || !neu) break;
    t = neu;
  }
  return t;
}

/** Schlüssel für unscharfen Vergleich: klein, ohne Akzente, ohne Klammern/feat. */
export function schluessel(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\s(feat\.?|ft\.?|featuring|with|x)\s.*$/i, " ")
    .replace(/&|\band\b|\bund\b/g, " ")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Erster Interpret aus „A & B feat. C“ bzw. „A, B“. */
export function hauptInterpret(s: string): string {
  return schluessel(s.split(/\s*(?:,|;|\/|&| feat\.? | ft\.? | featuring | x | und | and )\s*/i)[0] ?? s);
}

/** Kompakter Schlüssel: klein, ohne Akzente, Sonderzeichen und Leerzeichen („P!nk“ → „pnk“, „Hænning“ → „haenning“). */
export function kompakt(s: string, mitKlammern = false): string {
  const t = s.replace(/æ/gi, "ae").replace(/ø/gi, "o").replace(/ß/g, "ss").replace(/!/g, "i");
  return (mitKlammern ? t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s(feat\.?|ft\.?|featuring)\s.*$/i, "") : schluessel(t))
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Editierabstand (Levenshtein), für Tippfehler in Listen wie „Sinclair“/„Sinclar“. */
export function abstand(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let vorher = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const jetzt = [i];
    for (let j = 1; j <= b.length; j++) jetzt[j] = Math.min(vorher[j] + 1, jetzt[j - 1] + 1, vorher[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    vorher = jetzt;
  }
  return vorher[b.length];
}

/**
 * Rate-Eingabe (Interpret oder Titel) gegen die Lösung: Groß-/Kleinschreibung, Sonderzeichen und
 * leichte Schreibfehler egal (bis 4 Zeichen genau, ab 4 einer, ab 8 zwei, ab 15 drei Fehler).
 */
export function geraten(eingabe: string, loesungen: string[]): boolean {
  const e = kompakt(eingabe);
  if (e.length < 2) return false;
  const erlaubt = (n: number) => (n >= 15 ? 3 : n >= 8 ? 2 : n >= 4 ? 1 : 0);
  // Zahlen müssen genau stimmen („Mambo 6“ ist nicht „Mambo No. 5“), sonst sind leichte Tippfehler erlaubt
  const zahlen = (x: string) => x.replace(/\D+/g, " ").trim();
  const passt = (a: string, k: string) =>
    k.length > 0 && a.length >= 2 && zahlen(a) === zahlen(k) && abstand(a, k) <= erlaubt(Math.min(a.length, k.length));
  // zusätzlich ohne Füllwörter: „Mambo 5“ = „Mambo No. 5“, „Killers“ = „The Killers“
  const el = kompakt(locker(eingabe));
  return loesungen.some((l) => passt(e, kompakt(l)) || passt(el, kompakt(locker(l))));
}

/** Füllwörter, die beim Raten egal sind: „No./Nr./Number“ vor Zahlen, Artikel am Anfang. */
function locker(s: string): string {
  return s
    .replace(/\b(no|nr|number|nummer|num)\.?\s*(?=\d)/gi, "")
    .replace(/^\s*(the|a|an|der|die|das|le|la|les|el|il)\s+/i, "");
}

/** Alle Schreibweisen, die als richtiger Interpret zählen: ganzer Name, jeder einzelne Interpret. */
export function interpretVarianten(interpret: string): string[] {
  return [interpret, ...interpret.split(/\s*(?:,|;|\/|&| feat\.? | ft\.? | featuring | x | und | and )\s*/i)].filter((x) => x.trim());
}

/** Alle Schreibweisen, die als richtiger Titel zählen: mit und ohne Zusätze in Klammern. */
export function titelVarianten(titel: string): string[] {
  const t = anzeigeTitel(titel);
  return [t, t.replace(/\s*[([][^)\]]*[)\]]/g, "").replace(/\s+-\s+.*$/, "").trim()].filter(Boolean);
}

export function istVerdaechtigerTitel(titel: string): boolean {
  return /remaster|live|remix|re-?recorded|mix\s+\d{4}|version\s+\d{4}/i.test(titel);
}
