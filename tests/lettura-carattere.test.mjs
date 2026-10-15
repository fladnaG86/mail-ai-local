/**
 * Test del carattere applicato al pannello di lettura (blocco R). Funzioni
 * pure: `documentoCorpo` costruisce una stringa, nessun DOM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { documentoCorpo, stileLettura } from "../src/views/main-view.js";

test("senza stile il documento del corpo resta quello di prima", () => {
  const d = documentoCorpo("<p>ciao</p>");
  assert.match(d, /font:13px\/1\.6/);
  assert.match(d, /<p>ciao<\/p>/);
});

test("con lo stile scelto il documento indossa famiglia e dimensione", () => {
  const d = documentoCorpo("<p>ciao</p>", { famiglia: "Georgia", dimensione: 18, zoom: 100 });
  assert.match(d, /font-family:Georgia/);
  assert.match(d, /font-size:18px/);
  assert.doesNotMatch(d, /font:13px\/1\.6/);
});

test("lo zoom di lettura moltiplica la dimensione, non la sostituisce", () => {
  const d = documentoCorpo("<p>ciao</p>", { famiglia: "Georgia", dimensione: 18, zoom: 150 });
  assert.match(d, /font-size:27px/);
});

test("dimensione non valida ripiega su 12 punti, mai NaN", () => {
  const d = documentoCorpo("<p>ciao</p>", { famiglia: "Georgia", dimensione: "abc" });
  assert.match(d, /font-size:12px/);
  assert.doesNotMatch(d, /NaN/);
});

test("famiglia non valida ripiega su Aptos", () => {
  const d = documentoCorpo("<p>ciao</p>", { famiglia: "   " });
  assert.match(d, /font-family:Aptos/);
});

test("una famiglia con virgolette non esce dal suo valore", () => {
  const d = documentoCorpo("<p>ciao</p>", {
    famiglia: 'Arial"; background:url(https://esempio.it/x.png)',
  });
  // Il valore dichiarato si legge dalla sola dichiarazione, non dal documento
  // intero (che ha legittimamente graffe e punti e virgola nel CSS di base).
  const dichiarazione = /font-family:([^;}]+)/.exec(d);
  assert.ok(dichiarazione, "la dichiarazione della famiglia deve esserci");
  assert.doesNotMatch(dichiarazione[1], /[";{}()<>]/);
  assert.doesNotMatch(d, /background:url/);
});

test("stileLettura calcola le tre parti", () => {
  const s = stileLettura("Georgia", 18, 150);
  assert.equal(s.famiglia, "Georgia");
  assert.equal(s.px, 27);
  assert.equal(s.variabili, "--lettura-famiglia:Georgia;--lettura-px:27px;");
});

test("stileLettura limita lo zoom all'intervallo", () => {
  assert.equal(stileLettura("Georgia", 18, 9999).px, 72);
  assert.equal(stileLettura("Georgia", 18, 1).px, 9);
});
