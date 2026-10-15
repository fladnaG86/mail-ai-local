/**
 * Test della logica pura del pannello «Categorie» (blocco O, node --test):
 * tavolozza dei colori, normalizzazione dell'elenco (id generato, nome vuoto
 * scartato, colore sconosciuto → default, duplicati per nome rimossi), riordino
 * e voci del menu «Categorizza». L'effetto visivo (targhette colorate) si
 * verifica con la prova `?view=impostazioni-categorie` e nel pannello.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TAVOLOZZA_CATEGORIE,
  COLORE_CATEGORIA_DEFAULT,
  coloreEsadecimale,
  etichettaColore,
  normalizzaCategorie,
  categoriaPerNome,
  rinominaCategoria,
  spostaCategoria,
  vociMenuCategorie,
  mappaColoriCategorie,
  targhetteCategorie,
} from "../src/views/categorie.js";

test("la tavolozza è quella delle categorie di Outlook (sei tinte)", () => {
  assert.deepEqual(
    TAVOLOZZA_CATEGORIE.map((c) => c.etichetta),
    ["Rosso", "Arancione", "Giallo", "Verde", "Blu", "Viola"],
  );
  for (const c of TAVOLOZZA_CATEGORIE) {
    assert.match(c.colore, /^#[0-9A-F]{6}$/, `il colore di ${c.id} è esadecimale`);
  }
  assert.equal(COLORE_CATEGORIA_DEFAULT, "blu");
});

test("coloreEsadecimale mappa l'id sulla tinta; sconosciuto → default", () => {
  assert.equal(coloreEsadecimale("rosso"), "#D13438");
  assert.equal(coloreEsadecimale("blu"), "#0078D4");
  assert.equal(coloreEsadecimale("fucsia"), "#0078D4");
  assert.equal(coloreEsadecimale(null), "#0078D4");
  assert.equal(etichettaColore("verde"), "Verde");
  assert.equal(etichettaColore("boh"), "Blu");
});

test("normalizzaCategorie: id generato, nome vuoto scartato, colore ignoto → default", () => {
  const fuori = normalizzaCategorie([
    { nome: "Lavoro", colore: "rosso" },
    { id: "x", nome: "   ", colore: "blu" },
    { id: "ufficio", nome: "Ufficio", colore: "fucsia" },
  ]);
  assert.equal(fuori.length, 2, "il nome vuoto è scartato");
  assert.equal(fuori[0].id, "categoria1", "id vuoto → generato");
  assert.equal(fuori[0].nome, "Lavoro");
  assert.equal(fuori[0].colore, "rosso");
  assert.equal(fuori[1].id, "ufficio");
  assert.equal(fuori[1].colore, "blu", "colore sconosciuto → default");
});

test("normalizzaCategorie toglie i duplicati per nome (senza badare alle maiuscole)", () => {
  const fuori = normalizzaCategorie([
    { id: "a", nome: "Lavoro", colore: "rosso" },
    { id: "b", nome: " lavoro ", colore: "verde" },
    { id: "c", nome: "Casa", colore: "blu" },
  ]);
  assert.deepEqual(
    fuori.map((c) => c.nome),
    ["Lavoro", "Casa"],
  );
});

test("normalizzaCategorie non muta l'elenco originale", () => {
  const orig = [{ id: "a", nome: "Lavoro", colore: "rosso" }];
  const copia = JSON.parse(JSON.stringify(orig));
  normalizzaCategorie(orig);
  assert.deepEqual(orig, copia);
});

test("categoriaPerNome trova la categoria (anche con spazi)", () => {
  const elenco = normalizzaCategorie([{ id: "a", nome: "Lavoro", colore: "rosso" }]);
  assert.equal(categoriaPerNome(elenco, "Lavoro").id, "a");
  assert.equal(categoriaPerNome(elenco, " lavoro ").id, "a");
  assert.equal(categoriaPerNome(elenco, "Casa"), null);
});

test("spostaCategoria riordina su e giù, senza uscire dai bordi", () => {
  const elenco = normalizzaCategorie([
    { id: "a", nome: "A", colore: "rosso" },
    { id: "b", nome: "B", colore: "blu" },
    { id: "c", nome: "C", colore: "verde" },
  ]);
  assert.deepEqual(spostaCategoria(elenco, 1, -1).map((c) => c.id), ["b", "a", "c"]);
  assert.deepEqual(spostaCategoria(elenco, 1, 1).map((c) => c.id), ["a", "c", "b"]);
  assert.deepEqual(spostaCategoria(elenco, 0, -1).map((c) => c.id), ["a", "b", "c"]);
  assert.deepEqual(spostaCategoria(elenco, 2, 1).map((c) => c.id), ["a", "b", "c"]);
  assert.deepEqual(elenco.map((c) => c.id), ["a", "b", "c"], "l'originale non cambia");
});

test("vociMenuCategorie segna le categorie attive e porta il colore", () => {
  const elenco = normalizzaCategorie([
    { id: "a", nome: "Lavoro", colore: "rosso" },
    { id: "b", nome: "Casa", colore: "blu" },
  ]);
  const voci = vociMenuCategorie(elenco, ["Casa"]);
  assert.deepEqual(
    voci.map((v) => v.etichetta),
    ["Lavoro", "Casa"],
  );
  assert.equal(voci[0].attivo, false);
  assert.equal(voci[1].attivo, true);
  assert.equal(voci[0].colore, "#D13438");
});

test("mappaColoriCategorie associa nome → esadecimale", () => {
  const elenco = normalizzaCategorie([{ id: "a", nome: "Lavoro", colore: "verde" }]);
  assert.deepEqual(mappaColoriCategorie(elenco), { Lavoro: "#107C10" });
});

test("targhetteCategorie colora le categorie note e lascia neutre le altre", () => {
  const mappa = { Lavoro: "#D13438" };
  const html = targhetteCategorie(["Lavoro", "Sconosciuta"], mappa);
  assert.match(html, /cat-tag--colorato/);
  assert.match(html, /--cat-colore:#D13438/);
  assert.match(html, /Sconosciuta/);
});

test("targhetteCategorie mette al sicuro i nomi scritti dall'utente", () => {
  const html = targhetteCategorie(['<img src=x onerror="1">'], {});
  assert.ok(!html.includes("<img"), "il markup dell'utente non passa");
  assert.match(html, /&lt;img/);
});

test("rinominaCategoria aggiorna il nome e non muta l'originale", () => {
  const elenco = normalizzaCategorie([
    { id: "a", nome: "Lavoro", colore: "rosso" },
    { id: "b", nome: "Casa", colore: "blu" },
  ]);
  const fuori = rinominaCategoria(elenco, 0, "Ufficio");
  assert.equal(fuori[0].nome, "Ufficio");
  assert.equal(fuori[0].id, "a", "l'id resta lo stesso");
  assert.equal(elenco[0].nome, "Lavoro", "l'elenco originale non cambia");
});

test("rinominaCategoria rifiuta il nome di un'altra categoria (niente duplicati)", () => {
  const elenco = normalizzaCategorie([
    { id: "a", nome: "Lavoro", colore: "rosso" },
    { id: "b", nome: "Casa", colore: "blu" },
  ]);
  assert.equal(rinominaCategoria(elenco, 0, "casa"), null, "senza badare alle maiuscole");
  assert.equal(rinominaCategoria(elenco, 0, "  Casa "), null, "né agli spazi");
  assert.equal(rinominaCategoria(elenco, 2, "X"), null, "indice fuori elenco → null");
  assert.equal(rinominaCategoria(elenco, 0, "   "), null, "nome vuoto → null");
});

test("rinominaCategoria accetta il nome invariato della stessa voce", () => {
  const elenco = normalizzaCategorie([{ id: "a", nome: "Lavoro", colore: "rosso" }]);
  const fuori = rinominaCategoria(elenco, 0, "Lavoro");
  assert.equal(fuori[0].nome, "Lavoro");
});
