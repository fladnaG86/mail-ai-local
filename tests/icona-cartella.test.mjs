/**
 * Ogni cartella della barra laterale ha la sua icona: si sceglie dal nome, che
 * può essere quello italiano o quello del server (INBOX, INBOX.Sent, Trash…).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { chiaveIconaCartella, svgIconaCartella } from "../src/views/mail-actions.js";

let renderSidebar;
let doc;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  doc = dom.window.document;
  ({ renderSidebar } = await import("../src/views/main-view.js"));
});

const CASI = [
  ["INBOX", "arrivo"],
  ["Posta in arrivo", "arrivo"],
  ["Bozze", "bozze"],
  ["INBOX.Drafts", "bozze"],
  ["Posta inviata", "inviata"],
  ["INBOX.Sent", "inviata"],
  ["Posta eliminata", "cestino"],
  ["INBOX.Trash", "cestino"],
  ["Archivio", "archivio"],
  ["Posta indesiderata", "indesiderata"],
  ["INBOX.SPAM", "indesiderata"],
  ["Timbrature", "cartella"],
  ["", "cartella"],
];

for (const [nome, chiave] of CASI) {
  test(`«${nome}» ha l'icona «${chiave}»`, () => {
    assert.equal(chiaveIconaCartella(nome), chiave);
  });
}

test("ogni chiave ha un'icona SVG che prende il colore del testo", () => {
  for (const chiave of new Set(CASI.map((c) => c[1]))) {
    const svg = svgIconaCartella(chiave);
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /currentColor/);
  }
});

test("una chiave sconosciuta ripiega sulla cartella generica", () => {
  assert.equal(svgIconaCartella("boh"), svgIconaCartella("cartella"));
});

test("la barra laterale mette l'icona davanti a ogni cartella e non davanti ai gruppi", () => {
  const root = doc.createElement("div");
  renderSidebar(root, [
    { kind: "group", nome: "mario.rossi@esempiogroup.it", open: true },
    { kind: "child", nome: "Posta inviata", cartella: "INBOX.Sent", nonLetti: 0 },
    { kind: "child", nome: "Timbrature", cartella: "Timbrature", nonLetti: 4 },
  ]);
  const [gruppo, inviata, altra] = root.querySelectorAll(".folder");
  assert.equal(gruppo.querySelector(".folder-ic"), null);
  assert.ok(inviata.querySelector(".folder-ic svg"));
  assert.equal(inviata.querySelector(".folder-ic").dataset.icona, "inviata");
  assert.equal(altra.querySelector(".folder-ic").dataset.icona, "cartella");
  assert.equal(altra.querySelector(".count").textContent, "4");
});
