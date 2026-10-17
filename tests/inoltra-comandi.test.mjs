/**
 * «Inoltra» dal nastro e dal menu del clic destro apre la finestra di
 * composizione con l'oggetto «I: …». Dal commit di pubblicazione entrambi
 * chiamavano `apriInoltra`, che non esiste (la funzione è `apriInoltro`):
 * ReferenceError e nessuna finestra. Trovato cliccando tutte le voci del nastro.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const ACCOUNT = "mario.rossi@esempiogroup.it";
const RIGA = {
  uid: "1", account: ACCOUNT, folder: "INBOX", from: "Luca Bianchi <luca@esempiohost.it>",
  subject: "Preventivo", date: 1_760_000_000, seen: true, hasAttachments: false,
};
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

const attendi = async (n = 20) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

async function avvia() {
  const dom = new JSDOM(HTML, { url: "http://localhost/", pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.__TAURI__ = {
    core: {
      invoke: async (nome) => {
        if (nome === "impostazioni_leggi") return { preferenze: { raggruppaConversazioni: false } };
        if (nome === "account_list") return [{ id: ACCOUNT, email: ACCOUNT }];
        if (nome === "mail_list") return [RIGA];
        if (nome === "mail_body") return { html: "<p>Testo</p>", text: "Testo", attachments: [] };
        if (["cartelle_elenco", "mail_conversazioni", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };
  impostaGlobali(w);
  await main.boot();
  await attendi();
  return { w, doc: w.document };
}

test("«Inoltra» nel nastro apre la composizione dell'inoltro", async () => {
  const x = await avvia();
  x.doc.querySelector('#ribbon-groups [data-rb="forward"]').click();
  await attendi();
  const finestra = x.doc.querySelector(".compose-overlay");
  assert.ok(finestra, "la finestra di composizione non si è aperta");
  const oggetti = [...finestra.querySelectorAll("input")].map((i) => i.value);
  assert.ok(oggetti.some((v) => /I: Preventivo/.test(v)), `oggetto atteso «I: Preventivo», campi: ${oggetti.join(" | ")}`);
});

test("«Inoltra» dal clic destro sul messaggio apre la composizione dell'inoltro", async () => {
  const x = await avvia();
  const riga = x.doc.querySelector('#message-list .row[data-uid="1"]');
  riga.dispatchEvent(new x.w.MouseEvent("contextmenu", { clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
  const voce = [...x.doc.querySelectorAll(".rb-menu .rb-menu-voce")].find((b) => b.textContent.trim().endsWith("Inoltra"));
  assert.ok(voce, "premessa: la voce «Inoltra» è nel menu");
  voce.click();
  await attendi();
  assert.ok(x.doc.querySelector(".compose-overlay"), "la finestra di composizione non si è aperta");
});
