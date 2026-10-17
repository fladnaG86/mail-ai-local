/**
 * Blocco U3 — la scheda contatto della rubrica mostra e salva tutti i campi:
 * ruolo, indirizzo, email e telefoni in più con etichetta. E modificare un
 * contatto non perde i campi: prima il modulo mandava solo quelli che mostrava,
 * e il kernel (che in modifica riscrive tutto) li cancellava.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let apriRubrica;
let w;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
  w = dom.window;
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.KeyboardEvent = w.KeyboardEvent;
  globalThis.CustomEvent = w.CustomEvent;
  ({ apriRubrica } = await import("../src/views/contatti.js"));
});

const attendi = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

const LUCA = {
  id: 7,
  nome: "Luca",
  cognome: "Bianchi",
  email: "luca@esempiohost.it",
  telefono: "+39 333 1234567",
  azienda: "Esempio Group",
  note: "",
  ruolo: "Responsabile tecnico",
  indirizzo: "Via Roma 1, Milano",
  emailAltre: [{ etichetta: "casa", valore: "lb@esempio.org" }],
  telefoni: [{ etichetta: "lavoro", valore: "+39 02 1234" }],
  origine: "automatico",
};

/** Apre la rubrica con `contatti`; `salvati` raccoglie ciò che arriva a onSalva. */
async function apri(contatti = [LUCA]) {
  w.document.body.replaceChildren();
  const salvati = [];
  apriRubrica({
    onElenco: async () => contatti.map((c) => structuredClone(c)),
    onSalva: async (c) => {
      salvati.push(c);
      return { id: c.id || 99, aggiornato: !!c.id };
    },
  });
  await attendi();
  const doc = w.document;
  const scheda = () => doc.querySelector("#rubrica-scheda");
  return {
    doc,
    salvati,
    scheda,
    modifica: async (id) => {
      doc.querySelector(`.rubrica-riga[data-id="${id}"]`).click();
      doc.querySelector('[data-az="modifica"]').click();
      await attendi();
    },
    nuovo: async () => {
      doc.querySelector('[data-az="nuovo"]').click();
      await attendi();
    },
    campo: (nome) => scheda().querySelector(`[data-campo="${nome}"]`),
    righe: (lista) => [...scheda().querySelectorAll(`[data-lista="${lista}"] .rubrica-recapito`)],
    salva: async () => {
      scheda().querySelector('[data-form="salva"]').click();
      await attendi();
    },
  };
}

test("la scheda mostra ruolo, indirizzo, email e telefoni in più", async () => {
  const x = await apri();
  await x.modifica(7);
  assert.equal(x.campo("ruolo").value, "Responsabile tecnico");
  assert.equal(x.campo("indirizzo").value, "Via Roma 1, Milano");
  const email = x.righe("emailAltre");
  assert.equal(email.length, 1);
  assert.equal(email[0].querySelector("[data-recapito=etichetta]").value, "casa");
  assert.equal(email[0].querySelector("[data-recapito=valore]").value, "lb@esempio.org");
  assert.equal(x.righe("telefoni")[0].querySelector("[data-recapito=valore]").value, "+39 02 1234");
});

test("modificare solo il nome non perde gli altri campi", async () => {
  const x = await apri();
  await x.modifica(7);
  x.campo("nome").value = "Luchino";
  await x.salva();
  const s = x.salvati[0];
  assert.equal(s.nome, "Luchino");
  assert.equal(s.id, 7);
  assert.equal(s.ruolo, "Responsabile tecnico");
  assert.equal(s.indirizzo, "Via Roma 1, Milano");
  assert.deepEqual(s.emailAltre, [{ etichetta: "casa", valore: "lb@esempio.org" }]);
  assert.deepEqual(s.telefoni, [{ etichetta: "lavoro", valore: "+39 02 1234" }]);
});

test("si aggiunge un'altra email con la sua etichetta", async () => {
  const x = await apri();
  await x.modifica(7);
  x.scheda().querySelector('[data-aggiungi="emailAltre"]').click();
  const nuova = x.righe("emailAltre").at(-1);
  nuova.querySelector("[data-recapito=etichetta]").value = "lavoro";
  nuova.querySelector("[data-recapito=valore]").value = "luca.bianchi@esempiogroup.it";
  await x.salva();
  assert.deepEqual(x.salvati[0].emailAltre, [
    { etichetta: "casa", valore: "lb@esempio.org" },
    { etichetta: "lavoro", valore: "luca.bianchi@esempiogroup.it" },
  ]);
});

test("si toglie un telefono in più", async () => {
  const x = await apri();
  await x.modifica(7);
  x.righe("telefoni")[0].querySelector("[data-togli]").click();
  await x.salva();
  assert.deepEqual(x.salvati[0].telefoni, []);
});

test("le righe lasciate vuote non si salvano", async () => {
  const x = await apri();
  await x.nuovo();
  x.campo("email").value = "anna@esempiohost.it";
  x.scheda().querySelector('[data-aggiungi="telefoni"]').click();
  await x.salva();
  assert.deepEqual(x.salvati[0].telefoni, []);
  assert.equal(x.salvati[0].id, null);
});

test("salvando a mano un contatto aggiunto da sé, l'origine resta al kernel", async () => {
  const x = await apri();
  await x.modifica(7);
  await x.salva();
  // L'origine viaggia com'era: è il kernel a decidere (un salvataggio per id la mantiene).
  assert.equal(x.salvati[0].origine, "automatico");
});
