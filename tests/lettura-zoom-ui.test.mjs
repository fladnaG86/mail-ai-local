/**
 * Test dei passi dello zoom di lettura (blocco R). Funzione pura.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { PASSI_ZOOM_LETTURA, passoZoomLettura } from "../src/views/main-view.js";

test("i passi coprono l'intervallo ammesso", () => {
  assert.equal(PASSI_ZOOM_LETTURA[0], 50);
  assert.equal(PASSI_ZOOM_LETTURA[PASSI_ZOOM_LETTURA.length - 1], 400);
});

test('"dentro" sale al passo successivo', () => {
  assert.equal(passoZoomLettura(100, "dentro"), 125);
  assert.equal(passoZoomLettura(50, "dentro"), 75);
});

test('"fuori" scende al passo precedente', () => {
  assert.equal(passoZoomLettura(100, "fuori"), 75);
  assert.equal(passoZoomLettura(400, "fuori"), 300);
});

test("ai limiti il valore resta al limite, non va in NaN né a zero", () => {
  assert.equal(passoZoomLettura(400, "dentro"), 400);
  assert.equal(passoZoomLettura(50, "fuori"), 50);
});

test("un valore fuori lista si aggancia al passo più vicino", () => {
  assert.equal(passoZoomLettura(130, "dentro"), 150);
  assert.equal(passoZoomLettura(130, "fuori"), 125);
  assert.equal(passoZoomLettura("abc", "dentro"), 125);
});
