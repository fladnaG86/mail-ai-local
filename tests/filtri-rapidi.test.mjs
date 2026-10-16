/**
 * Filtri rapidi nella barra superiore: «Tutti» e «Non letti». Sono lo stesso
 * filtro della voce «Filtra posta elettronica» del nastro, a portata di clic.
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

const riga = (uid, seen) => ({
  uid, folder: "INBOX", account: ACCOUNT, from: "Luca Bianchi", subject: `Messaggio ${uid}`,
  date: 1_760_000_000 + uid, seen, hasAttachments: false,
});

async function avvia() {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.__TAURI__ = {
    core: {
      invoke: async (nome) => {
        if (nome === "impostazioni_leggi") return { preferenze: { raggruppaConversazioni: false } };
        if (nome === "account_list") return [{ id: ACCOUNT, email: ACCOUNT }];
        if (nome === "mail_list") return [riga(1, false), riga(2, true)];
        if (["cartelle_elenco", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };
  impostaGlobali(w);
  await main.boot();
  return w.document;
}

const righe = (doc) => [...doc.querySelectorAll("#message-list .row")].map((r) => r.dataset.uid);
const bottone = (doc, filtro) => doc.querySelector(`.filtro-btn[data-filtro="${filtro}"]`);

test("la barra superiore ha «Tutti» e «Non letti», con «Tutti» attivo all'inizio", async () => {
  const doc = await avvia();
  assert.equal(bottone(doc, "tutti").getAttribute("aria-pressed"), "true");
  assert.equal(bottone(doc, "non-letti").getAttribute("aria-pressed"), "false");
  assert.deepEqual(righe(doc), ["2", "1"]);
});

test("«Non letti» lascia in lista solo i messaggi non letti", async () => {
  const doc = await avvia();
  bottone(doc, "non-letti").click();
  assert.deepEqual(righe(doc), ["1"]);
  assert.equal(bottone(doc, "non-letti").getAttribute("aria-pressed"), "true");
  assert.equal(bottone(doc, "tutti").getAttribute("aria-pressed"), "false");
});

test("«Tutti» toglie il filtro", async () => {
  const doc = await avvia();
  bottone(doc, "non-letti").click();
  bottone(doc, "tutti").click();
  assert.deepEqual(righe(doc), ["2", "1"]);
  assert.equal(bottone(doc, "tutti").getAttribute("aria-pressed"), "true");
});

test("la voce «Filtra» del nastro segue lo stesso filtro", async () => {
  const doc = await avvia();
  bottone(doc, "non-letti").click();
  assert.match(doc.querySelector('[data-rb="filter"] .lb').textContent, /Non letti/i);
});
