/**
 * Blocco W3, percorso dell'app: all'avvio il kernel allinea i canali push
 * (`push_riconcilia`); un avviso `posta-push` sincronizza **solo la Posta in
 * arrivo di quella casella**, una volta per raffica, e ridisegna le cartelle.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { RITARDO_SYNC_PUSH_MS } from "../src/views/push.js";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");

let main;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  Object.defineProperty(dom.window.document, "readyState", { value: "loading", configurable: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  impostaGlobali(dom.window);
  main = await import("../src/main.js");
});

function impostaGlobali(window_) {
  globalThis.window = window_;
  globalThis.document = window_.document;
  globalThis.location = window_.location;
  globalThis.localStorage = window_.localStorage;
  globalThis.KeyboardEvent = window_.KeyboardEvent;
}

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

async function avvia() {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const window_ = dom.window;
  window_.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const chiamate = [];
  const ascoltatori = {};
  window_.__TAURI__ = {
    core: {
      invoke: async (nome, args) => {
        chiamate.push({ nome, args });
        if (nome === "impostazioni_leggi") return { preferenze: { syncPush: true, syncAllAvvio: false } };
        if (nome === "account_list") return [{ id: "io@esempio.it", email: "io@esempio.it" }];
        if (nome === "push_riconcilia") return [{ account: "io@esempio.it", stato: "connessione" }];
        if (nome === "mail_sync") return { folders: [] };
        if (["cartelle_elenco", "mail_list", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro", "aperture_in_attesa"].includes(nome)) return [];
        return null;
      },
    },
    event: {
      listen: async (nome, fn) => {
        ascoltatori[nome] = fn;
        return () => {};
      },
    },
  };
  impostaGlobali(window_);
  await main.boot();
  await attesa(20);
  return { chiamate, ascoltatori };
}

test("all'avvio il kernel allinea i canali push", async () => {
  const w = await avvia();
  assert.equal(w.chiamate.filter((c) => c.nome === "push_riconcilia").length, 1);
  assert.equal(typeof w.ascoltatori["posta-push"], "function");
  assert.equal(typeof w.ascoltatori["push-stato"], "function");
});

test("una raffica di avvisi sincronizza una volta sola la Posta in arrivo di quella casella", async () => {
  const w = await avvia();
  const prima = w.chiamate.length;
  w.ascoltatori["posta-push"]({ payload: "io@esempio.it" });
  w.ascoltatori["posta-push"]({ payload: "io@esempio.it" });
  w.ascoltatori["posta-push"]({ payload: "io@esempio.it" });
  await attesa(RITARDO_SYNC_PUSH_MS + 200);
  const dopo = w.chiamate.slice(prima);
  const sync = dopo.filter((c) => c.nome === "mail_sync");
  assert.deepEqual(sync.map((c) => c.args), [{ accountId: "io@esempio.it", soloCartella: "INBOX" }]);
  assert.ok(dopo.some((c) => c.nome === "cartelle_elenco"), "le cartelle si ridisegnano");
});
