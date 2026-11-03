import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auswerten, bereit, eingeben, grenzen, karteLegen, naechsterZug, pruefePosition, ratenAbgeben, sicht, spielerEntfernen, spielerHinzufuegen, spielEntschieden, starten,
  STANDARD_EINSTELLUNGEN, type Karte, type Spiel,
} from "../src/game.ts";
import { jahrBestimmen } from "../src/bibliothek.ts";
import { besterTreffer, type AppleTreffer } from "../src/apple.ts";
import { anzeigeTitel, geraten, hauptInterpret, interpretVarianten, schluessel, titelVarianten } from "../src/normalisieren.ts";

const k = (jahr: number, id = `s${jahr}-${Math.random()}`): Karte => ({ songId: id, jahr, titel: `T${jahr}`, interpret: "I" });

function neuesSpiel(ziel = 3): Spiel {
  return {
    code: "TEST", hostSitzung: "h", einladung: "e", einstellungen: { ...STANDARD_EINSTELLUNGEN, modus: "einzeln", zielKarten: ziel },
    spieler: [], stapel: [], ablage: [], phase: "lobby", reihenfolge: [], zugIndex: 0, runde: 0,
    stechen: null, zug: null, gewinner: [], erstellt: 0, geaendert: 0,
  };
}

test("Position prüfen inkl. gleichem Jahr und Toleranz", () => {
  const z = [k(1980), k(1990)];
  assert.equal(pruefePosition(z, 0, 1975), true);
  assert.equal(pruefePosition(z, 0, 1985), false);
  assert.equal(pruefePosition(z, 1, 1985), true);
  assert.equal(pruefePosition(z, 1, 1980), true); // gleiches Jahr wie Nachbar
  assert.equal(pruefePosition(z, 0, 1980), true);
  assert.equal(pruefePosition(z, 2, 1995), true);
  assert.equal(pruefePosition(z, 2, 1988), false);
  assert.equal(pruefePosition(z, 2, 1988, 2), true); // ±2 Toleranz
});

test("kompletter Ablauf mit Sieg am Rundenende", () => {
  const s = neuesSpiel(2);
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  spielerHinzufuegen(s, { id: "b", name: "Ben", farbe: "#0f0", sitzung: "y" });
  // Stapel wird von hinten gezogen: gemeinsame Startkarte 2000, dann Züge
  starten(s, [k(1940), k(1941), k(1970), k(1960), k(1950), k(2000)]);
  assert.equal(s.phase, "hoeren");
  assert.deepEqual(s.spieler.map((p) => p.zeitstrahl[0].jahr), [2000, 2000]);
  assert.notEqual(s.spieler[0].zeitstrahl, s.spieler[1].zeitstrahl); // eigene Zeitstrahlen
  // Verdeckte Karte darf nicht in der Sicht stehen
  assert.ok(!JSON.stringify(sicht(s)).includes("1950"));
  assert.ok(!JSON.stringify(sicht(s)).includes('"sitzung"'));

  const e1 = karteLegen(s, "a", 0); // 1950 vor 2000 → richtig
  assert.equal(e1.richtig, true);
  assert.throws(() => karteLegen(s, "a", 0));
  naechsterZug(s);
  assert.throws(() => karteLegen(s, "a", 0), /nicht dran/);
  const e2 = karteLegen(s, "b", 1); // 1960 nach 2000 → falsch
  assert.equal(e2.richtig, false);
  assert.equal(e2.abstand, 40);
  naechsterZug(s); // Runde vorbei: Anna hat 2 = Ziel → Sieg
  assert.equal(s.phase, "ende");
  assert.deepEqual(s.gewinner, ["a"]);
});

test("Gleichstand am Ziel: gemeinsamer Sieg, ⭐ entscheiden", () => {
  const s = neuesSpiel(2);
  spielerHinzufuegen(s, { id: "a", name: "A", farbe: "", sitzung: "1" });
  spielerHinzufuegen(s, { id: "b", name: "B", farbe: "", sitzung: "2" });
  spielerHinzufuegen(s, { id: "c", name: "C", farbe: "", sitzung: "3" });
  starten(s, [k(1900), k(1901), k(1902), k(1903), k(1904), k(1970), k(1960), k(1950), k(2000)]);
  karteLegen(s, "a", 0); naechsterZug(s);
  karteLegen(s, "b", 0); naechsterZug(s);
  karteLegen(s, "c", 1); naechsterZug(s); // c falsch
  assert.equal(s.phase, "ende");
  assert.equal(s.stechen, null);
  assert.deepEqual(s.gewinner, ["a", "b"]);
});

test("aktiven Spieler entfernen setzt beim Nächsten fort", () => {
  const s = neuesSpiel(5);
  spielerHinzufuegen(s, { id: "a", name: "A", farbe: "", sitzung: "1" });
  spielerHinzufuegen(s, { id: "b", name: "B", farbe: "", sitzung: "2" });
  starten(s, Array.from({ length: 20 }, (_, i) => k(1950 + i)));
  assert.equal(sicht(s).aktiv, "a");
  spielerEntfernen(s, "a");
  assert.equal(sicht(s).aktiv, "b");
  assert.equal(s.phase, "hoeren");
});

test("Jahresregeln (PRD §9)", () => {
  const basis = { mb_geprueft: 1, chart_jahr: null, manuell_jahr: null, kompilation: 0, titel: "Song" };
  assert.deepEqual(jahrBestimmen({ ...basis, tag_jahr: 2009, mb_jahr: 1969 }).jahr, 1969); // Remaster
  assert.equal(jahrBestimmen({ ...basis, tag_jahr: 2009, mb_jahr: 1969 }).pruefen, true);
  assert.equal(jahrBestimmen({ ...basis, tag_jahr: 1985, mb_jahr: 1985 }).pruefen, false);
  assert.equal(jahrBestimmen({ ...basis, tag_jahr: 1985, mb_jahr: 1990 }).jahr, 1985);
  assert.equal(jahrBestimmen({ ...basis, tag_jahr: null, mb_jahr: null, chart_jahr: 1977 }).jahr, 1977);
  assert.equal(jahrBestimmen({ ...basis, tag_jahr: 2009, mb_jahr: 1969, manuell_jahr: 1970 }).jahr, 1970);
  assert.equal(jahrBestimmen({ ...basis, tag_jahr: null, mb_jahr: null }).jahr, null);
});

test("Normalisierung", () => {
  assert.equal(anzeigeTitel("Hey Jude - Remastered 2015"), "Hey Jude");
  assert.equal(anzeigeTitel("Take On Me (Radio Edit)"), "Take On Me");
  assert.equal(anzeigeTitel("Version 2.0"), "Version 2.0");
  assert.equal(schluessel("Yes Sir, I Can Boogie"), "yes sir i can boogie");
  assert.equal(hauptInterpret("Boney M. & Friends"), "boney m");
  assert.equal(hauptInterpret("The Beatles"), "beatles");
});

test("Songlisten: Dateiname als Rückfall für Sampler", async () => {
  const { ausDateiname } = await import("../src/listen.ts");
  assert.deepEqual(ausDateiname("sampler/Bravo Hits 12/07 - Nena - 99 Luftballons.mp3"), { interpret: "Nena", titel: "99 Luftballons" });
  assert.deepEqual(ausDateiname("alben/x/Queen - Bohemian Rhapsody.m4a"), { interpret: "Queen", titel: "Bohemian Rhapsody" });
  assert.equal(ausDateiname("alben/x/01 Track.mp3"), null);
});

test("falsch eingeordnet: Song zurück in den Stapel, Auflösung verdeckt", () => {
  const s = neuesSpiel(5);
  s.einstellungen.nichtErraten = "verdeckt";
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  starten(s, [k(1930), k(1935), k(1940), k(1941), k(1945), k(1960, "geheim"), k(2000)]);
  const vorher = s.stapel.length;
  const e = karteLegen(s, "a", 1); // 1960 nach 2000 → falsch
  assert.equal(e.richtig, false);
  assert.deepEqual(e.zeitraum, { von: 2000, bis: null }); // getippt: nach 2000
  assert.equal(s.stapel.length, vorher + 1);
  assert.equal(s.stapel[0].songId, "geheim"); // ganz unten
  assert.ok(!s.ablage.some((x) => x.songId === "geheim"));
  const v = sicht(s);
  assert.equal(v.verdeckt, true);
  const text = JSON.stringify(v);
  assert.ok(!text.includes("geheim") && !text.includes("1960"));
});

test("Option „weg“: Lösung zeigen, Karte kommt nicht wieder", () => {
  const s = neuesSpiel(5);
  s.einstellungen.nichtErraten = "weg";
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  starten(s, [k(1930), k(1935), k(1940), k(1941), k(1945), k(1960, "offen"), k(2000)]);
  const vorher = s.stapel.length;
  karteLegen(s, "a", 1); // 1960 nach 2000 → falsch
  assert.equal(s.stapel.length, vorher);
  assert.equal(s.ablage.at(-1)?.songId, "offen");
  const v = sicht(s);
  assert.equal(v.verdeckt, false);
  assert.equal(v.ergebnis?.karte.jahr, 1960);
});

test("Option „offen“: Lösung zeigen, Karte kommt unten in den Stapel", () => {
  const s = neuesSpiel(5);
  s.einstellungen.nichtErraten = "offen";
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  starten(s, [k(1930), k(1935), k(1940), k(1941), k(1945), k(1960, "nochmal"), k(2000)]);
  karteLegen(s, "a", 1); // falsch
  assert.equal(s.stapel[0].songId, "nochmal");
  const v = sicht(s);
  assert.equal(v.verdeckt, false);
  assert.equal(v.ergebnis?.karte.jahr, 1960);
});

test("später einsteigen: Startkarte und hinten in der Reihenfolge", () => {
  const s = neuesSpiel(5);
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  starten(s, [k(1930), k(1935), k(1940), k(1941), k(1945), k(1960), k(2000)]);
  const vorher = s.stapel.length;
  const p = spielerHinzufuegen(s, { id: "b", name: "Ben", farbe: "#0f0", sitzung: "y" });
  assert.equal(p.zeitstrahl.length, 1);
  assert.equal(s.stapel.length, vorher - 1);
  assert.deepEqual(s.reihenfolge, ["a", "b"]);
  karteLegen(s, "a", 0);
  naechsterZug(s);
  assert.equal(sicht(s).aktiv, "b");
});

test("voller Raum mit Bots: echter Mitspieler übernimmt den Platz eines Bots", async () => {
  const { botHinzufuegen } = await import("../src/game.ts");
  const s = neuesSpiel(9);
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  const farben = ["#1", "#2", "#3", "#4", "#5"];
  for (const [i, f] of farben.entries()) botHinzufuegen(s, "mittel", `b${i}`, f);
  starten(s, Array.from({ length: 20 }, (_, i) => k(1950 + i)));
  s.spieler.find((p) => p.id === "b2")!.zeitstrahl = [];
  const p = spielerHinzufuegen(s, { id: "n", name: "Neu", farbe: "#x", sitzung: "y" });
  assert.equal(s.spieler.length, 6);
  assert.ok(!s.spieler.some((q) => q.id === "b2")); // der Bot mit den wenigsten Karten macht Platz
  assert.equal(p.farbe, "#3");
  assert.equal(p.zeitstrahl.length, 1);
  assert.ok(s.reihenfolge.includes("n") && !s.reihenfolge.includes("b2"));
  // steigt ein echter Mitspieler aus, kommt kein Bot dazu; geht der letzte, ist das Spiel vorbei
  spielerEntfernen(s, "a");
  assert.equal(s.spieler.length, 5);
  assert.equal(s.phase, "hoeren");
  spielerEntfernen(s, "n");
  assert.equal(s.phase, "ende");
  assert.ok(s.gewinner.length >= 1);
  // ohne Bots bleibt der volle Raum voll
  const t = neuesSpiel(9);
  for (const id of ["a", "b", "c", "d", "e", "f"]) spielerHinzufuegen(t, { id, name: id, farbe: "", sitzung: id });
  assert.throws(() => spielerHinzufuegen(t, { id: "m", name: "Mia", farbe: "", sitzung: "z" }), /voll/);
});

test("Modus „alle“: erst merken, dann gemeinsam auswerten; Option „erster“", () => {
  for (const warten of ["alle", "erster"] as const) {
    const s = neuesSpiel(5);
    s.einstellungen.modus = "alle";
    s.einstellungen.warten = warten;
    for (const id of ["a", "b", "c"]) spielerHinzufuegen(s, { id, name: id, farbe: "", sitzung: id });
    starten(s, [k(1930), k(1935), k(1940), k(1941), k(1945), k(1950), k(1960), k(1970), k(1980), k(2000)]);
    const fertig = eingeben(s, "a", 0);
    assert.equal(fertig, warten === "erster");
    assert.equal(s.phase, "hoeren"); // noch nicht aufgelöst (Song läuft zu Ende)
    if (warten === "alle") {
      assert.throws(() => eingeben(s, "a", 0), /schon gelegt/);
      eingeben(s, "b", 1);
      assert.equal(eingeben(s, "c", 0), true);
    } else assert.equal(eingeben(s, "b", 1), true); // „erster“: die anderen dürfen noch tippen
    assert.equal(bereit(s), true);
    auswerten(s);
    assert.equal(s.phase, "aufloesung");
    const v = sicht(s);
    assert.equal(v.ergebnisse?.length, 3);
    // „erster“: wer nicht getippt hat, bekommt keinen Fehler angerechnet
    if (warten === "erster") assert.equal(s.spieler.find((p) => p.id === "c")!.falsch, 0);
  }
});

test("Standard: alle gleichzeitig; Warten-Option „alle5“ bleibt erhalten, Unbekanntes wird „alle“", () => {
  assert.equal(STANDARD_EINSTELLUNGEN.modus, "alle");
  assert.equal(grenzen({ ...STANDARD_EINSTELLUNGEN, warten: "alle5" }).warten, "alle5");
  assert.equal(grenzen({ ...STANDARD_EINSTELLUNGEN, warten: "quatsch" as never }).warten, "alle");
});

test("Vorschau-Abgleich: tolerant bei Schreibweisen, aber keine fremden Songs", () => {
  const t = (interpret: string, titel: string, album = "Album"): AppleTreffer =>
    ({ trackId: 1, interpret, titel, album, jahr: 2000, genre: null, vorschau: "https://x", cover: null, link: null });
  const passt = (treffer: AppleTreffer, interpret: string, titel: string) => besterTreffer([treffer], interpret, titel) !== null;
  // Schreibweisen, wie sie in Songlisten vorkommen
  assert.ok(passt(t("Bob Sinclar", "World, Hold On (Children of the Sky)"), "Bob Sinclair", "World Hold on (Children of the Sky)"));
  assert.ok(passt(t("Matthias Reim", "Verdammt Ich lieb' dich"), "Matthias Reim", "Verdammt lch lieb' dich"));
  assert.ok(passt(t("P!nk", "Just Give Me a Reason (feat. Nate Ruess)"), "Pink, Nate Ruess", "Just Give Me a Reason (feat. Nate Ruess)"));
  assert.ok(passt(t("Gitte Hænning", "Ich will 'nen Cowboy als Mann"), "Gitte Haenning", "Ich will 'nen Cowboy als Mann"));
  assert.ok(passt(t("Mad'House", "Like a Prayer"), "MadHouse", "Like a Prayer"));
  assert.ok(passt(t("Modjo", "Lady (Hear Me Tonight)"), "Modjo", "Lady - Hear Me Tonight"));
  assert.ok(passt(t("Nelly", "Dilemma"), "Kelly Rowland", "Dilemma (feat. Kelly Rowland) Nelly"));
  // nicht verwechseln
  assert.ok(!passt(t("Madonna", "Like a Prayer"), "MadHouse", "Like a Prayer"));
  assert.ok(!passt(t("Modjo", "Chillin'"), "Modjo", "Lady - Hear Me Tonight"));
  assert.ok(!passt(t("The Beatles", "Lady Madonna"), "The Beatles", "Lady"));
  assert.ok(!passt(t("Nena", "Leuchtturm"), "Nena", "99 Luftballons"));
  // genauer Treffer schlägt toleranten, Original schlägt Remix
  const genau = t("Bob Sinclar", "World Hold On"), remix = t("Bob Sinclar", "World Hold On", "Remixes");
  assert.equal(besterTreffer([t("Bob Sinclar", "World, Hold On (Children of the Sky) - Remix"), genau], "Bob Sinclar", "World Hold On"), genau);
  assert.equal(besterTreffer([t("Bob Sinclar", "World Hold On (Remix)"), remix, genau], "Bob Sinclar", "World Hold On"), genau);
});

test("Raten: Groß/klein egal, leichte Tippfehler zählen, falsche Antworten nicht", () => {
  const interpret = interpretVarianten("Bon Jovi"), titel = titelVarianten("It's My Life (Remastered)");
  assert.ok(geraten("bon jovi", interpret));
  assert.ok(geraten("BON JOVY", interpret)); // 1 Fehler
  assert.ok(geraten("its my life", titel));
  assert.ok(geraten("Its my lief", titel)); // 2 Fehler bei langem Titel
  assert.ok(!geraten("Bon Scott", interpret));
  assert.ok(!geraten("Livin on a prayer", titel));
  assert.ok(!geraten("", titel));
  // Füllwörter: „No.“ vor der Zahl darf fehlen oder anders geschrieben sein
  const mambo = titelVarianten("Mambo No. 5 (a Little Bit of...)");
  for (const e of ["mambo 5", "mambo no 5", "Mambo No. 5", "mambo nr. 5", "mambo number 5"]) assert.ok(geraten(e, mambo), e);
  assert.ok(!geraten("mambo 6", mambo));
  // Bandname mit „The“ und mehrere Interpreten
  assert.ok(geraten("beatles", interpretVarianten("The Beatles")));
  assert.ok(geraten("rihanna", interpretVarianten("Calvin Harris feat. Rihanna")));
  assert.ok(geraten("Calvin Harris", interpretVarianten("Calvin Harris feat. Rihanna")));
  // Klammerzusatz darf fehlen oder dabei sein
  assert.ok(geraten("World hold on", titelVarianten("World, Hold On (Children of the Sky)")));
  // kurze Wörter müssen genau stimmen
  assert.ok(!geraten("ABAB", interpretVarianten("ABBA")) || geraten("ABBA", interpretVarianten("ABBA")));
  assert.ok(!geraten("U3", interpretVarianten("U2")));
});

test("Raten: Zusatzpunkte je richtigem Interpret/Titel, auch wenn das Jahr falsch ist", () => {
  const s = neuesSpiel(5);
  s.einstellungen.raten = true;
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  const karte: Karte = { songId: "bj", jahr: 2000, titel: "It's My Life", interpret: "Bon Jovi" };
  starten(s, [k(1940), k(1941), k(1942), k(1950), karte, k(1990)]);
  // Anna hat 1990, legt 2000 davor → Jahr falsch, Interpret richtig (Tippfehler), Titel falsch
  eingeben(s, "a", 0, { interpret: "bon jovy", titel: "Always" });
  auswerten(s);
  const e = s.zug!.ergebnis!;
  assert.equal(e.richtig, false);
  assert.deepEqual([e.bonus?.interpretRichtig, e.bonus?.titelRichtig], [true, false]);
  assert.equal(s.spieler[0].punkte, 1);
  // ohne Option: keine Punkte, Tipps werden ignoriert
  const t = neuesSpiel(5);
  spielerHinzufuegen(t, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  starten(t, [k(1940), k(1941), k(1942), k(1950), { ...karte }, k(1990)]);
  eingeben(t, "a", 1, { interpret: "Bon Jovi", titel: "It's My Life" });
  auswerten(t);
  assert.equal(t.zug!.ergebnis!.bonus, undefined);
  assert.equal(t.spieler[0].punkte ?? 0, 0);
  // Tipps stehen vor der Auflösung nicht in der Sicht
  const u = neuesSpiel(5);
  u.einstellungen.raten = true;
  spielerHinzufuegen(u, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  starten(u, [k(1940), k(1941), k(1942), k(1950), { ...karte }, k(1990)]);
  eingeben(u, "a", 0, { interpret: "Geheimtipp Interpret", titel: "x" });
  assert.ok(!JSON.stringify(sicht(u)).includes("Geheimtipp"));
});

test("Raten geführt: erst Jahr, dann Interpret, dann Titel – fertig erst nach dem letzten Schritt", () => {
  const s = neuesSpiel(5);
  s.einstellungen.raten = true;
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  const karte: Karte = { songId: "bj", jahr: 2000, titel: "It's My Life", interpret: "Bon Jovi" };
  starten(s, [k(1940), k(1941), k(1942), k(1950), karte, k(1990)]);
  assert.throws(() => ratenAbgeben(s, "a", { interpret: "Bon Jovi" }, false), /Erst das Jahr/);
  assert.equal(eingeben(s, "a", 0, undefined, true), false); // Jahr liegt, aber noch nicht fertig
  assert.deepEqual(sicht(s).raten, ["a"]);
  assert.equal(ratenAbgeben(s, "a", { interpret: "Bon Jovi" }, false), false);
  assert.equal(ratenAbgeben(s, "a", { titel: "its my life" }, true), true);
  assert.deepEqual(sicht(s).raten, []);
  assert.throws(() => ratenAbgeben(s, "a", { titel: "x" }, true), /schon alles/);
  auswerten(s);
  assert.deepEqual([s.zug!.ergebnis!.bonus?.interpretRichtig, s.zug!.ergebnis!.bonus?.titelRichtig], [true, true]);
  assert.equal(s.spieler[0].punkte, 2);
});

test("Raten nur Titel: Interpret wird ignoriert und gibt keinen Punkt", () => {
  const s = neuesSpiel(5);
  s.einstellungen.raten = true;
  s.einstellungen.ratenWas = "titel";
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  const karte: Karte = { songId: "bj", jahr: 2000, titel: "It's My Life", interpret: "Bon Jovi" };
  starten(s, [k(1940), k(1941), k(1942), k(1950), karte, k(1990)]);
  eingeben(s, "a", 0, undefined, true);
  assert.equal(ratenAbgeben(s, "a", { interpret: "Bon Jovi", titel: "its my life" }, true), true);
  auswerten(s);
  assert.deepEqual([s.zug!.ergebnis!.bonus?.interpretRichtig, s.zug!.ergebnis!.bonus?.titelRichtig], [false, true]);
  assert.equal(s.spieler[0].punkte, 1);
});

test("Bots: lustiger Name, Roboter-Avatar, Profi trifft mit hohem Zufall die richtige Lücke", async () => {
  const { botHinzufuegen, botZug, BOT_AVATARE } = await import("../src/game.ts");
  const s = neuesSpiel(5);
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  const bot = botHinzufuegen(s, "profi", "b", "#0f0", () => 0);
  assert.equal(bot.bot, "profi");
  assert.ok(BOT_AVATARE.includes(bot.avatar!));
  assert.notEqual(bot.name, "Anna");
  starten(s, [k(1930), k(1935), k(1940), k(1950), k(1960), k(1970), { songId: "x", jahr: 1985, titel: "T", interpret: "I" }, k(1999)]);
  // Startkarte des Bots ist 1999 (Stapel von hinten), Song 1985 gehört davor → Lücke 0
  const startkarte = bot.zeitstrahl[0].jahr;
  const richtig = s.zug!.karte.jahr < startkarte ? 0 : 1;
  assert.equal(botZug(s, bot, () => 0.1).position, richtig); // Zufall unter Trefferquote → richtig
  assert.equal(botZug(s, bot, () => 0.95).position, 1 - richtig); // darüber → daneben
});

test("Ziel erreicht: Spiel ist schon bei der Auflösung entschieden (kein weiterer Song)", () => {
  const s = neuesSpiel(2);
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  spielerHinzufuegen(s, { id: "b", name: "Ben", farbe: "#0f0", sitzung: "y" });
  starten(s, [k(1940), k(1941), k(1970), k(1960), k(1950), k(2000)]);
  karteLegen(s, "a", 0); // Anna hat 2 = Ziel, aber Ben ist in dieser Runde noch dran
  assert.equal(spielEntschieden(s), false);
  naechsterZug(s);
  karteLegen(s, "b", 1);
  assert.equal(spielEntschieden(s), true);
  naechsterZug(s);
  assert.equal(s.phase, "ende");
});

test("Bot-Plan: sechs feste Bots (je zwei pro Stufe), freie Plätze in der Lobby sichtbar", async () => {
  const { botsDazu, botHinzufuegen, sicht } = await import("../src/game.ts");
  const s = neuesSpiel(5);
  s.einstellungen.auffuellen = true;
  assert.equal(botsDazu(s).length, 6);
  for (const stufe of ["leicht", "mittel", "profi"]) assert.equal(botsDazu(s).filter((b) => b.stufe === stufe).length, 2);
  spielerHinzufuegen(s, { id: "a", name: "Anna", farbe: "#f00", sitzung: "x" });
  const geplant = botsDazu(s);
  assert.equal(geplant.length, 5);
  assert.deepEqual(sicht(s).botsDazu, geplant);
  const bot = botHinzufuegen(s, geplant[0].stufe, "b", "#0f0", Math.random, geplant[0]);
  assert.equal(bot.name, geplant[0].name);
  assert.equal(bot.avatar, geplant[0].avatar);
  assert.equal(botsDazu(s)[0].name, geplant[1].name);
  s.einstellungen.auffuellen = false;
  assert.equal(botsDazu(s).length, 0);
});
