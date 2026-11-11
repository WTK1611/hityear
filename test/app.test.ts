import { test } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { appMedienFreigeben, appSitzungErstellen, rolleAusAppSitzung, rolleAusMedienFreigabe } from "../src/app.ts";

const anfrage = (method = "GET") => ({ method }) as IncomingMessage;

test("App-Sitzungen: Rollen, Manipulation, Ablauf und Zweckbindung", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const sitzung = appSitzungErstellen("admin");
  assert.equal(rolleAusAppSitzung(sitzung), "admin");
  assert.equal(rolleAusAppSitzung(appSitzungErstellen("gast")), "gast");
  assert.equal(rolleAusAppSitzung(sitzung.slice(0, -1)), null);
  assert.equal(rolleAusAppSitzung(sitzung + ".weiter"), null);
  assert.equal(rolleAusAppSitzung({ rolle: "admin" }), null);
  const medien = new URL(appMedienFreigeben("/api/qr", "admin")!, "https://test.invalid");
  assert.equal(rolleAusAppSitzung(medien.searchParams.get("appFreigabe")), null);
  const gefaelscht = new URL("https://test.invalid/api/qr");
  gefaelscht.searchParams.set("appFreigabe", sitzung);
  assert.equal(rolleAusMedienFreigabe(anfrage(), gefaelscht), null);
  t.mock.timers.tick(14 * 24 * 60 * 60_000);
  assert.equal(rolleAusAppSitzung(sitzung), null);
});

test("Medienfreigabe gilt nur für denselben Pfad, dieselben Parameter und GET/HEAD", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const url = new URL(appMedienFreigeben("/api/cover/abcdefgh?admin=1", "admin")!, "https://test.invalid");
  assert.equal(rolleAusMedienFreigabe(anfrage(), url), "admin");
  assert.equal(rolleAusMedienFreigabe(anfrage("HEAD"), url), "admin");
  assert.equal(rolleAusMedienFreigabe(anfrage("POST"), url), null);
  const anders = new URL(url);
  anders.pathname = "/api/cover/ijklmnop";
  assert.equal(rolleAusMedienFreigabe(anfrage(), anders), null);
  anders.pathname = "/api/admin/songs";
  assert.equal(rolleAusMedienFreigabe(anfrage(), anders), null);
  anders.pathname = url.pathname;
  anders.searchParams.delete("admin");
  assert.equal(rolleAusMedienFreigabe(anfrage(), anders), null);
  const qr = new URL(appMedienFreigeben("/api/qr?raum=ABCD&text=Hallo%20Welt", "spieler")!, "https://test.invalid");
  assert.equal(rolleAusMedienFreigabe(anfrage(), qr), "spieler", "Query-Encoding bleibt stabil");
  t.mock.timers.tick(5 * 60_000);
  assert.equal(rolleAusMedienFreigabe(anfrage(), url), null);
});

test("Medienfreigabe erlaubt keine fremden URLs oder allgemeinen API-Zugriffe", () => {
  for (const pfad of ["https://fremd.invalid/api/qr", "//fremd.invalid/api/qr", "/api/ich", "/api/login", "/api/admin/songs", "/api/qr#fragment", "/api/qr?appFreigabe=falsch", null, {}, "x".repeat(1025)]) {
    assert.equal(appMedienFreigeben(pfad, "spieler"), null);
  }
});
