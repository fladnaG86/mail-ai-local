/**
 * Test dei valori del gruppo «Carattere» della composizione (blocco R):
 * elenchi di famiglie e dimensioni offerti dai due menu. Funzioni pure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { CARATTERI_COMPOSIZIONE, elencoDimensioni } from "../src/views/compose.js";
import { DIMENSIONE_MIN, DIMENSIONE_MAX } from "../src/views/impostazioni-mail.js";

test("le famiglie offerte sono tutte non vuote, senza spazi ai bordi e senza duplicati", () => {
  assert.ok(CARATTERI_COMPOSIZIONE.length >= 5);
  const basse = CARATTERI_COMPOSIZIONE.map((f) => f.toLowerCase());
  assert.equal(new Set(basse).size, basse.length);
  assert.ok(CARATTERI_COMPOSIZIONE.every((f) => f.trim() === f && f.length > 0));
});

test("il primo carattere offerto è il predefinito della finestra", () => {
  assert.equal(CARATTERI_COMPOSIZIONE[0], "Aptos");
});

test("le dimensioni offerte stanno nell'intervallo ammesso", () => {
  const d = elencoDimensioni();
  assert.ok(d.length >= 10);
  assert.ok(d.every((n) => n >= DIMENSIONE_MIN && n <= DIMENSIONE_MAX));
});

test("le dimensioni sono in ordine crescente e senza duplicati", () => {
  const d = elencoDimensioni();
  for (let i = 1; i < d.length; i += 1) assert.ok(d[i] > d[i - 1]);
});

test("le dimensioni più usate ci sono", () => {
  const d = elencoDimensioni();
  for (const n of [10, 11, 12, 14, 18, 24]) assert.ok(d.includes(n), `manca ${n}`);
});
