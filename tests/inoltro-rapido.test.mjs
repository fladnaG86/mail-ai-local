/**
 * «Inoltro rapido» nella barra dell'Assistente: si scrive un indirizzo e si
 * preme Invio; si apre l'inoltro del messaggio già con quel destinatario. Non
 * parte nessuna mail da sola: l'ultimo passo, Invia, resta all'utente.
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

async function avvia() {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const invocazioni = [];
  w.__TAURI__ = {
    core: {
      invoke: async (nome, args) => {
        invocazioni.push(nome);
        if (nome === "impostazioni_leggi") return { preferenze: { raggruppaConversazioni: false } };
        if (nome === "account_list") return [{ id: ACCOUNT, email: ACCOUNT }];
        if (nome === "mail_list") {
          return [{ uid: 1, folder: "INBOX", account: ACCOUNT, from: "Luca Bianchi <luca.bianchi@esempiogroup.it>", subject: "Piano manutenzione Q4", date: 1_760_000_000, seen: true, hasAttachments: false }];
        }
        if (nome === "mail_body") return { html: "<p>Corpo</p>", text: "Corpo", attachments: [] };
        if (["cartelle_elenco", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        void args;
        return null;
      },
    },
  };
  impostaGlobali(w);
  await main.boot();
  w.document.querySelector("#message-list .row").click();
  await new Promise((r) => setImmediate(r));
  return { w, doc: w.document, invocazioni };
}

function scrivi(x, testo, tasto = "Enter") {
  const campo = x.doc.querySelector("#reading-pane .inoltro-rapido-campo");
  campo.value = testo;
  campo.dispatchEvent(new x.w.KeyboardEvent("keydown", { key: tasto, bubbles: true }));
  return campo;
}

const composizione = (x) => x.doc.querySelector(".compose-overlay");

test("la barra dell'Assistente ha il campo «Inoltro rapido»", async () => {
  const x = await avvia();
  assert.ok(x.doc.querySelector("#reading-pane .inoltro-rapido-campo"));
});

test("un indirizzo valido + Invio apre l'inoltro con quel destinatario", async () => {
  const x = await avvia();
  scrivi(x, "  anna.verdi@esempiogroup.it ");
  await new Promise((r) => setImmediate(r));
  const overlay = composizione(x);
  assert.ok(overlay, "la finestra di composizione non si è aperta");
  assert.equal(overlay.querySelector("#cmp-a").value, "anna.verdi@esempiogroup.it");
  assert.match(overlay.querySelector("input[id*=oggetto]").value, /Piano manutenzione Q4/);
});

test("il campo si svuota dopo l'apertura", async () => {
  const x = await avvia();
  const campo = scrivi(x, "anna.verdi@esempiogroup.it");
  await new Promise((r) => setImmediate(r));
  assert.equal(campo.value, "");
});

test("un indirizzo non valido non apre nulla e resta nel campo", async () => {
  const x = await avvia();
  const campo = scrivi(x, "non-un-indirizzo");
  await new Promise((r) => setImmediate(r));
  assert.equal(composizione(x), null);
  assert.equal(campo.value, "non-un-indirizzo");
});

test("Invio con il campo vuoto non fa nulla", async () => {
  const x = await avvia();
  scrivi(x, "   ");
  await new Promise((r) => setImmediate(r));
  assert.equal(composizione(x), null);
});

test("un altro tasto non apre nulla", async () => {
  const x = await avvia();
  scrivi(x, "anna.verdi@esempiogroup.it", "a");
  await new Promise((r) => setImmediate(r));
  assert.equal(composizione(x), null);
});

test("l'inoltro rapido non invia nessuna mail da solo", async () => {
  const x = await avvia();
  scrivi(x, "anna.verdi@esempiogroup.it");
  await new Promise((r) => setImmediate(r));
  assert.equal(x.invocazioni.some((n) => /invia|send/i.test(n) && !/ricevi/i.test(n)), false);
});
