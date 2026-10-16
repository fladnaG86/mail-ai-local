/**
 * Inviti di riunione e agenda a **elenco** (blocco G, versione inviti).
 *
 * Il modulo ha due parti, come gli altri del progetto:
 * - funzioni **pure** (formattazione italiana di data/ora e durata, etichette di
 *   stato, ordinamento e raggruppamento oggi/prossimi/passati): collaudate con
 *   `node --test`, senza DOM e senza kernel;
 * - le due finestre **solo disegno**: la barra dell'invito nel pannello di
 *   lettura (`barraInvito`), l'agenda a elenco (`apriAgenda`) e il modulo di una
 *   nuova riunione (`apriNuovaRiunione`).
 *
 * Dichiarato: questa è una versione a **inviti**, non un calendario. L'agenda è
 * un **elenco** per data — non ci sono viste mese/settimana/giorno a griglia, né
 * il calcolo delle occorrenze di una ricorrenza, né promemoria.
 *
 * I comandi del kernel (`inviti_elenco`, `invito_da_messaggio`,
 * `invito_rispondi`, `invito_crea`) si chiamano da `src/main.js`; qui non si
 * tocca il kernel.
 */

import { rendiSpostabile } from "./finestre.js";
import { fugaHtml as fuga } from "./mail-actions.js";
import { collegaCampoDestinatario } from "./contatti.js";
import { PULSANTE_CHIUDI } from "./blocco-i2.js";

/** Giorni abbreviati in italiano, come nelle date del riferimento. */
const GIORNI_BREVI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

/** Stati che significano «l'utente ha risposto». */
export const STATI_RISPOSTI = ["accettato", "tentativo", "rifiutato"];

// ---------------------------------------------------------------------------
// Funzioni pure
// ---------------------------------------------------------------------------

/**
 * Formatta una data in italiano: «gio 15/10/2026, 15:00». Per un evento di
 * giornata intera: «gio 15/10/2026 (tutto il giorno)». Vuoto se la data manca.
 */
export function formattaDataOra(epoch, giornataIntera = false) {
  const n = Number(epoch);
  if (!n || n <= 0) return "";
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const due = (x) => String(x).padStart(2, "0");
  const data = `${GIORNI_BREVI[d.getDay()]} ${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (giornataIntera) return `${data} (tutto il giorno)`;
  return `${data}, ${due(d.getHours())}:${due(d.getMinutes())}`;
}

/**
 * Durata leggibile fra due istanti (secondi Unix): «45 min», «1 h 30 min»,
 * «2 ore», «3 giorni». Vuota se la fine manca o non è successiva all'inizio.
 */
export function formattaDurata(inizio, fine) {
  const a = Number(inizio);
  const b = Number(fine);
  if (!a || !b || b <= a) return "";
  const minuti = Math.round((b - a) / 60);
  if (minuti >= 1440) {
    const giorni = Math.round(minuti / 1440);
    return giorni === 1 ? "1 giorno" : `${giorni} giorni`;
  }
  if (minuti < 60) return `${minuti} min`;
  const ore = Math.floor(minuti / 60);
  const resto = minuti % 60;
  if (resto === 0) return ore === 1 ? "1 ora" : `${ore} ore`;
  return `${ore} h ${resto} min`;
}

/** Etichetta italiana dello stato di un invito. */
export function etichettaStato(stato) {
  switch (String(stato || "").toLowerCase()) {
    case "accettato":
      return "Accettato";
    case "tentativo":
      return "Tentativo";
    case "rifiutato":
      return "Rifiutato";
    case "annullato":
      return "Annullato";
    case "in_attesa":
    default:
      return "In attesa";
  }
}

/** Vero se l'utente ha già risposto all'invito. */
export function haRisposto(stato) {
  return STATI_RISPOSTI.includes(String(stato || "").toLowerCase());
}

/** Il nome leggibile dell'organizzatore (o il suo indirizzo). */
export function nomeOrganizzatore(invito) {
  if (!invito) return "";
  const nome = String(invito.organizzatoreNome || "").trim();
  if (nome) return nome;
  return String(invito.organizzatore || "").trim();
}

/** Riepilogo «quando» di un invito: data/ora e durata, se c'è. */
export function riepilogoQuando(invito) {
  if (!invito) return "";
  const quando = formattaDataOra(invito.inizio, !!invito.giornataIntera);
  const durata = invito.giornataIntera ? "" : formattaDurata(invito.inizio, invito.fine);
  return durata ? `${quando} · ${durata}` : quando;
}

/** L'elenco ordinato per data di inizio (dal più vicino). */
export function ordinaInviti(inviti) {
  return (Array.isArray(inviti) ? inviti.slice() : []).sort((a, b) => {
    const ia = Number(a && a.inizio) || 0;
    const ib = Number(b && b.inizio) || 0;
    return ia - ib;
  });
}

/** La mezzanotte locale del giorno di `adesso`. */
function inizioGiorno(adesso) {
  const d = new Date(adesso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Raggruppa gli inviti in **oggi**, **prossimi** (dopo oggi) e **passati** (prima
 * di oggi). Ogni gruppo è ordinato per data. Un invito annullato resta nel
 * gruppo della sua data: lo stato lo dichiara.
 */
export function raggruppaInviti(inviti, adesso = Date.now()) {
  const oggi0 = inizioGiorno(adesso);
  const domani0 = oggi0 + 86_400_000;
  const out = { oggi: [], prossimi: [], passati: [] };
  for (const inv of ordinaInviti(inviti)) {
    const t = (Number(inv && inv.inizio) || 0) * 1000;
    if (t >= domani0) out.prossimi.push(inv);
    else if (t >= oggi0) out.oggi.push(inv);
    else out.passati.push(inv);
  }
  return out;
}

/** Conteggio totale degli inviti di un elenco. */
export function conteggioInviti(inviti) {
  return (Array.isArray(inviti) ? inviti : []).length;
}

/** Vero se l'invito è di quelli creati da noi (non si risponde ai propri). */
export function invitoInUscita(invito) {
  return !!(invito && invito.uscita);
}

/** `epoch` → valore per `<input type="datetime-local">` (ora locale). */
export function valoreDatetimeLocale(epoch) {
  const n = Number(epoch);
  if (!n || n <= 0) return "";
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const due = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}:${due(d.getMinutes())}`;
}

/** `epoch` → valore per `<input type="date">` (ora locale). */
export function valoreDataLocale(epoch) {
  const v = valoreDatetimeLocale(epoch);
  return v ? v.split("T")[0] : "";
}

/** Valore di un `<input type="datetime-local">` → secondi Unix (0 se vuoto). */
export function epochDaDatetimeLocale(valore) {
  const v = String(valore || "").trim();
  if (!v) return 0;
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor(t / 1000);
}

/** Valore di un `<input type="date">` → secondi Unix a mezzanotte locale. */
export function epochDaDataLocale(valore) {
  const v = String(valore || "").trim();
  if (!v) return 0;
  const t = new Date(`${v}T00:00`).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor(t / 1000);
}

/** Inviti di esempio, per le prove visive nel browser. */
export function invitiDiEsempio() {
  const adesso = new Date();
  const alle = (giorni, ore, minuti) => {
    const d = new Date(adesso);
    d.setDate(d.getDate() + giorni);
    d.setHours(ore, minuti, 0, 0);
    return Math.floor(d.getTime() / 1000);
  };
  return [
    {
      id: 1,
      uid: "riunione-q4@esempiogroup.it",
      sequenza: 1,
      oggetto: "Piano manutenzione Q4",
      organizzatore: "luca.bianchi@esempiogroup.it",
      organizzatoreNome: "Luca Bianchi",
      inizio: alle(0, 15, 0),
      fine: alle(0, 16, 30),
      giornataIntera: false,
      luogo: "Sala riunioni — Sede",
      stato: "in_attesa",
      metodo: "REQUEST",
      descrizione: "Ordine del giorno: interventi su VED e Beta, costi del fermo impianto.",
      notaRicorrenza: null,
      invitati: [
        { indirizzo: "mario.rossi@esempiogroup.it", nome: "Mario Rossi", partstat: "NEEDS-ACTION" },
      ],
      cartella: "INBOX",
      uidMessaggio: "101",
      uscita: false,
    },
    {
      id: 2,
      uid: "verifica-impianti@beta.it",
      sequenza: 0,
      oggetto: "Verifica quadri elettrici",
      organizzatore: "info@beta.it",
      organizzatoreNome: "",
      inizio: alle(2, 9, 30),
      fine: alle(2, 11, 0),
      giornataIntera: false,
      luogo: "Capannone 3",
      stato: "accettato",
      metodo: "REQUEST",
      descrizione: "",
      notaRicorrenza: null,
      invitati: [],
      cartella: "INBOX",
      uidMessaggio: "102",
      uscita: false,
    },
    {
      id: 3,
      uid: "riunione-sicurezza@esempiogroup.it",
      sequenza: 0,
      oggetto: "Riunione sicurezza (creata da te)",
      organizzatore: "mario.rossi@esempiogroup.it",
      organizzatoreNome: "Mario Rossi",
      inizio: alle(1, 11, 0),
      fine: alle(1, 12, 0),
      giornataIntera: false,
      luogo: "Sala 1",
      stato: "in_attesa",
      metodo: "REQUEST",
      descrizione: "Punto sulla sicurezza dei cantieri.",
      notaRicorrenza: null,
      invitati: [
        { indirizzo: "marco.ferrari@esempiogroup.it", nome: "Marco Ferrari", partstat: "NEEDS-ACTION" },
      ],
      cartella: "Posta inviata",
      uidMessaggio: "",
      uscita: true,
    },
  ];
}

/** Un invito di esempio, per la barra nel pannello di lettura (prove visive). */
export function invitoEsempio() {
  return invitiDiEsempio()[0];
}

// ---------------------------------------------------------------------------
// Barra dell'invito nel pannello di lettura
// ---------------------------------------------------------------------------

/**
 * Costruisce la barra discreta in cima a un messaggio che porta un invito.
 *
 * `opzioni.onRispondi(risposta)` è chiamata solo al clic su Accetta / Tentativo /
 * Rifiuta: **nessuna risposta parte da sé**. Deve restituire un invito aggiornato
 * (o una promessa che lo risolve); la barra lo ridisegna. `opzioni.onApriAgenda`
 * apre l'agenda.
 *
 * Se l'utente ha già risposto (o l'invito è annullato) la barra mostra lo stato
 * invece dei pulsanti.
 */
export function barraInvito(invito, opzioni = {}) {
  const barra = document.createElement("div");
  barra.className = "invito-bar";

  let corrente = Object.assign({}, invito);

  const disegna = () => {
    const chi = fuga(nomeOrganizzatore(corrente)) || "un organizzatore";
    const quando = fuga(riepilogoQuando(corrente));
    const dove = String(corrente.luogo || "").trim();
    const risposto = haRisposto(corrente.stato);
    const annullato = String(corrente.stato || "") === "annullato";

    let testa = annullato
      ? `Riunione annullata (da ${chi})`
      : `Richiesta di riunione da ${chi}`;
    let statoTesto = "";
    if (risposto || annullato || invitoInUscita(corrente)) {
      statoTesto = invitoInUscita(corrente)
        ? "invito inviato da te"
        : etichettaStato(corrente.stato);
    }

    let pulsanti = "";
    if (!risposto && !annullato && !invitoInUscita(corrente)) {
      pulsanti =
        '<button type="button" class="invito-btn invito-btn--ok" data-risp="accettato">Accetta</button>' +
        '<button type="button" class="invito-btn" data-risp="tentativo">Tentativo</button>' +
        '<button type="button" class="invito-btn" data-risp="rifiutato">Rifiuta</button>';
    }
    pulsanti +=
      '<button type="button" class="invito-btn invito-btn--agenda" data-azione="agenda">Apri l\'agenda</button>';

    barra.innerHTML =
      '<span class="invito-ic" aria-hidden="true">📆</span>' +
      `<span class="invito-testo"><b>${testa}</b>` +
      `<span class="invito-quando">${quando}${dove ? ` · ${fuga(dove)}` : ""}</span>` +
      (corrente.notaRicorrenza ? `<span class="invito-nota-ric">${fuga(corrente.notaRicorrenza)}</span>` : "") +
      "</span>" +
      (statoTesto ? `<span class="invito-stato invito-stato--${fuga(String(corrente.stato))}">${fuga(statoTesto)}</span>` : "") +
      `<span class="invito-azioni">${pulsanti}</span>` +
      '<span class="invito-esito" role="status"></span>';

    for (const b of barra.querySelectorAll("[data-risp]")) {
      b.addEventListener("click", () => rispondi(b, b.dataset.risp));
    }
    const apriAgenda = barra.querySelector('[data-azione="agenda"]');
    if (apriAgenda) apriAgenda.addEventListener("click", () => opzioni.onApriAgenda && opzioni.onApriAgenda());
  };

  const esito = (testo, errore) => {
    const el = barra.querySelector(".invito-esito");
    if (!el) return;
    el.textContent = testo || "";
    el.classList.toggle("invito-esito--errore", !!errore);
  };

  const rispondi = async (bottone, risposta) => {
    if (typeof opzioni.onRispondi !== "function") {
      esito(`Risposta «${etichettaStato(risposta)}» non collegata in questa prova.`, true);
      return;
    }
    for (const b of barra.querySelectorAll("[data-risp]")) b.disabled = true;
    esito("Invio della risposta…", false);
    try {
      const aggiornato = await opzioni.onRispondi(risposta);
      corrente = aggiornato && typeof aggiornato === "object"
        ? Object.assign({}, corrente, aggiornato)
        : Object.assign({}, corrente, { stato: risposta });
      disegna();
      esito(`Risposta «${etichettaStato(risposta)}» inviata all'organizzatore.`, false);
    } catch (err) {
      for (const b of barra.querySelectorAll("[data-risp]")) b.disabled = false;
      esito(`Risposta non inviata: ${err && err.message ? err.message : err}`, true);
      void bottone;
    }
  };

  disegna();
  return barra;
}

// ---------------------------------------------------------------------------
// Agenda a elenco
// ---------------------------------------------------------------------------

/** Una riga dell'agenda: quando, oggetto, organizzatore, luogo, stato, azioni. */
function rigaAgenda(inv) {
  const risposto = haRisposto(inv.stato);
  const annullato = String(inv.stato || "") === "annullato";
  const uscita = invitoInUscita(inv);
  const dove = String(inv.luogo || "").trim();
  let azioni = "";
  if (!uscita && !risposto && !annullato) {
    azioni =
      '<button type="button" class="invito-btn invito-btn--ok" data-risp="accettato">Accetta</button>' +
      '<button type="button" class="invito-btn" data-risp="tentativo">Tentativo</button>' +
      '<button type="button" class="invito-btn" data-risp="rifiutato">Rifiuta</button>';
  }
  const etichetta = uscita ? "invito inviato da te" : etichettaStato(inv.stato);
  return `<div class="agenda-riga" data-id="${inv.id}">
      <span class="agenda-quando">${fuga(riepilogoQuando(inv))}</span>
      <span class="agenda-oggetto">${fuga(inv.oggetto || "(senza oggetto)")}</span>
      <span class="agenda-chi">${fuga(nomeOrganizzatore(inv) || "—")}</span>
      <span class="agenda-dove">${dove ? fuga(dove) : ""}</span>
      <span class="agenda-stato agenda-stato--${fuga(String(inv.stato))}">${fuga(etichetta)}</span>
      ${inv.notaRicorrenza ? `<span class="agenda-ric">${fuga(inv.notaRicorrenza)}</span>` : ""}
      <span class="agenda-azioni">${azioni}</span>
    </div>`;
}

function elencoAgenda(titolo, inviti) {
  if (!inviti.length) return "";
  return `<div class="agenda-gruppo-titolo">${fuga(titolo)}</div>${inviti.map(rigaAgenda).join("")}`;
}

/** Markup della finestra dell'agenda. */
function markupAgenda() {
  return `
  <div class="agenda-win" role="dialog" aria-label="Agenda — inviti di riunione">
    <header class="agenda-titlebar">
      ${PULSANTE_CHIUDI}
      <span class="agenda-title">Agenda — inviti di riunione</span>
      <button type="button" class="agenda-nuova rubrica-btn">＋ Nuova riunione</button>
    </header>
    <p class="agenda-avvertenza">Agenda a <b>elenco</b> (non una griglia mese/settimana/giorno): inviti in arrivo e in uscita, ordinati per data. Le ricorrenze complesse mostrano la sola prima occorrenza.</p>
    <div class="agenda-corpo" id="agenda-corpo"></div>
    <div class="agenda-nota" role="status" aria-live="polite"></div>
  </div>`;
}

/**
 * Apre l'agenda a elenco sopra la vista principale.
 *
 * `opzioni.elenco()` è una funzione asincrona che restituisce gli inviti (dentro
 * Tauri chiama `inviti_elenco`; nel browser i dati di esempio).
 * `opzioni.onRispondi(invito, risposta)` invia la risposta; `opzioni.onNuova()`
 * apre il modulo di una nuova riunione.
 */
export function apriAgenda(opzioni = {}) {
  document.querySelectorAll(".agenda-overlay").forEach((el) => el.remove());
  const overlay = document.createElement("div");
  overlay.className = "agenda-overlay";
  overlay.innerHTML = markupAgenda();
  document.body.append(overlay);
  rendiSpostabile(overlay);

  const corpo = overlay.querySelector("#agenda-corpo");
  const notaEl = overlay.querySelector(".agenda-nota");
  const nota = (testo, errore) => {
    notaEl.textContent = testo || "";
    notaEl.classList.toggle("agenda-nota--errore", !!errore);
  };
  const chiudi = () => overlay.remove();

  const disegna = (inviti) => {
    const g = raggruppaInviti(inviti);
    const html =
      elencoAgenda("Oggi", g.oggi) +
      elencoAgenda("Prossimi", g.prossimi) +
      elencoAgenda("Passati", g.passati);
    corpo.innerHTML =
      html ||
      '<div class="agenda-vuoto">Nessun invito ancora. Gli inviti che arrivano per posta compaiono qui; da «＋ Nuova riunione» ne crei uno in uscita.</div>';
    corpo.querySelectorAll("[data-risp]").forEach((b) => {
      b.addEventListener("click", async () => {
        const riga = b.closest(".agenda-riga");
        const inv = inviti.find((x) => String(x.id) === riga.dataset.id);
        nota("Invio della risposta…", false);
        try {
          if (typeof opzioni.onRispondi === "function") await opzioni.onRispondi(inv, b.dataset.risp);
          inv.stato = b.dataset.risp;
          disegna(inviti);
          nota(`Risposta «${etichettaStato(b.dataset.risp)}» inviata all'organizzatore.`, false);
        } catch (err) {
          nota(`Risposta non inviata: ${err && err.message ? err.message : err}`, true);
        }
      });
    });
  };

  const ricarica = async () => {
    let inviti = [];
    try {
      if (typeof opzioni.elenco === "function") inviti = (await opzioni.elenco()) || [];
    } catch (err) {
      nota(`Non riesco a leggere gli inviti: ${err && err.message ? err.message : err}`, true);
    }
    disegna(Array.isArray(inviti) ? inviti : []);
    return inviti;
  };

  overlay.querySelector(".win-close").addEventListener("click", chiudi);
  overlay.querySelector(".agenda-nuova").addEventListener("click", () => {
    if (typeof opzioni.onNuova === "function") opzioni.onNuova();
    else nota("Nuova riunione non collegata in questa prova.", true);
  });
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) chiudi();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") chiudi();
  });

  ricarica();
  overlay.__ricarica = ricarica;
  return overlay;
}

// ---------------------------------------------------------------------------
// Nuova riunione (modulo in uscita)
// ---------------------------------------------------------------------------

/** Markup del modulo di una nuova riunione. */
function markupNuova(iniziale) {
  const quando = iniziale.inizio
    ? valoreDatetimeLocale(iniziale.inizio)
    : valoreDatetimeLocale(prossimaOraTonda());
  const fine = iniziale.fine ? valoreDatetimeLocale(iniziale.fine) : "";
  return `
  <div class="nuova-win" role="dialog" aria-label="Nuova riunione">
    <header class="agenda-titlebar">
      ${PULSANTE_CHIUDI}
      <span class="agenda-title">Nuova riunione — invito in uscita</span>
    </header>
    <div class="nuova-corpo">
      <label class="rubrica-campo"><span>Oggetto</span>
        <input type="text" id="nu-oggetto" autocomplete="off" value="${fuga(iniziale.oggetto || "")}" /></label>
      <label class="rubrica-campo"><span>Invitati (A:)</span>
        <input type="text" id="nu-invitati" autocomplete="off" value="${fuga(iniziale.invitati || "")}" /></label>
      <label class="nu-check"><input type="checkbox" id="nu-intera"${iniziale.giornataIntera ? " checked" : ""} /> Giornata intera (senza orario)</label>
      <div class="nu-due">
        <label class="rubrica-campo"><span id="nu-inizio-lb">Inizio</span>
          <input type="datetime-local" id="nu-inizio" value="${quando}" /></label>
        <label class="rubrica-campo"><span>Fine</span>
          <input type="datetime-local" id="nu-fine" value="${fine}" /></label>
      </div>
      <label class="rubrica-campo"><span>Luogo</span>
        <input type="text" id="nu-luogo" autocomplete="off" value="${fuga(iniziale.luogo || "")}" /></label>
      <label class="rubrica-campo"><span>Messaggio accompagnatorio</span>
        <textarea id="nu-messaggio" rows="4">${fuga(iniziale.descrizione || "")}</textarea></label>
      <p class="im-nota">L'invito parte come allegato <b>text/calendar</b> (METHOD:REQUEST) con un UID nuovo e il tuo indirizzo come ORGANIZER. Nessun invito viene inviato da sé: solo col pulsante «Invia invito».</p>
      <div class="nu-azioni">
        <button type="button" class="rubrica-btn nuova-annulla">Annulla</button>
        <button type="button" class="rubrica-btn rubrica-btn--ok nuova-invia">Invia invito</button>
      </div>
      <div class="nuova-nota" role="status" aria-live="polite"></div>
    </div>
  </div>`;
}

/** Un'ora tonda fra un'ora (default dell'inizio del modulo). */
function prossimaOraTonda() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Apre il modulo di una nuova riunione. `opzioni.iniziale` precompila i campi
 * (invitati, oggetto, descrizione) — è il caso della creazione **dalla
 * composizione**, dove il corpo scritto diventa il messaggio accompagnatorio.
 *
 * `opzioni.onCrea(datiRiunione, invitati)` invia l'invito e restituisce l'esito.
 * `opzioni.suggerire` alimenta il completamento degli invitati dalla rubrica.
 */
export function apriNuovaRiunione(opzioni = {}) {
  document.querySelectorAll(".nuova-overlay").forEach((el) => el.remove());
  const iniziale = opzioni.iniziale || {};
  const overlay = document.createElement("div");
  overlay.className = "nuova-overlay";
  overlay.innerHTML = markupNuova(iniziale);
  document.body.append(overlay);
  rendiSpostabile(overlay);

  const notaEl = overlay.querySelector(".nuova-nota");
  const nota = (testo, errore) => {
    notaEl.textContent = testo || "";
    notaEl.classList.toggle("nuova-nota--errore", !!errore);
  };
  const chiudi = () => overlay.remove();

  const campoInvitati = overlay.querySelector("#nu-invitati");
  collegaCampoDestinatario(campoInvitati, { suggerire: opzioni.suggerire });

  const intera = overlay.querySelector("#nu-intera");
  const inizio = overlay.querySelector("#nu-inizio");
  const fine = overlay.querySelector("#nu-fine");
  const labelInizio = overlay.querySelector("#nu-inizio-lb");
  const adattaTipo = () => {
    const t = intera.checked ? "date" : "datetime-local";
    inizio.type = t;
    fine.type = t;
    labelInizio.textContent = intera.checked ? "Giorno" : "Inizio";
  };
  intera.addEventListener("change", adattaTipo);
  adattaTipo();

  overlay.querySelector(".win-close").addEventListener("click", chiudi);
  overlay.querySelector(".nuova-annulla").addEventListener("click", chiudi);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) chiudi();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") chiudi();
  });

  overlay.querySelector(".nuova-invia").addEventListener("click", async () => {
    const interaOn = intera.checked;
    const inizioEpoch = interaOn
      ? epochDaDataLocale(inizio.value)
      : epochDaDatetimeLocale(inizio.value);
    const fineEpoch = interaOn ? epochDaDataLocale(fine.value) : epochDaDatetimeLocale(fine.value);
    const dati = {
      oggetto: overlay.querySelector("#nu-oggetto").value.trim(),
      inizio: inizioEpoch,
      fine: fineEpoch > inizioEpoch ? fineEpoch : null,
      luogo: overlay.querySelector("#nu-luogo").value.trim(),
      descrizione: overlay.querySelector("#nu-messaggio").value,
      giornataIntera: interaOn,
    };
    const invitati = campoInvitati.value
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!dati.oggetto) {
      nota("Oggetto mancante: scrivere un oggetto per la riunione.", true);
      return;
    }
    if (!dati.inizio) {
      nota("Data di inizio mancante: indicare giorno e ora della riunione.", true);
      return;
    }
    if (!invitati.length) {
      nota("Indicare almeno un invitato nel campo Invitati.", true);
      return;
    }
    if (typeof opzioni.onCrea !== "function") {
      nota("Invio dell'invito non collegato in questa prova.", true);
      return;
    }
    nota("Invio dell'invito…", false);
    try {
      const esito = await opzioni.onCrea(dati, invitati);
      nota(esito || "Invito inviato.", false);
      setTimeout(() => chiudi(), 900);
    } catch (err) {
      nota(`Invito non inviato: ${err && err.message ? err.message : err}`, true);
    }
  });

  return overlay;
}
