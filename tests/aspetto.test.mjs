/**
 * Test della logica pura del pannello «Aspetto» (node --test):
 * normalizzazione dell'accento, derivazione delle varianti di colore dalla
 * tinta scelta e CSS generato. L'effetto visivo (cambio dei token `--accent`)
 * si verifica con la prova `?view=impostazioni-aspetto`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACCENTI,
  ACCENTO_DEFAULT,
  TEMA_SCELTE,
  normAccento,
  etichettaAccento,
  tintaAccento,
  luminanza,
  mescolaColore,
  derivaVarianti,
  variantiAccento,
  cssAccenti,
} from "../src/views/aspetto.js";

test("le scelte di tema sono Sistema · Chiaro · Scuro (come in Generale)", () => {
  assert.deepEqual(
    TEMA_SCELTE.map((t) => t.id),
    ["system", "light", "dark"],
  );
  assert.deepEqual(
    TEMA_SCELTE.map((t) => t.etichetta),
    ["Sistema", "Chiaro", "Scuro"],
  );
});

test("la tavolozza dell'accento usa le tinte misurate (--cat-*)", () => {
  // Sei tinte reali, con i valori di docs/riferimento-outlook/colori-misurati.md:
  // il blu è `BlueButtonPrimaryBackgroundDefaultColor` (#0078D4) e `GroupCardBlueColor`.
  assert.equal(ACCENTI.length, 6);
  const perId = Object.fromEntries(ACCENTI.map((a) => [a.id, a.tinta]));
  assert.equal(perId.blu, "#0078D4");
  assert.equal(perId.rosso, "#D13438");
  assert.equal(perId.arancione, "#F7630C");
  assert.equal(perId.giallo, "#FFB900");
  assert.equal(perId.verde, "#107C10");
  assert.equal(perId.viola, "#8764B8");
  // Le maiuscole sono canoniche: due tinte scritte in modo diverso sono la stessa.
  for (const a of ACCENTI) assert.match(a.tinta, /^#[0-9A-F]{6}$/);
});

test("una tinta sconosciuta ricade sul blu (il default misurato)", () => {
  assert.equal(normAccento("verde"), "verde");
  assert.equal(normAccento("fucsia"), ACCENTO_DEFAULT);
  assert.equal(normAccento(null), ACCENTO_DEFAULT);
  assert.equal(normAccento(""), ACCENTO_DEFAULT);
  assert.equal(etichettaAccento("viola"), "Viola");
  assert.equal(etichettaAccento("boh"), "Blu");
  assert.equal(tintaAccento("verde"), "#107C10");
  assert.equal(tintaAccento("boh"), "#0078D4");
});

test("mescolaColore muove il colore verso il bianco o verso il nero", () => {
  // Quantità 0 = il colore resta; 1 = il colore diventa bianco o nero.
  assert.equal(mescolaColore("#0078D4", "bianco", 0), "#0078D4");
  assert.equal(mescolaColore("#0078D4", "nero", 0), "#0078D4");
  assert.equal(mescolaColore("#0078D4", "bianco", 1), "#FFFFFF");
  assert.equal(mescolaColore("#0078D4", "nero", 1), "#000000");
  // Verso ignoto: non cambia nulla (nessun colore inventato).
  assert.equal(mescolaColore("#0078D4", "boh", 0.5), "#0078D4");
});

test("la luminanza distingue le tinte scure dalle chiare", () => {
  // Il blu misurato è scuro, il giallo è chiaro.
  assert.ok(luminanza("#0078D4") < 0.3);
  assert.ok(luminanza("#FFB900") > 0.3);
  assert.ok(luminanza("#FFFFFF") > 0.9);
  assert.ok(luminanza("#000000") < 0.01);
});

test("derivaVarianti ricava i token --accent* nei due temi", () => {
  const v = derivaVarianti("#0078D4");
  for (const tema of ["chiaro", "scuro"]) {
    for (const chiave of ["accent", "hover", "pressed", "disabled", "text"]) {
      assert.match(v[tema][chiave], /^#[0-9A-F]{6}$/, `${tema}.${chiave}`);
    }
  }
  // In chiaro l'accento è la tinta stessa; hover e pressed sono più scuri.
  assert.equal(v.chiaro.accent, "#0078D4");
  assert.notEqual(v.chiaro.hover, v.chiaro.accent);
  assert.notEqual(v.chiaro.pressed, v.chiaro.hover);
  // In scuro l'accento è più chiaro della tinta (come nei valori misurati).
  assert.notEqual(v.scuro.accent, "#0078D4");
  // Il blu scuro è chiaro: il testo sopra diventa scuro; in chiaro è bianco.
  assert.equal(v.chiaro.text, "#FFFFFF");
  assert.equal(v.scuro.text, "#1E1E1E");
});

test("variantiAccento normalizza l'id prima di derivare", () => {
  assert.deepEqual(variantiAccento("boh"), variantiAccento("blu"));
});

test("cssAccenti genera le regole per entrambi i temi, mai colori inventati", () => {
  const css = cssAccenti("verde");
  assert.match(css, /\[data-theme="light"\]\[data-accento="verde"\]/);
  assert.match(css, /\[data-theme="dark"\]\[data-accento="verde"\]/);
  assert.match(css, /--accent:\s*#/);
  assert.match(css, /--accent-hover:\s*#/);
  assert.match(css, /--accent-pressed:\s*#/);
  assert.match(css, /--accent-text:\s*#/);
  // Un id sconosciuto genera le regole del blu, non una tinta a caso.
  assert.match(cssAccenti("boh"), /\[data-accento="blu"\]/);
});
