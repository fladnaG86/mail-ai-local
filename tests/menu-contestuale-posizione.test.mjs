/**
 * Il menu del clic destro si apre dove si è fatto clic, come in macOS e in
 * Outlook. Prima l'evento partiva dalla barra laterale (o dalla lista) intera:
 * il menu si ancorava a tutto il pannello, non stava sotto il suo bordo e
 * veniva ribaltato in cima allo schermo.
 *
 * jsdom non fa layout: misure di finestra e menu sono simulate.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const ACCOUNT = "mario.rossi@esempiogroup.it";
const GRUPPO = {
  account: ACCOUNT,
  email: ACCOUNT,
  predefinito: true,
  cartelle: [
    { nome: "INBOX", preferita: false, nonLetti: 1 },
    { nome: "INBOX.Drafts", preferita: false, nonLetti: 0 },
  ],
};
const RIGA = {
  uid: "1", account: ACCOUNT, folder: "INBOX", from: "Luca Bianchi <luca@esempiohost.it>",
  subject: "Ciao", date: 1, seen: false, hasAttachments: false,
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
}

async function avvia(preferenze = { raggruppaConversazioni: false }) {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(w, "innerWidth", { value: 1400, configurable: true });
  Object.defineProperty(w, "innerHeight", { value: 900, configurable: true });
  // Il menu misura 200×150: abbastanza per vedere se sta sotto il cursore o sopra.
  Object.defineProperty(w.HTMLElement.prototype, "offsetWidth", { get() { return this.classList.contains("rb-menu") ? 200 : 0; }, configurable: true });
  Object.defineProperty(w.HTMLElement.prototype, "offsetHeight", { get() { return this.classList.contains("rb-menu") ? 150 : 0; }, configurable: true });
  w.__TAURI__ = {
    core: {
      invoke: async (nome) => {
        if (nome === "impostazioni_leggi") return { preferenze };
        if (nome === "account_list") return [{ id: ACCOUNT, email: ACCOUNT }];
        if (nome === "cartelle_elenco") return [GRUPPO];
        if (nome === "mail_list") return [RIGA];
        if (nome === "mail_conversazioni") {
          return [{ chiave: "c1", numero: 1, nonLetti: 1, from: RIGA.from, subject: RIGA.subject, date: 1, seen: false, hasAttachments: false, messaggi: [RIGA] }];
        }
        if (["inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };
  impostaGlobali(w);
  await main.boot();
  const doc = w.document;
  const destro = (nodo, x, y) =>
    nodo.dispatchEvent(new w.MouseEvent("contextmenu", { clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const menu = () => doc.querySelector(".rb-menu");
  return { doc, destro, menu };
}

const cartella = (doc, nome) => [...doc.querySelectorAll("#sidebar .folder")].find((n) => n.textContent.includes(nome));

test("il menu di una cartella si apre sotto il cursore, non in cima", async () => {
  const x = await avvia();
  const nodo = cartella(x.doc, "INBOX.Drafts");
  assert.ok(nodo, "premessa: la cartella è in barra laterale");
  x.destro(nodo, 120, 320);
  assert.ok(x.menu(), "il menu non si è aperto");
  assert.equal(x.menu().style.left, "120px");
  assert.equal(x.menu().style.top, "322px");
});

test("vicino al fondo dello schermo il menu della cartella si apre sopra il cursore", async () => {
  const x = await avvia();
  x.destro(cartella(x.doc, "INBOX.Drafts"), 120, 850);
  assert.equal(x.menu().style.top, `${850 - 150 - 2}px`);
});

test("il menu di un messaggio si apre sotto il cursore", async () => {
  const x = await avvia();
  const riga = x.doc.querySelector("#message-list .row[data-uid='1']");
  assert.ok(riga, "premessa: la riga c'è");
  x.destro(riga, 700, 260);
  assert.equal(x.menu().style.left, "700px");
  assert.equal(x.menu().style.top, "262px");
});

test("il menu di una conversazione si apre sotto il cursore", async () => {
  const x = await avvia({});
  const intestazione = x.doc.querySelector("#message-list .row--conv");
  assert.ok(intestazione, "premessa: la conversazione c'è");
  x.destro(intestazione, 650, 240);
  assert.equal(x.menu().style.left, "650px");
  assert.equal(x.menu().style.top, "242px");
});
