/**
 * Blocco U4 — gruppi nell'interfaccia: nei campi A/Cc un gruppo suggerito si
 * espande negli indirizzi dei membri; la finestra «Gruppi» li crea, li
 * modifica e li elimina (con conferma, mai un'eliminazione muta).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let contatti;
let gruppi;
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
  gruppi = await import("../src/views/gruppi.js");
});

const attendi = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

const UFFICIO = { nome: "Ufficio tecnico (2)", email: "", origine: "gruppo", membri: ["luca@esempiohost.it", "anna@esempiohost.it"] };

// --- campi A/Cc -----------------------------------------------------------------

async function scrivi(valoreIniziale, testo) {
  w.document.body.replaceChildren();
  const input = w.document.createElement("input");
  w.document.body.append(input);
  contatti.collegaCampoDestinatario(input, { suggerire: async () => [UFFICIO] });
  input.value = valoreIniziale + testo;
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  await attendi();
  return input;
}

test("un gruppo fra i suggerimenti si riconosce come gruppo", async () => {
  await scrivi("", "uff");
  const voce = w.document.querySelector(".cmp-sugg-voce");
  assert.match(voce.textContent, /Ufficio tecnico \(2\)/);
  assert.match(voce.textContent, /gruppo/);
  assert.doesNotMatch(voce.textContent, /<>/, "un gruppo non ha un indirizzo suo");
});

test("scegliere un gruppo inserisce gli indirizzi dei membri", async () => {
  const input = await scrivi("", "uff");
  w.document.querySelector(".cmp-sugg-voce").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  assert.equal(input.value, "luca@esempiohost.it; anna@esempiohost.it; ");
});

test("i destinatari già scritti restano prima dei membri del gruppo", async () => {
  const input = await scrivi("marco@esempiohost.it; ", "uff");
  w.document.querySelector(".cmp-sugg-voce").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  assert.equal(input.value, "marco@esempiohost.it; luca@esempiohost.it; anna@esempiohost.it; ");
});

// --- finestra Gruppi ------------------------------------------------------------

async function apriFinestra(elenco = [{ id: 1, nome: "Tecnici", membri: ["luca@esempiohost.it"] }]) {
  w.document.body.replaceChildren();
  const salvati = [];
  const eliminati = [];
  gruppi.apriGruppi({
    onElenco: async () => structuredClone(elenco),
    onSalva: async (g) => {
      salvati.push(g);
      return g.id || 2;
    },
    onElimina: async (id) => {
      eliminati.push(id);
      return 1;
    },
  });
  await attendi();
  const doc = w.document;
  return {
    doc,
    salvati,
    eliminati,
    riga: (id) => doc.querySelector(`.rubrica-riga[data-id="${id}"]`),
    az: (nome) => doc.querySelector(`[data-az="${nome}"]`),
    nome: () => doc.querySelector('[data-gruppo="nome"]'),
    membri: () => doc.querySelector('[data-gruppo="membri"]'),
    salva: async () => {
      doc.querySelector('[data-form="salva"]').click();
      await attendi();
    },
  };
}

test("la finestra elenca i gruppi col numero dei membri", async () => {
  const x = await apriFinestra();
  assert.match(x.riga(1).textContent, /Tecnici/);
  assert.match(x.riga(1).textContent, /1 membro/);
});

test("un gruppo nuovo si salva con i membri scritti uno per riga, virgola o punto e virgola", async () => {
  const x = await apriFinestra([]);
  x.az("nuovo").click();
  await attendi();
  x.nome().value = "Ufficio tecnico";
  x.membri().value = "luca@esempiohost.it\nanna@esempiohost.it, marco@esempiohost.it;  \n";
  await x.salva();
  assert.deepEqual(x.salvati, [{ id: null, nome: "Ufficio tecnico", membri: ["luca@esempiohost.it", "anna@esempiohost.it", "marco@esempiohost.it"] }]);
});

test("modificando un gruppo si parte dai suoi dati", async () => {
  const x = await apriFinestra();
  x.riga(1).click();
  x.az("modifica").click();
  await attendi();
  assert.equal(x.nome().value, "Tecnici");
  assert.equal(x.membri().value, "luca@esempiohost.it");
  x.membri().value += "\nanna@esempiohost.it";
  await x.salva();
  assert.deepEqual(x.salvati[0], { id: 1, nome: "Tecnici", membri: ["luca@esempiohost.it", "anna@esempiohost.it"] });
});

test("un indirizzo scritto male si segnala e il gruppo non si salva", async () => {
  const x = await apriFinestra([]);
  x.az("nuovo").click();
  await attendi();
  x.nome().value = "Prova";
  x.membri().value = "luca@esempiohost.it\nnon-un-indirizzo";
  await x.salva();
  assert.equal(x.salvati.length, 0);
  assert.match(x.doc.querySelector(".rubrica-nota").textContent, /non-un-indirizzo/);
});

test("eliminare un gruppo chiede conferma", async () => {
  const x = await apriFinestra();
  x.riga(1).click();
  x.az("elimina").click();
  await attendi();
  assert.equal(x.eliminati.length, 0, "senza conferma non si elimina");
  x.doc.querySelector('[data-conf="si"]').click();
  await attendi();
  assert.deepEqual(x.eliminati, [1]);
});
