/**
 * Test della logica pura del pannello «Archiviazione» (blocco N, node --test):
 * formato della dimensione della cache, soglia di avviso e riepilogo. L'effetto
 * reale (dimensione della cache + svuotamento) è agganciato al comando
 * `archiviazione_stato` e a `svuota_cache`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formattaByte,
  sogliaSuperata,
  normSogliaMb,
  SOGLIA_MB_MAX,
  riepilogoArchiviazione,
} from "../src/views/archiviazione.js";

test("la dimensione è leggibile in B/KB/MB/GB", () => {
  assert.equal(formattaByte(0), "0 B");
  assert.equal(formattaByte(512), "512 B");
  assert.equal(formattaByte(2048), "2,0 KB");
  assert.equal(formattaByte(5 * 1024 * 1024), "5,0 MB");
  assert.equal(formattaByte(3 * 1024 * 1024 * 1024), "3,0 GB");
  assert.equal(formattaByte(-1), "0 B");
  assert.equal(formattaByte("boh"), "0 B");
});

test("la soglia di avviso è superata solo se impostata e oltrepassata", () => {
  const mb = 1024 * 1024;
  assert.equal(sogliaSuperata(10 * mb, 0), false, "nessuna soglia → mai superata");
  assert.equal(sogliaSuperata(10 * mb, 20), false);
  assert.equal(sogliaSuperata(25 * mb, 20), true);
});

test("il riepilogo dice dimensione e numero di messaggi", () => {
  const testo = riepilogoArchiviazione({ byte: 2048, messaggi: 42 });
  assert.match(testo, /2,0 KB/);
  assert.match(testo, /42/);
  assert.equal(riepilogoArchiviazione(null), "La cache locale è vuota.");
});

test("la soglia è limitata sopra (come il kernel) e sotto a 0", () => {
  assert.equal(normSogliaMb(500), 500);
  assert.equal(normSogliaMb(0), 0);
  assert.equal(normSogliaMb(-10), 0);
  assert.equal(normSogliaMb("boh"), 0);
  assert.equal(normSogliaMb(12.6), 13, "arrotonda");
  assert.equal(normSogliaMb(SOGLIA_MB_MAX + 1), SOGLIA_MB_MAX, "clampa al massimo");
  assert.equal(normSogliaMb(999_999_999), SOGLIA_MB_MAX, "un valore enorme non fa fallire il salvataggio");
});
