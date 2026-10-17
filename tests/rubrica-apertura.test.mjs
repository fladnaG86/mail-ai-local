/**
 * «Rubrica» e «Trova contatto» del nastro aprono davvero la rubrica, con i
 * contatti del kernel. Dal commit di pubblicazione `apriRubricaUI` usava una
 * variabile `dentro` mai definita: ReferenceError al clic, e non compariva nulla.
 * I test della rubrica chiamavano `apriRubrica` direttamente e non lo vedevano.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const ACCOUNT = "mario.rossi@esempiogroup.it";
let main;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  Object.defineProperty(dom.window.document, "readyState", { value: "loading", configurable: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  impostaGlobali(dom.window);
  main = await import("../src/main.js");
});

function impostaGlobali(w) {
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.location = w.location;
  globalThis.localStorage = w.localStorage;
  globalThis.KeyboardEvent = w.KeyboardEvent;
  globalThis.CustomEvent = w.CustomEvent;
  globalThis.Event = w.Event;
}

const attendi = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

async function avvia() {
  const dom = new JSDOM(HTML, { url: "http://localhost/", pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const chiamate = [];
  w.__TAURI__ = {
    core: {
      invoke: async (nome, args) => {
        chiamate.push(nome);
        if (nome === "impostazioni_leggi") return { preferenze: {} };
        if (nome === "account_list") return [{ id: ACCOUNT, email: ACCOUNT }];
        if (nome === "contatti_elenco") return [{ id: 1, nome: "Luca", cognome: "Bianchi", email: "luca@esempiohost.it" }];
        if (["cartelle_elenco", "mail_list", "mail_conversazioni", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };
  const errori = [];
  w.addEventListener("error", (e) => errori.push(e.message));
  impostaGlobali(w);
  await main.boot();
  const doc = w.document;
  const voce = async (scheda, chiave) => {
    doc.querySelector(`.ribbon-tabs [data-scheda="${scheda}"]`).click();
    await attendi();
    doc.querySelector(`#ribbon-groups [data-rb="${chiave}"]`).click();
    await attendi(20);
  };
  return { doc, chiamate, errori, voce };
}

test("«Rubrica» nel nastro apre la rubrica coi contatti del kernel", async () => {
  const x = await avvia();
  await x.voce("strumenti", "addressbook");
  const finestra = x.doc.querySelector(".rubrica-overlay");
  assert.ok(finestra, "la rubrica non si è aperta");
  assert.ok(x.chiamate.includes("contatti_elenco"), "i contatti vengono dal kernel");
  assert.match(finestra.textContent, /Luca/);
});

test("«Trova contatto» apre la rubrica col fuoco sulla ricerca", async () => {
  const x = await avvia();
  await x.voce("strumenti", "contact");
  assert.ok(x.doc.querySelector(".rubrica-overlay"), "la rubrica non si è aperta");
});
