/**
 * Test della logica pura del blocco I2 (node --test): ordinamento della lista,
 * densità ed etichette del riferimento, costruzione della query della ricerca
 * avanzata, formattazione del ritardo, stile dello zoom e markup della
 * formattazione. L'interfaccia è verificata con le prove visive (`?view=*`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ORDINAMENTI,
  VERSI,
  DENSITA_LISTA,
  etichettaOrdinamento,
  etichettaVerso,
  etichettaDensita,
  COLORI_EVIDENZIAZIONE,
  ordinaMessaggi,
  ordinamentoValido,
  dimensioneDi,
  costruisciQueryAvanzata,
  dataValida,
  etichettaRitardo,
  stileZoom,
  valoreDatetimeLocal,
  epochDaDatetimeLocal,
  markupFormattazione,
  chiedeConferma,
  classeDensita,
  ETICHETTE_CONFERME,
  SCORCIATOIE,
  chromePannello,
  PULSANTE_CHIUDI,
} from "../src/views/blocco-i2.js";

const ADESSO = Date.UTC(2026, 9, 13, 12, 0, 0); // 13/10/2026 12:00 UTC

function msg(id, { from = "x", subject = "x", timestamp = 0, body = "", has_attachments = false } = {}) {
  return { uid: String(id), from, subject, timestamp, body, has_attachments };
}

// --- Etichette del riferimento ----------------------------------------------

test("le etichette di ordinamento e densità sono quelle del riferimento", () => {
  assert.deepEqual(
    ORDINAMENTI.map((o) => o.etichetta),
    ["Data", "Mittente", "Oggetto", "Dimensione"],
  );
  assert.deepEqual(
    DENSITA_LISTA.map((d) => d.etichetta),
    ["Compatta", "Accogliente", "Spaziosa"],
  );
  assert.ok(VERSI.some((v) => v.id === "crescente"));
  assert.ok(VERSI.some((v) => v.id === "discendente"));
});

test("le etichette hanno un valore di ripiego sicuro", () => {
  assert.equal(etichettaOrdinamento("boh"), "Data");
  assert.equal(etichettaVerso("boh"), "Discendente");
  assert.equal(etichettaDensita("boh"), "Accogliente");
  assert.equal(classeDensita("spaziosa"), "lista--spaziosa");
  assert.equal(classeDensita("boh"), "lista--accogliente");
});

// --- Ordinamento della lista -------------------------------------------------

test("ordina per data in entrambi i versi", () => {
  const lista = [msg(1, { timestamp: 300 }), msg(2, { timestamp: 100 }), msg(3, { timestamp: 200 })];
  assert.deepEqual(
    ordinaMessaggi(lista, "data", "discendente").map((m) => m.timestamp),
    [300, 200, 100],
  );
  assert.deepEqual(
    ordinaMessaggi(lista, "data", "crescente").map((m) => m.timestamp),
    [100, 200, 300],
  );
});

test("ordina per mittente e per oggetto", () => {
  const lista = [msg(1, { from: "Zeta", subject: "Alfa" }), msg(2, { from: "Alfa", subject: "Zeta" })];
  assert.deepEqual(
    ordinaMessaggi(lista, "mittente", "crescente").map((m) => m.from),
    ["Alfa", "Zeta"],
  );
  assert.deepEqual(
    ordinaMessaggi(lista, "oggetto", "discendente").map((m) => m.subject),
    ["Zeta", "Alfa"],
  );
});

test("ordina per dimensione (allegato pesa più del corpo)", () => {
  const lista = [
    msg(1, { body: "x".repeat(10) }),
    msg(2, { body: "x".repeat(5), has_attachments: true }),
  ];
  assert.deepEqual(
    ordinaMessaggi(lista, "dimensione", "discendente").map((m) => m.uid),
    ["2", "1"],
  );
  assert.equal(dimensioneDi(lista[1]) > dimensioneDi(lista[0]), true);
});

test("un campo non riconosciuto ricade sulla data e non muta l'originale", () => {
  const lista = [msg(1, { timestamp: 1 }), msg(2, { timestamp: 2 })];
  const copia = lista.slice();
  const out = ordinaMessaggi(lista, "campo-inventato", "discendente");
  assert.deepEqual(out.map((m) => m.timestamp), [2, 1]);
  assert.deepEqual(lista, copia, "l'elenco di partenza non cambia");
  assert.equal(ordinamentoValido("dimensione"), true);
  assert.equal(ordinamentoValido("campo-inventato"), false);
});

// --- Ricerca avanzata --------------------------------------------------------

test("la query avanzata si costruisce per ogni combinazione di campi", () => {
  assert.equal(costruisciQueryAvanzata({}), "");
  assert.equal(costruisciQueryAvanzata({ da: "luca" }), "da:luca");
  assert.equal(costruisciQueryAvanzata({ oggetto: "piano" }), "oggetto:piano");
  assert.equal(costruisciQueryAvanzata({ a: "mario" }), "a:mario");
  assert.equal(costruisciQueryAvanzata({ conAllegato: true }), "con:allegato");
  assert.equal(costruisciQueryAvanzata({ conAllegato: false }), "senza:allegato");
  assert.equal(costruisciQueryAvanzata({ nonLetti: true }), "non:letto");
  assert.equal(
    costruisciQueryAvanzata({ periodoDa: "2026-01-01", periodoA: "2026-12-31" }),
    "dopo:2026-01-01 prima:2026-12-31",
  );
  const completa = costruisciQueryAvanzata({
    da: "luca",
    oggetto: "piano",
    a: "mario",
    conAllegato: true,
    nonLetti: true,
    periodoDa: "2026-01-01",
    periodoA: "2026-12-31",
  });
  assert.equal(
    completa,
    "da:luca oggetto:piano a:mario con:allegato non:letto dopo:2026-01-01 prima:2026-12-31",
  );
});

test("una data non valida non entra nella query", () => {
  assert.equal(costruisciQueryAvanzata({ periodoDa: "non-una-data" }), "");
  assert.equal(dataValida("2026-13-99"), false);
  assert.equal(dataValida("2026-10-13"), true);
  assert.equal(dataValida("2026-10-13T09:00"), true);
});

// --- Formattazione del ritardo ----------------------------------------------

test("l'etichetta del ritardo dice «tra N ore», «domani alle…», «oggi alle…»", () => {
  const adessoSec = Math.floor(ADESSO / 1000);
  assert.equal(etichettaRitardo(adessoSec + 2 * 3600, ADESSO), "tra 2 ore");
  assert.equal(etichettaRitardo(adessoSec + 30 * 60, ADESSO), "tra 30 minuti");
  // Costruiti con lo stesso orologio locale della funzione: nessuna dipendenza dal fuso.
  const dOggi = new Date(ADESSO);
  dOggi.setHours(18, 0, 0, 0);
  assert.equal(etichettaRitardo(Math.floor(dOggi.getTime() / 1000), ADESSO), "oggi alle 18:00");
  const dDomani = new Date(ADESSO);
  dDomani.setDate(dDomani.getDate() + 1);
  dDomani.setHours(9, 0, 0, 0);
  assert.equal(etichettaRitardo(Math.floor(dDomani.getTime() / 1000), ADESSO), "domani alle 09:00");
  const dDopo = new Date(ADESSO);
  dDopo.setDate(dDopo.getDate() + 7);
  dDopo.setHours(8, 30, 0, 0);
  assert.match(etichettaRitardo(Math.floor(dDopo.getTime() / 1000), ADESSO), /alle 08:30$/);
});

// --- Zoom e formattazione ----------------------------------------------------

test("lo zoom produce la dimensione attesa e resta nel limite", () => {
  assert.equal(stileZoom(100, 12), "font-size: 12px");
  assert.equal(stileZoom(150, 12), "font-size: 18px");
  assert.equal(stileZoom(1, 12), stileZoom(50, 12));
  assert.equal(stileZoom(9999, 12), stileZoom(400, 12));
});

test("la formattazione produce il markup atteso e fuga il testo", () => {
  assert.equal(markupFormattazione("barrato", "fermo", undefined), "<s>fermo</s>");
  assert.equal(
    markupFormattazione("evidenzia", "x", "#ffff00"),
    '<span style="background-color: #ffff00">x</span>',
  );
  assert.equal(markupFormattazione("cancella_formattazione", "testo", undefined), "testo");
  assert.match(markupFormattazione("testo_normale", "ciao", undefined), /inherit/);
  assert.equal(markupFormattazione("sconosciuto", "x", undefined), null);
  assert.ok(!markupFormattazione("barrato", "<script>", undefined).includes("<script>"));
});

test("i colori di evidenziazione sono quelli del riferimento", () => {
  assert.equal(COLORI_EVIDENZIAZIONE.length, 5);
  assert.equal(COLORI_EVIDENZIAZIONE[0].etichetta, "Giallo");
  assert.equal(COLORI_EVIDENZIAZIONE[COLORI_EVIDENZIAZIONE.length - 1].etichetta, "Nessuno");
});

// --- Conferme e invio programmato -------------------------------------------

test("la richiesta di conferma è riconosciuta dallo stato", () => {
  assert.equal(chiedeConferma({ lettura: true, recapito: false }), true);
  assert.equal(chiedeConferma({ lettura: false, recapito: true }), true);
  assert.equal(chiedeConferma({ lettura: false, recapito: false }), false);
  assert.equal(chiedeConferma(null), false);
  assert.equal(ETICHETTE_CONFERME.invia, "Invia la conferma");
  assert.equal(ETICHETTE_CONFERME.nonInviare, "Non inviare");
});

test("la data del datetime-local fa andata e ritorno", () => {
  const quando = Math.floor(Date.UTC(2026, 9, 14, 9, 0, 0) / 1000);
  const valore = valoreDatetimeLocal(quando);
  assert.equal(epochDaDatetimeLocal(valore), quando);
  assert.equal(epochDaDatetimeLocal(""), null);
  assert.equal(epochDaDatetimeLocal("non-una-data"), null);
});

// --- Scelte rapide da tastiera ----------------------------------------------

test("le scorciatoie elencate sono quelle reali del programma", () => {
  assert.ok(SCORCIATOIE.length >= 6);
  const tasti = SCORCIATOIE.map((s) => s.tasti);
  assert.ok(tasti.includes("⌘ S"));
  assert.ok(tasti.includes("⌘ ↩"));
  assert.ok(tasti.includes("⌘ ,"));
});

// --- ✕ di chiusura delle finestre interne -----------------------------------

test("la ✕ di chiusura è una sola e ha il markup atteso", () => {
  // Al posto dei pallini finti dei semafori (rimossi), in ogni finestra interna
  // c'è una ✕ visibile. È un'unica stringa, così tutte le barre restano uguali:
  // qui si verifica il markup (senza DOM); l'aggancio alla `chiudi` di ciascuna
  // finestra è in ogni `apri…` e si prova con le prove visive.
  assert.match(PULSANTE_CHIUDI, /^<button type="button" class="win-close" data-chiudi="1"/);
  assert.match(PULSANTE_CHIUDI, /title="Chiudi"/);
  assert.match(PULSANTE_CHIUDI, /aria-label="Chiudi"/);
  assert.match(PULSANTE_CHIUDI, />✕<\/button>$/);
});

test("il telaio condiviso dai pannelli mette la ✕ in testa, prima del titolo", () => {
  const html = chromePannello("Prova", "<p>x</p>");
  assert.match(html, /<header class="settings-titlebar">\s*<button type="button" class="win-close"/);
  assert.match(html, /class="win-close"[^>]*>✕<\/button>\s*<span class="settings-title">Prova<\/span>/);
});
