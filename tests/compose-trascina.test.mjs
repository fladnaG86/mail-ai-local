/**
 * La finestra «Nuovo messaggio» si sposta trascinandola per la barra del titolo.
 * Non può uscire dallo schermo: resta sempre una parte della barra da afferrare.
 * Ogni finestra nuova riparte al centro.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let apriComposizione;
let limitaPosizioneFinestra;
let window_;
let doc;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  window_ = dom.window;
  doc = window_.document;
  Object.defineProperty(window_, "innerWidth", { value: 1400, configurable: true });
  Object.defineProperty(window_, "innerHeight", { value: 800, configurable: true });
  globalThis.window = window_;
  globalThis.document = doc;
  globalThis.location = window_.location;
  globalThis.localStorage = window_.localStorage;
  globalThis.KeyboardEvent = window_.KeyboardEvent;
  globalThis.CustomEvent = window_.CustomEvent;
  ({ apriComposizione } = await import("../src/views/compose.js"));
  ({ limitaPosizioneFinestra } = await import("../src/views/finestre.js"));
});

const VISTA = { w: 1400, h: 800 };
const FINESTRA = { w: 900, h: 700 };

test("una posizione dentro lo schermo resta com'è", () => {
  assert.deepEqual(limitaPosizioneFinestra({ x: 50, y: -20 }, FINESTRA, VISTA), { x: 50, y: -20 });
});

test("non si può portare la barra del titolo sopra il bordo alto", () => {
  // Centrata: top = (800 - 700) / 2 = 50 → al massimo si sale di 50.
  assert.equal(limitaPosizioneFinestra({ x: 0, y: -400 }, FINESTRA, VISTA).y, -50);
});

test("in basso resta almeno la barra del titolo visibile", () => {
  // top = 50 + y deve restare <= 800 - 40.
  assert.equal(limitaPosizioneFinestra({ x: 0, y: 5000 }, FINESTRA, VISTA).y, 800 - 40 - 50);
});

test("a destra e a sinistra resta una parte della finestra da afferrare", () => {
  // left centrata = 250. A destra: left <= 1400 - 80 → x <= 1070.
  assert.equal(limitaPosizioneFinestra({ x: 9999, y: 0 }, FINESTRA, VISTA).x, 1400 - 80 - 250);
  // A sinistra: left + 900 >= 80 → x >= 80 - 900 - 250.
  assert.equal(limitaPosizioneFinestra({ x: -9999, y: 0 }, FINESTRA, VISTA).x, 80 - 900 - 250);
});

function apri() {
  doc.body.replaceChildren();
  const overlay = apriComposizione({ a: "luca.bianchi@esempiogroup.it", oggetto: "Prova" });
  const finestra = overlay.querySelector(".compose-window");
  // jsdom non fa layout: si simula la misura della finestra.
  finestra.getBoundingClientRect = () => ({ width: 900, height: 700, left: 250, top: 50, right: 1150, bottom: 750 });
  return { overlay, finestra, barra: overlay.querySelector(".compose-titlebar") };
}

function mouse(tipo, x, y) {
  return new window_.MouseEvent(tipo, { clientX: x, clientY: y, bubbles: true });
}

const traslazione = (finestra) => finestra.style.transform;

test("trascinando la barra del titolo la finestra si sposta di quanto si è mosso il mouse", () => {
  const { finestra, barra } = apri();
  barra.dispatchEvent(mouse("mousedown", 600, 70));
  doc.dispatchEvent(mouse("mousemove", 640, 120));
  assert.equal(traslazione(finestra), "translate(40px, 50px)");
  doc.dispatchEvent(mouse("mouseup", 640, 120));
});

test("rilasciato il mouse la finestra resta dov'è e non segue più", () => {
  const { finestra, barra } = apri();
  barra.dispatchEvent(mouse("mousedown", 600, 70));
  doc.dispatchEvent(mouse("mousemove", 640, 120));
  doc.dispatchEvent(mouse("mouseup", 640, 120));
  doc.dispatchEvent(mouse("mousemove", 900, 400));
  assert.equal(traslazione(finestra), "translate(40px, 50px)");
});

test("un secondo trascinamento riparte da dove aveva lasciato il primo", () => {
  const { finestra, barra } = apri();
  barra.dispatchEvent(mouse("mousedown", 600, 70));
  doc.dispatchEvent(mouse("mousemove", 640, 120));
  doc.dispatchEvent(mouse("mouseup", 640, 120));
  barra.dispatchEvent(mouse("mousedown", 640, 120));
  doc.dispatchEvent(mouse("mousemove", 650, 110));
  doc.dispatchEvent(mouse("mouseup", 650, 110));
  assert.equal(traslazione(finestra), "translate(50px, 40px)");
});

test("il pulsante di chiusura non avvia il trascinamento", () => {
  const { finestra, overlay } = apri();
  overlay.querySelector(".win-close").dispatchEvent(mouse("mousedown", 30, 20));
  doc.dispatchEvent(mouse("mousemove", 300, 300));
  assert.equal(traslazione(finestra), "");
});

test("non si trascina dal corpo del messaggio", () => {
  const { finestra, overlay } = apri();
  overlay.querySelector("#cmp-body").dispatchEvent(mouse("mousedown", 500, 400));
  doc.dispatchEvent(mouse("mousemove", 700, 500));
  assert.equal(traslazione(finestra), "");
});

test("trascinando troppo in alto la finestra si ferma al bordo", () => {
  const { finestra, barra } = apri();
  barra.dispatchEvent(mouse("mousedown", 600, 70));
  doc.dispatchEvent(mouse("mousemove", 600, -3000));
  assert.equal(traslazione(finestra), "translate(0px, -50px)");
  doc.dispatchEvent(mouse("mouseup", 600, -3000));
});

test("una finestra nuova riparte al centro", () => {
  const prima = apri();
  prima.barra.dispatchEvent(mouse("mousedown", 600, 70));
  doc.dispatchEvent(mouse("mousemove", 640, 120));
  doc.dispatchEvent(mouse("mouseup", 640, 120));
  const dopo = apri();
  assert.equal(traslazione(dopo.finestra), "");
});

test("il corpo del messaggio ha un carattere di ripiego senza grazie", () => {
  const { overlay } = apri();
  assert.match(overlay.querySelector("#cmp-body").getAttribute("style"), /font-family:[^;]*sans-serif/);
});
