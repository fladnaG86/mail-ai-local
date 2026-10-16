/**
 * Il mittente nella lista: il kernel manda `Nome <indirizzo>` oppure il solo
 * indirizzo. La riga mostra il nome sopra e l'indirizzo sotto, con un avatar
 * tondo (iniziali su un colore sempre uguale per lo stesso mittente).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { nomeEmail, inizialiAvatar, coloreAvatar } from "../src/views/mail-actions.js";

test("«Nome <indirizzo>» si separa in nome e indirizzo", () => {
  assert.deepEqual(nomeEmail("Mario Rossi <mario.rossi@esempiogroup.it>"), {
    nome: "Mario Rossi",
    email: "mario.rossi@esempiogroup.it",
  });
});

test("le virgolette attorno al nome vengono tolte", () => {
  assert.deepEqual(nomeEmail('"Rossi, Mario" <m@esempiogroup.it>'), {
    nome: "Rossi, Mario",
    email: "m@esempiogroup.it",
  });
});

test("un indirizzo solo resta il nome e non si ripete sotto", () => {
  assert.deepEqual(nomeEmail("noreply@esempiohost.it"), { nome: "noreply@esempiohost.it", email: "" });
});

test("un nome senza indirizzo resta il nome", () => {
  assert.deepEqual(nomeEmail("Luca Bianchi"), { nome: "Luca Bianchi", email: "" });
});

test("mittente assente: nome vuoto, nessun errore", () => {
  assert.deepEqual(nomeEmail(undefined), { nome: "", email: "" });
  assert.deepEqual(nomeEmail(""), { nome: "", email: "" });
});

test("iniziali: due parole → due iniziali", () => {
  assert.equal(inizialiAvatar("Mario Rossi"), "MR");
  assert.equal(inizialiAvatar("luca bianchi verdi"), "LB");
});

test("iniziali: una parola → le prime due lettere", () => {
  assert.equal(inizialiAvatar("Luca"), "LU");
  assert.equal(inizialiAvatar("comunicazioni@staff.esempiohost.it"), "CO");
});

test("iniziali: da un indirizzo con punti usa le parti della parte locale", () => {
  assert.equal(inizialiAvatar("mario.rossi@esempiogroup.it"), "MR");
});

test("iniziali: vuoto o senza lettere → «?»", () => {
  assert.equal(inizialiAvatar(""), "?");
  assert.equal(inizialiAvatar("1234"), "?");
});

test("il colore dell'avatar è sempre lo stesso per lo stesso mittente", () => {
  assert.equal(coloreAvatar("mario.rossi@esempiogroup.it"), coloreAvatar("mario.rossi@esempiogroup.it"));
});

test("il colore dell'avatar è un esadecimale della tavolozza e varia da un mittente all'altro", () => {
  const colori = new Set(
    ["a@x.it", "b@x.it", "c@x.it", "d@x.it", "e@x.it", "f@x.it", "g@x.it", "h@x.it"].map(coloreAvatar),
  );
  for (const c of colori) assert.match(c, /^#[0-9A-F]{6}$/i);
  assert.ok(colori.size >= 3, "tutti i mittenti hanno lo stesso colore");
});
