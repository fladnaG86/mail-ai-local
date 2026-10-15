/**
 * Test della logica pura degli inviti di riunione (node --test): formattazione
 * italiana di data/ora e durata, etichette di stato, ordinamento e
 * raggruppamento oggi/prossimi/passati. Il disegno è verificato con le prove
 * visive (`?view=invito`, `?view=agenda`, `?view=nuova-riunione`); qui si
 * collauda ciò che non tocca il DOM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formattaDataOra,
  formattaDurata,
  etichettaStato,
  haRisposto,
  nomeOrganizzatore,
  riepilogoQuando,
  ordinaInviti,
  raggruppaInviti,
  conteggioInviti,
  invitoInUscita,
  valoreDatetimeLocale,
  valoreDataLocale,
  epochDaDatetimeLocale,
  epochDaDataLocale,
  invitiDiEsempio,
  invitoEsempio,
  STATI_RISPOSTI,
} from "../src/views/inviti.js";

/** Secondi Unix di una data/ora **locale** (come le mostra l'agenda). */
function locale(anno, mese0, giorno, ore, minuti = 0) {
  return Math.floor(new Date(anno, mese0, giorno, ore, minuti, 0, 0).getTime() / 1000);
}

test("la data/ora si formatta in italiano e dice la giornata intera", () => {
  // 15 ottobre 2026 è un giovedì.
  const t = locale(2026, 9, 15, 15, 0);
  assert.equal(formattaDataOra(t), "gio 15/10/2026, 15:00");
  assert.equal(formattaDataOra(t, true), "gio 15/10/2026 (tutto il giorno)");
  // Una data assente non inventa nulla.
  assert.equal(formattaDataOra(0), "");
  assert.equal(formattaDataOra(undefined), "");
});

test("la durata si legge in minuti, ore e giorni, senza zeri inutili", () => {
  const base = locale(2026, 9, 15, 15, 0);
  assert.equal(formattaDurata(base, base + 45 * 60), "45 min");
  assert.equal(formattaDurata(base, base + 90 * 60), "1 h 30 min");
  assert.equal(formattaDurata(base, base + 2 * 3600), "2 ore");
  assert.equal(formattaDurata(base, base + 3600), "1 ora");
  assert.equal(formattaDurata(base, base + 3 * 86_400), "3 giorni");
  // Fine assente o non successiva: nessuna durata (mai un numero inventato).
  assert.equal(formattaDurata(base, 0), "");
  assert.equal(formattaDurata(base, base), "");
  assert.equal(formattaDurata(base, base - 60), "");
});

test("le etichette di stato sono quelle italiane del pannello", () => {
  assert.equal(etichettaStato("in_attesa"), "In attesa");
  assert.equal(etichettaStato("accettato"), "Accettato");
  assert.equal(etichettaStato("tentativo"), "Tentativo");
  assert.equal(etichettaStato("rifiutato"), "Rifiutato");
  assert.equal(etichettaStato("annullato"), "Annullato");
  // Uno stato ignoto ricade su «In attesa», non su una parola inventata.
  assert.equal(etichettaStato("boh"), "In attesa");
});

test("«già risposto» vale solo per accettato, tentativo e rifiutato", () => {
  assert.deepEqual(STATI_RISPOSTI, ["accettato", "tentativo", "rifiutato"]);
  assert.ok(haRisposto("accettato"));
  assert.ok(haRisposto("Tentativo"));
  assert.ok(!haRisposto("in_attesa"));
  assert.ok(!haRisposto("annullato"));
});

test("l'organizzatore usa il nome, o l'indirizzo se il nome manca", () => {
  assert.equal(
    nomeOrganizzatore({ organizzatoreNome: "Luca Bianchi", organizzatore: "luca@example.it" }),
    "Luca Bianchi",
  );
  assert.equal(nomeOrganizzatore({ organizzatoreNome: "", organizzatore: "info@beta.it" }), "info@beta.it");
  assert.equal(nomeOrganizzatore(null), "");
});

test("il riepilogo «quando» unisce data/ora e durata", () => {
  const inizio = locale(2026, 9, 15, 15, 0);
  const r = riepilogoQuando({ inizio, fine: inizio + 90 * 60, giornataIntera: false });
  assert.equal(r, "gio 15/10/2026, 15:00 · 1 h 30 min");
  const intero = riepilogoQuando({ inizio, fine: inizio + 86_400, giornataIntera: true });
  assert.equal(intero, "gio 15/10/2026 (tutto il giorno)");
});

test("l'elenco si ordina per data di inizio crescente", () => {
  const a = { id: 1, inizio: locale(2026, 9, 15, 10, 0) };
  const b = { id: 2, inizio: locale(2026, 9, 14, 9, 0) };
  const c = { id: 3, inizio: locale(2026, 9, 16, 8, 0) };
  const ordinati = ordinaInviti([a, b, c]);
  assert.deepEqual(
    ordinati.map((x) => x.id),
    [2, 1, 3],
  );
  // Non muta l'elenco originale.
  assert.deepEqual([a, b, c].map((x) => x.id), [1, 2, 3]);
});

test("gli inviti si raggruppano in oggi / prossimi / passati", () => {
  const adesso = new Date(2026, 9, 15, 12, 0, 0, 0).getTime();
  const inv = (id, inizio) => ({ id, inizio });
  const g = raggruppaInviti(
    [
      inv("domani", locale(2026, 9, 16, 9, 0)),
      inv("oggi-pomeriggio", locale(2026, 9, 15, 18, 0)),
      inv("ieri", locale(2026, 9, 14, 9, 0)),
      inv("oggi-mattina", locale(2026, 9, 15, 9, 0)),
      inv("fra-una-settimana", locale(2026, 9, 22, 9, 0)),
    ],
    adesso,
  );
  assert.deepEqual(
    g.oggi.map((x) => x.id),
    ["oggi-mattina", "oggi-pomeriggio"],
  );
  assert.deepEqual(
    g.prossimi.map((x) => x.id),
    ["domani", "fra-una-settimana"],
  );
  assert.deepEqual(
    g.passati.map((x) => x.id),
    ["ieri"],
  );
  assert.equal(conteggioInviti([1, 2, 3]), 3);
  assert.equal(conteggioInviti(null), 0);
});

test("un invito creato da noi si riconosce (non si risponde ai propri)", () => {
  assert.ok(invitoInUscita({ uscita: true }));
  assert.ok(!invitoInUscita({ uscita: false }));
  assert.ok(!invitoInUscita(null));
});

test("i valori dei campi data/ora sono locali e fanno andata e ritorno", () => {
  const t = locale(2026, 9, 15, 15, 0);
  assert.equal(valoreDatetimeLocale(t), "2026-10-15T15:00");
  assert.equal(epochDaDatetimeLocale("2026-10-15T15:00"), t);
  assert.equal(valoreDataLocale(t), "2026-10-15");
  assert.equal(epochDaDataLocale("2026-10-15"), locale(2026, 9, 15, 0, 0));
  // Valori vuoti o non interpretabili non inventano un istante.
  assert.equal(valoreDatetimeLocale(0), "");
  assert.equal(epochDaDatetimeLocale(""), 0);
  assert.equal(epochDaDataLocale("storta"), 0);
});

test("gli inviti di esempio hanno la forma attesa dalla barra e dall'agenda", () => {
  const e = invitoEsempio();
  assert.ok(e.uid && e.oggetto && e.inizio > 0);
  assert.equal(typeof e.giornataIntera, "boolean");
  assert.ok(Array.isArray(invitiDiEsempio()));
  assert.ok(invitiDiEsempio().length >= 2);
  // Un invito di esempio è in uscita: l'agenda lo dichiara invece di offrire i pulsanti.
  assert.ok(invitiDiEsempio().some(invitoInUscita));
});
