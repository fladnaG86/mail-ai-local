/**
 * Test della logica pura delle impostazioni del blocco D (node --test):
 * correzione automatica, posizione del pannello di lettura, carattere
 * predefinito, politiche delle immagini e secondi del "segna come letto".
 * Il disegno dei pannelli si verifica con le prove visive (`?view=impostazioni-…`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PANNELLI_LETTURA,
  MODI_IMMAGINI,
  FORMATI_COMPOSIZIONE,
  normPannello,
  normImmagini,
  normFormato,
  classePannelloLettura,
  secondiSegnaLetto,
  limitaDimensione,
  stileCarattere,
  etichettaPannello,
  etichettaImmagini,
} from "../src/views/impostazioni-mail.js";
import {
  sostituzioniPredefinite,
  normalizzaSostituzioni,
  applicaSostituzioni,
  sostituzioneDaApplicare,
  testoSostituzione,
} from "../src/views/sostituzioni.js";

// --- Correzione automatica -------------------------------------------------

test("le sostituzioni predefinite hanno almeno tre voci e «nn» → «non»", () => {
  const s = sostituzioniPredefinite();
  assert.ok(s.length >= 3);
  const nn = s.find((x) => x.da === "nn");
  assert.equal(nn.a, "non");
});

test("applicaSostituzioni corregge a parola intera, non dentro le parole", () => {
  const reg = sostituzioniPredefinite();
  assert.equal(applicaSostituzioni("nn", reg), "non");
  assert.equal(applicaSostituzioni("Ciao nn, ci vediamo", reg), "Ciao non, ci vediamo");
  // "nn" dentro "Anna" non si tocca.
  assert.equal(applicaSostituzioni("Anna nn", reg), "Anna non");
  // una parola più lunga che contiene la chiave non si tocca.
  assert.equal(applicaSostituzioni("nnn", reg), "nnn");
  assert.equal(applicaSostituzioni("annn", reg), "annn");
});

test("applicaSostituzioni non ritocca una parola già corretta", () => {
  const reg = sostituzioniPredefinite();
  assert.equal(applicaSostituzioni("non", reg), "non");
  assert.equal(applicaSostituzioni("non è che nn", reg), "non è che non");
});

test("applicaSostituzioni applica più regole in un colpo solo", () => {
  const reg = [
    { da: "nn", a: "non" },
    { da: "ke", a: "che" },
  ];
  assert.equal(applicaSostituzioni("nn so ke fare", reg), "non so che fare");
});

test("applicaSostituzioni non si innesca da sola (nn → non, poi non)", () => {
  const reg = sostituzioniPredefinite();
  // L'uscita "non" non contiene nessuna chiave: nessun doppio passaggio.
  assert.equal(applicaSostituzioni("nn", reg), "non");
  assert.equal(applicaSostituzioni("xche", reg), "perché");
});

test("sostituzioneDaApplicare agisce solo a fine parola scritta", () => {
  const reg = sostituzioniPredefinite();
  assert.deepEqual(sostituzioneDaApplicare("Ciao nn", reg), { da: "nn", a: "non" });
  assert.equal(sostituzioneDaApplicare("nn", reg).a, "non");
  // cursore a metà parola: "An" non è una chiave.
  assert.equal(sostituzioneDaApplicare("An", reg), null);
  // la chiave è dentro una parola più lunga: non si applica.
  assert.equal(sostituzioneDaApplicare("annn", reg), null);
  assert.equal(sostituzioneDaApplicare("xnn", reg), null);
  // nessuna chiave in coda.
  assert.equal(sostituzioneDaApplicare("parola normale", reg), null);
});

test("sostituzioneDaApplicare sceglie la chiave più lunga", () => {
  const reg = [
    { da: "che", a: "che" },
    { da: "xche", a: "perché" },
  ];
  assert.deepEqual(sostituzioneDaApplicare("lo so xche", reg), { da: "xche", a: "perché" });
});

test("normalizzaSostituzioni scarta le vuote e i duplicati", () => {
  const out = normalizzaSostituzioni([
    { da: "nn", a: "non" },
    { da: "  ", a: "x" },
    { da: " nn ", a: "dup" },
    { da: "ke", a: "che" },
  ]);
  assert.deepEqual(out, [
    { da: "nn", a: "non" },
    { da: "ke", a: "che" },
  ]);
});

test("testoSostituzione riconosce i duplicati e le vuote", () => {
  assert.equal(testoSostituzione({ da: "nn" }, [{ da: "nn" }]).duplicato, true);
  assert.equal(testoSostituzione({ da: "cmq" }, [{ da: "nn" }]).duplicato, false);
  assert.equal(testoSostituzione({ da: "  " }, []).vuota, true);
});

// --- Posizione del pannello di lettura --------------------------------------

test("classePannelloLettura traduce la posizione nella classe del layout", () => {
  assert.equal(classePannelloLettura("sotto"), "");
  assert.equal(classePannelloLettura("destra"), "main--lettura-destra");
  assert.equal(classePannelloLettura("nascosto"), "main--lettura-nascosta");
  // un valore storto torna a "sotto" (layout normale).
  assert.equal(classePannelloLettura("ovunque"), "");
  assert.deepEqual(PANNELLI_LETTURA, ["sotto", "destra", "nascosto"]);
});

test("etichette leggibili di pannello e immagini", () => {
  assert.equal(etichettaPannello("destra"), "A destra");
  assert.equal(etichettaPannello("storto"), "Sotto la lista");
  assert.equal(etichettaImmagini("mai"), "Mai");
  assert.match(etichettaImmagini("storto"), /Chiedi/);
});

// --- Politiche e formati ----------------------------------------------------

test("normalizza le politiche delle immagini e i formati", () => {
  assert.deepEqual(MODI_IMMAGINI, ["mai", "chiedi", "sempre"]);
  assert.deepEqual(FORMATI_COMPOSIZIONE, ["html", "testo"]);
  assert.equal(normImmagini("sempre"), "sempre");
  assert.equal(normImmagini("forse"), "chiedi");
  assert.equal(normFormato("testo"), "testo");
  assert.equal(normFormato("rtf"), "html");
  assert.equal(normPannello("nascosto"), "nascosto");
});

// --- Carattere predefinito --------------------------------------------------

test("stileCarattere normalizza famiglia e dimensione", () => {
  assert.deepEqual(stileCarattere("Georgia", 18), { fontFamily: "Georgia", fontSize: 18 });
  // famiglia vuota → default del kernel.
  assert.deepEqual(stileCarattere("   ", 12), { fontFamily: "Aptos", fontSize: 12 });
  // dimensione fuori scala → default.
  assert.equal(stileCarattere("Aptos", 999).fontSize, 12);
  assert.equal(stileCarattere("Aptos", 2).fontSize, 12);
  assert.equal(limitaDimensione(8), 8);
  assert.equal(limitaDimensione(72), 72);
  assert.equal(limitaDimensione("boh"), 12);
});

// --- Segna come letto dopo N secondi ---------------------------------------

test("secondiSegnaLetto limita i valori e tratta 0 come «mai»", () => {
  assert.equal(secondiSegnaLetto(5), 5);
  assert.equal(secondiSegnaLetto(0), 0);
  assert.equal(secondiSegnaLetto(-30), 0, "i secondi negativi diventano «mai»");
  assert.equal(secondiSegnaLetto(99999), 600, "oltre il massimo si tronca");
  assert.equal(secondiSegnaLetto("3"), 3);
  assert.equal(secondiSegnaLetto("boh"), 0);
});
