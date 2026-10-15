/**
 * Test dell'HTML inviato col carattere scelto (blocco R): il messaggio deve
 * portare la famiglia e la dimensione del corpo, non solo il markup.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { htmlConCarattere } from "../src/views/compose.js";

test("avvolge il corpo nella famiglia e nella dimensione scelte", () => {
  const h = htmlConCarattere("<p>Ciao</p>", "Georgia", 18);
  assert.match(h, /font-family:Georgia/);
  assert.match(h, /font-size:18px/);
  assert.match(h, /<p>Ciao<\/p>/);
});

test("senza markup resta vuoto: l'HTML non parte", () => {
  assert.equal(htmlConCarattere("", "Georgia", 18), "");
  assert.equal(htmlConCarattere("   ", "Georgia", 18), "");
});

test("una dimensione fuori intervallo ripiega su 12 punti", () => {
  const h = htmlConCarattere("<p>Ciao</p>", "Georgia", 9999);
  assert.match(h, /font-size:12px/);
});

test("una famiglia vuota ripiega su Aptos", () => {
  const h = htmlConCarattere("<p>Ciao</p>", "  ", 12);
  assert.match(h, /font-family:Aptos/);
});

test("una virgoletta nella famiglia non esce dal suo attributo", () => {
  const h = htmlConCarattere("<p>Ciao</p>", 'Arial" onload="x', 12);
  assert.doesNotMatch(h, /onload=/);
  const dichiarazione = /font-family:([^;}]+)/.exec(h);
  assert.ok(dichiarazione);
  assert.doesNotMatch(dichiarazione[1], /[";{}()<>]/);
});

test("lo zoom moltiplica la dimensione dichiarata nel messaggio", () => {
  const h = htmlConCarattere("<p>Ciao</p>", "Georgia", 20, 150);
  assert.match(h, /font-size:30px/);
});
