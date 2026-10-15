/**
 * Test della logica pura del pannello «Impostazioni di sincronizzazione»
 * (blocco N, node --test): normalizzazione dell'intervallo, etichette del
 * riferimento e la decisione del timer. L'effetto reale (timer di sync,
 * sync all'avvio) è agganciato in `src/main.js`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PRESET_INTERVALLO,
  normIntervalloMinuti,
  etichettaIntervallo,
  deveSincronizzare,
  deveSincronizzareAvvio,
} from "../src/views/sincronizzazione.js";

test("i preset dell'intervallo partono da «Mai»", () => {
  assert.equal(PRESET_INTERVALLO[0].minuti, 0);
  assert.equal(PRESET_INTERVALLO[0].etichetta, "Mai");
  assert.ok(PRESET_INTERVALLO.some((p) => p.minuti === 15));
  assert.ok(PRESET_INTERVALLO.some((p) => p.minuti === 60));
});

test("l'intervallo è sempre fra 0 e 1440 minuti", () => {
  assert.equal(normIntervalloMinuti(15), 15);
  assert.equal(normIntervalloMinuti(-5), 0);
  assert.equal(normIntervalloMinuti(9999), 1440);
  assert.equal(normIntervalloMinuti("boh"), 0);
  assert.equal(normIntervalloMinuti(14.6), 15, "arrotonda");
});

test("l'etichetta dell'intervallo è leggibile", () => {
  assert.equal(etichettaIntervallo(0), "Mai");
  assert.equal(etichettaIntervallo(15), "Ogni 15 minuti");
  assert.equal(etichettaIntervallo(60), "Ogni ora");
  assert.equal(etichettaIntervallo(120), "Ogni 2 ore");
  assert.equal(etichettaIntervallo(45), "Ogni 45 minuti");
});

test("deveSincronizzare rispetta intervallo e ultima sincronizzazione", () => {
  const adesso = 1_000_000_000_000;
  assert.equal(deveSincronizzare(0, 0, adesso), false, "«Mai» non sincronizza");
  assert.equal(deveSincronizzare(15, 0, adesso), true, "mai sincronizzato → sincronizza");
  assert.equal(deveSincronizzare(15, adesso - 5 * 60000, adesso), false, "troppo presto");
  assert.equal(deveSincronizzare(15, adesso - 16 * 60000, adesso), true, "intervallo passato");
});

test("all'avvio si sincronizza solo con la preferenza attiva", () => {
  assert.equal(deveSincronizzareAvvio({ syncAllAvvio: true }), true);
  assert.equal(deveSincronizzareAvvio({ syncAllAvvio: false }), false);
  assert.equal(deveSincronizzareAvvio({}), false, "assente → spenta");
  assert.equal(deveSincronizzareAvvio(null), false, "nessuna preferenza → spenta");
});
