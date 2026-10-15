/**
 * Test della logica pura del controllo prima dell'invio (logica JS, node --test).
 * Nel percorso browser il controllo è simulato (`avvisiSimulati`); il controllo
 * vero è nel kernel Rust (test in `src-tauri/tests/presend_test.rs`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  avvisiSimulati,
  contaIndirizzi,
  etichettaGravita,
} from "../src/views/compose.js";

/** Tipo presente nell'elenco? */
function ha(avvisi, tipo) {
  return avvisi.some((a) => a.tipo === tipo);
}

test("contaIndirizzi separa su virgola e punto e virgola", () => {
  assert.equal(contaIndirizzi(""), 0);
  assert.equal(contaIndirizzi("a@b.it"), 1);
  assert.equal(contaIndirizzi("a@b.it, c@d.it; e@f.it"), 3);
  assert.equal(contaIndirizzi("  ,  ; "), 0);
});

test("etichettaGravita è leggibile", () => {
  assert.equal(etichettaGravita("attenzione"), "Attenzione");
  assert.equal(etichettaGravita("informativo"), "Informativo");
  assert.equal(etichettaGravita(undefined), "Informativo");
});

test("allegato citato ma assente produce un avviso", () => {
  const avvisi = avvisiSimulati({ a: "a@b.it", oggetto: "Piano", corpoTesto: "in allegato trovi il preventivo" });
  assert.equal(ha(avvisi, "allegato_mancante"), true);
});

test("nessun allegato citato non produce avvisi", () => {
  const avvisi = avvisiSimulati({ a: "a@b.it", oggetto: "Piano", corpoTesto: "Buongiorno, confermo la riunione." });
  assert.deepEqual(avvisi, []);
});

test("i dati sensibili e i molti destinatari vengono segnalati", () => {
  const avvisi = avvisiSimulati({
    a: Array.from({ length: 11 }, (_, i) => `p${i}@x.it`).join(", "),
    oggetto: "Piano",
    corpoTesto: "la password è Esempio2026! IBAN IT60X0542811101000000123456",
  });
  assert.equal(ha(avvisi, "dato_sensibile"), true);
  assert.equal(ha(avvisi, "troppi_destinatari"), true);
});

test("l'esempio dell'aggancio ?view=controllo produce almeno due avvisi", () => {
  const avvisi = avvisiSimulati({
    a: "luca.bianchi@esempiogroup.it",
    oggetto: "Accessi di rete",
    corpoTesto: "in allegato trovi il riepilogo. La password del firewall è Esempio2026!",
  });
  assert.ok(avvisi.length >= 2, `attesi almeno due avvisi, ottenuti ${avvisi.length}`);
  assert.equal(ha(avvisi, "allegato_mancante"), true);
  assert.equal(ha(avvisi, "dato_sensibile"), true);
});
