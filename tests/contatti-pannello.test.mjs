/**
 * Test della logica pura del pannello «Contatti» (blocco Q, node --test):
 * normalizzazione delle preferenze (ordinamento della rubrica, formato del nome
 * visualizzato, numero di suggerimenti), comparatori di ordinamento della
 * rubrica e formattazione del nome. Il disegno del pannello e l'effetto reale
 * (ordine della rubrica, nome nelle righe, limite dei suggerimenti) si
 * verificano con la prova `?view=impostazioni-contatti` e nel pannello.
 *
 * Le etichette delle voci ordine sono del riferimento
 * (`Preferences.Panes.AddressBook.strings`: «Ordina i risultati nel riquadro
 * Ricerca contatti per:», «Nome», «Cognome»); «Azienda» è un campo del nostro
 * modello, con l'etichetta già in uso nella rubrica.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ORDINAMENTI_RUBRICA,
  ORDINAMENTO_RUBRICA_DEFAULT,
  FORMATI_NOME_CONTATTO,
  FORMATO_NOME_DEFAULT,
  LIMITE_SUGGERIMENTI,
  LIMITE_SUGGERIMENTI_MIN,
  LIMITE_SUGGERIMENTI_MAX,
  normOrdinamento,
  normFormatoNome,
  normSuggerimentiLimite,
  nomeVisualizzato,
  ordinaContatti,
  anteprimaFormato,
} from "../src/views/contatti.js";
import { VOCI_NON_DISPONIBILI } from "../src/views/contatti-pannello.js";

const CONTATTI = [
  { id: 1, nome: "Luca", cognome: "Bianchi", email: "luca.bianchi@esempiogroup.it", azienda: "Azienda Esempio" },
  { id: 2, nome: "Anna", cognome: "Verdi", email: "anna.verdi@example.it", azienda: "" },
  { id: 3, nome: "", cognome: "", email: "info@beta.it", azienda: "Beta" },
  { id: 4, nome: "Mario", cognome: "Rossi", email: "mario.rossi@esempio.it", azienda: "Azienda Esempio" },
];

test("le voci dell'ordinamento sono quelle del riferimento, con la loro etichetta", () => {
  assert.deepEqual(
    ORDINAMENTI_RUBRICA.map((o) => o.etichetta),
    ["Nome", "Cognome", "Azienda"],
  );
  assert.equal(ORDINAMENTO_RUBRICA_DEFAULT, "nome");
});

test("i formati del nome coprono il nome, il cognome e l'azienda", () => {
  assert.deepEqual(
    FORMATI_NOME_CONTATTO.map((f) => f.id),
    ["nome_cognome", "cognome_nome", "azienda"],
  );
  assert.equal(FORMATO_NOME_DEFAULT, "nome_cognome");
});

test("normOrdinamento: valore ignoto → default", () => {
  assert.equal(normOrdinamento("cognome"), "cognome");
  assert.equal(normOrdinamento("azienda"), "azienda");
  assert.equal(normOrdinamento("boh"), ORDINAMENTO_RUBRICA_DEFAULT);
  assert.equal(normOrdinamento(undefined), ORDINAMENTO_RUBRICA_DEFAULT);
});

test("normFormatoNome: valore ignoto → default", () => {
  assert.equal(normFormatoNome("cognome_nome"), "cognome_nome");
  assert.equal(normFormatoNome("azienda"), "azienda");
  assert.equal(normFormatoNome("fucsia"), FORMATO_NOME_DEFAULT);
});

test("normSuggerimentiLimite: fuori intervallo → default, dentro → arrotondato", () => {
  assert.equal(normSuggerimentiLimite(8), 8);
  assert.equal(normSuggerimentiLimite(LIMITE_SUGGERIMENTI_MIN), LIMITE_SUGGERIMENTI_MIN);
  assert.equal(normSuggerimentiLimite(LIMITE_SUGGERIMENTI_MAX), LIMITE_SUGGERIMENTI_MAX);
  assert.equal(normSuggerimentiLimite(999), LIMITE_SUGGERIMENTI, "sopra il massimo → default");
  assert.equal(normSuggerimentiLimite(2), LIMITE_SUGGERIMENTI, "sotto il minimo → default");
  assert.equal(normSuggerimentiLimite(0), LIMITE_SUGGERIMENTI);
  assert.equal(normSuggerimentiLimite("boh"), LIMITE_SUGGERIMENTI, "non numerico → default");
  assert.equal(normSuggerimentiLimite(undefined), LIMITE_SUGGERIMENTI);
  assert.equal(normSuggerimentiLimite(7.6), 8, "arrotonda");
});

test("nomeVisualizzato segue il formato scelto, con ripieghi mai vuoti", () => {
  const c = CONTATTI[0];
  assert.equal(nomeVisualizzato(c, "nome_cognome"), "Luca Bianchi");
  assert.equal(nomeVisualizzato(c, "cognome_nome"), "Bianchi Luca");
  assert.equal(nomeVisualizzato(c, "azienda"), "Azienda Esempio");
  // Senza nome: l'azienda, poi l'indirizzo (mai una riga vuota).
  assert.equal(nomeVisualizzato(CONTATTI[2], "nome_cognome"), "Beta");
  assert.equal(nomeVisualizzato(CONTATTI[2], "azienda"), "Beta");
  assert.equal(nomeVisualizzato({ email: "solo@x.it" }, "nome_cognome"), "solo@x.it");
});

test("ordinaContatti per nome, cognome e azienda (stabile, senza mutare l'originale)", () => {
  const copia = JSON.parse(JSON.stringify(CONTATTI));
  const perNome = ordinaContatti(CONTATTI, "nome");
  assert.deepEqual(perNome.map((c) => c.id), [2, 1, 4, 3], "per nome: senza nome in fondo");
  const perCognome = ordinaContatti(CONTATTI, "cognome");
  assert.deepEqual(perCognome.map((c) => c.id), [1, 4, 2, 3], "per cognome");
  const perAzienda = ordinaContatti(CONTATTI, "azienda");
  assert.deepEqual(perAzienda.map((c) => c.id), [1, 4, 3, 2], "per azienda; chi non ne ha va in fondo");
  assert.deepEqual(CONTATTI, copia, "l'originale non cambia");
});

test("ordinaContatti con campo ignoto ricade su «nome»", () => {
  assert.deepEqual(
    ordinaContatti(CONTATTI, "boh").map((c) => c.id),
    ordinaContatti(CONTATTI, "nome").map((c) => c.id),
  );
});

test("anteprimaFormato mostra nome e indirizzo secondo il formato", () => {
  assert.equal(
    anteprimaFormato("nome_cognome", CONTATTI[0]),
    "Luca Bianchi <luca.bianchi@esempiogroup.it>",
  );
  assert.equal(anteprimaFormato("cognome_nome", CONTATTI[0]), "Bianchi Luca <luca.bianchi@esempiogroup.it>");
  // Senza nome: resta il solo indirizzo (niente intestazione vuota).
  assert.equal(anteprimaFormato("nome_cognome", { email: "info@beta.it" }), "info@beta.it");
});

test("le voci dichiarate non disponibili portano una ragione", () => {
  assert.ok(Array.isArray(VOCI_NON_DISPONIBILI) && VOCI_NON_DISPONIBILI.length >= 1);
  for (const v of VOCI_NON_DISPONIBILI) {
    assert.equal(typeof v.etichetta, "string");
    assert.equal(typeof v.motivo, "string");
    assert.ok(v.etichetta.length > 0 && v.motivo.length > 0, "mai un pulsante muto");
  }
});
