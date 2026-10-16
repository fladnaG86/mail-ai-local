/**
 * «Invia e ricevi» sta nel nastro, subito dopo «Nuovo Messaggio»: non più come
 * ↻ isolato nella barra del titolo. Lo stesso pulsante serve da Home e da
 * Strumenti, e mentre lavora non si può premere due volte.
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
}

/** Un'app nuova; `sbloccaSync()` fa finire la sincronizzazione in corso. */
async function avvia() {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const sincronizzazioni = [];
  let sblocca = () => {};
  w.__TAURI__ = {
    core: {
      invoke: async (nome, args) => {
        if (nome === "impostazioni_leggi") return { preferenze: {} };
        if (nome === "account_list") return [{ id: ACCOUNT, email: ACCOUNT }];
        if (nome === "mail_sync") {
          sincronizzazioni.push(args);
          await new Promise((r) => { sblocca = r; });
          return { nuovi: 0 };
        }
        if (["cartelle_elenco", "mail_list", "mail_conversazioni", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };
  impostaGlobali(w);
  await main.boot();
  return { doc: w.document, sincronizzazioni, sbloccaSync: () => sblocca() };
}

const attendi = () => new Promise((r) => setImmediate(r));

test("la barra del titolo non ha più il pulsante ↻ isolato", async () => {
  const x = await avvia();
  assert.equal(x.doc.querySelector("#btn-invia-ricevi"), null);
  assert.equal(x.doc.querySelector(".titlebar .titlebar-btn"), null);
});

test("«Invia e ricevi» è il primo pulsante dopo «Nuovo Messaggio»", async () => {
  const x = await avvia();
  const nuovo = x.doc.querySelector('#ribbon-groups [data-rb="mail-new"]');
  assert.ok(nuovo, "premessa: c'è «Nuovo Messaggio»");
  assert.equal(nuovo.nextElementSibling.dataset.rb, "sync");
});

test("«Invia e ricevi» c'è anche nella scheda Strumenti", async () => {
  const x = await avvia();
  x.doc.querySelector('.ribbon-tabs [data-scheda="strumenti"]').click();
  assert.ok(x.doc.querySelector('#ribbon-groups [data-rb="sync"]'));
});

test("il clic sincronizza la casella", async () => {
  const x = await avvia();
  x.doc.querySelector('#ribbon-groups [data-rb="sync"]').click();
  await attendi();
  assert.deepEqual(x.sincronizzazioni, [{ accountId: ACCOUNT }]);
  x.sbloccaSync();
  await attendi();
});

test("mentre lavora il pulsante è in attesa e un secondo clic non fa partire altro", async () => {
  const x = await avvia();
  const sync = x.doc.querySelector('#ribbon-groups [data-rb="sync"]');
  sync.click();
  await attendi();
  assert.ok(sync.classList.contains("rb--in-attesa"), "il pulsante non mostra l'attesa");
  sync.click();
  await attendi();
  assert.equal(x.sincronizzazioni.length, 1, "è partita una seconda sincronizzazione");
  x.sbloccaSync();
  await attendi();
  await attendi();
  assert.equal(sync.classList.contains("rb--in-attesa"), false, "l'attesa non è finita");
});
