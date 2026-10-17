/**
 * Blocco V2, percorso dell'app: un `mailto:` messo in coda dal kernel apre la
 * composizione già compilata — sia all'avvio (link che ha lanciato l'app) sia
 * dopo, all'evento `aperture-esterne`. Vera `index.html` in jsdom, kernel finto.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

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

/** Aspetta che le promesse in sospeso (invoke finti) si risolvano. */
const attesa = () => new Promise((r) => setTimeout(r, 20));

async function avvia(codaIniziale) {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const window_ = dom.window;
  window_.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const coda = [...codaIniziale];
  const ascoltatori = {};
  window_.__TAURI__ = {
    core: {
      invoke: async (nome) => {
        if (nome === "aperture_in_attesa") return coda.splice(0);
        if (nome === "impostazioni_leggi") return { preferenze: {} };
        if (nome === "account_list") return [{ id: "io@esempio.it", email: "io@esempio.it" }];
        if (["cartelle_elenco", "mail_list", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
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
  await attesa();
  return { doc: window_.document, coda, ascoltatori };
}

test("all'avvio un mailto in coda apre la composizione compilata", async () => {
  const w = await avvia([
    { tipo: "mailto", url: "mailto:anna@esempio.it?cc=bruno@esempio.it&subject=Preventivo&body=Buongiorno" },
  ]);
  const overlays = w.doc.querySelectorAll(".compose-overlay");
  assert.equal(overlays.length, 1);
  assert.equal(w.doc.querySelector("#cmp-a").value, "anna@esempio.it");
  assert.equal(w.doc.querySelector("#cmp-cc").value, "bruno@esempio.it");
  assert.equal(w.doc.querySelector("#cmp-oggetto").value, "Preventivo");
  assert.match(w.doc.querySelector("#cmp-body").textContent, /Buongiorno/);
});

test("senza aperture in coda non si apre nulla", async () => {
  const w = await avvia([]);
  assert.equal(w.doc.querySelectorAll(".compose-overlay").length, 0);
});

test("a app aperta l'evento aperture-esterne ritira la coda e apre la composizione", async () => {
  const w = await avvia([]);
  assert.equal(typeof w.ascoltatori["aperture-esterne"], "function");
  w.coda.push({ tipo: "mailto", url: "mailto:carla@esempio.it" });
  w.ascoltatori["aperture-esterne"]({ payload: null });
  await attesa();
  assert.equal(w.doc.querySelector("#cmp-a").value, "carla@esempio.it");
  assert.equal(w.coda.length, 0, "la coda è stata ritirata");
});
