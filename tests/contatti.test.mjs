/**
 * Test della logica pura della rubrica (node --test): formattazione del
 * suggerimento, filtro e ordinamento per pertinenza, testo di conferma
 * dell'eliminazione. Il disegno è verificato con le prove visive (`?view=…`);
 * qui si collauda ciò che non tocca il DOM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  nomeContatto,
  formattaSuggerimento,
  filtroSuggerimenti,
  testoConfermaEliminazione,
  scomponiMittente,
  testoImportazione,
  LIMITE_SUGGERIMENTI,
} from "../src/views/contatti.js";

test("il suggerimento è «Nome Cognome <indirizzo>»", () => {
  assert.equal(
    formattaSuggerimento({ nome: "Mario Rossi", email: "mario.rossi@example.it" }),
    "Mario Rossi <mario.rossi@example.it>",
  );
});

test("col solo indirizzo il suggerimento è il solo indirizzo", () => {
  assert.equal(formattaSuggerimento({ nome: "", email: "info@beta.it" }), "info@beta.it");
  assert.equal(formattaSuggerimento({ email: "solo@example.it" }), "solo@example.it");
  // Nome uguale all'indirizzo: non si raddoppia.
  assert.equal(formattaSuggerimento({ nome: "a@b.it", email: "a@b.it" }), "a@b.it");
});

test("nomeContatto mette insieme nome e cognome, o ripiega sull'indirizzo", () => {
  assert.equal(nomeContatto({ nome: "Anna", cognome: "Verdi", email: "anna@x.it" }), "Anna Verdi");
  assert.equal(nomeContatto({ nome: "", cognome: "", email: "anna@x.it" }), "anna@x.it");
  assert.equal(nomeContatto({ nome: "Anna", email: "anna@x.it" }), "Anna");
});

test("il filtro distingue la corrispondenza all'inizio da quella interna", () => {
  const elenco = [
    { nome: "Marco Rossi", email: "info@rossi.it" }, // "ross" interno all'indirizzo
    { nome: "Rossella Bianchi", email: "r.bianchi@example.it" }, // inizio del nome
    { nome: "Altro", email: "rossana@example.it" }, // inizio dell'indirizzo
  ];
  const esito = filtroSuggerimenti(elenco, "ross", 10);
  const email = esito.map((s) => s.email);
  // Prima l'indirizzo che inizia per "ross", poi il nome che inizia per "ross",
  // infine la corrispondenza interna.
  assert.equal(email[0], "rossana@example.it");
  assert.equal(email[1], "r.bianchi@example.it");
  assert.equal(email[2], "info@rossi.it");
});

test("il filtro non inventa riquadri: nessuna corrispondenza, elenco vuoto", () => {
  const elenco = [{ nome: "Anna", email: "anna@example.it" }];
  assert.deepEqual(filtroSuggerimenti(elenco, "zzz", 10), []);
  assert.deepEqual(filtroSuggerimenti([], "a", 10), []);
});

test("il filtro deduplica per indirizzo e rispetta il limite", () => {
  const elenco = [
    { nome: "Luca", email: "luca.bianchi@esempio.it" },
    { nome: "Luca (doppione)", email: "LUCA.BIANCHI@esempio.it" },
    { nome: "Anna", email: "anna@esempio.it" },
  ];
  const esito = filtroSuggerimenti(elenco, "a", 10);
  assert.equal(esito.length, 2, "lo stesso indirizzo non compare due volte");
  // A parità di punteggio (entrambi gli indirizzi contengono «a») decide il
  // nome: Anna prima di Luca.
  assert.equal(esito[0].email, "anna@esempio.it");
  // Con un limite stretto si taglia.
  assert.equal(filtroSuggerimenti(elenco, "a", 1).length, 1);
  assert.equal(LIMITE_SUGGERIMENTI >= 1, true);
});

test("il testo vuoto restituisce i primi suggerimenti in ordine di nome", () => {
  const elenco = [
    { nome: "Zeta", email: "z@example.it" },
    { nome: "Alfa", email: "a@example.it" },
  ];
  const esito = filtroSuggerimenti(elenco, "", 10);
  assert.deepEqual(esito.map((s) => s.nome), ["Alfa", "Zeta"]);
});

test("il testo di conferma dell'eliminazione cita il contatto", () => {
  const t = testoConfermaEliminazione({ nome: "Anna Verdi", email: "anna@example.it" });
  assert.match(t, /Eliminare/);
  assert.match(t, /Anna Verdi <anna@example\.it>/);
  assert.match(t, /non si possono recuperare/);
  // Con il solo indirizzo.
  const t2 = testoConfermaEliminazione({ email: "info@beta.it" });
  assert.match(t2, /info@beta\.it/);
});

test("scomponiMittente divide nome e indirizzo", () => {
  assert.deepEqual(scomponiMittente("Luca Bianchi <luca.bianchi@esempio.it>"), {
    nome: "Luca",
    cognome: "Bianchi",
    email: "luca.bianchi@esempio.it",
  });
  // Solo indirizzo: nessun nome inventato.
  assert.deepEqual(scomponiMittente("noreply@dhl.com"), {
    nome: "",
    cognome: "",
    email: "noreply@dhl.com",
  });
  assert.deepEqual(scomponiMittente(""), { nome: "", cognome: "", email: "" });
});

test("il testo dell'importazione dichiara i campi ignorati", () => {
  const t = testoImportazione({
    importati: 2,
    aggiornati: 1,
    senzaEmail: 1,
    ignorati: ["ADR", "BDAY"],
  });
  assert.match(t, /2 aggiunti/);
  assert.match(t, /1 aggiornati/);
  assert.match(t, /1 scartati/);
  assert.match(t, /ADR, BDAY/);
});
