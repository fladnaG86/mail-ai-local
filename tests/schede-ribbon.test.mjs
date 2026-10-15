// Le schede della barra multifunzione: ognuna mostra il suo sottoinsieme di
// voci, e le voci di servizio non devono sparire da tutte le schede.
import test from "node:test";
import assert from "node:assert/strict";

import { SCHEDE, vociScheda } from "../src/views/main-view.js";

const chiavi = (scheda) => vociScheda(scheda).filter((v) => !v.sep).map((v) => v.key);

test("le tre schede del riferimento esistono e non sono vuote", () => {
  for (const nome of ["home", "organizza", "strumenti"]) {
    assert.ok(Array.isArray(SCHEDE[nome]) && SCHEDE[nome].length > 0, `${nome} vuota`);
  }
});

test("ogni scheda mostra esattamente le voci che dichiara", () => {
  for (const nome of ["home", "organizza", "strumenti"]) {
    assert.deepEqual(chiavi(nome).sort(), [...SCHEDE[nome]].sort());
  }
});

test("«Impostazioni…» è raggiungibile dalla scheda Strumenti", () => {
  assert.ok(chiavi("strumenti").includes("settings"));
  assert.ok(!chiavi("home").includes("settings"), "non deve stare nella Home");
});

test("ogni voce mostrata esiste davvero fra i gruppi definiti", () => {
  const definite = new Set(
    [...chiavi("home"), ...chiavi("organizza"), ...chiavi("strumenti")],
  );
  assert.ok(definite.size >= 20);
  for (const k of definite) assert.equal(typeof k, "string");
});

test("una scheda sconosciuta ricade su Home invece di dare una lista vuota", () => {
  assert.deepEqual(chiavi("inesistente"), chiavi("home"));
});

test("i separatori non restano mai in testa né in coda", () => {
  for (const nome of ["home", "organizza", "strumenti"]) {
    const voci = vociScheda(nome);
    assert.ok(!voci[0].sep, `${nome}: separatore in testa`);
    assert.ok(!voci[voci.length - 1].sep, `${nome}: separatore in coda`);
  }
});
