/**
 * Test della logica pura della composizione avanzata (blocco C, node --test):
 * dimensione leggibile, elenco degli allegati (aggiunta, rimozione, totale),
 * markup della tabella e avvolgimento del collegamento. Le parti legate al DOM
 * (canvas del ritaglio, scelta file, formattazione) si provano con le prove
 * visive, non qui.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dimensioneLeggibile,
  aggiungiAllegato,
  rimuoviAllegato,
  totaleByte,
  totaleLeggibile,
  markupTabella,
  normalizzaUrl,
  avvolgiCollegamento,
  dividiDataUrl,
} from "../src/views/compose.js";

test("dimensioneLeggibile rende B, KB e MB con la virgola decimale", () => {
  assert.equal(dimensioneLeggibile(0), "0 B");
  assert.equal(dimensioneLeggibile(512), "512 B");
  assert.equal(dimensioneLeggibile(1023), "1023 B");
  assert.equal(dimensioneLeggibile(1024), "1,0 KB");
  assert.equal(dimensioneLeggibile(1536), "1,5 KB");
  assert.equal(dimensioneLeggibile(1024 * 1024), "1,0 MB");
  assert.equal(dimensioneLeggibile(2.5 * 1024 * 1024), "2,5 MB");
  // Un valore storto non manda in errore: vale come zero.
  assert.equal(dimensioneLeggibile(undefined), "0 B");
  assert.equal(dimensioneLeggibile(-5), "0 B");
});

test("aggiungiAllegato accoda senza mutare l'elenco di partenza", () => {
  const vuoto = [];
  const uno = aggiungiAllegato(vuoto, { nome: "piano.pdf", mime: "application/pdf", dimensione: 2048, contenuto: "AAA" });
  const due = aggiungiAllegato(uno, { nome: "x.bin", dimensione: 10 });
  assert.equal(vuoto.length, 0, "l'elenco di partenza resta intatto");
  assert.equal(uno.length, 1);
  assert.equal(due.length, 2);
  assert.equal(due[0].nome, "piano.pdf");
  assert.equal(due[1].mime, "application/octet-stream", "mime assente → generico");
  assert.equal(due[1].dimensione, 10);
});

test("rimuoviAllegato toglie la riga giusta e ignora indici storti", () => {
  const elenco = [
    { nome: "a", dimensione: 1 },
    { nome: "b", dimensione: 2 },
    { nome: "c", dimensione: 3 },
  ];
  const senzaB = rimuoviAllegato(elenco, 1);
  assert.deepEqual(senzaB.map((a) => a.nome), ["a", "c"]);
  assert.equal(elenco.length, 3, "l'elenco di partenza resta intatto");
  assert.deepEqual(rimuoviAllegato(elenco, 99).map((a) => a.nome), ["a", "b", "c"]);
});

test("totaleByte e totaleLeggibile sommano l'elenco", () => {
  const elenco = aggiungiAllegato(
    aggiungiAllegato([], { nome: "a", dimensione: 1024 * 1024 }),
    { nome: "b", dimensione: 512 * 1024 },
  );
  assert.equal(totaleByte(elenco), 1024 * 1024 + 512 * 1024);
  assert.equal(totaleLeggibile(elenco), "1,5 MB");
  assert.equal(totaleLeggibile([]), "0 B");
});

test("markupTabella genera righe×colonne, con limiti ragionevoli", () => {
  const html = markupTabella(2, 3);
  assert.equal((html.match(/<tr>/g) || []).length, 2, "il numero di righe");
  assert.equal((html.match(/<td>/g) || []).length, 6, "il numero di celle");
  assert.ok(html.includes("<table"), "è una tabella");
  assert.ok(html.includes("<tbody>"), "con un corpo");
  // Valori storti o oltre il limite restano nei limiti (1..20).
  assert.equal((markupTabella(0, 0).match(/<tr>/g) || []).length, 1);
  assert.equal((markupTabella(99, 99).match(/<tr>/g) || []).length, 20);
  assert.equal((markupTabella("x", "y").match(/<td>/g) || []).length, 1);
});

test("normalizzaUrl assume https e rifiuta gli schemi pericolosi", () => {
  assert.equal(normalizzaUrl("esempiogroup.it"), "https://esempiogroup.it");
  assert.equal(normalizzaUrl("http://x.it/p"), "http://x.it/p");
  assert.equal(normalizzaUrl("mailto:info@esempiogroup.it"), "mailto:info@esempiogroup.it");
  assert.equal(normalizzaUrl("tel:+390212345678"), "tel:+390212345678");
  assert.equal(normalizzaUrl("javascript:alert(1)"), "", "javascript: va rifiutato");
  assert.equal(normalizzaUrl("data:text/html,x"), "", "data: va rifiutato");
  assert.equal(normalizzaUrl(""), "");
});

test("avvolgiCollegamento avvolge la selezione o inserisce il solo link", () => {
  assert.equal(avvolgiCollegamento("sito Esempio", "esempiogroup.it"), '<a href="https://esempiogroup.it">sito Esempio</a>');
  assert.equal(avvolgiCollegamento("", "esempiogroup.it"), '<a href="https://esempiogroup.it">https://esempiogroup.it</a>');
  // L'etichetta e l'href sono fuggiti.
  assert.equal(
    avvolgiCollegamento("a & b", "x.it/?a=1&b=2"),
    '<a href="https://x.it/?a=1&amp;b=2">a &amp; b</a>',
  );
  assert.equal(avvolgiCollegamento("testo", "javascript:alert(1)"), "", "url pericoloso → niente link");
});

test("dividiDataUrl separa mime e contenuto base64", () => {
  const base64 = "SGVsbG8="; // "Hello"
  const d = dividiDataUrl(`data:image/png;base64,${base64}`);
  assert.equal(d.mime, "image/png");
  assert.equal(d.base64, base64);
  const nonData = dividiDataUrl("non-un-data-url");
  assert.equal(nonData.mime, "");
  assert.equal(nonData.base64, "");
});
