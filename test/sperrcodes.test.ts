import { test } from "node:test";
import assert from "node:assert/strict";
import { codeGesperrt, lesarten } from "../src/sperrcodes.ts";

const ZEICHEN = "ACDEFGHJKLMNPQRTUVWXY2345679"; // wie CODE_ZEICHEN in raeume.ts

test("Sperrcodes: Ziffern werden auch als Buchstaben gelesen", () => {
  assert.ok(lesarten("HA55").includes("HASS"));
  assert.ok(codeGesperrt("HA55"));
  assert.ok(codeGesperrt("5EX7"));
  assert.ok(codeGesperrt("N4ZA"));
  assert.ok(codeGesperrt("AKFC"));
  assert.ok(codeGesperrt("69AC"));
  assert.ok(codeGesperrt("NKKK"));
  assert.ok(codeGesperrt("AFDX"));
  assert.ok(codeGesperrt("PUMA"));
});

test("Sperrcodes: harmlose Codes bleiben erlaubt", () => {
  for (const c of ["ACDE", "R3TJ", "VYA4", "E5TJ", "GUQ4", "W7KM"]) assert.equal(codeGesperrt(c), false, c);
});

test("Sperrcodes: es bleiben genug Codes übrig", () => {
  let gesperrt = 0, n = 0;
  for (const a of ZEICHEN) for (const b of ZEICHEN) for (const c of ZEICHEN) for (const d of ZEICHEN) {
    n++;
    if (codeGesperrt(a + b + c + d)) gesperrt++;
  }
  assert.ok(gesperrt / n < 0.1, `${gesperrt} von ${n} gesperrt`);
  console.log(`gesperrt: ${gesperrt} von ${n} (${((100 * gesperrt) / n).toFixed(1)} %)`);
});
