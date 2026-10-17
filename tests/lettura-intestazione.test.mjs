/**
 * Intestazione del pannello di lettura: il mittente «Nome <indirizzo>» si
 * divide in nome e indirizzo (prima `<indirizzo>` finiva in `innerHTML` come un
 * tag e spariva, e si leggeva «Nome <Nome >»), e nessun campo del messaggio
 * entra nel DOM come HTML: oggetto, mittente, destinatario, data e nomi degli
 * allegati arrivano dal server e sono testo.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let vista;
let doc;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  doc = dom.window.document;
  vista = await import("../src/views/main-view.js");
});

function leggi(messaggio) {
  const root = doc.createElement("div");
  vista.renderReading(root, { date: "ven 16/10/26, 21:51", ...messaggio });
  return root;
}

test("il mittente si divide in nome e indirizzo", () => {
  const root = leggi({ from: "Mario Rossi <mario.rossi@esempiohost.it>", subject: "Ciao" });
  assert.equal(root.querySelector(".sender-name").textContent, "Mario Rossi");
  assert.equal(root.querySelector(".sender-addr").textContent, "<mario.rossi@esempiohost.it>");
});

test("un mittente col solo indirizzo lo mostra come nome, senza indirizzo inventato", () => {
  const root = leggi({ from: "noreply@esempiohost.it", subject: "Ciao" });
  assert.equal(root.querySelector(".sender-name").textContent, "noreply@esempiohost.it");
  assert.equal(root.querySelector(".sender-addr").textContent, "");
});

test("l'HTML nel nome del mittente resta testo, non diventa un elemento", () => {
  const root = leggi({ from: '<img src=x onerror="alert(1)"> <a@b.it>', subject: "Ciao" });
  assert.equal(root.querySelector(".mail-sender img"), null);
});

test("l'HTML nell'oggetto, nel destinatario e nella data resta testo", () => {
  const root = leggi({
    from: "Luca <luca@esempiohost.it>",
    subject: "<b>urgente</b>",
    to: "<i>Mario</i>",
    date: "<u>oggi</u>",
  });
  assert.equal(root.querySelector(".mail-subject").textContent, "<b>urgente</b>");
  assert.equal(root.querySelector(".mail-subject b"), null);
  assert.equal(root.querySelector(".sender-to i"), null);
  assert.equal(root.querySelector(".mail-date u"), null);
});

test("il nome di un allegato resta testo", () => {
  const radice = doc.createElement("div");
  vista.mostraAllegati(radice, [{ indice: 0, name: "<img src=x>.pdf", mime: "application/pdf", size: 10 }], () => {});
  assert.equal(radice.querySelector(".attach-name").textContent, "<img src=x>.pdf");
  assert.equal(radice.querySelector(".attach-name img"), null);
});
