/**
 * Blocco V2: i link `mailto:` aperti da altre app (Safari, Finder, Comandi
 * rapidi…) arrivano alla composizione già compilata.
 *
 * `analizzaMailto` segue la RFC 6068: indirizzi nel percorso, campi
 * `to`/`cc`/`bcc`/`subject`/`body` nella query, chiavi senza distinzione di
 * maiuscole, codifica percentuale (il `+` resta un `+`), gli altri campi ignorati.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analizzaMailto } from "../src/views/apertura-esterna.js";

test("solo indirizzo", () => {
  assert.deepEqual(analizzaMailto("mailto:anna@esempio.it"), {
    a: "anna@esempio.it",
    cc: "",
    ccn: "",
    oggetto: "",
    corpo: "",
  });
});

test("più indirizzi, oggetto e corpo con a capo codificati", () => {
  const r = analizzaMailto(
    "mailto:anna@esempio.it,bruno@esempio.it?subject=Riunione%20di%20luned%C3%AC&body=Ciao%2C%0D%0Aa%20presto",
  );
  assert.equal(r.a, "anna@esempio.it, bruno@esempio.it");
  assert.equal(r.oggetto, "Riunione di lunedì");
  assert.equal(r.corpo, "Ciao,\na presto");
});

test("to nella query si aggiunge al percorso; cc e bcc; chiavi in maiuscolo", () => {
  const r = analizzaMailto("MAILTO:anna@esempio.it?To=carla@esempio.it&CC=dario@esempio.it&Bcc=eva@esempio.it");
  assert.equal(r.a, "anna@esempio.it, carla@esempio.it");
  assert.equal(r.cc, "dario@esempio.it");
  assert.equal(r.ccn, "eva@esempio.it");
});

test("il + resta un + (RFC 6068), l'indirizzo codificato si decodifica", () => {
  const r = analizzaMailto("mailto:anna%2Bposta@esempio.it?subject=1+1");
  assert.equal(r.a, "anna+posta@esempio.it");
  assert.equal(r.oggetto, "1+1");
});

test("percorso vuoto con to nella query; campi sconosciuti ignorati", () => {
  const r = analizzaMailto("mailto:?to=anna@esempio.it&in-reply-to=%3Cx@y%3E&subject=Ok");
  assert.equal(r.a, "anna@esempio.it");
  assert.equal(r.oggetto, "Ok");
});

test("codifica rotta: il testo resta com'è invece di lanciare", () => {
  const r = analizzaMailto("mailto:anna@esempio.it?subject=100%25%20e%20%ZZ");
  assert.equal(r.oggetto, "100%25%20e%20%ZZ");
});

test("non è un mailto → null", () => {
  assert.equal(analizzaMailto("https://esempio.it"), null);
  assert.equal(analizzaMailto(""), null);
  assert.equal(analizzaMailto(null), null);
});
