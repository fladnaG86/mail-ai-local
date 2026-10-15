/**
 * Test della logica pura del blocco E (node --test): formattazione del testo
 * della notifica, limite di conteggio, normalizzazione degli orari di «non
 * disturbare» (compreso l'intervallo che scavalca la mezzanotte e i valori
 * sbagliati) e scelta del suono. Il disegno del pannello è verificato con le
 * prove visive (`?view=impostazioni-notifiche`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SUONI,
  SUONO_DEFAULT,
  MAX_CONTEGGIO_MOSTRATO,
  orarioValido,
  minutiDaOrario,
  normalizzaOrario,
  normSuono,
  etichettaSuono,
  normMinuti,
  dentroNonDisturbare,
  testoNotifica,
  titoloConteggio,
  TITOLI_PANNELLI_E,
} from "../src/views/notifiche.js";
import { PANNELLI_BLOCCO_E } from "../src/views/settings.js";

test("testoNotifica per un solo messaggio mostra mittente e oggetto", () => {
  assert.deepEqual(testoNotifica(1, "Mario Rossi", "Riunione di lunedì", true), {
    titolo: "Mario Rossi",
    corpo: "Riunione di lunedì",
  });
  // Senza anteprima non rivela il contenuto.
  const senza = testoNotifica(1, "Mario Rossi", "Riunione di lunedì", false);
  assert.equal(senza.titolo, "Nuovo messaggio");
  assert.ok(!senza.corpo.includes("Riunione"));
});

test("testoNotifica per più messaggi dice quanti sono", () => {
  const con = testoNotifica(3, "Mario Rossi", "Riunione", true);
  assert.equal(con.titolo, "3 nuovi messaggi");
  assert.ok(con.corpo.includes("Mario Rossi") && con.corpo.includes("Riunione"));
  const senza = testoNotifica(3, "Mario Rossi", "Riunione", false);
  assert.equal(senza.titolo, "3 nuovi messaggi");
  assert.ok(!senza.corpo.includes("Mario"));
});

test("testoNotifica non inventa su mittente e oggetto vuoti", () => {
  const { titolo, corpo } = testoNotifica(1, "  ", "", true);
  assert.equal(titolo, "Mittente sconosciuto");
  assert.equal(corpo, "(nessun oggetto)");
});

test("titoloConteggio rispetta il limite dichiarato", () => {
  assert.equal(titoloConteggio(2), "2 nuovi messaggi");
  assert.equal(titoloConteggio(MAX_CONTEGGIO_MOSTRATO), `${MAX_CONTEGGIO_MOSTRATO} nuovi messaggi`);
  assert.equal(titoloConteggio(MAX_CONTEGGIO_MOSTRATO + 1), `${MAX_CONTEGGIO_MOSTRATO}+ nuovi messaggi`);
  assert.equal(titoloConteggio(1500), "99+ nuovi messaggi");
});

test("orarioValido accetta ore e minuti sensati, anche a una cifra", () => {
  assert.ok(orarioValido("22:00"));
  assert.ok(orarioValido("7:05"));
  assert.ok(!orarioValido("24:00"));
  assert.ok(!orarioValido("22:60"));
  assert.ok(!orarioValido("22"));
  assert.ok(!orarioValido(""));
  assert.ok(!orarioValido(null));
});

test("minutiDaOrario converte e rifiuta i valori storti", () => {
  assert.equal(minutiDaOrario("22:00"), 1320);
  assert.equal(minutiDaOrario("07:00"), 420);
  assert.equal(minutiDaOrario("7:05"), 425);
  assert.equal(minutiDaOrario("25:00"), null);
  assert.equal(minutiDaOrario("abc"), null);
});

test("normalizzaOrario porta al default i valori sbagliati", () => {
  assert.equal(normalizzaOrario("7:5", "22:00"), "07:05");
  assert.equal(normalizzaOrario("22:00"), "22:00");
  assert.equal(normalizzaOrario("25:00", "07:00"), "07:00");
  assert.equal(normalizzaOrario("", "22:00"), "22:00");
  assert.equal(normalizzaOrario(null, "07:00"), "07:00");
});

test("dentroNonDisturbare copre l'intervallo che scavalca la mezzanotte", () => {
  // 22:00 → 07:00.
  assert.ok(dentroNonDisturbare(23 * 60, "22:00", "07:00"));
  assert.ok(dentroNonDisturbare(2 * 60, "22:00", "07:00"));
  assert.ok(dentroNonDisturbare(6 * 60 + 59, "22:00", "07:00"));
  assert.ok(!dentroNonDisturbare(7 * 60, "22:00", "07:00"));
  assert.ok(!dentroNonDisturbare(12 * 60, "22:00", "07:00"));
  // Stessa giornata.
  assert.ok(dentroNonDisturbare(13 * 60, "12:00", "14:00"));
  assert.ok(!dentroNonDisturbare(11 * 60, "12:00", "14:00"));
  // Intervallo vuoto (estremi uguali) e minuti "grezzi" accettati.
  assert.ok(!dentroNonDisturbare(780, 780, 780));
  assert.ok(dentroNonDisturbare(1320, 1320, 420));
  // Valori non interpretabili: non si inventa un intervallo.
  assert.ok(!dentroNonDisturbare("boh", "22:00", "07:00"));
});

test("normSuono sceglie solo suoni offerti e etichettaSuono li rende leggibili", () => {
  assert.equal(normSuono("Ping"), "Ping");
  assert.equal(normSuono("boato"), SUONO_DEFAULT);
  assert.equal(normSuono(undefined), SUONO_DEFAULT);
  assert.ok(SUONI.includes("nessuno"));
  assert.equal(etichettaSuono("nessuno"), "Nessuno (silenzioso)");
  assert.equal(etichettaSuono("Glass"), "Vetro");
});

test("normMinuti porta un valore qualsiasi nell'intervallo della giornata", () => {
  assert.equal(normMinuti(-30), 1410);
  assert.equal(normMinuti(1500), 60);
  assert.equal(normMinuti("07:30"), 450);
  assert.equal(normMinuti("boh"), null);
});

test("il riquadro Notifiche del hub ha un titolo di pannello", () => {
  assert.deepEqual(Object.values(PANNELLI_BLOCCO_E), ["notifiche"]);
  assert.equal(TITOLI_PANNELLI_E.notifiche, "Notifiche e suoni");
});
