/**
 * Test della logica pura delle impostazioni (node --test): testi del hub,
 * etichette, formattazione del registro e valori di esempio del pannello
 * Assistente IA. Il disegno è verificato con le prove visive (`?view=…`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { testoNonDisponibile, PANNELLI_BLOCCO_D } from "../src/views/settings.js";
import { TITOLI_PANNELLI } from "../src/views/impostazioni-mail.js";
import {
  TONI,
  LINGUE,
  etichettaTono,
  etichettaLingua,
  formatoData,
  spiegazioneRegistro,
  colonneRegistro,
  righeDiEsempio,
  impostazioniDiEsempio,
} from "../src/views/ai-settings.js";

test("testoNonDisponibile dichiara la v1 senza fingere", () => {
  const t = testoNonDisponibile("Calendario");
  assert.match(t, /Calendario/);
  assert.match(t, /non è disponibile nella v1/);
});

test("i riquadri del blocco D hanno un pannello collegato", () => {
  // Le chiavi del hub (settings.js) e i pannelli reali (impostazioni-mail.js)
  // devono coincidere: un riquadro senza pannello resterebbe muto.
  const dalHub = Object.values(PANNELLI_BLOCCO_D);
  assert.deepEqual(dalHub.slice().sort(), ["carattere", "composizione", "correzione", "lettura", "ortografia"]);
  for (const chiave of dalHub) {
    assert.ok(TITOLI_PANNELLI[chiave], `manca il titolo del pannello «${chiave}»`);
  }
});

test("etichette di toni e lingue sono leggibili", () => {
  assert.equal(etichettaTono("diretto"), "Diretto");
  assert.equal(etichettaTono("formale"), "Formale");
  assert.equal(etichettaTono(""), "");
  assert.equal(etichettaLingua("inglese"), "Inglese");
  // I valori ammessi coincidono col kernel.
  assert.deepEqual(TONI, ["formale", "diretto", "breve"]);
  assert.ok(LINGUE.includes("italiano") && LINGUE.includes("inglese"));
});

test("formatoData rende una data leggibile e non inventa su valori storti", () => {
  assert.match(formatoData(1760340000), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  assert.equal(formatoData(0), "--");
  assert.equal(formatoData("boh"), "--");
  assert.equal(formatoData(null), "--");
});

test("il registro spiega cosa registra e cosa non registra mai", () => {
  const s = spiegazioneRegistro();
  assert.match(s, /data e ora/i);
  assert.match(s, /impronta|SHA-256/i);
  assert.match(s, /NON viene registrato/i);
  assert.match(s, /testo/i);
});

test("la tabella del registro ha le colonne attese", () => {
  const cols = colonneRegistro();
  assert.equal(cols.length, 6);
  assert.ok(cols.includes("Data e ora"));
  assert.ok(cols.includes("Modello"));
  assert.ok(cols.includes("Impronta"));
});

test("le righe di esempio del registro hanno i campi del kernel", () => {
  const righe = righeDiEsempio();
  assert.ok(righe.length >= 1);
  for (const r of righe) {
    assert.ok(typeof r.data === "number");
    assert.equal(r.provider, "cloud");
    assert.ok(r.modello && r.azione && r.promptVersion && r.hash);
  }
});

test("i valori di esempio rispettano i default richiesti", () => {
  const p = impostazioniDiEsempio().preferenze;
  assert.equal(p.providerIa, "locale");
  assert.equal(p.endpointLocale, "http://127.0.0.1:8000/v1");
  assert.equal(p.modelloLocale, "thinkingcap-27b");
  assert.equal(p.consensoRichiesto, true);
  assert.equal(p.registroAttivo, true);
  assert.equal(p.controlloTonoAttivo, false);
  assert.equal(p.avviaModelloAllApertura, false);
  assert.equal(p.tonoBozze, "diretto");
  assert.equal(p.linguaTraduzione, "inglese");
  assert.ok(p.firmaDelMittente.length > 0);
});
