/**
 * Test della logica pura del raggruppamento in conversazioni (blocco H),
 * con `node --test`: normalizzazione dell'oggetto, riepilogo della conversazione
 * (numero di messaggi, non letti) e raggruppamento.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizzaOggetto,
  chiaveDi,
  riepilogoConversazione,
  raggruppaConversazioni,
} from "../src/views/conversazioni.js";

test("normalizzaOggetto toglie i prefissi di risposta e inoltro", () => {
  assert.equal(normalizzaOggetto("Re: Piano Q4"), "piano q4");
  assert.equal(normalizzaOggetto("R: Piano Q4"), "piano q4");
  assert.equal(normalizzaOggetto("I: Piano Q4"), "piano q4");
  assert.equal(normalizzaOggetto("Rif: Piano Q4"), "piano q4");
  assert.equal(normalizzaOggetto("Fwd: Piano Q4"), "piano q4");
  assert.equal(normalizzaOggetto("Fw: Piano Q4"), "piano q4");
});

test("normalizzaOggetto toglie marcatori, spazi e maiuscole", () => {
  assert.equal(normalizzaOggetto("Re: [externa]  I:  Piano   Q4 "), "piano q4");
  assert.equal(normalizzaOggetto("  Piano  Q4 "), "piano q4");
  // Oggetti diversi restano diversi.
  assert.notEqual(normalizzaOggetto("Piano Q4"), normalizzaOggetto("Riunione di lunedì"));
});

test("chiaveDi preferisce la chiave del kernel, poi l'oggetto normalizzato", () => {
  assert.equal(chiaveDi({ chiave: "t:abc@x", subject: "qualsiasi" }), "t:abc@x");
  assert.equal(chiaveDi({ subject: "Re: Piano Q4" }), "s:piano q4");
  assert.equal(chiaveDi({ uid: "9" }), "uid:9");
  assert.equal(chiaveDi(null), "");
});

test("il riepilogo conta messaggi e non letti", () => {
  const r = riepilogoConversazione([{ seen: true }, { seen: false }, { seen: false }]);
  assert.equal(r.numero, 3);
  assert.equal(r.nonLetti, 2);
  assert.equal(r.letti, 1);
  assert.deepEqual(riepilogoConversazione([]), { numero: 0, nonLetti: 0, letti: 0 });
});

test("raggruppaConversazioni unisce per oggetto normalizzato e non oggetti diversi", () => {
  const messaggi = [
    { uid: "1", subject: "Prenotazione ritiro AMAZON DHL", seen: true, from: "DHL" },
    { uid: "2", subject: "I: Prenotazione ritiro AMAZON DHL", seen: false, from: "marco" },
    { uid: "3", subject: "Piano manutenzione Q4", seen: false, from: "Luca" },
  ];
  const conv = raggruppaConversazioni(messaggi);
  assert.equal(conv.length, 2, "due conversazioni distinte");
  const amazon = conv.find((c) => c.chiave === "s:prenotazione ritiro amazon dhl");
  assert.ok(amazon, "la conversazione Amazon esiste");
  assert.equal(amazon.numero, 2);
  assert.equal(amazon.nonLetti, 1);
  assert.equal(amazon.messaggi.length, 2);
});

test("raggruppaConversazioni rispetta la chiave del kernel (threading vero)", () => {
  const messaggi = [
    { uid: "1", chiave: "t:root@x", subject: "Piano Q4", seen: false },
    { uid: "2", chiave: "t:root@x", subject: "Re: Riunione diversa", seen: false },
  ];
  const conv = raggruppaConversazioni(messaggi);
  assert.equal(conv.length, 1, "il riferimento unisce anche con oggetti diversi");
  assert.equal(conv[0].numero, 2);
  assert.equal(conv[0].nonLetti, 2);
});

test("raggruppaConversazioni non muta l'elenco di partenza", () => {
  const messaggi = [{ uid: "1", subject: "X" }, { uid: "2", subject: "X" }];
  const copia = JSON.parse(JSON.stringify(messaggi));
  raggruppaConversazioni(messaggi);
  assert.deepEqual(messaggi, copia);
});
