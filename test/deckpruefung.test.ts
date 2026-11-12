import { test } from "node:test";
import assert from "node:assert/strict";
import { DeckPruefung, type Pruefergebnis } from "../src/deckpruefung.ts";

const schritt = () => new Promise<void>(r => setImmediate(r));
const bereit = (): Pruefergebnis => ({ art: "bereit", bis: Date.now() + 300_000 });

test("Deckprüfung begrenzt Parallelität, teilt Songs und verwirft alte Warteschlangen", async () => {
  const decks: Record<string, string[]> = { a: ["eins", "zwei", "alt"], b: ["zwei", "neu"] };
  const abrufe: string[] = [];
  const antworten = new Map<string, (e: Pruefergebnis) => void>();
  const meldungen: string[] = [];
  const p = new DeckPruefung(id => decks[id], id => {
    abrufe.push(id);
    return new Promise(r => antworten.set(id, r));
  }, id => meldungen.push(id));
  p.waehlen("raum1", "a");
  p.waehlen("raum2", "a");
  await schritt();
  assert.deepEqual(abrufe, ["eins", "zwei"], "global höchstens zwei Abfragen, auch bei zwei Räumen");
  p.waehlen("raum1", "b");
  p.waehlen("raum2", null);
  antworten.get("eins")!(bereit());
  await schritt();
  assert.deepEqual(abrufe, ["eins", "zwei", "neu"], "nicht begonnene Prüfung des alten Decks entfällt");
  antworten.get("zwei")!(bereit());
  antworten.get("neu")!(bereit());
  await schritt();
  assert.deepEqual(p.stand("b"), { gesamt: 2, geprueft: 2, laeuft: false, bereit: 2, fehlt: 0, unklar: 0 });
  assert.equal(p.stand("a"), null);
  assert.ok(meldungen.every(id => id === "b"), "alte Ergebnisse erscheinen nicht bei der neuen Auswahl");
});

test("Neue Deck-Treffer werden nachgeprüft; frische Ergebnisse werden wiederverwendet", async () => {
  const ids = ["eins"];
  const abrufe: string[] = [];
  const p = new DeckPruefung(() => ids, async id => { abrufe.push(id); return bereit(); }, () => {});
  p.waehlen("raum", "deck");
  await schritt();
  ids.push("zwei");
  p.aktualisieren();
  await schritt();
  p.waehlen("anderer", "deck");
  await schritt();
  assert.deepEqual(abrufe, ["eins", "zwei"]);
  assert.equal(p.stand("deck")?.geprueft, 2);
});

test("Nur bestätigte Ausfälle werden vorübergehend ausgeschlossen", async (t) => {
  let jetzt = Date.now();
  t.mock.method(Date, "now", () => jetzt);
  const p = new DeckPruefung(() => ["fehlt", "unklar"], async id => ({ art: id as "fehlt" | "unklar", bis: jetzt + 1000 }), () => {});
  p.waehlen("raum", "deck");
  await schritt();
  assert.equal(p.fehlt("fehlt"), true);
  assert.equal(p.fehlt("unklar"), false);
  assert.equal(p.fehlt("ungeprueft"), false);
  jetzt += 1001;
  assert.equal(p.fehlt("fehlt"), false, "keine dauerhafte Sperre");
});

test("Große Decks schließen trotz inzwischen abgelaufener früher Ergebnisse ab", async (t) => {
  let jetzt = Date.now();
  t.mock.method(Date, "now", () => jetzt);
  const antworten = new Map<string, (e: Pruefergebnis) => void>();
  const abrufe: string[] = [];
  const p = new DeckPruefung(() => ["eins", "zwei", "drei"], id => {
    abrufe.push(id);
    return new Promise(r => antworten.set(id, r));
  }, () => {});
  p.waehlen("raum", "deck");
  await schritt();
  antworten.get("eins")!({ art: "bereit", bis: jetzt + 1000 });
  await schritt();
  jetzt += 2000;
  p.aktualisieren();
  p.waehlen("raum", "deck");
  antworten.get("zwei")!(bereit());
  antworten.get("drei")!(bereit());
  await schritt();
  assert.deepEqual(abrufe, ["eins", "zwei", "drei"]);
  assert.equal(p.stand("deck")?.laeuft, false);
  p.waehlen("raum", "deck");
  await schritt();
  assert.equal(abrufe.at(-1), "eins", "neue Auswahl erneuert inzwischen veraltete Ergebnisse");
  antworten.get("eins")!(bereit());
  await schritt();
});

test("Unerwartete Prüffehler blockieren die Warteschlange nicht", async () => {
  const p = new DeckPruefung(() => ["eins", "zwei", "drei"], async () => { throw new Error("Netzwerk"); }, () => {});
  p.waehlen("raum", "deck");
  await schritt();
  assert.equal(p.stand("deck")?.unklar, 3);
  assert.equal(p.stand("deck")?.laeuft, false);
});
