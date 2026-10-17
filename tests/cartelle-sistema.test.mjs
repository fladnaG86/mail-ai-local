/**
 * Le cartelle di sistema (Posta in arrivo, Bozze, Inviata, Eliminata,
 * Indesiderata, Archivio) non si rinominano né si eliminano, come in Outlook: il
 * server le usa per ruolo, e rinominare INBOX in IMAP sposta tutta la posta in
 * un'altra cartella. Le voci restano nel menu, disattivate e con il perché.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let azioni;
let doc;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  doc = dom.window.document;
  azioni = await import("../src/views/mail-actions.js");
});

const voce = (voci, id) => voci.find((v) => v.id === id);

test("le cartelle di sistema si riconoscono anche col prefisso del server", () => {
  for (const nome of ["INBOX", "inbox", "INBOX.Drafts", "INBOX.Sent", "INBOX.SPAM", "INBOX.Trash", "Posta inviata", "[Gmail]/Sent", "Archivio", "Posta in arrivo"]) {
    assert.equal(azioni.cartellaDiSistema(nome), true, nome);
  }
});

test("le cartelle create dall'utente non sono di sistema", () => {
  for (const nome of ["INBOX.Progetti", "Timbrature", "Veeam Backup", "Bozze vecchie", "Clienti/Sent ok"]) {
    assert.equal(azioni.cartellaDiSistema(nome), false, nome);
  }
});

test("su una cartella di sistema «Rinomina» ed «Elimina» sono disattivate e dicono perché", () => {
  const voci = azioni.vociMenuCartella({ nome: "INBOX.Drafts", kind: "child" });
  for (const id of ["rinomina-cartella", "elimina-cartella"]) {
    assert.equal(voce(voci, id).disabilitata, true, id);
    assert.match(voce(voci, id).nota, /cartella di sistema/);
  }
  assert.ok(!voce(voci, "svuota-cartella").disabilitata, "svuotare (es. il Cestino) resta possibile");
});

test("su una cartella dell'utente «Rinomina» ed «Elimina» sono attive", () => {
  const voci = azioni.vociMenuCartella({ nome: "INBOX.Progetti", kind: "child" });
  assert.ok(!voce(voci, "rinomina-cartella").disabilitata);
  assert.ok(!voce(voci, "elimina-cartella").disabilitata);
});

test("una voce disattivata nel menu non si può scegliere e mostra la nota", () => {
  const ancora = doc.createElement("div");
  doc.body.append(ancora);
  let scelta = null;
  const menu = azioni.apriMenu(
    ancora,
    [{ id: "rinomina-cartella", etichetta: "Rinomina cartella", disabilitata: true, nota: "cartella di sistema" }],
    (v) => { scelta = v; },
  );
  const bottone = menu.querySelector(".rb-menu-voce");
  assert.equal(bottone.disabled, true);
  assert.equal(bottone.title, "cartella di sistema");
  bottone.click();
  assert.equal(scelta, null);
  azioni.chiudiMenu();
});
