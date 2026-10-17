/**
 * «Colore evidenziazione carattere» (🖍) della finestra Nuovo messaggio è un
 * interruttore: sul testo già evidenziato (o col cursore dentro) toglie
 * l'evidenziazione, altrimenti la mette. Prima applicava sempre il giallo e non
 * c'era modo di toglierlo: il testo scritto dopo restava evidenziato.
 *
 * jsdom non ha `execCommand`: lo si sostituisce per registrare cosa chiede la
 * finestra al motore di editing, che è WebKit nell'app.
 */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let apriComposizione;
let evidenziazioneAttiva;
let window_;
let doc;
let comandi;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
  window_ = dom.window;
  doc = window_.document;
  globalThis.window = window_;
  globalThis.document = doc;
  globalThis.location = window_.location;
  globalThis.localStorage = window_.localStorage;
  globalThis.KeyboardEvent = window_.KeyboardEvent;
  globalThis.CustomEvent = window_.CustomEvent;
  ({ apriComposizione } = await import("../src/views/compose.js"));
  ({ evidenziazioneAttiva } = await import("../src/views/blocco-i2.js"));
});

beforeEach(() => {
  comandi = [];
  doc.execCommand = (nome, _ui, valore) => {
    comandi.push([nome, valore]);
    return true;
  };
});

// --- funzione pura -------------------------------------------------------------

function corpo(html) {
  const radice = doc.createElement("div");
  radice.innerHTML = html;
  return radice;
}

test("il testo dentro uno span con sfondo colorato è evidenziato", () => {
  const r = corpo('<p>prima <span style="background-color: #ffff00">giallo <b>forte</b></span></p>');
  assert.equal(evidenziazioneAttiva(r.querySelector("b").firstChild, r), true);
});

test("il testo normale non è evidenziato", () => {
  const r = corpo("<p>solo <b>testo</b></p>");
  assert.equal(evidenziazioneAttiva(r.querySelector("b").firstChild, r), false);
});

test("uno sfondo trasparente più interno vince su quello colorato esterno", () => {
  const r = corpo('<span style="background-color: yellow">a<span style="background-color: transparent"><i>b</i></span></span>');
  assert.equal(evidenziazioneAttiva(r.querySelector("i").firstChild, r), false);
});

test("anche <mark> conta come evidenziato", () => {
  const r = corpo("<mark>x</mark>");
  assert.equal(evidenziazioneAttiva(r.querySelector("mark").firstChild, r), true);
});

test("lo sfondo di un contenitore fuori dal corpo non conta", () => {
  const fuori = doc.createElement("div");
  fuori.style.backgroundColor = "yellow";
  const r = corpo("<p>testo</p>");
  fuori.append(r);
  assert.equal(evidenziazioneAttiva(r.querySelector("p").firstChild, r), false);
});

test("senza nodo non è evidenziato", () => {
  assert.equal(evidenziazioneAttiva(null, corpo("")), false);
});

// --- finestra vera -------------------------------------------------------------

function apri(html) {
  doc.body.replaceChildren();
  const overlay = apriComposizione({ a: "luca.bianchi@esempiogroup.it", oggetto: "Prova" });
  const corpoEl = overlay.querySelector("#cmp-body");
  corpoEl.innerHTML = html;
  return { overlay, corpoEl, pulsante: overlay.querySelector('[data-cmd2="evidenzia"]') };
}

function seleziona(nodo, da, a = da) {
  const range = doc.createRange();
  range.setStart(nodo, da);
  range.setEnd(nodo, a);
  const sel = window_.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

const clic = (el) => el.dispatchEvent(new window_.MouseEvent("click", { bubbles: true }));

test("su testo normale selezionato 🖍 mette il giallo", () => {
  const { corpoEl, pulsante } = apri("<p>ciao mondo</p>");
  seleziona(corpoEl.querySelector("p").firstChild, 0, 4);
  clic(pulsante);
  assert.deepEqual(comandi.filter(([n]) => n === "hiliteColor"), [["hiliteColor", "#ffff00"]]);
});

test("su testo già evidenziato selezionato 🖍 toglie l'evidenziazione", () => {
  const { corpoEl, pulsante } = apri('<p><span style="background-color: #ffff00">ciao</span> mondo</p>');
  seleziona(corpoEl.querySelector("span").firstChild, 0, 4);
  clic(pulsante);
  assert.deepEqual(comandi.filter(([n]) => n === "hiliteColor"), [["hiliteColor", "transparent"]]);
});

test("col cursore alla fine del testo evidenziato 🖍 porta il cursore fuori dall'evidenziazione", () => {
  const { corpoEl, pulsante } = apri('<p><span style="background-color: #ffff00">ciao</span></p>');
  seleziona(corpoEl.querySelector("span").firstChild, 4);
  clic(pulsante);
  const sel = window_.getSelection();
  assert.equal(evidenziazioneAttiva(sel.anchorNode, corpoEl), false, "il testo scritto dopo sarebbe ancora evidenziato");
  assert.equal(corpoEl.querySelector("span").textContent, "ciao", "il testo già evidenziato resta com'era");
});

test("col cursore a metà del testo evidenziato lo spezza: prima e dopo restano evidenziati", () => {
  const { corpoEl, pulsante } = apri('<p><span style="background-color: #ffff00">ciao <b>mondo</b></span></p>');
  seleziona(corpoEl.querySelector("span").firstChild, 2);
  clic(pulsante);
  const sel = window_.getSelection();
  assert.equal(evidenziazioneAttiva(sel.anchorNode, corpoEl), false);
  const span = [...corpoEl.querySelectorAll("span")];
  assert.deepEqual(span.map((s) => s.textContent), ["ci", "ao mondo"]);
  assert.ok(span[1].querySelector("b"), "il grassetto della seconda metà resta");
});

test("l'evidenziazione usa il comando nativo, non riscrive la selezione come testo semplice", () => {
  const { corpoEl, pulsante } = apri("<p><b>ciao</b> mondo</p>");
  seleziona(corpoEl.querySelector("b").firstChild, 0, 4);
  clic(pulsante);
  assert.equal(comandi.some(([n]) => n === "insertHTML"), false, "insertHTML perderebbe il grassetto");
});
