// Hitster-Decks (Songlisten der Original-Editionen): standardmäßig ausgeblendet, per Admin-Schalter einblendbar,
// Zugehörigkeit je Deck einstellbar.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const daten = fs.mkdtempSync(path.join(os.tmpdir(), "hityear-decks-"));
process.env.ZEITSTRAHL_DATEN = daten;
const { db } = await import("../src/db.ts");
const { deckAnlegen, deckImSpiel, hitsterDecksAn, hitsterDecksSetzen, hitsterSetzen, listenLaden, listenUebersicht, spielDecks } = await import("../src/listen.ts");

after(() => {
  db.close();
  fs.rmSync(daten, { recursive: true, force: true });
});

const eintrag = [{ interpret: "A", titel: "B", jahr: 1990 }];

test("Hitster-Decks: standardmäßig nur die selbst erstellten Decks im Spiel", () => {
  listenLaden();
  const hitster = deckAnlegen("Ungarns Hits", "katalog", eintrag);
  const eigeneListe = deckAnlegen("HitYear - Schlager 50er bis heute", "katalog", eintrag);
  const eigen = deckAnlegen("Party 80er", "eigen", eintrag);
  const playlist = deckAnlegen("Meine Playlist", "playlist", eintrag);
  const imSpiel = () => spielDecks().map((l) => l.id);

  // Vorbelegung: importierte Songliste ohne „HitYear“ im Namen = Hitster-Deck
  const markiert = Object.fromEntries(listenUebersicht().map((l) => [l.id, l.hitster]));
  assert.deepEqual([markiert[hitster], markiert[eigeneListe], markiert[eigen], markiert[playlist]], [true, false, false, false]);
  assert.equal(markiert["weihnachtslieder"], false, "mitgelieferte Listen (data/listen) gelten als selbst erstellt");

  // Standard: ausgeschaltet
  assert.equal(hitsterDecksAn(), false);
  assert.ok(!imSpiel().includes(hitster));
  assert.ok([eigeneListe, eigen, playlist, "weihnachtslieder"].every((id) => imSpiel().includes(id)));
  assert.equal(deckImSpiel(hitster), false);
  assert.equal(deckImSpiel("gibt-es-nicht"), false);

  // eingeschaltet: alle Decks
  hitsterDecksSetzen(true);
  assert.ok(imSpiel().includes(hitster));
  assert.equal(deckImSpiel(hitster), true);
  hitsterDecksSetzen(false);

  // Zugehörigkeit je Deck umstellen
  hitsterSetzen(hitster, false);
  hitsterSetzen(eigen, true);
  assert.ok(imSpiel().includes(hitster));
  assert.ok(!imSpiel().includes(eigen));
});
