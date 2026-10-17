/**
 * Blocco U5 — aggiunta automatica nell'interfaccia: la preferenza nel pannello
 * «Contatti» (attiva se manca) e, in rubrica, i contatti aggiunti da sé si
 * riconoscono e si filtrano per rivederli o eliminarli.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let pannello;
let contatti;
let w;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
  w = dom.window;
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.Event = w.Event;
  globalThis.KeyboardEvent = w.KeyboardEvent;
  globalThis.CustomEvent = w.CustomEvent;
  pannello = await import("../src/views/contatti-pannello.js");
  contatti = await import("../src/views/contatti.js");
});

const attendi = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

// --- pannello «Contatti» --------------------------------------------------------

async function apriPannello(preferenze) {
  w.document.body.replaceChildren();
  const salvate = [];
  pannello.apriPannelloContatti({ preferenze, onSalva: async (imp) => salvate.push(imp.preferenze) });
  await attendi();
  return { casella: w.document.querySelector("#q-auto"), salva: () => w.document.querySelector("#q-salva").click(), salvate };
}

test("senza preferenza salvata l'aggiunta automatica risulta attiva", async () => {
  const x = await apriPannello({});
  assert.ok(x.casella, "la casella c'è");
  assert.equal(x.casella.checked, true);
});

test("la scelta si salva nelle preferenze", async () => {
  const x = await apriPannello({ rubricaAggiuntaAutomatica: true });
  x.casella.checked = false;
  x.salva();
  await attendi();
  assert.equal(x.salvate[0].rubricaAggiuntaAutomatica, false);
});

test("spenta resta spenta alla riapertura", async () => {
  const x = await apriPannello({ rubricaAggiuntaAutomatica: false });
  assert.equal(x.casella.checked, false);
});

// --- rubrica --------------------------------------------------------------------

const ELENCO = [
  { id: 1, nome: "Luca", cognome: "Bianchi", email: "luca@esempiohost.it", origine: "" },
  { id: 2, nome: "Anna", cognome: "Verdi", email: "anna@esempiohost.it", origine: "automatico" },
];

async function apriRubrica() {
  w.document.body.replaceChildren();
  contatti.apriRubrica({ onElenco: async () => structuredClone(ELENCO) });
  await attendi();
  const doc = w.document;
  return {
    righe: () => [...doc.querySelectorAll(".rubrica-riga")].map((r) => r.dataset.id),
    riga: (id) => doc.querySelector(`.rubrica-riga[data-id="${id}"]`),
    filtro: doc.querySelector("#rubrica-solo-auto"),
  };
}

test("in rubrica un contatto aggiunto da sé si riconosce", async () => {
  const x = await apriRubrica();
  assert.match(x.riga(2).textContent, /aggiunto da sé/);
  assert.doesNotMatch(x.riga(1).textContent, /aggiunto da sé/);
});

test("il filtro mostra solo i contatti aggiunti automaticamente", async () => {
  const x = await apriRubrica();
  assert.equal(x.righe().length, 2, "premessa: senza filtro si vedono tutti");
  x.filtro.checked = true;
  x.filtro.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.deepEqual(x.righe(), ["2"]);
});
