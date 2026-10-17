/**
 * Divisorio trascinabile fra la lista e il pannello di lettura.
 *
 * Si prova con la vera `index.html` e il vero `app.css` in jsdom, e col kernel
 * finto: il percorso è quello dell'app (`boot` → `applicaPreferenze` →
 * `salvaImpostazioni`), non una scorciatoia. jsdom non fa layout, quindi le
 * altezze di `.main` e della lista sono simulate: la lista legge la sua da
 * `style.height`, come farebbe il browser dopo averla impostata.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

/** Altezza simulata di `.main`; con i minimi (120 + 200 + 4) lascia 280px di corsa. */
const ALTEZZA_MAIN = 604;
const CORSA = ALTEZZA_MAIN - 120 - 200 - 4;

let main;

before(async () => {
  // Il bootstrap parte da solo all'import se il documento non sta caricando.
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

/**
 * Un'app nuova: DOM vero, kernel che serve `preferenze`, e l'elenco dei
 * `impostazioni_salva` ricevuti. Ogni test ha il suo mondo, così gli ascoltatori
 * di un `boot` non si sommano a quelli del successivo.
 */
async function avvia(preferenze = {}) {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const window_ = dom.window;
  const doc = window_.document;
  const stile = doc.createElement("style");
  stile.textContent = CSS;
  doc.head.append(stile);
  window_.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

  const salvate = [];
  const letture = { preferenze };
  window_.__TAURI__ = {
    core: {
      invoke: async (nome, args) => {
        if (nome === "impostazioni_leggi") return letture;
        if (nome === "impostazioni_salva") {
          salvate.push(args.impostazioni.preferenze);
          return null;
        }
        if (nome === "account_list") return [{ id: "mario.rossi@esempiogroup.it", email: "mario.rossi@esempiogroup.it" }];
        if (["cartelle_elenco", "mail_list", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };

  // jsdom non fa layout: altezza di `.main` fissa, quella della lista è quella impostata.
  const mainEl = doc.querySelector(".main");
  const lista = doc.querySelector("#message-list");
  const misure = { main: ALTEZZA_MAIN };
  Object.defineProperty(mainEl, "offsetHeight", { get: () => misure.main });
  mainEl.getBoundingClientRect = () => ({ top: 0, height: misure.main });
  Object.defineProperty(lista, "offsetHeight", { get: () => parseFloat(lista.style.height) || 0 });

  impostaGlobali(window_);
  await main.boot();
  return { window_, doc, mainEl, lista, misure, salvate, letture, divisorio: doc.querySelector("#list-splitter") };
}

function mouse(w, tipo, y) {
  return new w.window_.MouseEvent(tipo, { clientY: y, bubbles: true });
}

function trascina(w, da, a) {
  w.divisorio.dispatchEvent(mouse(w, "mousedown", da));
  w.doc.dispatchEvent(mouse(w, "mousemove", a));
  w.doc.dispatchEvent(mouse(w, "mouseup", a));
}

test("all'avvio senza rapporto salvato la lista prende metà della corsa", async () => {
  const w = await avvia({});
  assert.equal(w.lista.style.height, `${120 + 0.5 * CORSA}px`);
});

test("all'avvio il rapporto salvato in config.json viene ripristinato", async () => {
  const w = await avvia({ splitRapporto: 0.25 });
  assert.equal(w.lista.style.height, `${120 + 0.25 * CORSA}px`);
});

test("trascinando il divisorio la lista cresce di quanto si è mosso il mouse", async () => {
  const w = await avvia({});
  w.divisorio.dispatchEvent(mouse(w, "mousedown", 300));
  w.doc.dispatchEvent(mouse(w, "mousemove", 328));
  // 28px su 280 di corsa = +0.1 → rapporto 0.6.
  assert.equal(w.lista.style.height, `${120 + 0.6 * CORSA}px`);
  w.doc.dispatchEvent(mouse(w, "mouseup", 328));
});

test("rilasciato il mouse, il rapporto si salva nelle preferenze", async () => {
  const w = await avvia({ letturaZoom: 120 });
  trascina(w, 300, 328);
  assert.equal(w.salvate.length, 1, "un solo salvataggio, al rilascio");
  assert.ok(Math.abs(w.salvate[0].splitRapporto - 0.6) < 1e-9);
  assert.equal(w.salvate[0].letturaZoom, 120, "le altre preferenze viaggiano intatte");
});

test("dopo il rilascio il mouse non trascina più", async () => {
  const w = await avvia({});
  trascina(w, 300, 328);
  const dopo = w.lista.style.height;
  assert.equal(dopo, `${120 + 0.6 * CORSA}px`, "premessa: il trascinamento ha funzionato");
  w.doc.dispatchEvent(mouse(w, "mousemove", 100));
  assert.equal(w.lista.style.height, dopo);
});

test("si può trascinare più volte: la seconda parte da dove ha lasciato la prima", async () => {
  const w = await avvia({});
  trascina(w, 300, 328); // 0.5 → 0.6
  trascina(w, 400, 428); // 0.6 → 0.7
  assert.equal(w.lista.style.height, `${120 + 0.7 * CORSA}px`);
});

test("il rapporto non esce dai minimi di lista e lettura", async () => {
  const w = await avvia({});
  trascina(w, 300, 5000);
  assert.equal(w.lista.style.height, `${120 + CORSA}px`);
  trascina(w, 5000, -5000);
  assert.equal(w.lista.style.height, "120px");
});

test("doppio clic sul divisorio riporta a metà e salva", async () => {
  const w = await avvia({ splitRapporto: 0.9 });
  w.divisorio.dispatchEvent(new w.window_.MouseEvent("dblclick", { bubbles: true }));
  assert.equal(w.lista.style.height, `${120 + 0.5 * CORSA}px`);
  assert.equal(w.salvate.at(-1).splitRapporto, 0.5);
});

for (const pannello of ["destra", "nascosto"]) {
  test(`con la lettura «${pannello}» il divisorio non c'è e non lascia stili sulla lista`, async () => {
    const w = await avvia({ letturaPannello: pannello });
    assert.equal(w.window_.getComputedStyle(w.divisorio).display, "none");
    assert.equal(w.lista.style.height, "");
    assert.equal(w.lista.style.flex, "");
  });
}

test("con la lettura sotto il divisorio si vede", async () => {
  const w = await avvia({ letturaPannello: "sotto" });
  assert.notEqual(w.window_.getComputedStyle(w.divisorio).display, "none");
});

test("passando da sotto a destra gli stili messi dal divisorio spariscono", async () => {
  const w = await avvia({ letturaPannello: "sotto" });
  assert.notEqual(w.lista.style.height, "", "premessa: sotto la lista ha un'altezza");
  w.letture.preferenze = { letturaPannello: "destra" };
  await main.boot();
  assert.equal(w.lista.style.height, "");
  assert.equal(w.lista.style.flex, "");
});

/** Simula il ridimensionamento della finestra: `.main` cambia altezza. */
function ridimensiona(w, altezza) {
  w.misure.main = altezza;
  w.window_.dispatchEvent(new w.window_.Event("resize"));
}

test("ridimensionando la finestra la lista mantiene il rapporto salvato", async () => {
  const w = await avvia({ splitRapporto: 0.25 });
  ridimensiona(w, 1004); // corsa 680
  assert.equal(w.lista.style.height, `${120 + 0.25 * 680}px`);
});

test("rimpicciolendo la finestra la lettura non scende sotto il suo minimo", async () => {
  const w = await avvia({ splitRapporto: 1 });
  ridimensiona(w, 404); // corsa 80
  assert.equal(w.lista.style.height, `${120 + 80}px`);
});

test("dopo un trascinamento il ridimensionamento usa il rapporto trascinato", async () => {
  const w = await avvia({});
  trascina(w, 300, 328); // 0.5 → 0.6
  // Il rapporto entra nelle preferenze quando il kernel ha risposto al salvataggio.
  await new Promise((r) => setImmediate(r));
  ridimensiona(w, 1004);
  assert.equal(w.lista.style.height, `${120 + 0.6 * 680}px`);
});
