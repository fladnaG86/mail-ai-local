/**
 * Test della scala di lettura (blocco R): la percentuale con cui si ingrandisce
 * il testo del messaggio aperto. Funzione pura: nessun DOM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ZOOM_LETTURA_MIN,
  ZOOM_LETTURA_MAX,
  limitaZoomLettura,
  zoomLetturaDaPreferenze,
} from "../src/views/accessibilita.js";

import { soloFamiglia } from "../src/views/impostazioni-mail.js";

test("limitaZoomLettura tiene i valori nell'intervallo", () => {
  assert.equal(limitaZoomLettura(100), 100);
  assert.equal(limitaZoomLettura(150), 150);
});

test("limitaZoomLettura porta ai limiti i valori fuori scala", () => {
  assert.equal(limitaZoomLettura(10), ZOOM_LETTURA_MIN);
  assert.equal(limitaZoomLettura(9999), ZOOM_LETTURA_MAX);
  assert.equal(limitaZoomLettura(-40), ZOOM_LETTURA_MIN);
});

test("limitaZoomLettura ripiega sul default sui valori non numerici", () => {
  assert.equal(limitaZoomLettura(undefined), 100);
  assert.equal(limitaZoomLettura(null), 100);
  assert.equal(limitaZoomLettura(""), 100);
  assert.equal(limitaZoomLettura("abc"), 100);
  assert.equal(limitaZoomLettura(NaN), 100);
});

test("limitaZoomLettura arrotonda a un intero", () => {
  assert.equal(limitaZoomLettura(112.6), 113);
  assert.equal(limitaZoomLettura(112.4), 112);
});

test("zoomLetturaDaPreferenze legge la chiave grezza del kernel", () => {
  // L'unica chiave è `letturaZoom` (quella di `config.json`): non esiste una
  // chiave normalizzata corta, e `serveRidisegnareLettura` confronta la stessa
  // chiave grezza — introdurne una qui lo lascerebbe cieco ai cambi di scala.
  assert.equal(zoomLetturaDaPreferenze({ letturaZoom: 150 }), 150);
  assert.equal(zoomLetturaDaPreferenze({}), 100);
  assert.equal(zoomLetturaDaPreferenze({ letturaZoom: 5000 }), ZOOM_LETTURA_MAX);
});

test("soloFamiglia tiene i nomi di famiglia veri", () => {
  assert.equal(soloFamiglia("Georgia"), "Georgia");
  assert.equal(soloFamiglia("Times New Roman"), "Times New Roman");
  assert.equal(soloFamiglia("Courier New"), "Courier New");
  assert.equal(soloFamiglia("  Helvetica  "), "Helvetica");
  assert.equal(soloFamiglia("Arial, sans-serif"), "Arial, sans-serif");
});

test("soloFamiglia ripiega sul default sui valori vuoti", () => {
  assert.equal(soloFamiglia(""), "Aptos");
  assert.equal(soloFamiglia("   "), "Aptos");
  assert.equal(soloFamiglia(null), "Aptos");
  assert.equal(soloFamiglia(undefined), "Aptos");
});

test("soloFamiglia toglie tutto ciò che può cambiare una dichiarazione CSS", () => {
  // L'escaping HTML non basterebbe: dentro un attributo style e dentro un
  // <style>, `&quot;` è già decodificato quando il CSS viene letto.
  assert.equal(soloFamiglia('Arial"; background:url(https://esempio.it/x.png)'), "Arial backgroundurlhttpsesempioitxpng");
  assert.equal(soloFamiglia("Georgia}</style><script>alert(1)</script>"), "Georgiastylescriptalert1script");
  assert.equal(soloFamiglia("Arial;color:red"), "Arialcolorred");
  // Le virgolette sono escluse apposta: una spaiata aprirebbe una stringa CSS
  // mai chiusa e la dichiarazione verrebbe scartata in silenzio.
  assert.equal(soloFamiglia("O'Brien"), "OBrien");
  assert.equal(soloFamiglia("'Segoe UI'"), "Segoe UI");
  assert.doesNotMatch(soloFamiglia("O'Brien"), /['"]/);
  assert.doesNotMatch(soloFamiglia("'Segoe UI'"), /['"]/);
  assert.doesNotMatch(soloFamiglia('Arial"; background:url(x)'), /[";{}()<>]/);
});
