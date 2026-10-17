/**
 * Blocco U6 — «Importa da Contatti di macOS» nella rubrica: chiama il kernel,
 * dice com'è andata (aggiunti, aggiornati, saltati) e ricarica l'elenco. Fuori
 * dall'app lo dichiara invece di restare muto.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

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
  contatti = await import("../src/views/contatti.js");
});

const attendi = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

test("il pulsante importa dai Contatti di macOS, riepiloga e ricarica", async () => {
  w.document.body.replaceChildren();
  let elenchi = 0;
  let importazioni = 0;
  contatti.apriRubrica({
    onElenco: async () => {
      elenchi += 1;
      return [];
    },
    onImportaMacos: async () => {
      importazioni += 1;
      return { schede: 3, importati: 2, aggiornati: 1, senzaEmail: 0, ignorati: [], conflitti: [] };
    },
  });
  await attendi();
  const prima = elenchi;
  w.document.querySelector('[data-az="importa-macos"]').click();
  await attendi();
  assert.equal(importazioni, 1);
  assert.match(w.document.querySelector(".rubrica-nota").textContent, /2 aggiunti, 1 aggiornati/);
  assert.ok(elenchi > prima, "dopo l'importazione l'elenco si ricarica");
});

test("un errore del kernel (es. permesso negato) si mostra com'è", async () => {
  w.document.body.replaceChildren();
  contatti.apriRubrica({
    onElenco: async () => [],
    onImportaMacos: async () => {
      throw new Error("macOS non permette a Outlook AI di leggere Contatti: concedilo in Impostazioni di Sistema");
    },
  });
  await attendi();
  w.document.querySelector('[data-az="importa-macos"]').click();
  await attendi();
  const nota = w.document.querySelector(".rubrica-nota");
  assert.match(nota.textContent, /Impostazioni di Sistema/);
  assert.ok(nota.classList.contains("rubrica-nota--errore"));
});

test("fuori dall'app il pulsante dichiara che l'importazione richiede l'app", async () => {
  w.document.body.replaceChildren();
  contatti.apriRubrica({});
  await attendi();
  w.document.querySelector('[data-az="importa-macos"]').click();
  await attendi();
  assert.match(w.document.querySelector(".rubrica-nota").textContent, /app/);
});
