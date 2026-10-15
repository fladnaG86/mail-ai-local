/**
 * Test della logica pura del blocco I1 (node --test): le voci dei menu
 * contestuali per tipo di elemento (messaggio, messaggio già letto,
 * conversazione, cartella), le etichette esatte del riferimento e i testi delle
 * conferme. Il disegno è verificato con le prove visive (`?view=menu-*`), non qui.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCADENZE,
  etichettaScadenza,
  conversazioneIgnorata,
  vociSottomenuContrassegna,
  vociMenuMessaggio,
  vociMenuConversazione,
  vociMenuCartella,
  testoConfermaEliminaCartella,
  testoConfermaSvuotaCartella,
  testoConfermaSvuotaPostaEliminata,
  testoConfermaSvuotamento,
  ePostaEliminata,
} from "../src/views/mail-actions.js";

/// Etichette delle voci non separatore, nell'ordine.
const etichette = (voci) => voci.filter((v) => !v.sep).map((v) => v.etichetta);

test("le voci di scadenza sono quelle del riferimento, nell'ordine", () => {
  assert.deepEqual(
    SCADENZE.map((s) => s.etichetta),
    ["Più tardi oggi", "Questa sera", "Domani", "Prossima settimana", "Rimuovi contrassegno"],
  );
  assert.deepEqual(
    SCADENZE.map((s) => s.id),
    ["piu-tardi-oggi", "questa-sera", "domani", "prossima-settimana", "rimuovi"],
  );
  assert.equal(etichettaScadenza("domani"), "Domani");
  assert.equal(etichettaScadenza("boh"), "Più tardi oggi");
});

test("il sottomenu Contrassegna ha le cinque voci, con id prefissato", () => {
  const sotto = vociSottomenuContrassegna();
  assert.equal(sotto.length, 5);
  assert.equal(sotto[0].id, "scadenza:piu-tardi-oggi");
  assert.equal(sotto[4].etichetta, "Rimuovi contrassegno");
});

test("le voci del messaggio sono quelle del riferimento, nell'ordine", () => {
  const m = { seen: false, threadKey: "t1" };
  assert.deepEqual(etichette(vociMenuMessaggio(m, { ignorate: [] })), [
    "Rispondi",
    "Rispondi a tutti",
    "Inoltra",
    "Rinvia",
    "Inoltra come allegato",
    "Copia nella cartella…",
    "Sposta nella cartella…",
    "Elimina",
    "Archivia",
    "Segna come già letto",
    "Categorizza",
    "Contrassegna",
    "Ignora conversazione",
    "Segna come indesiderato",
  ]);
});

test("un messaggio già letto mostra «Segna come da leggere»", () => {
  const letto = vociMenuMessaggio({ seen: true });
  const daLeggere = letto.find((v) => v.id === "letto");
  assert.equal(daLeggere.etichetta, "Segna come da leggere");

  const nonLetto = vociMenuMessaggio({ seen: false });
  assert.equal(nonLetto.find((v) => v.id === "letto").etichetta, "Segna come già letto");
});

test("«Contrassegna» porta il sottomenu delle scadenze", () => {
  const v = vociMenuMessaggio({ seen: false }).find((x) => x.id === "contrassegna");
  assert.ok(Array.isArray(v.sottomenu));
  assert.equal(v.sottomenu[0].etichetta, "Più tardi oggi");
});

test("una conversazione ignorata mostra «Non ignorare più»", () => {
  const m = { threadKey: "t9" };
  assert.equal(conversazioneIgnorata(m, ["t9"]), true);
  assert.equal(conversazioneIgnorata(m, ["altro"]), false);
  assert.equal(conversazioneIgnorata({}, ["t9"]), false);

  const voci = vociMenuMessaggio(m, { ignorate: ["t9"] });
  assert.equal(voci.find((v) => v.id === "ignora").etichetta, "Non ignorare più");
  const voci2 = vociMenuMessaggio(m, { ignorate: [] });
  assert.equal(voci2.find((v) => v.id === "ignora").etichetta, "Ignora conversazione");
});

test("un messaggio indesiderato mostra «Segna come non indesiderato»", () => {
  assert.equal(
    vociMenuMessaggio({ indesiderato: true }).find((v) => v.id === "indesiderato").etichetta,
    "Segna come non indesiderato",
  );
  assert.equal(
    vociMenuMessaggio({ indesiderato: false }).find((v) => v.id === "indesiderato").etichetta,
    "Segna come indesiderato",
  );
});

test("le voci della conversazione hanno Ignora e Contrassegna", () => {
  const et = etichette(vociMenuConversazione({ chiave: "c1", seen: true }, { ignorate: [] }));
  assert.ok(et.includes("Inoltra come allegato"));
  assert.ok(et.includes("Copia nella cartella…"));
  assert.ok(et.includes("Ignora conversazione"));
  assert.ok(et.includes("Contrassegna"));
  assert.ok(et.includes("Segna come da leggere"));

  const ignorata = vociMenuConversazione({ chiave: "c1", seen: false }, { ignorate: ["c1"] });
  assert.equal(ignorata.find((v) => v.id === "ignora").etichetta, "Non ignorare più");
});

test("le voci di una cartella sono quelle del riferimento", () => {
  const et = etichette(vociMenuCartella({ nome: "Archivio", preferita: false, kind: "child" }));
  assert.deepEqual(et, [
    "Nuova cartella",
    "Rinomina cartella",
    "Elimina cartella",
    "Svuota cartella",
    "Segna tutti come già letti",
    "Aggiungi a Preferiti",
  ]);
  // Preferita: la voce diventa «Rimuovi da Preferiti».
  const pref = vociMenuCartella({ nome: "Bozze", preferita: true, kind: "child" });
  assert.equal(pref.find((v) => v.id === "preferita").etichetta, "Rimuovi da Preferiti");
});

test("un gruppo (account) ha solo «Nuova cartella»", () => {
  const et = etichette(vociMenuCartella({ nome: "mario@esempiogroup.it", kind: "group" }));
  assert.deepEqual(et, ["Nuova cartella"]);
});

test("i testi delle conferme sono espliciti e mai muti", () => {
  assert.match(testoConfermaEliminaCartella("Commesse"), /Commesse/);
  assert.match(testoConfermaEliminaCartella("Commesse"), /non può essere annullata/);
  assert.match(testoConfermaSvuotaCartella("Archivio"), /Archivio/);
  assert.match(testoConfermaSvuotaCartella("Archivio"), /eliminati definitivamente/);
  assert.match(testoConfermaSvuotaPostaEliminata(), /Posta eliminata/);
});

test("«Svuota Posta eliminata» ha la conferma dedicata", () => {
  assert.equal(ePostaEliminata("Posta eliminata"), true);
  assert.equal(ePostaEliminata("Trash"), true);
  assert.equal(ePostaEliminata("Archivio"), false);
  assert.equal(testoConfermaSvuotamento("Posta eliminata"), testoConfermaSvuotaPostaEliminata());
  assert.equal(testoConfermaSvuotamento("Archivio"), testoConfermaSvuotaCartella("Archivio"));
});
