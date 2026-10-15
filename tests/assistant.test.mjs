/**
 * Test della logica pura della barra dell'Assistente (logica JS, node --test).
 * Non copre il disegno: quello è verificato con le prove visive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  etichettaDestinazione,
  titoloAzione,
  formattaAzioni,
  messaggioErrore,
} from "../src/views/assistant.js";

test("etichettaDestinazione combina provider e modello", () => {
  assert.equal(etichettaDestinazione("locale", "thinkingcap-27b"), "locale · thinkingcap-27b");
  assert.equal(etichettaDestinazione("cloud", "OpenRouter"), "cloud · OpenRouter");
  // senza modello usa il default del provider
  assert.equal(etichettaDestinazione("cloud"), "cloud · OpenRouter");
  assert.equal(etichettaDestinazione("locale"), "locale · thinkingcap-27b");
});

test("titoloAzione nomea le azioni e aggiunge i messaggi usati", () => {
  assert.equal(titoloAzione("riassumi", 3), "RIASSUNTO · 3 messaggi");
  assert.equal(titoloAzione("azioni", 0), "AZIONI");
  assert.equal(titoloAzione("bozza_risposta", 2), "BOZZA DI RISPOSTA · 2 messaggi");
  assert.equal(titoloAzione("traduci"), "TRADUZIONE");
});

test("formattaAzioni legge il JSON del modello", () => {
  const ok = formattaAzioni('{"azioni":[{"cosa":"inviare la lista","chi":"io","entro":"2026-11-20","fonte":1}],"scadenze_assenti":false}');
  assert.equal(ok.ok, true);
  assert.equal(ok.azioni.length, 1);
  assert.equal(ok.azioni[0].entro, "2026-11-20");

  // con recinzione markdown e testo attorno
  const recinto = formattaAzioni('Ecco:\n```json\n{"azioni":[]}\n```\nfatto.');
  assert.equal(recinto.ok, true);
  assert.equal(recinto.azioni.length, 0);

  // JSON non valido: resta il testo grezzo
  const ko = formattaAzioni("non è JSON");
  assert.equal(ko.ok, false);
  assert.equal(ko.testo, "non è JSON");
});

test("messaggioErrore spiega l'errore del modello locale spento", () => {
  const msg = messaggioErrore("errore di rete verso il modello: connection refused (os error 111)");
  assert.match(msg, /non in esecuzione|Avvia/);
  assert.doesNotMatch(msg, /os error/);
});

test("messaggioErrore spiega thread vuoto e risposta non valida", () => {
  assert.match(messaggioErrore("messaggio non trovato in cache: INBOX/12"), /vuoto|non è più in cache/);
  assert.match(messaggioErrore("risposta non valida: manca choices[0].message.content"), /non è valida/);
  // errore sconosciuto: passa il testo originale
  assert.equal(messaggioErrore("qualcos'altro"), "qualcos'altro");
});
