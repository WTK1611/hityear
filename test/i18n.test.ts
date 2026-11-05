// Sprachdateien (public/js/sprachen/*.js): jede Sprache hat dieselben Schlüssel wie Englisch, Platzhalter passen,
// und jede Sprache aus SPRACHEN in i18n.js hat eine Datei (außer Deutsch, der Quellsprache).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const ORDNER = new URL("../public/js/sprachen/", import.meta.url);
function laden(datei: string): Record<string, string> {
  let tabelle: Record<string, string> = {};
  new Function("uebersetzungLaden", readFileSync(new URL(datei, ORDNER), "utf8"))((t: Record<string, string>) => (tabelle = t));
  return tabelle;
}
const platzhalter = (s: string) => (s.match(/\{\d\}/g) ?? []).sort().join();

test("jede Sprache aus SPRACHEN hat eine Sprachdatei", () => {
  const i18n = readFileSync(new URL("../public/js/i18n.js", import.meta.url), "utf8");
  const codes = [...i18n.matchAll(/\{ code: "([^"]+)", name:/g)].map((m) => m[1]).filter((c) => c !== "de");
  const dateien = readdirSync(ORDNER).map((d) => d.replace(/\.js$/, ""));
  assert.ok(codes.length >= 6);
  assert.deepEqual(codes.filter((c) => !dateien.includes(c)), []);
});

test("alle Sprachdateien sind vollständig und behalten die Platzhalter", () => {
  const en = laden("en.js");
  for (const datei of readdirSync(ORDNER)) {
    const t = laden(datei);
    assert.deepEqual(Object.keys(t).filter((k) => !(k in en)), [], `${datei}: Schlüssel, die es in en.js nicht gibt`);
    assert.deepEqual(Object.keys(en).filter((k) => !(k in t)), [], `${datei}: fehlende Schlüssel`);
    for (const [de, ziel] of Object.entries(t)) assert.equal(platzhalter(ziel), platzhalter(de), `${datei}: ${de}`);
  }
});
