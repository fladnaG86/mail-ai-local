/**
 * La riga di un messaggio nella lista: pallino blu se non letto, avatar tondo,
 * nome sopra e indirizzo sotto, oggetto, icone di stato (✔ allegato ★), data e
 * categorie. Un solo costruttore (`htmlCelleMessaggio`) per lista piatta,
 * messaggi delle conversazioni e risultati di ricerca.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let htmlCelleMessaggio;
let statoRiga;
let renderList;
let renderListaConversazioni;
let doc;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  doc = dom.window.document;
  ({ htmlCelleMessaggio, statoRiga } = await import("../src/views/mail-actions.js"));
  ({ renderList, renderListaConversazioni } = await import("../src/views/main-view.js"));
});

function messaggio(extra = {}) {
  return Object.assign(
    {
      uid: 1,
      from: "Mario Rossi <mario.rossi@esempiogroup.it>",
      subject: "Piano manutenzione Q4",
      date: "ven 16/10/26, 21:57",
      timestamp: 1_760_000_000,
      seen: false,
      flagged: false,
      has_attachments: false,
      categories: [],
    },
    extra,
  );
}

/** Le celle di un messaggio, già montate in una riga per poterle interrogare. */
function celle(m, extra) {
  const riga = doc.createElement("div");
  riga.innerHTML = htmlCelleMessaggio(m, statoRiga(m), extra);
  return riga;
}

test("nome sopra e indirizzo sotto, separati", () => {
  const r = celle(messaggio());
  assert.equal(r.querySelector(".from-nome").textContent, "Mario Rossi");
  assert.equal(r.querySelector(".from-email").textContent, "mario.rossi@esempiogroup.it");
});

test("senza nome l'indirizzo sta sopra e sotto non si ripete", () => {
  const r = celle(messaggio({ from: "noreply@esempiohost.it" }));
  assert.equal(r.querySelector(".from-nome").textContent, "noreply@esempiohost.it");
  assert.equal(r.querySelector(".from-email"), null);
});

test("l'avatar ha le iniziali e il colore del mittente", () => {
  const av = celle(messaggio()).querySelector(".avatar");
  assert.equal(av.textContent, "MR");
  assert.match(av.getAttribute("style"), /background:\s*#[0-9A-F]{6}/i);
});

test("il pallino è acceso solo per un messaggio non letto", () => {
  assert.ok(celle(messaggio({ seen: false })).querySelector(".dot--on"));
  assert.equal(celle(messaggio({ seen: true })).querySelector(".dot--on"), null);
});

test("le icone di stato compaiono solo quando servono", () => {
  const spoglia = celle(messaggio());
  assert.equal(spoglia.querySelector(".ic--att"), null);
  assert.equal(spoglia.querySelector(".ic--done"), null);
  assert.equal(spoglia.querySelector(".ic--star").textContent, "☆");

  const piena = celle(messaggio({ has_attachments: true, flagged: true, completed: true }));
  assert.ok(piena.querySelector(".ic--att"));
  assert.ok(piena.querySelector(".ic--done"));
  assert.equal(piena.querySelector(".ic--star").textContent, "★");
});

test("il testo del mittente e dell'oggetto non diventa mai markup", () => {
  const r = celle(messaggio({ from: '"<img src=x onerror=1>" <a@b.it>', subject: "<b>ciao</b>" }));
  assert.equal(r.querySelector("img"), null);
  assert.equal(r.querySelector(".cell--subject b"), null);
  assert.equal(r.querySelector(".cell--subject").textContent, "<b>ciao</b>");
});

test("data e targhette stanno nelle loro celle", () => {
  const r = celle(messaggio(), { targhette: '<span class="cat-tag">Lavoro</span>' });
  assert.equal(r.querySelector(".row-date").textContent, "ven 16/10/26, 21:57");
  assert.equal(r.querySelector(".cell--cat .cat-tag").textContent, "Lavoro");
});

test("la lista piatta disegna le righe col costruttore condiviso", () => {
  const root = doc.createElement("div");
  renderList(root, [messaggio()]);
  assert.equal(root.querySelector(".row .avatar").textContent, "MR");
  assert.ok(root.querySelector(".row .dot--on"));
});

test("i messaggi dentro una conversazione disegnano lo stesso avatar", () => {
  const root = doc.createElement("div");
  const m = messaggio();
  renderListaConversazioni(root, [
    { chiave: "c1", numero: 1, nonLetti: 1, from: m.from, subject: m.subject, date: m.date, timestamp: m.timestamp, messaggi: [m] },
  ]);
  assert.equal(root.querySelector(".row--msg .avatar").textContent, "MR");
  assert.equal(root.querySelector(".row--msg .from-nome").textContent, "Mario Rossi");
});
