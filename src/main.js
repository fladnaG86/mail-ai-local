import { initTheme, setTheme, getTheme } from "./theme.js";
import {
  renderRibbon, renderSidebar, renderList, renderReading, renderStatus,
  preparaCorpo, mostraCorpoHtml, mostraAllegati, testoInParagrafi,
  passoZoomLettura, serveRidisegnareLettura,
  sampleMessages, daRigaKernel, sampleFolders,
  renderListaConversazioni, daConversazioneKernel, impostaConversazioniAperte,
} from "./views/main-view.js";
import {
  apriComposizione,
  avvisiSimulati,
  eseguiControllo,
  impostaFirme,
  impostaApriFirma,
  impostaApriRiunione,
  impostaSalvaBozza,
  impostaSalvaPreferenze,
  impostaPianificaInvio,
  impostaAllegati,
  impostaPreferenzeComposizione,
  impostaSuggeritoreDestinatari,
  markupTabella,
  notaInBozza,
  payloadInvio,
} from "./views/compose.js";
import {
  renderSchedaIA, schedaDiEsempio, chiediConsensoCloud,
} from "./views/assistant.js";
import { apriImpostazioni } from "./views/settings.js";
import { firmeEffettive, idFirmaPredefinita } from "./views/firme.js";
import {
  apriPannelloFirme,
  apriPannelloPosta,
  apriPannelloPrivacy,
} from "./views/blocco-d2.js";
import {
  apriPannelloMail,
  classePannelloLettura,
  normImmagini,
  normPannello,
  secondiSegnaLetto,
} from "./views/impostazioni-mail.js";
import { apriAccount, accountDiEsempio, secondoAccountDiEsempio } from "./views/account.js";
import {
  alberoCartelle,
  etichettaAccountAttivo,
  riepilogoSyncTutti,
  testoConfermaEliminaAccount,
  risolviAccountAzione,
  risolviAccountCartella,
  nonLettiDi,
  CARTELLA_POSTA_IN_ARRIVO,
} from "./views/cartelle-account.js";
import { apriPannelloNotifiche } from "./views/notifiche.js";
import {
  apriAssistenteIA,
  impostazioniDiEsempio,
  righeDiEsempio,
} from "./views/ai-settings.js";
import {
  FILTRI,
  filtra,
  passaFiltro,
  etichettaFiltro,
  categorieRiga,
  alternaCategoria,
  fugaHtml,
  testoNonDisponibileRibbon,
  apriMenu,
  chiudiMenu,
  vociMenuMessaggio,
  vociMenuConversazione,
  vociMenuCartella,
  SCADENZE,
  testoConfermaEliminaCartella,
  testoConfermaSvuotaCartella,
  testoConfermaSvuotaPostaEliminata,
  testoConfermaSvuotamento,
  ePostaEliminata,
} from "./views/mail-actions.js";
import {
  apriPannelloCategorie,
  mappaColoriCategorie,
  vociMenuCategorie,
  categoriePredefinite,
} from "./views/categorie.js";
import {
  cercaNeiMessaggi,
  daRigaRicercaKernel,
  intestazioneRicerca,
  renderRisultati,
  RITARDO_RICERCA_MS,
} from "./views/search.js";
import {
  apriRubrica,
  filtroSuggerimenti,
  normFormatoNome,
  normOrdinamento,
  scomponiMittente,
  suggerimentiEsempio,
} from "./views/contatti.js";
import { apriPannelloContatti } from "./views/contatti-pannello.js";
import { raggruppaConversazioni } from "./views/conversazioni.js";
import { apriPannelloRegole, regoleDiEsempio } from "./views/regole.js";
import {
  barraInvito,
  apriAgenda,
  apriNuovaRiunione,
  invitiDiEsempio,
  invitoEsempio,
} from "./views/inviti.js";
import {
  apriMenuOrdina,
  apriMenuDensita,
  apriModuloRicercaAvanzata,
  barraConferma,
  apriPannelloScelteRapide,
  apriPannelloPersonali,
  SCORCIATOIE,
  ordinaMessaggi,
  applicaDensita,
  etichettaOrdinamento,
  etichettaVerso,
  etichettaDensita,
} from "./views/blocco-i2.js";
import {
  apriPannelloVisualizza,
  applicaColoreContrassegnata,
  richiedeRidisegno,
  normColore,
} from "./views/visualizza.js";
import {
  apriPannelloCerca,
  normAmbito,
  normLimiteRicerca,
  filtraPerAmbito,
} from "./views/cerca.js";
import {
  apriPannelloSincronizzazione,
  normIntervalloMinuti,
  deveSincronizzare,
  deveSincronizzareAvvio,
} from "./views/sincronizzazione.js";
import { apriPannelloArchiviazione } from "./views/archiviazione.js";
import { EVENTO_AVANZAMENTO_SYNC, statoAvanzamento, etichettaCartellaSync } from "./views/avanzamento-sync.js";
import { apriPannelloAspetto, applicaAccento, normAccento } from "./views/aspetto.js";
import {
  apriPannelloAccessibilita,
  applicaAccessibilita,
  normOpzioni as normOpzioniAccessibilita,
  zoomLetturaDaPreferenze,
  limitaZoomLettura,
} from "./views/accessibilita.js";

/** Cartella mostrata all'avvio: preferenza `cartellaIniziale`, default INBOX. */
let CARTELLA = "INBOX";

/** Blocco J: account attivo. `""` significa «Tutti gli account». */
let accountAttivo = "";
/** Blocco J: cartella attiva (nome IMAP). */
let cartellaAttiva = "INBOX";
/** Blocco J: struttura `cartelle_elenco` (un gruppo per casella). */
let gruppiCartelle = [];
/** Blocco J: caselle espanse nella barra laterale (nodo ▾/▸). */
const accountAperti = new Set();

/** Identificatore dell'account attivo (per la firma predefinita per account). */
let accountCorrenteId = "";

/** Messaggio selezionato: destinatario delle azioni Rispondi/Inoltra. */
let messaggioCorrente = null;

// ---------------------------------------------------------------------------
// Modello della lista e riferimenti al DOM (blocco A: azioni sul messaggio)
// ---------------------------------------------------------------------------

/** Messaggi attualmente mostrati (esempio nel browser, cache nel kernel). */
let messaggiCorrenti = [];
/** Filtro attivo della "Filtra posta elettronica" (id di `FILTRI`). */
let filtroCorrente = "tutti";
/** Preferenza «Raggruppa per conversazione» (blocco H), salvata in config.rs. */
let raggruppaConversazioniAttivo = true;
/** Conversazioni correnti della lista raggruppata (blocco H). */
let conversazioniCorrenti = [];
/** Scheda attiva della barra multifunzione: home | organizza | strumenti. */
let schedaCorrente = "home";
/** Regole correnti (blocco H), mostrate dal pannello «Regole». */
let regoleCorrenti = [];
/** Riferimenti agli elementi su cui agiscono le azioni (valorizzati in boot). */
let listEl = null;
let readingEl = null;
let countEl = null;
let syncEl = null;
let accountEl = null;
let ribbonEl = null;
let searchInput = null;
/** Contenitore `.main` (lista + pannello di lettura): ne cambia il layout. */
let mainEl = null;
/** Messaggio in attesa del "segna come letto dopo N secondi". */
let timerSegnaLetto = null;

/** Ricerca attiva (blocco B): quando è vera la lista mostra i risultati. */
let ricercaAttiva = false;
/** Testo dell'ultima ricerca (per ridisegnare i risultati dopo un'azione). */
let ricercaTesto = "";
/** Risultati correnti della ricerca. */
let ricercaRisultati = [];
/** Timer del ritardo (250 ms) fra un tasto e la ricerca. */
let timerRicerca = null;

/** Destinazione scelta nel selettore della barra dell'Assistente ("locale"|"cloud"). */
let destinazioneIA = "locale";

/**
 * Preferenze correnti (Milestone 8), caricate da `config.json` all'avvio con il
 * comando `impostazioni_leggi`. Nel browser restano in memoria (prove visive).
 */
let preferenzeCorrenti = null;

/** Scala del testo del messaggio letto (blocco R): dai pulsanti A⁻/A⁺. */
let zoomLetturaCorrente = 100;

/**
 * L'ultimo corpo disegnato nel pannello di lettura e il messaggio a cui
 * appartiene (blocco S): `{ messaggio, html, allegati, conImmagini }`. Il corpo
 * non è nel modello del messaggio — arriva dal kernel una volta sola
 * (`mail_body`) — quindi va conservato qui: ogni ridisegno sul posto
 * (segna come letto, categorizza, contrassegna, completa) ricostruisce il
 * pannello da capo e senza questo lo perderebbe. Serve anche allo zoom (A⁻/A⁺)
 * e al cambio di carattere, che ridisegnano il solo iframe.
 */
let corpoCorrente = null;

/**
 * Le due barre che stanno **sopra** il corpo, conservate per la stessa ragione
 * (blocco T): `{ messaggio, invito }` per la richiesta di riunione e
 * `{ messaggio, statoConferme, dove }` per le conferme di lettura/recapito. Il loro contenuto
 * però non è un dato immutabile come il corpo — è **stato** che il kernel
 * ricalcola (`invito_da_messaggio`, `conferme_stato`) e che cambia quando
 * l'utente risponde. Quindi si conserva qui l'ultimo stato **disegnato**, che
 * comprende la risposta appena data, invece di richiederlo di nuovo al kernel a
 * ogni ridisegno: sarebbe una chiamata di rete per un disegno.
 */
let invitoCorrente = null;
let confermeCorrente = null;

/** Blocco I1/L: chiavi delle conversazioni ignorate **per account** (blocco L). */
let ignoratePerAccount = {};
/** Le chiavi ignorate di un account (elenco vuoto se nessuna). */
function ignorateDi(account) {
  const chiave = String(account || "");
  const elenco = ignoratePerAccount[chiave];
  return Array.isArray(elenco) ? elenco : [];
}
/** Blocco I1: le voci del sottomenu «Contrassegna» (etichette dal riferimento). */
let vociScadenza = SCADENZE.slice();

/** Blocco I2: ordinamento della lista («Ordina per») e densità di visualizzazione. */
let ordinaCampo = "data";
let ordinaVerso = "discendente";
let densitaLista = "accogliente";

/** Blocco N: opzioni di ricerca, sincronizzazione e timer (dai pannelli). */
let ricercaAmbito = "tutte";
let ricercaLimite = 50;
let ricercaMentreSiDigita = true;
let syncIntervalloMinuti = 0;
let timerSyncAutomatica = null;
let ultimaSyncMs = 0;

/** Vero quando la pagina gira dentro Tauri (webview), falso nel browser. */
function dentroTauri() {
  return typeof window !== "undefined" && !!(window.__TAURI__ && window.__TAURI__.core);
}

// Nella finestra vera la barra del titolo di macOS è un overlay sopra la webview
// (`titleBarStyle: overlay`): i semafori sono i suoi, quindi a sinistra va
// lasciato loro spazio. Nel browser (prove visive) non c'è nulla sopra.
if (dentroTauri()) document.documentElement.dataset.tauri = "1";

/** Chiama un comando Tauri; restituisce null (con avviso) se non riesce. */
async function comando(nome, args) {
  if (!dentroTauri()) return null;
  try {
    return await window.__TAURI__.core.invoke(nome, args);
  } catch (err) {
    console.warn(`comando ${nome} non riuscito:`, err);
    return null;
  }
}

/**
 * Chiama un comando Tauri lasciando andare l'errore: serve all'assistente,
 * che deve mostrare all'utente un messaggio chiaro invece di un esito vuoto.
 */
async function comandoConErrore(nome, args) {
  if (!dentroTauri()) throw new Error("comando disponibile solo dentro Tauri");
  return await window.__TAURI__.core.invoke(nome, args);
}

/** Elenco degli account configurati, nella forma { id, email, … }. */
async function accountConfigurati() {
  const elenco = await comando("account_list");
  return Array.isArray(elenco) ? elenco : [];
}

/** Indirizzo dell'account attivo (per l'intestazione della finestra). */
async function mittenteAccount() {
  const accounts = await accountConfigurati();
  return accounts.length ? accounts[0].email || "" : "";
}

// ---------------------------------------------------------------------------
// Impostazioni (Milestone 8)
// ---------------------------------------------------------------------------

/**
 * Legge le impostazioni complete: dal kernel dentro Tauri (`impostazioni_leggi`),
 * con i valori di esempio nel browser, per non far fallire le prove visive.
 */
async function caricaImpostazioni() {
  const dalKernel = await comando("impostazioni_leggi");
  return dalKernel && dalKernel.preferenze ? dalKernel : impostazioniDiEsempio();
}

/** Applica le preferenze in memoria (firma subito attiva sulle nuove composizioni). */
function applicaPreferenze(imp) {
  if (!imp || !imp.preferenze) return;
  const precedenti = preferenzeCorrenti;
  preferenzeCorrenti = imp.preferenze;
  // Blocco R: la scala del testo letto arriva dalla preferenza, non solo dai
  // pulsanti; il corpo già aperto si ridisegna se il carattere è cambiato.
  zoomLetturaCorrente = zoomLetturaDaPreferenze(imp.preferenze);
  if (corpoCorrente && readingEl && serveRidisegnareLettura(precedenti, imp.preferenze)) {
    // Si riscrive il solo iframe del corpo, non tutto `.mail-body`: `preparaCorpo`
    // ricostruirebbe la barra («Mostra immagini») e l'elenco allegati, lasciando
    // il pulsante delle immagini senza il suo ascoltatore — un pulsante muto — e
    // perdendo gli allegati. I pulsanti A⁻/A⁺ stanno invece nella barra
    // dell'Assistente e non vengono ricostruiti: il loro ascoltatore è già quello
    // messo da `collegaZoomLettura`, quindi non si ricollega (una seconda
    // chiamata raddoppierebbe il passo a ogni clic).
    const frame = readingEl.querySelector(".mail-frame");
    if (frame) {
      mostraCorpoHtml({ frame }, corpoCorrente.html, stileLetturaCorrente());
    }
  }
  // Blocco D, seconda metà: firme multiple con predefinita per account (migrando
  // in lettura l'eventuale firma singola) e cartella iniziale.
  const firme = firmeEffettive(imp.preferenze);
  const idDef = idFirmaPredefinita(
    firme,
    imp.preferenze.firmaPredefinitaPerAccount,
    accountCorrenteId,
  );
  impostaFirme(firme, idDef);
  if (imp.preferenze.cartellaIniziale) CARTELLA = imp.preferenze.cartellaIniziale;
  // Blocco D: la finestra di composizione indossa formato, carattere,
  // correzione automatica e ortografia scelti.
  impostaPreferenzeComposizione(imp.preferenze);
  applicaLayoutLettura();
  // Blocco H: raggruppamento in conversazioni (attivo di default) e regole.
  raggruppaConversazioniAttivo = imp.preferenze.raggruppaConversazioni !== false;
  regoleCorrenti = Array.isArray(imp.preferenze.regole) ? imp.preferenze.regole : [];
  aggiornaToggleRaggruppa();
  // Blocco I2: ordinamento e densità della lista.
  ordinaCampo = imp.preferenze.ordinaPer || "data";
  ordinaVerso = imp.preferenze.ordinaVerso || "discendente";
  densitaLista = imp.preferenze.densitaVisualizzazione || "accogliente";
  applicaDensita(listEl, densitaLista);
  // Blocco N: colore della riga contrassegnata «Visualizza», opzioni di ricerca
  // e intervallo di sincronizzazione. Il timer lo (ri)programma `programmaSync`.
  applicaColoreContrassegnata(listEl, normColore(imp.preferenze.visualizzaColoreContrassegnata));
  ricercaAmbito = normAmbito(imp.preferenze.ricercaAmbito);
  ricercaLimite = normLimiteRicerca(imp.preferenze.ricercaLimite);
  ricercaMentreSiDigita = imp.preferenze.ricercaMentreSiDigita !== false;
  syncIntervalloMinuti = normIntervalloMinuti(imp.preferenze.syncIntervalloMinuti);
  programmaSync();
  aggiornaEtichetteVista();
  // Blocco P: aspetto (colore accento) e accessibilità (movimento, contrasto,
  // dimensioni del testo, etichette dei pulsanti). Agiscono sul <html> e sui
  // token CSS: effetto immediato, nessun ricaricamento.
  applicaAccento(normAccento(imp.preferenze.accento));
  applicaAccessibilita(normOpzioniAccessibilita(imp.preferenze));
}

/**
 * Applica le preferenze del pannello «Visualizza» (blocco N). La densità la
 * applica `applicaPreferenze` (basta il CSS); l'anteprima nella lista e il
 * raggruppamento in conversazioni cambiano invece le righe, quindi la lista va
 * ridisegnata — come fa il percorso del ribbon (`salvaVista`). Senza questo,
 * quelle due voci avevano effetto solo al ridisegno successivo.
 */
function applicaPreferenzeVista(preferenze) {
  const ridisegnare = richiedeRidisegno(preferenzeCorrenti, preferenze);
  applicaPreferenze({ theme: getTheme(), preferenze });
  if (!ridisegnare) return;
  if (raggruppaConversazioniAttivo && conversazioniCorrenti.length === 0) {
    conversazioniCorrenti = raggruppaConversazioni(messaggiCorrenti);
  }
  ridisegna();
}

/** Aggiorna lo stato del pulsante «Raggruppa per conversazione» della lista. */
function aggiornaToggleRaggruppa() {
  const btn = document.getElementById("raggruppa-toggle");
  if (!btn) return;
  btn.setAttribute("aria-pressed", raggruppaConversazioniAttivo ? "true" : "false");
}

/**
 * Attiva/disattiva «Raggruppa per conversazione» (blocco H): salva la
 * preferenza in `config.json` e ricostruisce la lista. Nel browser resta in
 * memoria (prove visive).
 */
async function alternaRaggruppa() {
  raggruppaConversazioniAttivo = !raggruppaConversazioniAttivo;
  aggiornaToggleRaggruppa();
  if (dentroTauri()) {
    const preferenze = Object.assign({}, preferenzeCorrenti || {}, {
      raggruppaConversazioni: raggruppaConversazioniAttivo,
    });
    try {
      await salvaImpostazioni({ theme: getTheme(), preferenze });
    } catch (err) {
      stato(`Preferenza non salvata: ${err && err.message ? err.message : err}`, true);
    }
    conversazioniCorrenti = [];
    const messaggi = await listaDallaCache(listEl, countEl, syncEl, accountEl);
    if (Array.isArray(messaggi)) messaggiCorrenti = messaggi;
  }
  if (raggruppaConversazioniAttivo && conversazioniCorrenti.length === 0) {
    conversazioniCorrenti = raggruppaConversazioni(messaggiCorrenti);
  }
  ridisegna();
  stato(
    raggruppaConversazioniAttivo
      ? "Raggruppa per conversazione: attivo."
      : "Raggruppa per conversazione: disattivato.",
  );
}

/**
 * Applica al layout la preferenza del pannello di lettura (blocco D): "" sotto
 * la lista (come la v1), "main--lettura-destra" o "main--lettura-nascosta".
 * Ha effetto subito, senza ricaricare la vista.
 */
function applicaLayoutLettura() {
  if (!mainEl) return;
  const classe = classePannelloLettura(preferenzeCorrenti && preferenzeCorrenti.letturaPannello);
  mainEl.classList.remove("main--lettura-destra", "main--lettura-nascosta");
  if (classe) mainEl.classList.add(classe);
  applicaSplit();
}

// ---------------------------------------------------------------------------
// Divisorio lista / lettura
// ---------------------------------------------------------------------------

let splitterEl = null;

/** Minimo spazio per la lista in pixel. */
const LISTA_MIN_PX = 120;

/** Minimo spazio per la lettura in pixel. */
const LETTURA_MIN_PX = 200;

/** Spazio occupato dal divisorio stesso, tolto alla corsa. */
const SPLITTER_PX = 4;

const SPLIT_RAPPORTO_DEFAULT = 0.5;

/** Il rapporto salvato in `config.json`, o metà se manca o è storto. */
function rapportoSalvato() {
  const r = preferenzeCorrenti && preferenzeCorrenti.splitRapporto;
  return Number.isFinite(r) && r >= 0 && r <= 1 ? r : SPLIT_RAPPORTO_DEFAULT;
}

/**
 * Applica il rapporto lista/lettura (0..1: 0 = lista minima, 1 = massima).
 * Senza argomento usa quello delle preferenze. Vale solo con la lettura sotto
 * la lista: negli altri layout toglie gli stili messi in precedenza, perché il
 * layout a griglia o senza lettura li subirebbe.
 */
function applicaSplit(rapporto = rapportoSalvato()) {
  if (!listEl || !readingEl || !mainEl) return;
  const sotto = classePannelloLettura(preferenzeCorrenti && preferenzeCorrenti.letturaPannello) === "";
  if (!sotto) {
    listEl.style.flex = "";
    listEl.style.height = "";
    readingEl.style.flex = "";
    return;
  }
  const corsa = mainEl.offsetHeight - LISTA_MIN_PX - LETTURA_MIN_PX - SPLITTER_PX;
  if (corsa <= 0) return;
  const clamped = Math.max(0, Math.min(1, rapporto));
  listEl.style.flex = "0 0 auto";
  listEl.style.height = `${LISTA_MIN_PX + clamped * corsa}px`;
  readingEl.style.flex = "1 1 auto";
}

/** Il rapporto che la lista ha adesso a schermo (non quello salvato). */
function rapportoCorrenteDaDOM() {
  const corsa = mainEl.offsetHeight - LISTA_MIN_PX - LETTURA_MIN_PX - SPLITTER_PX;
  if (corsa <= 0) return SPLIT_RAPPORTO_DEFAULT;
  return Math.max(0, Math.min(1, (listEl.offsetHeight - LISTA_MIN_PX) / corsa));
}

/** Salva il rapporto nelle preferenze: `salvaImpostazioni` lo riapplica. */
function salvaRapporto(rapporto) {
  const preferenze = Object.assign({}, preferenzeCorrenti || {}, { splitRapporto: rapporto });
  salvaImpostazioni({ theme: getTheme(), preferenze }).catch((err) => {
    stato(`Divisorio non salvato: ${err && err.message ? err.message : err}`, true);
  });
}

/**
 * Trascinamento del divisorio: mousemove/mouseup stanno sul documento, così il
 * mouse può uscire dal divisorio senza perdere il gesto. Parte dal rapporto che
 * la lista ha a schermo, quindi si può trascinare quante volte si vuole.
 */
function avviaTrascinamentoSplit(e) {
  if (!listEl || !readingEl || !mainEl) return;
  if (classePannelloLettura(preferenzeCorrenti && preferenzeCorrenti.letturaPannello) !== "") return;
  e.preventDefault();

  const y0 = e.clientY;
  const rapporto0 = rapportoCorrenteDaDOM();
  let mosso = false;
  if (splitterEl) splitterEl.classList.add("active");

  function onMove(ev) {
    const corsa = mainEl.getBoundingClientRect().height - LISTA_MIN_PX - LETTURA_MIN_PX - SPLITTER_PX;
    if (corsa <= 0) return;
    mosso = true;
    applicaSplit(rapporto0 + (ev.clientY - y0) / corsa);
  }

  function onUp() {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    if (splitterEl) splitterEl.classList.remove("active");
    if (mosso) salvaRapporto(rapportoCorrenteDaDOM());
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

/** Doppio clic sul divisorio: torna a metà e lo salva. */
function resettaSplit() {
  applicaSplit(SPLIT_RAPPORTO_DEFAULT);
  salvaRapporto(SPLIT_RAPPORTO_DEFAULT);
}

/** Collega il divisorio: trascinamento e doppio clic per riportarlo a metà. */
function collegaSplitter() {
  splitterEl = document.getElementById("list-splitter");
  if (!splitterEl) return;
  splitterEl.addEventListener("mousedown", avviaTrascinamentoSplit);
  splitterEl.addEventListener("dblclick", (e) => {
    e.preventDefault();
    resettaSplit();
  });
  splitterEl.title = "Trascina per ridistribuire · doppio clic: metà";
  // L'altezza della lista è in pixel: a finestra ridimensionata va ricalcolata
  // dal rapporto, o la lettura scenderebbe sotto il suo minimo.
  window.addEventListener("resize", () => applicaSplit());
}

/**
 * La mappa `{ nome: #tinta }` delle categorie definite (blocco O): serve a
 * colorare le targhette nella lista e nel pannello di lettura, come in Outlook.
 */
function coloriCategorie() {
  const p = preferenzeCorrenti || impostazioniDiEsempio().preferenze;
  return mappaColoriCategorie(p.categorie || []);
}

/**
 * Ridisegna il pannello di lettura con le targhette colorate delle categorie.
 *
 * È il punto per cui passano TUTTI i ridisegni del pannello, non solo l'apertura
 * di un messaggio: `renderReading` ricostruisce il pannello da capo, quindi qui
 * si ricollega tutto ciò che vive in nodi ricreati e si rimette ciò che non sta
 * nel modello (il corpo, che arriva dal kernel una volta sola).
 */
function renderLettura(el, msg) {
  renderReading(el, msg, { coloriCategorie: coloriCategorie() });
  // A⁻/A⁺: senza ricollegarli resterebbero muti dopo «segna come letto»,
  // contrassegna, categoria o completamento.
  collegaZoomLettura(el);
  if (msg) {
    // Stessa ragione per la barra dell'Assistente e per il pulsante della
    // rubrica: senza questo i quattro pulsanti IA, il selettore locale/cloud e
    // «Aggiungi ai contatti» diventano muti sugli stessi percorsi.
    collegaAssistente(el, msg);
    collegaAggiungiContatti(el, msg);
    // E il corpo del messaggio: non sta nel modello, vive nell'iframe.
    ripristinaCorpo(el, msg);
    // Blocco T: stessa sorte per le due barre in cima — l'invito di riunione e
    // le conferme di lettura/recapito. Sono chiamate **sincrone**: la copia
    // conservata basta, il kernel non si interroga per un disegno.
    ripristinaInvito(el, msg);
    ripristinaConferme(el, msg);
  }
}

/**
 * Rimette nel pannello il corpo già arrivato dal kernel, quando è quello del
 * messaggio che si sta ridisegnando. Non rilegge nulla dal kernel: usa l'ultimo
 * corpo disegnato (`corpoCorrente`) con i suoi allegati e la politica delle
 * immagini in vigore, così «Mostra immagini» resta collegato.
 */
function ripristinaCorpo(el, msg) {
  if (!el || !corpoCorrente || corpoCorrente.messaggio !== msg) return;
  const lettura = preparaCorpo(el);
  if (!lettura) return;
  mostraCorpoHtml(lettura, corpoCorrente.html, stileLetturaCorrente());
  mostraAllegati(lettura.allegati, corpoCorrente.allegati, (allegato, bottone, riga) =>
    salvaAllegato(msg, allegato, bottone, riga),
  );
  // Le immagini già mostrate restano mostrate: al ridisegno si toglie il
  // pulsante senza richiedere di nuovo il consenso né rileggere il corpo.
  if (corpoCorrente.conImmagini) lettura.btnImmagini.remove();
  else collegaImmagini(lettura, msg);
}

/**
 * Rimette la barra dell'invito conservata (blocco T), con la stessa guardia del
 * corpo: solo se l'invito è quello del messaggio che si sta ridisegnando.
 * Il messaggio si passa al disegno: è su quello che `onRispondi` riconosce la
 * copia da aggiornare, e una risposta data **dopo** un ridisegno non deve andare
 * persa perché la barra rimessa non sa più a chi appartiene.
 *
 * L'ordine dei `prepend` conta: prima l'invito, poi le conferme, così le
 * conferme restano in cima come nell'apertura.
 */
function ripristinaInvito(el, msg) {
  if (!el || !invitoCorrente || invitoCorrente.messaggio !== msg) return;
  disegnaInvito(el, invitoCorrente.invito, msg);
}

/**
 * Lo stile con cui si veste il corpo letto: famiglia, dimensione e scala di
 * lettura in vigore (blocco R). Sta in un posto solo perché lo usano
 * l'apertura, il ridisegno sul posto, lo zoom e il cambio di carattere.
 */
function stileLetturaCorrente() {
  const p = preferenzeCorrenti || {};
  return {
    famiglia: p.carattereFamiglia,
    dimensione: p.carattereDimensione,
    zoom: zoomLetturaCorrente,
  };
}

/** La preferenza di lettura in vigore (default prudenti se il kernel tace). */
function prefLettura() {
  const p = preferenzeCorrenti || {};
  return {
    pannello: normPannello(p.letturaPannello),
    immagini: normImmagini(p.letturaImmagini),
    secondi: secondiSegnaLetto(p.letturaSegnaLettoDopo),
    alPassaggio: p.letturaSegnaLettoAlPassaggio !== false,
    anteprima: !!p.letturaAnteprima,
  };
}

/**
 * Chiede al kernel di segnare `messaggio` come letto. Vero se è andata (nel
 * browser, dove non c'è kernel, sempre vero: l'effetto è solo in memoria).
 */
async function segnaLettoNelKernel(messaggio) {
  if (!dentroTauri() || !messaggio.uid) return true;
  const accountId = accountIdPerAzione(messaggio);
  if (accountId === undefined) return false;
  const errore = await azioneMail("mail_set_seen", {
    folder: cartellaDi(messaggio),
    uid: messaggio.uid,
    letto: true,
    accountId,
  });
  return !errore;
}

/** Quanto il mouse deve restare sulla riga perché il messaggio risulti letto. */
const PASSAGGIO_SEGNA_LETTO_MS = 1000;
let timerPassaggio = null;

function annullaSegnaLettoAlPassaggio() {
  if (timerPassaggio) {
    clearTimeout(timerPassaggio);
    timerPassaggio = null;
  }
}

/**
 * Gli oggetti del modello attuale che rappresentano `messaggio`: stessa casella,
 * cartella e UID. Durante l'attesa la lista può essersi ricaricata (una
 * sincronizzazione crea oggetti nuovi), e segnare solo il vecchio lascerebbe in
 * grassetto la riga che si vede.
 */
function copieCorrenti(messaggio) {
  const stesso = (m) =>
    m === messaggio ||
    (!!m.uid &&
      String(m.uid) === String(messaggio.uid) &&
      (m.account || "") === (messaggio.account || "") &&
      (m.folder || "") === (messaggio.folder || ""));
  const copie = new Set([messaggio]);
  for (const m of messaggiCorrenti) if (stesso(m)) copie.add(m);
  for (const c of conversazioniCorrenti) for (const m of c.messaggi || []) if (stesso(m)) copie.add(m);
  return [...copie];
}

/**
 * Il mouse è entrato nella riga di `messaggio`: se resta 1 secondo e il
 * messaggio non è letto, lo segna come letto (preferenza «al passaggio»). Un
 * solo timer alla volta: cambiare riga riparte da zero.
 */
function programmaSegnaLettoAlPassaggio(messaggio) {
  annullaSegnaLettoAlPassaggio();
  if (!prefLettura().alPassaggio || !messaggio || messaggio.seen) return;
  timerPassaggio = setTimeout(async () => {
    timerPassaggio = null;
    if (!(await segnaLettoNelKernel(messaggio))) return;
    const copie = copieCorrenti(messaggio);
    for (const m of copie) m.seen = true;
    ridisegna();
    if (readingEl && copie.includes(messaggioCorrente)) renderLettura(readingEl, messaggioCorrente);
    stato("Messaggio segnato come letto.");
  }, PASSAGGIO_SEGNA_LETTO_MS);
}

/**
 * Invalida il timer del "segna come letto": parte all'apertura di un messaggio
 * non letto e chiama `mail_set_seen` dopo i secondi scelti (0 = mai). Nel
 * browser (prove visive) l'effetto è simulato in memoria.
 */
function programmaSegnaLetto(messaggio) {
  if (timerSegnaLetto) {
    clearTimeout(timerSegnaLetto);
    timerSegnaLetto = null;
  }
  const { secondi } = prefLettura();
  if (!secondi || !messaggio || messaggio.seen) return;
  timerSegnaLetto = setTimeout(async () => {
    timerSegnaLetto = null;
    if (!(await segnaLettoNelKernel(messaggio))) return;
    messaggio.seen = true;
    if (messaggioCorrente === messaggio) {
      ridisegna();
      if (readingEl) renderLettura(readingEl, messaggio);
      stato("Messaggio segnato come letto dopo l'apertura.");
    }
  }, secondi * 1000);
}

/**
 * Salva le impostazioni (comando `impostazioni_salva`) e le applica in memoria.
 * Restituisce l'esito leggibile mostrato dal pannello. Nel browser non scrive nulla.
 */
async function salvaImpostazioni(imp) {
  if (!dentroTauri()) {
    applicaPreferenze(imp);
    return "Salvato (prova visiva: nessun file scritto).";
  }
  await window.__TAURI__.core.invoke("impostazioni_salva", { impostazioni: imp });
  applicaPreferenze(imp);
  return "Salvato in config.json.";
}

/** Righe del registro delle richieste cloud (elenco vuoto = nessun invio). */
async function caricaRegistro(limite) {
  if (!dentroTauri()) return righeDiEsempio();
  const righe = await comando("registro_ia", { limite: limite || 200 });
  return Array.isArray(righe) ? righe : [];
}

/** Tenta di avviare il motore locale; l'errore è il testo in italiano del kernel. */
async function avviaMotoreLocale() {
  if (!dentroTauri()) {
    return "Prova visiva: il comando di avvio non viene eseguito (solo dentro l'app).";
  }
  return await window.__TAURI__.core.invoke("assistente_avvia");
}

// ---------------------------------------------------------------------------
// Blocco D, seconda metà: posta indesiderata, registro del pannello Privacy,
// svuota cache. Dentro Tauri parlano coi comandi del kernel; nel browser
// (prove visive) usano valori di esempio e non scrivono nulla.
// ---------------------------------------------------------------------------

/** Stato del pannello Posta indesiderata: mittenti bloccati, protezione, ultima azione. */
async function caricaStatoPosta() {
  const protezione = (preferenzeCorrenti && preferenzeCorrenti.protezionePostaIndesiderata) || "attiva";
  if (!dentroTauri()) {
    return {
      mittenti: ["offerte@promo.example", "spam@example.com"],
      protezione,
      ultimaAzione: 0,
    };
  }
  const stato = await comando("posta_indesiderata_stato");
  return stato || { mittenti: [], protezione, ultimaAzione: 0 };
}

/** Sblocca un mittente (comando `mail_sblocca_mittente`). */
async function sbloccaMittente(indirizzo) {
  if (!dentroTauri()) return 0;
  return await window.__TAURI__.core.invoke("mail_sblocca_mittente", { indirizzo });
}

/** Svuota il registro IA (comando `registro_ia_svuota`); restituisce le voci rimosse. */
async function svuotaRegistroKernel() {
  if (!dentroTauri()) return 0;
  return await window.__TAURI__.core.invoke("registro_ia_svuota");
}

/** Esporta il registro IA in un file di testo (comando `registro_ia_esporta`). */
async function esportaRegistroKernel() {
  if (!dentroTauri()) return "prova visiva: nessun file scritto";
  return await window.__TAURI__.core.invoke("registro_ia_esporta");
}

/** Svuota la cache locale dei messaggi (comando `svuota_cache`). */
async function svuotaCacheKernel() {
  if (!dentroTauri()) return "Prova visiva: la cache è del kernel e non viene toccata.";
  return await window.__TAURI__.core.invoke("svuota_cache");
}

/**
 * Stato della cache locale per il pannello «Archiviazione» (blocco N): comando
 * `archiviazione_stato` → `{ byte, messaggi }`. Nel browser: valori di esempio.
 */
async function caricaStatoArchiviazione() {
  if (!dentroTauri()) return { byte: 4_300_000, messaggi: 128 };
  const esito = await comando("archiviazione_stato");
  return esito && typeof esito === "object" ? esito : { byte: 0, messaggi: 0 };
}

// ---------------------------------------------------------------------------
// Rubrica e completamento dei destinatari (blocco F). Dentro Tauri parlano coi
// comandi del kernel; nel browser (prove visive) usano i dati di esempio del
// modulo `contatti.js` e non scrivono nulla.
// ---------------------------------------------------------------------------

/** Contatti della rubrica (comando `contatti_elenco`). Nel browser: null. */
async function caricaContatti(filtro) {
  if (!dentroTauri()) return null;
  return await window.__TAURI__.core.invoke("contatti_elenco", { filtro: filtro || null });
}

/** Salva un contatto; restituisce `{ id, aggiornato }` (comando `contatto_salva`). */
async function salvaContattoKernel(contatto) {
  return await window.__TAURI__.core.invoke("contatto_salva", { contatto });
}

/** Elimina un contatto per id (comando `contatto_elimina`). */
async function eliminaContattoKernel(id) {
  return await window.__TAURI__.core.invoke("contatto_elimina", { id });
}

/** Importa un testo vCard (comando `contatti_importa_vcard`). */
async function importaVCardKernel(testo) {
  return await window.__TAURI__.core.invoke("contatti_importa_vcard", { testo });
}

/** Esporta la rubrica in un file .vcf e restituisce il percorso. */
async function esportaVCardKernel() {
  return await window.__TAURI__.core.invoke("contatti_esporta_vcard");
}

/**
 * Suggerimenti per i campi A/Cc/Ccn: rubrica + indirizzi già visti nella cache
 * (comando `contatti_suggerisci`). Nel browser filtra i dati di esempio.
 */
async function suggerisciContatti(testo, limite) {
  if (!dentroTauri()) return filtroSuggerimenti(suggerimentiEsempio(), testo, limite);
  try {
    const esito = await window.__TAURI__.core.invoke("contatti_suggerisci", {
      testo,
      limite: limite || null,
    });
    return Array.isArray(esito) ? esito : [];
  } catch (err) {
    console.warn("contatti_suggerisci non riuscito:", err);
    return [];
  }
}

/**
 * Blocco H — comandi del kernel per le regole locali. Restituiscono sempre
 * l'elenco aggiornato, così il pannello ridisegna senza una seconda lettura.
 */
async function regoleElencoKernel() {
  const elenco = await comando("regole_elenco");
  return Array.isArray(elenco) ? elenco : [];
}

async function regolaSalvaKernel(regola) {
  return await window.__TAURI__.core.invoke("regola_salva", { regola });
}

async function regolaEliminaKernel(id) {
  return await window.__TAURI__.core.invoke("regola_elimina", { id });
}

async function regoleRiordinaKernel(ids) {
  return await window.__TAURI__.core.invoke("regole_riordina", { ids });
}

/**
 * Apre il pannello «Regole» (blocco H). Dentro Tauri legge le regole dal kernel
 * e le salva con i comandi `regola_salva`/`regola_elimina`/`regole_riordina`;
 * nel browser usa due regole di esempio e salva solo in memoria (prove visive).
 */
async function apriRegoleUI() {
  if (!dentroTauri()) {
    let locali = (regoleCorrenti && regoleCorrenti.length ? regoleCorrenti : regoleDiEsempio()).slice();
    return apriPannelloRegole({
      regole: locali,
      onSalva: (regola) => {
        const i = locali.findIndex((r) => r.id && r.id === regola.id);
        const salvata = Object.assign({}, regola, { id: regola.id || `regola${locali.length + 1}` });
        if (i >= 0) locali[i] = salvata;
        else locali.push(salvata);
        return locali;
      },
      onElimina: (id) => {
        locali = locali.filter((r) => r.id !== id);
        return locali;
      },
      onRiordina: (ids) => {
        locali = ids.map((id, pos) => Object.assign({}, locali.find((r) => r.id === id), { ordine: pos }));
        return locali;
      },
      getTema: () => getTheme(),
    });
  }
  const regole = await regoleElencoKernel();
  regoleCorrenti = regole;
  return apriPannelloRegole({
    regole,
    onSalva: (regola) => regolaSalvaKernel(regola),
    onElimina: (id) => regolaEliminaKernel(id),
    onRiordina: (ids) => regoleRiordinaKernel(ids),
    getTema: () => getTheme(),
  });
}

// ---------------------------------------------------------------------------
// Inviti di riunione (blocco G, versione inviti). Dentro Tauri parlano coi
// comandi `inviti_elenco`, `invito_da_messaggio`, `invito_rispondi`,
// `invito_crea`; nel browser usano gli inviti di esempio (prove visive) e non
// inviano nulla.
// ---------------------------------------------------------------------------

/** Elenco degli inviti dalla cache (comando `inviti_elenco`). */
async function invitiElencoKernel(filtro) {
  const elenco = await comando("inviti_elenco", { filtro: filtro || null });
  return Array.isArray(elenco) ? elenco : [];
}

/** L'invito del messaggio aperto, se ne porta uno (comando `invito_da_messaggio`). */
async function invitoDaMessaggioKernel(folder, uid, accountId) {
  return await comando("invito_da_messaggio", { folder, uid, accountId: accountId || null });
}

/**
 * Invia la risposta a un invito (comando `invito_rispondi`): il kernel genera il
 * METHOD:REPLY e lo consegna all'organizzatore. Avviene **solo** su questa
 * chiamata, cioè quando l'utente preme un pulsante.
 */
async function invitoRispondiKernel(idInvito, risposta) {
  return await window.__TAURI__.core.invoke("invito_rispondi", { idInvito, risposta });
}

/** Crea e invia un invito in uscita (comando `invito_crea`). */
async function invitoCreaKernel(datiRiunione, destinatari) {
  return await window.__TAURI__.core.invoke("invito_crea", { datiRiunione, destinatari });
}

/**
 * Mostra (o ridisegna) la barra dell'invito in cima al messaggio aperto. Se il
 * messaggio non porta un invito la barra non compare.
 */
async function collegaInvito(readingEl, messaggio) {
  if (!readingEl || !messaggio) return;
  // Gli allegati si leggono dal corpo conservato (`corpoCorrente`), non da un
  // parametro: dopo un ridisegno il corpo arrivato dal kernel non esiste più
  // come variabile locale. Una sola fonte, come per `stileLetturaCorrente`.
  const allegati =
    corpoCorrente && corpoCorrente.messaggio === messaggio ? corpoCorrente.allegati : [];
  const haCalendario = allegati.some(
    (a) =>
      /calendar/i.test(a.mime || "") ||
      /application\/ics/i.test(a.mime || "") ||
      /\.ics$/i.test(a.name || ""),
  );
  if (!haCalendario || !dentroTauri() || !messaggio.uid) return;
  const invito = await invitoDaMessaggioKernel(
    cartellaDi(messaggio),
    messaggio.uid,
    accountDi(messaggio),
  );
  if (invito) applicaInvito(readingEl, messaggio, invito);
}

/**
 * Registra l'invito del messaggio aperto e lo disegna. Una sola porta d'ingresso
 * alla copia conservata: `onRispondi` aggiorna **anche** la copia, altrimenti un
 * ridisegno dopo la risposta rimostrerebbe la barra con i pulsanti, come se
 * nulla fosse stato deciso.
 *
 * `messaggio` può mancare: è il caso della prova visiva `?view=invito`, che
 * disegna un invito d'esempio senza un messaggio aperto. In quel caso non si
 * conserva nulla — non c'è un messaggio a cui legare la copia.
 */
function applicaInvito(readingEl, messaggio, invito) {
  if (messaggio) invitoCorrente = { messaggio, invito };
  disegnaInvito(readingEl, invito, messaggio);
}

/**
 * Disegna la barra dell'invito in cima al pannello. Il ridisegno della barra
 * dopo una risposta lo fa `barraInvito` da sé: l'invito aggiornato torna
 * indietro per `onRispondi`, e da lì si aggiorna la copia conservata di
 * **quel** messaggio (il confronto è sull'identità, così la risposta data su un
 * messaggio non tocca la copia di un altro).
 */
function disegnaInvito(readingEl, invito, messaggio) {
  if (!readingEl || !invito) return;
  readingEl.querySelectorAll(".invito-bar").forEach((e) => e.remove());
  const barra = barraInvito(invito, {
    onRispondi: async (risposta) => {
      const aggiornato = Object.assign({}, invito, { stato: risposta });
      if (invitoCorrente && invitoCorrente.messaggio === messaggio) {
        invitoCorrente.invito = aggiornato;
      }
      if (!dentroTauri()) {
        stato(`Prova visiva: risposta «${risposta}» non inviata (solo dentro l'app).`);
        return aggiornato;
      }
      const esito = await invitoRispondiKernel(invito.id, risposta);
      stato(esito);
      return aggiornato;
    },
    onApriAgenda: () => apriAgendaUI(),
  });
  readingEl.prepend(barra);
}

/**
 * Apre l'agenda a elenco degli inviti (blocco G). Dentro Tauri legge con
 * `inviti_elenco` e risponde con `invito_rispondi`; nel browser usa gli inviti di
 * esempio. Da qui si crea anche una nuova riunione.
 */
async function apriAgendaUI() {
  const dentro = dentroTauri();
  return apriAgenda({
    elenco: () => (dentro ? invitiElencoKernel(null) : invitiDiEsempio()),
    onRispondi: async (invito, risposta) => {
      if (!dentro) {
        stato(`Prova visiva: risposta «${risposta}» non inviata (solo dentro l'app).`);
        return;
      }
      const esito = await invitoRispondiKernel(invito.id, risposta);
      stato(esito);
    },
    onNuova: () => apriNuovaRiunioneUI(),
    getTema: () => getTheme(),
    suggerire: suggerisciContatti,
  });
}

/**
 * Apre il modulo di una nuova riunione. `iniziale` precompila i campi: la voce
 * «Riunione» della composizione porta qui destinatari e corpo scritto.
 */
function apriNuovaRiunioneUI(iniziale = {}) {
  const dentro = dentroTauri();
  return apriNuovaRiunione({
    iniziale,
    getTema: () => getTheme(),
    suggerire: suggerisciContatti,
    onCrea: async (datiRiunione, destinatari) => {
      if (!dentro) {
        return `Prova visiva: l'invito a ${destinatari.join(", ")} non è stato inviato (solo dentro l'app).`;
      }
      return await invitoCreaKernel(datiRiunione, destinatari);
    },
  });
}

/**
 * Apre la finestra della rubrica. `focusRicerca` vero (voce "Trova contatto")
 * mette il fuoco nel campo di ricerca; il doppio clic su un contatto apre una
 * nuova composizione su quell'indirizzo.
 */
function apriRubricaUI(opzioni = {}) {
  // Blocco Q: l'ordine e il formato del nome della rubrica sono preferenze
  // (pannello «Contatti»), normalizzate qui come nel kernel.
  const prefs = preferenzeCorrenti || {};
  return apriRubrica({
    focusRicerca: !!opzioni.focusRicerca,
    ricercaIniziale: opzioni.ricercaIniziale || "",
    ordinamento: normOrdinamento(prefs.rubricaOrdinamento),
    formatoNome: normFormatoNome(prefs.rubricaFormatoNome),
    onElenco: dentro ? caricaContatti : undefined,
    onSalva: dentro ? salvaContattoKernel : undefined,
    onElimina: dentro ? eliminaContattoKernel : undefined,
    onImporta: dentro ? importaVCardKernel : undefined,
    onEsporta: dentro ? esportaVCardKernel : undefined,
    onApriComposizione: async (email) => {
      apriComposizione({
        a: email || "",
        mittente: await mittenteAccount(),
        onInvia: inviaConKernel,
        onControllo: controlloPreInvio,
      });
    },
  });
}

/** Aggiunge al pannello di lettura il pulsante "Aggiungi ai contatti". */
function collegaAggiungiContatti(readingEl, messaggio) {
  const sender = readingEl.querySelector(".mail-sender");
  if (!sender || sender.querySelector(".add-contact")) return;
  const bottone = document.createElement("button");
  bottone.type = "button";
  bottone.className = "mail-btn add-contact";
  bottone.textContent = "👤 Aggiungi ai contatti";
  bottone.title = "Salva il mittente in rubrica";
  bottone.addEventListener("click", () => aggiungiMittenteAiContatti(messaggio, bottone));
  sender.append(bottone);
}

/**
 * Salva in rubrica il mittente del messaggio aperto. Se l'indirizzo è già in
 * rubrica il kernel **aggiorna** la voce invece di duplicarla, e lo si dice.
 */
async function aggiungiMittenteAiContatti(messaggio, bottone) {
  const dati = scomponiMittente(messaggio && messaggio.from ? messaggio.from : "");
  if (!dati.email || !dati.email.includes("@")) {
    stato("Questo mittente non porta un indirizzo su cui salvare un contatto.", true);
    return;
  }
  if (bottone) {
    bottone.disabled = true;
    bottone.textContent = "Salvataggio…";
  }
  const ripristina = () => {
    if (bottone) {
      bottone.disabled = false;
      bottone.textContent = "👤 Aggiungi ai contatti";
    }
  };
  if (!dentroTauri()) {
    ripristina();
    stato(`Prova visiva: «${dati.email}» non è stato scritto (la rubrica è del kernel).`);
    return;
  }
  try {
    const esito = await salvaContattoKernel({
      nome: dati.nome,
      cognome: dati.cognome,
      email: dati.email,
    });
    ripristina();
    stato(
      esito && esito.aggiornato
        ? `«${dati.email}» era già in rubrica: contatto aggiornato.`
        : `«${dati.email}» aggiunto alla rubrica.`,
    );
  } catch (err) {
    ripristina();
    stato(`Non salvato: ${err && err.message ? err.message : err}`, true);
  }
}

/** Opzioni condivise dal pannello Assistente IA (usate dall'hub e dal ribbon). */
function opzioniAssistente() {
  return {
    impostazioni: {
      theme: getTheme(),
      preferenze: preferenzeCorrenti || impostazioniDiEsempio().preferenze,
    },
    onSalva: salvaImpostazioni,
    onRegistro: caricaRegistro,
    onAvvia: avviaMotoreLocale,
    onProvider: (provider) => {
      destinazioneIA = provider;
    },
    // Chiave OpenRouter: vive nel Portachiavi, non nelle preferenze. Le quattro
    // callback parlano col kernel; nessuna restituisce mai la chiave.
    onChiaveStato: chiaveCloudStato,
    onChiaveSalva: chiaveCloudSalva,
    onChiaveElimina: chiaveCloudElimina,
    onChiaveProva: chiaveCloudProva,
    getTema: () => getTheme(),
  };
}

/** Vero se la chiave OpenRouter è nel Portachiavi (`ai_chiave_stato`). */
async function chiaveCloudStato() {
  if (!dentroTauri()) return false;
  return !!(await comando("ai_chiave_stato"));
}

/** Salva la chiave OpenRouter nel Portachiavi (`ai_chiave_salva`). */
async function chiaveCloudSalva(chiave) {
  if (!dentroTauri()) return "Prova visiva: la chiave non viene scritta (serve l'app avviata).";
  await window.__TAURI__.core.invoke("ai_chiave_salva", { chiave });
  return "Chiave salvata nel Portachiavi.";
}

/** Rimuove la chiave OpenRouter dal Portachiavi (`ai_chiave_elimina`). */
async function chiaveCloudElimina() {
  if (!dentroTauri()) return "Prova visiva: nessuna chiave da rimuovere.";
  await window.__TAURI__.core.invoke("ai_chiave_elimina");
  return "Chiave rimossa dal Portachiavi.";
}

/**
 * Prova la chiave con una richiesta minima al cloud: è l'unico modo di sapere
 * se è valida **prima** di usarla su un messaggio vero. Non tocca la posta —
 * manda una richiesta di una riga e riporta l'esito in chiaro.
 */
async function chiaveCloudProva() {
  if (!dentroTauri()) return "Prova visiva: la chiave non viene provata (serve l'app avviata).";
  try {
    const esito = await window.__TAURI__.core.invoke("ai_chiave_prova");
    return String(esito || "Chiave valida: il cloud ha risposto.");
  } catch (err) {
    const msg = String((err && err.message) || err);
    return `Chiave non utilizzabile: ${msg}`;
  }
}

/**
 * Apre l'hub delle impostazioni; da lì il riquadro "Assistente IA" apre il
 * pannello dedicato (task 8.2). Il tema (voce "Generale") usa theme.js.
 */
function apriImpostazioniUI() {
  apriImpostazioni({
    onApriAssistente: () => apriAssistenteIA(opzioniAssistente()),
    onApriAccount: apriAccountUI,
    onApriPannelloMail: apriPannelloMailUI,
    getTema: () => getTheme(),
    setTema: (tema) => setTheme(tema),
    // Voce "Generale": tema, lingua delle risposte, cartella iniziale, svuota cache.
    impostazioni: {
      theme: getTheme(),
      preferenze: preferenzeCorrenti || impostazioniDiEsempio().preferenze,
    },
    onSalva: salvaImpostazioni,
    onApplica: (preferenze) => applicaPreferenze({ theme: getTheme(), preferenze }),
    onSvuotaCache: svuotaCacheKernel,
    // Blocco G: il riquadro «Calendario» apre l'agenda a elenco degli inviti.
    onApriCalendario: apriAgendaUI,
  });
}

/**
 * Apre un pannello del blocco D (Lettura, Composizione, Tipi di carattere,
 * Correzione automatica, Ortografia). Le modifiche si salvano subito con
 * `impostazioni_salva` e hanno effetto all'istante: layout di lettura, stile
 * della composizione, correzione automatica, ortografia.
 */
async function apriPannelloMailUI(chiave) {
  const preferenze = preferenzeCorrenti || impostazioniDiEsempio().preferenze;
  const comuni = {
    preferenze,
    impostazioni: { theme: getTheme(), preferenze },
    onSalva: salvaImpostazioni,
    onApplica: (p) => applicaPreferenze({ theme: getTheme(), preferenze: p }),
    getTema: () => getTheme(),
    // Blocco P: il pannello «Aspetto» cambia il tema con theme.js.
    setTema: (tema) => setTheme(tema),
    // «Mostra tutte» di ogni pannello che usa `apriOverlayPannello`: chiude il
    // pannello e riapre l'hub delle impostazioni. Senza questo, il pulsante dei
    // pannelli (Visualizza, Cerca, Sincronizzazione, Archiviazione, Aspetto,
    // Accessibilità, Contatti) si limiterebbe a chiudere la finestra senza
    // mostrare nulla: un controllo che non fa quello che dice.
    onMostraTutte: apriImpostazioniUI,
  };
  // Blocco D, seconda metà: Firme, Posta indesiderata, Privacy.
  if (chiave === "firme") {
    return apriPannelloFirme(Object.assign({ accountId: accountCorrenteId }, comuni));
  }
  if (chiave === "posta") {
    const stato = await caricaStatoPosta();
    return apriPannelloPosta(
      Object.assign({ stato, onSblocca: sbloccaMittente, onStato: caricaStatoPosta }, comuni),
    );
  }
  if (chiave === "privacy") {
    return apriPannelloPrivacy(
      Object.assign(
        {
          onRegistro: caricaRegistro,
          onSvuotaRegistro: svuotaRegistroKernel,
          onEsportaRegistro: esportaRegistroKernel,
        },
        comuni,
      ),
    );
  }
  // Blocco E: Notifiche e suoni.
  if (chiave === "notifiche") {
    return apriPannelloNotifiche(
      Object.assign(
        {
          onProvaNotifica: provaNotificaKernel,
          onProvaSuono: provaSuonoKernel,
        },
        comuni,
      ),
    );
  }
  // Blocco H: Regole locali sui messaggi in arrivo.
  if (chiave === "regole") {
    return apriRegoleUI();
  }
  // Blocco I2: pannelli «Scelte rapide da tastiera» e «Impostazioni personali».
  if (chiave === "scelte-rapide") {
    const elenco = (await comando("scelte_rapide")) || SCORCIATOIE;
    return apriPannelloScelteRapide({ scorciatoie: elenco, onMostraTutte: apriImpostazioniUI });
  }
  if (chiave === "personali") {
    return apriPannelloPersonali(Object.assign({ onMostraTutte: apriImpostazioniUI }, comuni));
  }
  // Blocco N: Visualizza, Cerca, Sincronizzazione, Archiviazione.
  if (chiave === "visualizza") {
    // Anteprima e raggruppamento richiedono il ridisegno: vedi applicaPreferenzeVista.
    return apriPannelloVisualizza(Object.assign({}, comuni, { onApplica: applicaPreferenzeVista }));
  }
  if (chiave === "cerca") {
    return apriPannelloCerca(comuni);
  }
  if (chiave === "sincronizzazione") {
    return apriPannelloSincronizzazione(Object.assign({ onSincronizzaOra: inviaERicevi }, comuni));
  }
  if (chiave === "archiviazione") {
    const stato = await caricaStatoArchiviazione();
    return apriPannelloArchiviazione(
      Object.assign({ stato, onSvuotaCache: svuotaCacheKernel }, comuni),
    );
  }
  // Blocco O: pannello «Categorie» (elenco di categorie definite dall'utente).
  if (chiave === "categorie") {
    return apriPannelloCategorie(
      Object.assign(
        {
          categorie: (preferenze.categorie && preferenze.categorie.length
            ? preferenze.categorie
            : categoriePredefinite()),
          onConferma: chiediConferma,
          onMostraTutte: apriImpostazioniUI,
        },
        comuni,
      ),
    );
  }
  // Blocco P: Aspetto (tema + colore accento) e Accessibilità.
  if (chiave === "aspetto") {
    return apriPannelloAspetto(comuni);
  }
  if (chiave === "accessibilita") {
    return apriPannelloAccessibilita(comuni);
  }
  // Blocco Q: pannello «Contatti» (ordinamento della rubrica, formato del nome,
  // numero di suggerimenti dei destinatari).
  if (chiave === "contatti") {
    return apriPannelloContatti(comuni);
  }
  return apriPannelloMail(chiave, comuni);
}

/** Mostra una notifica vera (comando `notifica_prova`). Nel browser lo dichiara. */
async function provaNotificaKernel() {
  if (!dentroTauri()) {
    return "Prova visiva: la notifica di sistema si mostra solo dentro l'app avviata.";
  }
  return await window.__TAURI__.core.invoke("notifica_prova");
}

/** Fa sentire il suono scelto (comando `suono_prova`). Nel browser lo dichiara. */
async function provaSuonoKernel(suono) {
  if (!dentroTauri()) {
    return `Prova visiva: il suono «${suono || ""}» si riproduce solo dentro l'app avviata.`;
  }
  return await window.__TAURI__.core.invoke("suono_prova", { suono: suono || null });
}

/**
 * Prove visive (solo nel percorso browser): sovrascrive alcune preferenze del
 * blocco D dai parametri dell'URL, per fotografare gli effetti senza aprire i
 * pannelli. Nel kernel decide `config.json`.
 */
function adattaPreferenzeDaUrl(imp) {
  if (!imp) return imp;
  const u = new URLSearchParams(location.search);
  const p = imp.preferenze || (imp.preferenze = {});
  if (u.has("lettura")) p.letturaPannello = normPannello(u.get("lettura"));
  if (u.has("anteprima")) p.letturaAnteprima = u.get("anteprima") !== "0";
  if (u.has("immagini")) p.letturaImmagini = normImmagini(u.get("immagini"));
  if (u.has("secondi")) p.letturaSegnaLettoDopo = secondiSegnaLetto(u.get("secondi"));
  // Blocco R: la scala del testo del messaggio letto dalle prove visive. Accetta
  // solo valori nell'intervallo ammesso, come la preferenza salvata: un valore
  // fuori scala verrebbe rifiutato da `config.json` e qui non deve comportarsi
  // diversamente. `?zoomlettura` e non `?zoom`, che è lo zoom della composizione.
  if (u.has("zoomlettura")) p.letturaZoom = limitaZoomLettura(u.get("zoomlettura"));
  if (u.has("formato")) p.composizioneFormato = u.get("formato") === "testo" ? "testo" : "html";
  if (u.has("carattere")) p.carattereFamiglia = u.get("carattere");
  if (u.has("dimensione")) p.carattereDimensione = Number(u.get("dimensione")) || p.carattereDimensione;
  if (u.has("correzione")) p.correzioneAutomaticaAttiva = u.get("correzione") !== "0";
  if (u.has("ortografia")) p.ortografiaAttiva = u.get("ortografia") !== "0";
  // Blocco I2: densità e ordinamento per le prove visive.
  if (u.has("densita")) {
    const d = u.get("densita");
    p.densitaVisualizzazione = ["compatta", "accogliente", "spaziosa"].includes(d) ? d : "accogliente";
  }
  if (u.has("ordina")) p.ordinaPer = u.get("ordina");
  if (u.has("verso")) p.ordinaVerso = u.get("verso");
  if (u.has("zoom")) p.zoomComposizione = Number(u.get("zoom")) || 100;
  // Blocco P: aspetto (colore accento) e accessibilità, per le prove visive.
  if (u.has("accento")) p.accento = normAccento(u.get("accento"));
  if (u.has("contrasto")) p.accessibilitaContrastoElevato = u.get("contrasto") !== "0";
  if (u.has("movimento")) p.accessibilitaMovimentoRidotto = u.get("movimento") !== "0";
  if (u.has("testo")) p.accessibilitaTestoScala = Number(u.get("testo")) || 100;
  if (u.has("etichette")) p.accessibilitaEtichettePulsanti = u.get("etichette") !== "0";
  return imp;
}

/**
 * Apre la finestra Account (spec §2.5, estesa dal blocco J) collegata al kernel:
 * elenca **tutti** gli account configurati con l'account predefinito segnalato;
 * il salvataggio passa da `account_save` (la password va nel Keychain), «−» da
 * `account_elimina` (con conferma), «Rendi predefinito» da `account_predefinito`
 * e la riga «Sincronizza ora» da `mail_sync`, che è la prima prova reale delle
 * credenziali. Dopo ogni operazione la lista si aggiorna senza riaprire.
 */
async function apriAccountUI(opzioni = {}) {
  if (!dentroTauri()) {
    // Prova visiva nel browser: due caselle di esempio, nessuna credenziale.
    return apriAccount({
      account: accountDiEsempio,
      elenco: [accountDiEsempio, secondoAccountDiEsempio],
      predefinito: accountDiEsempio.id,
      onMostraTutte: apriImpostazioniUI,
      onSalva: async () => {},
      onElimina: async (id) => `Prova visiva: «${id}» non viene eliminato davvero.`,
      onPredefinito: async (id) => `Prova visiva: account predefinito «${id}».`,
      onSincronizza: async () => "Prova visiva: la sincronizzazione richiede l'app avviata.",
      onDiagnostica: async () => diagnosticaDiEsempio(),
      onConferma: async () => true,
      testoConferma: testoConfermaEliminaAccount,
    });
  }
  const elenco = await accountConfigurati();
  const predefinito = (preferenzeCorrenti && preferenzeCorrenti.accountPredefinito) || "";
  const aperto = elenco.find((a) => a.id === predefinito) || elenco[0] || {};
  return apriAccount({
    account: aperto,
    elenco,
    predefinito: predefinito || (aperto && aperto.id) || "",
    // Solo dall'avvio automatico: cambia il testo dell'elenco vuoto, perché lì
    // il modulo è già aperto (vedi `testoElencoVuoto`).
    primoAvvio: !!opzioni.primoAvvio,
    onMostraTutte: apriImpostazioniUI,
    onSalva: async ({ account, password }) => {
      await window.__TAURI__.core.invoke("account_save", { account, password });
    },
    onElimina: eliminaAccountKernel,
    onPredefinito: impostaPredefinitoKernel,
    onSincronizza: (idAccount) => sincronizzaOra(idAccount),
    onDiagnostica: (idAccount) => diagnosticaConnessione(idAccount),
    onConferma: (titolo, testo) => chiediConferma(titolo, testo),
    testoConferma: testoConfermaEliminaAccount,
    // Rilegge elenco e predefinito dal kernel: la finestra si aggiorna da sola.
    onRicarica: async () => {
      const lista = await accountConfigurati();
      const def = (preferenzeCorrenti && preferenzeCorrenti.accountPredefinito) || "";
      return { elenco: lista, predefinito: def };
    },
  });
}

/** Elimina un account (comando `account_elimina`): configurazione, Keychain e cache. */
async function eliminaAccountKernel(id) {
  const esito = await window.__TAURI__.core.invoke("account_elimina", { id });
  // La selezione attiva non può puntare a una casella che non c'è più.
  if (accountAttivo === id) {
    accountAttivo = "";
    cartellaAttiva = CARTELLA_POSTA_IN_ARRIVO;
  }
  accountAperti.delete(id);
  await caricaCartelle();
  if (!gruppiCartelle.some((g) => g.account === accountAttivo)) {
    accountAttivo = "";
  }
  await apriCartellaSelezionata();
  return esito;
}

/** Segna l'account predefinito (comando `account_predefinito`). */
async function impostaPredefinitoKernel(id) {
  const esito = await window.__TAURI__.core.invoke("account_predefinito", { id });
  if (preferenzeCorrenti) preferenzeCorrenti.accountPredefinito = id;
  accountCorrenteId = id;
  await caricaCartelle();
  return esito;
}

/**
 * Esegue `mail_sync` per l'account indicato (o il primo configurato) e
 * restituisce l'esito leggibile. La usano la finestra Account e la voce
 * "Invia e ricevi" del ribbon: un'unica logica, un unico formato di esito.
 * Nel browser non c'è rete: si dichiara che serve l'app avviata.
 */
async function sincronizzaOra(idAccount) {
  if (!dentroTauri()) {
    return "Prova visiva: l'invio e la ricezione richiedono l'app avviata.";
  }
  const accounts = await accountConfigurati();
  const id = idAccount || (accounts.length ? accounts[0].id : null);
  if (!id) return "Nessun account configurato: apri Impostazioni → Account.";
  try {
    const esito = await window.__TAURI__.core.invoke("mail_sync", { accountId: id });
    ultimaSyncMs = Date.now();
    return riepilogoSync(esito);
  } catch (err) {
    return String((err && err.message) || err);
  }
}

/**
 * Blocco N — (ri)programma il timer della sincronizzazione automatica secondo
 * l'intervallo scelto nel pannello. Il timer vive finché la finestra è aperta
 * (non è un servizio in background); con intervallo 0 non fa nulla.
 */
function programmaSync() {
  if (timerSyncAutomatica) {
    clearInterval(timerSyncAutomatica);
    timerSyncAutomatica = null;
  }
  if (syncIntervalloMinuti <= 0) return;
  timerSyncAutomatica = setInterval(() => {
    const adesso = Date.now();
    if (!deveSincronizzare(syncIntervalloMinuti, ultimaSyncMs, adesso)) return;
    ultimaSyncMs = adesso;
    if (dentroTauri()) inviaERicevi();
  }, 60_000);
}

/** Riepilogo leggibile dell'esito di `mail_sync` per la riga di stato. */
function riepilogoSync(esito) {
  if (!esito || typeof esito !== "object") return "Cartelle aggiornate.";
  const nuove = esito.nuovi ?? esito.nuoviTotali ?? null;
  const cartelle = esito.cartelle ?? null;
  if (nuove === null && cartelle === null) return "Cartelle aggiornate.";
  const pezzi = [];
  if (cartelle !== null) pezzi.push(`${Array.isArray(cartelle) ? cartelle.length : cartelle} cartelle`);
  if (nuove !== null) pezzi.push(`${nuove} messaggi nuovi`);
  return `Cartelle aggiornate: ${pezzi.join(", ")}.`;
}

/**
 * Blocco M — esegue la **prova della connessione** dell'account: `diagnostica_account`
 * (ricezione, fino alle cartelle) e `diagnostica_smtp` (invio, fino all'accesso).
 * Restituisce l'elenco degli esiti pronti per la finestra Account.
 *
 * Un comando che fallisce **non ferma l'altro**: se la ricezione non parte, la
 * prova dell'invio si esegue lo stesso, e il passo mancante compare come errore
 * leggibile. La password non passa di qui: la legge il kernel dal Portachiavi.
 */
async function diagnosticaConnessione(idAccount) {
  const accounts = await accountConfigurati();
  const id = idAccount || (accounts.length ? accounts[0].id : "");
  if (!id) {
    return [
      {
        protocollo: "prova",
        passi: [
          {
            passo: "avvio",
            esito: "errore",
            dettaglio:
              "Nessun account configurato: aggiungine uno nella finestra Account e salva la password.",
          },
        ],
        interrotto: true,
        riepilogo: "La prova non è potuta partire: non c'è nessun account configurato.",
      },
    ];
  }
  const esiti = [];
  for (const [comando, protocollo] of [
    ["diagnostica_account", "IMAP"],
    ["diagnostica_smtp", "SMTP"],
  ]) {
    try {
      esiti.push(await window.__TAURI__.core.invoke(comando, { accountId: id }));
    } catch (err) {
      esiti.push({
        protocollo,
        passi: [
          {
            passo: "avvio",
            esito: "errore",
            dettaglio: String((err && err.message) || err),
          },
        ],
        interrotto: true,
        riepilogo: `La prova della posta ${protocollo === "IMAP" ? "in arrivo" : "in uscita"} non è potuta partire.`,
      });
    }
  }
  return esiti;
}

/**
 * Esiti di esempio per la **prova visiva** nel browser (nessun account, nessuna
 * credenziale): il caso utile da fotografare è «l'accesso è rifiutato», perché è
 * quello in cui i consigli in italiano compaiono.
 */
function diagnosticaDiEsempio() {
  return [
    {
      protocollo: "IMAP",
      passi: [
        { passo: "nome server", esito: "ok", dettaglio: "imaps.esempiohost.it → 192.0.2.42" },
        {
          passo: "connessione",
          esito: "ok",
          dettaglio: "connessione TCP aperta con 192.0.2.42:993 (imaps.esempiohost.it:993)",
        },
        {
          passo: "certificato",
          esito: "ok",
          dettaglio:
            "certificato valido: soggetto «CN=*.esempiohost.it, O=Esempio Host S.p.A., C=IT», rilasciato da «C=US, O=DigiCert Inc, CN=DigiCert TLS RSA SHA256 2020 CA1», valido dal 12 Feb 2025 00:00:00 +0000 al 13 Feb 2026 23:59:59 +0000 (scade fra 87 giorni)",
        },
        {
          passo: "saluto del server",
          esito: "ok",
          dettaglio:
            "* OK [CAPABILITY IMAP4rev1 SASL-IR LOGIN-REFERRALS ID ENABLE IDLE LITERAL+] Dovecot ready. · capacità dichiarate: IMAP4rev1 SASL-IR LOGIN-REFERRALS ID ENABLE IDLE LITERAL+ AUTH=PLAIN AUTH=LOGIN",
        },
        {
          passo: "accesso",
          esito: "errore",
          dettaglio:
            "il server ha rifiutato l'accesso: NO [AUTHENTICATIONFAILED] Authentication failed.",
        },
      ],
      interrotto: true,
      riepilogo:
        "La diagnostica si ferma al passo 5 (accesso): il server ha rifiutato l'accesso: NO [AUTHENTICATIONFAILED] Authentication failed.",
    },
    {
      protocollo: "SMTP",
      passi: [
        { passo: "nome server", esito: "ok", dettaglio: "smtps.esempiohost.it → 192.0.2.74" },
        {
          passo: "connessione",
          esito: "ok",
          dettaglio: "connessione TCP aperta con 192.0.2.74:465 (smtps.esempiohost.it:465)",
        },
        {
          passo: "certificato",
          esito: "ok",
          dettaglio:
            "certificato valido: soggetto «CN=*.esempiohost.it, O=Esempio Host S.p.A., C=IT», rilasciato da «C=US, O=DigiCert Inc, CN=DigiCert TLS RSA SHA256 2020 CA1», valido dal 12 Feb 2025 00:00:00 +0000 al 13 Feb 2026 23:59:59 +0000 (scade fra 87 giorni)",
        },
        {
          passo: "saluto del server",
          esito: "ok",
          dettaglio:
            "220 smtp.esempiohost.it ESMTP ready · capacità dichiarate: 250-smtp.esempiohost.it · 250-PIPELINING · 250-AUTH PLAIN LOGIN · 250 STARTTLS",
        },
        {
          passo: "accesso",
          esito: "errore",
          dettaglio:
            "il server ha rifiutato l'accesso: 535 5.7.8 Authentication credentials invalid",
        },
      ],
      interrotto: true,
      riepilogo:
        "La diagnostica si ferma al passo 5 (accesso): il server ha rifiutato l'accesso: 535 5.7.8 Authentication credentials invalid",
    },
  ];
}

/**
 * Agganci per aprire le impostazioni nella v1: il "?" della barra titolo e la
 * scorciatoia ⌘, (standard macOS). La finestra Account del riferimento non è
 * ancora collegata: il riquadro "Account" lo dichiara.
 */
function collegaImpostazioni() {
  const aiuto = document.querySelector(".titlebar .help");
  if (aiuto) {
    aiuto.title = "Impostazioni (⌘,)";
    aiuto.style.cursor = "pointer";
    aiuto.addEventListener("click", apriImpostazioniUI);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "," && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      apriImpostazioniUI();
    }
  });
}

/**
 * Carica la lista dalla cache del kernel Rust. Con «Raggruppa per conversazione»
 * attivo usa `mail_conversazioni` (una riga per conversazione, espandibile);
 * altrimenti `mail_list` (una riga per messaggio).
 *
 * Blocco J: la lettura è quella della **selezione attiva** — una casella e una
 * cartella, oppure «Tutti gli account» (senza `accountId`, che unisce le Posta
 * in arrivo di tutte le caselle). La barra di stato mostra l'account attivo.
 * Restituisce i messaggi da disegnare, oppure null se la cache non è disponibile.
 */
async function listaDallaCache(listEl, countEl, syncEl, accountEl) {
  const cartella = cartellaAttiva || CARTELLA;
  // `null` = «Tutti gli account»: il kernel unisce le caselle e marca l'account.
  const accountId = accountAttivo || null;
  let messaggi = null;
  if (raggruppaConversazioniAttivo) {
    const righe = await comando("mail_conversazioni", {
      folder: cartella,
      offset: 0,
      limit: 200,
      accountId,
    });
    if (Array.isArray(righe)) {
      conversazioniCorrenti = righe.map(daConversazioneKernel);
      messaggi = conversazioniCorrenti.flatMap((c) => c.messaggi);
      renderListaConversazioni(listEl, conversazioniCorrenti, { anteprima: prefLettura().anteprima });
    }
  }
  if (messaggi === null) {
    const righe = await comando("mail_list", { folder: cartella, offset: 0, limit: 200, accountId });
    if (!Array.isArray(righe)) return null;
    conversazioniCorrenti = [];
    messaggi = righe.map(daRigaKernel);
    renderList(listEl, messaggi, { anteprima: prefLettura().anteprima, coloriCategorie: coloriCategorie() });
  }

  const totale = await comando("mail_count", { folder: cartella, accountId });
  renderStatus(countEl, syncEl, accountEl, {
    count: typeof totale === "number" ? totale : messaggi.length,
    synced: "Tutte le cartelle sono aggiornate.",
    // La barra di stato dice l'account attivo, o «Tutti gli account» quando la
    // lista è aggregata (blocco J).
    account: etichettaAccountAttivo(gruppiCartelle, { account: accountAttivo }),
  });
  return messaggi;
}

/**
 * Seleziona account e cartella (blocco J), aggiorna la barra laterale e la lista.
 * «Tutti gli account» è `account` vuoto: sotto di sé aggrega la Posta in arrivo.
 */
async function selezionaCartella(account, cartella) {
  accountAttivo = account || "";
  cartellaAttiva = cartella || CARTELLA_POSTA_IN_ARRIVO;
  CARTELLA = cartellaAttiva;
  ricercaAttiva = false;
  messaggioCorrente = null;
  disegnaSidebar();
  if (readingEl) renderLettura(readingEl, null);
  await apriCartellaSelezionata();
}

/**
 * Ricarica la lista per la selezione attiva, svuota il pannello di lettura e lo
 * mostra vuoto quando non c'è nulla (una casella senza posta non finge dati).
 */
async function apriCartellaSelezionata() {
  const messaggi = await listaDallaCache(listEl, countEl, syncEl, accountEl);
  if (Array.isArray(messaggi)) {
    messaggiCorrenti = messaggi;
    if (raggruppaConversazioniAttivo && conversazioniCorrenti.length === 0) {
      conversazioniCorrenti = raggruppaConversazioni(messaggiCorrenti);
    }
  }
  ridisegna();
  if (messaggiCorrenti.length) {
    await apriMessaggio(readingEl, messaggiCorrenti[0]);
  } else {
    renderStatoVuoto(listEl, readingEl);
  }
}

/**
 * Applica il filtro attivo a ogni conversazione: si tengono solo i messaggi che
 * superano il filtro e le conversazioni che restano con almeno un messaggio.
 */
function filtraConversazioni(conversazioni, filtro, adesso = Date.now()) {
  const out = [];
  for (const c of conversazioni || []) {
    const messaggi = (c.messaggi || []).filter((m) => passaFiltro(m, filtro, adesso));
    if (!messaggi.length) continue;
    const ultimo = messaggi[messaggi.length - 1];
    const nonLetti = messaggi.filter((m) => !m.seen).length;
    out.push(
      Object.assign({}, c, {
        messaggi,
        numero: messaggi.length,
        nonLetti,
        seen: nonLetti === 0,
        from: ultimo.from,
        subject: ultimo.subject,
        date: ultimo.date,
        timestamp: ultimo.timestamp,
        has_attachments: messaggi.some((m) => m.has_attachments),
      }),
    );
  }
  return out;
}

/**
 * Riempie il pannello di lettura col corpo arrivato dal kernel: HTML sanificato
 * dentro l'iframe e, sotto, l'elenco degli allegati. Se l'HTML è vuoto si ripiega
 * sul testo semplice.
 */
function applicaCorpo(lettura, corpo, messaggio, conImmagini = false) {
  if (!lettura || !corpo) return;
  const html = corpo.html && corpo.html.trim() ? corpo.html : testoInParagrafi(corpo.text);
  // Si conserva il corpo per i ridisegni sul posto del pannello: il modello del
  // messaggio non lo porta, e rileggerlo dal kernel a ogni ridisegno sarebbe una
  // chiamata di rete per un disegno.
  // Il kernel dice se ha bloccato immagini remote: se no (già consentite per
  // questo messaggio, o non ce ne sono) non resta nulla da mostrare.
  const nienteDaMostrare = corpo.immaginiBloccate === false;
  corpoCorrente = { messaggio, html, allegati: corpo.attachments || [], conImmagini: conImmagini || nienteDaMostrare };
  mostraCorpoHtml(lettura, html, stileLetturaCorrente());
  mostraAllegati(lettura.allegati, corpo.attachments || [], (allegato, bottone, riga) =>
    salvaAllegato(messaggio, allegato, bottone, riga),
  );
}

/**
 * Applica la politica delle immagini al corpo appena disegnato (blocco D). Il
 * pulsante «Mostra immagini» nasce dentro `preparaCorpo`: qui si decide se
 * toglierlo («mai»), se caricare le immagini da sé («sempre») o se collegare il
 * consenso valido per questo solo messaggio («chiedi»). In un posto solo perché
 * lo usano l'apertura e il ridisegno sul posto: senza, il pulsante tornerebbe
 * muto a ogni ridisegno.
 */
async function collegaImmagini(lettura, messaggio) {
  if (!lettura) return;
  // Immagini già mostrate o nulla di bloccato: il pulsante non servirebbe.
  if (corpoCorrente && corpoCorrente.messaggio === messaggio && corpoCorrente.conImmagini) {
    lettura.btnImmagini.remove();
    return;
  }
  const politica = prefLettura().immagini;
  if (politica === "mai") {
    lettura.btnImmagini.remove();
    return;
  }
  const mostra = async () => {
    const conImmagini = await comando("mail_body_con_immagini", {
      folder: cartellaDi(messaggio),
      uid: messaggio.uid,
      accountId: accountDi(messaggio),
    });
    if (!conImmagini) return;
    applicaCorpo(lettura, conImmagini, messaggio, true);
    lettura.btnImmagini.remove();
  };
  if (politica === "sempre") {
    lettura.btnImmagini.remove();
    await mostra();
    return;
  }
  // "chiedi": il consenso vale per questo messaggio e il kernel lo ricorda
  // (riaprendolo il corpo arriva già con le immagini).
  lettura.btnImmagini.addEventListener("click", mostra);
}

/**
 * Collega A⁻/A⁺ del pannello di lettura: cambiano la scala del testo del
 * messaggio aperto, ridisegnano subito il corpo (senza riaprirlo) e salvano la
 * scelta come `letturaZoom`, così vale anche per i messaggi aperti dopo.
 */
function collegaZoomLettura(readingEl) {
  const etichetta = readingEl.querySelector("#lettura-zoom-val");
  const aggiorna = () => {
    if (etichetta) etichetta.textContent = `${zoomLetturaCorrente}%`;
  };
  aggiorna();
  readingEl.querySelectorAll("[data-zoom-lettura]").forEach((b) => {
    b.addEventListener("click", async () => {
      zoomLetturaCorrente = passoZoomLettura(zoomLetturaCorrente, b.dataset.zoomLettura);
      aggiorna();
      const frame = readingEl.querySelector(".mail-frame");
      if (frame && corpoCorrente) {
        mostraCorpoHtml({ frame }, corpoCorrente.html, stileLetturaCorrente());
      }
      try {
        await salvaImpostazioni({
          theme: getTheme(),
          preferenze: Object.assign({}, p, { letturaZoom: zoomLetturaCorrente }),
        });
      } catch (err) {
        // Lo zoom è già applicato a schermo (l'utente ha premuto il pulsante),
        // ma va detto che non è stato scritto: altrimenti un salvataggio
        // successivo riporterebbe la scala al valore vecchio, in silenzio.
        stato(`Scala di lettura non salvata: ${err && err.message ? err.message : err}`, true);
      }
    });
  });
}

/**
 * Chiede al kernel di salvare l'allegato in Download e mostra il percorso
 * scritto sotto la riga. Nessun dialogo di scelta: nella v1 va in Download.
 */
async function salvaAllegato(messaggio, allegato, bottone, riga) {
  bottone.disabled = true;
  bottone.textContent = "Salvataggio…";
  const percorso = await comando("mail_allegato_salva", {
    folder: cartellaDi(messaggio),
    uid: messaggio.uid,
    indice: allegato.indice,
    accountId: accountDi(messaggio),
  });
  bottone.disabled = false;
  bottone.textContent = "Salva";
  const esito = riga.querySelector(".attach-path") || document.createElement("div");
  esito.className = "attach-path";
  esito.textContent =
    typeof percorso === "string"
      ? `Salvato in: ${percorso}`
      : "Salvataggio non riuscito (vedi console).";
  if (!esito.parentNode) riga.append(esito);
}

/**
 * Apre un messaggio: intestazione subito, corpo e allegati dal kernel. Aggiunge
 * la barra delle azioni (Rispondi / Rispondi a tutti / Inoltra) sopra il corpo.
 */
async function apriMessaggio(pane, messaggio) {
  // Il pannello su cui si disegna è quello che le azioni successive devono
  // aggiornare: lo si registra qui, così i ridisegni sul posto (segna come
  // letto, categorizza, contrassegna, completa) lo trovano. È lo stesso nodo
  // che `boot()` mette in `readingEl` — il parametro si chiama `pane` appunto
  // per non ombreggiare quella variabile.
  readingEl = pane;
  messaggioCorrente = messaggio || null;
  // `renderLettura` collega già barra dell'Assistente, rubrica, zoom e corpo:
  // qui non si ricollega nulla, altrimenti gli ascoltatori raddoppierebbero.
  renderLettura(readingEl, messaggio);
  // Corpo e barre del messaggio precedente non valgono più: li rimetteranno
  // `applicaCorpo`, `applicaInvito` e `applicaConferme` (blocco T).
  corpoCorrente = null;
  invitoCorrente = null;
  confermeCorrente = null;
  // "Segna come letto dopo N secondi": vale anche nel percorso browser (simulato).
  programmaSegnaLetto(messaggio);
  if (!messaggio) return;
  if (!dentroTauri() || !messaggio.uid) return;

  const lettura = preparaCorpo(readingEl);
  const corpo = await comando("mail_body", {
    folder: cartellaDi(messaggio),
    uid: messaggio.uid,
    accountId: accountDi(messaggio),
  });
  applicaCorpo(lettura, corpo, messaggio);
  // Blocco G: se il messaggio porta un invito (allegato text/calendar) compare
  // la barra della richiesta di riunione in cima al messaggio. Gli allegati li
  // legge da solo dal corpo appena conservato.
  await collegaInvito(readingEl, messaggio);
  // Blocco I2: se il mittente ha chiesto una conferma di lettura/recapito compare
  // la barra discreta (nessuna conferma parte da sé).
  await collegaConferme(readingEl, messaggio);
  // Immagini dei messaggi (blocco D): "mai" NON chiama mai il comando; "sempre"
  // le carica da sé; "chiedi" lascia il pulsante "Mostra immagini" (v1).
  await collegaImmagini(lettura, messaggio);
}

/**
 * Collega la barra dell'Assistente (Milestone 6.4): i quattro pulsanti d'azione
 * e il selettore della destinazione dei dati (locale/cloud).
 */
function collegaAssistente(readingEl, messaggio) {
  const aiBar = readingEl.querySelector(".ai-bar");
  if (!aiBar) return;
  const selettore = aiBar.querySelector(".ai-model-select");
  if (selettore) {
    selettore.value = destinazioneIA;
    selettore.addEventListener("change", () => {
      destinazioneIA = selettore.value === "cloud" ? "cloud" : "locale";
    });
  }
  // «Inoltro rapido»: un indirizzo e Invio aprono l'inoltro già indirizzato.
  const inoltro = aiBar.querySelector(".inoltro-rapido-campo");
  if (inoltro) {
    inoltro.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const indirizzo = inoltro.value.trim();
      if (!indirizzo) return;
      if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(indirizzo)) {
        stato(`«${indirizzo}» non è un indirizzo valido.`, true);
        return;
      }
      inoltro.value = "";
      apriInoltro(messaggio, indirizzo);
    });
  }
  aiBar.addEventListener("click", (e) => {
    const bottone = e.target.closest("[data-ai]");
    if (!bottone) return;
    eseguiAzioneAssistita(bottone.dataset.ai, messaggio, readingEl);
  });
}

/**
 * Esegue un'azione dell'assistente e disegna il risultato (o l'attesa o
 * l'errore) nella scheda sotto il messaggio. Nel browser usa i dati di esempio:
 * serve alle prove visive, non tocca il modello.
 *
 * Azioni da kernel: `ai_azione` costruisce il contesto del thread dalla cache
 * (fonti ed esclusi tornano nella risposta). Per "reply" il risultato apre la
 * finestra di composizione come bozza assistita (Milestone 7.1).
 */
async function eseguiAzioneAssistita(azione, messaggio, readingEl) {
  const pannello = readingEl || document.querySelector("#reading-pane");
  if (!pannello || !messaggio) return;

  const azioneMappa = { summarize: "riassumi", actions: "azioni", translate: "traduci", reply: "bozza_risposta" };
  const nomeAzione = azioneMappa[azione];
  if (!nomeAzione) return;

  // Consenso per il cloud: conferma esplicita PRIMA della chiamata, con la
  // dichiarazione che il testo uscirà dal Mac. Se rifiuta resta sul locale.
  // Dalle impostazioni (Milestone 8) la conferma può essere disattivata: in quel
  // caso l'utente l'ha già autorizzata e non si chiede più a ogni azione, ma il
  // kernel riceve comunque `consensoCloud: true` e il registro continua a crescere.
  if (destinazioneIA === "cloud") {
    const serveConferma = !preferenzeCorrenti || preferenzeCorrenti.consensoRichiesto !== false;
    if (serveConferma) {
      const si = await chiediConsensoCloud();
      if (!si) {
        const selettore = pannello.querySelector(".ai-model-select");
        if (selettore) {
          selettore.value = "locale";
          destinazioneIA = "locale";
        }
        return;
      }
    }
  }

  const datiAttesa = { azione: nomeAzione, inAttesa: true, provider: destinazioneIA };
  renderSchedaIA(pannello, datiAttesa);
  attesaPulsanti(pannello, true);

  if (!dentroTauri() || !messaggio.uid) {
    // Prove visive nel browser: risultato simulato realistico.
    attesaPulsanti(pannello, false);
    const scheda = renderSchedaIA(pannello, schedaDiEsempio(nomeAzione));
    return scheda;
  }

  try {
    const risposta = await comandoConErrore("ai_azione", {
      azione: nomeAzione,
      folder: cartellaDi(messaggio),
      uid: messaggio.uid,
      provider: destinazioneIA,
      consensoCloud: destinazioneIA === "cloud",
      accountId: accountDi(messaggio),
    });
    attesaPulsanti(pannello, false);
    if (nomeAzione === "bozza_risposta") {
      // La bozza va nella finestra di composizione, non nella scheda.
      const attesa = pannello.querySelector(".ai-card");
      if (attesa) attesa.remove();
      apriBozzaAssistita(messaggio, risposta);
      return;
    }
    renderSchedaIA(pannello, {
      azione: nomeAzione,
      testo: risposta.testo,
      modello: risposta.modello,
      provider: risposta.provider,
      messaggiUsati: risposta.messaggiUsati,
      esclusi: risposta.esclusi,
    });
  } catch (err) {
    attesaPulsanti(pannello, false);
    renderSchedaIA(pannello, { azione: nomeAzione, errore: String(err), provider: destinazioneIA });
  }
}

/** Attiva/disattiva l'attesa sui pulsanti della barra dell'Assistente. */
function attesaPulsanti(pannello, inAttesa) {
  for (const b of pannello.querySelectorAll(".ai-btn")) {
    b.disabled = inAttesa;
    b.classList.toggle("ai-btn--attesa", inAttesa);
  }
}

/**
 * Apre la finestra di composizione con la bozza di risposta generata
 * dall'assistente (Milestone 7.1): destinatario = mittente della mail,
 * oggetto "R: …", corpo = testo del modello. Mai invio automatico.
 */
async function apriBozzaAssistita(messaggio, risposta) {
  const mittente = await mittenteAccount();
  const nelCloud = risposta.provider === "cloud";
  apriComposizione({
    a: messaggio.from || "",
    oggetto: prefissoOggetto(messaggio.subject, "R: "),
    corpo: risposta.testo || "",
    mittente,
    onInvia: inviaConKernel,
    onControllo: controlloPreInvio,
    etichettaIA: `bozza generata ${nelCloud ? "nel cloud" : "in locale"} · rileggila prima di inviare`,
  });
}

/** Corpo del messaggio originale nella forma testuale (per la citazione locale). */
function corpoOriginale(messaggio) {
  if (Array.isArray(messaggio.body)) return messaggio.body.join("\n");
  if (typeof messaggio.body === "string") return messaggio.body;
  return "";
}

/** Prefissa l'oggetto evitando di raddoppiare "R: "/"I: ". */
function prefissoOggetto(oggetto, prefisso) {
  const o = (oggetto || "").trim();
  if (!o) return prefisso.trimEnd();
  return o.toLowerCase().startsWith(prefisso.trimEnd().toLowerCase()) ? o : `${prefisso}${o}`;
}

/** Citazione locale del messaggio originale (usata nel browser e senza UID). */
function citaOriginale(messaggio) {
  const righe = corpoOriginale(messaggio)
    .split("\n")
    .map((r) => `> ${r}`)
    .join("\n");
  const data = messaggio.date || "";
  const da = messaggio.from || "";
  return (
    `Il ${data} ${da} ha scritto:\n${righe}\n\n` +
    `-----Messaggio originale-----\nDa: ${da}\nData: ${data}\n` +
    `A: ${messaggio.to || ""}\nOggetto: ${messaggio.subject || ""}\n`
  );
}

/** Bozza di risposta costruita localmente, senza il server. */
function bozzaRispostaLocale(messaggio, tutti) {
  const copia = tutti && messaggio.to && messaggio.to !== messaggio.from ? messaggio.to : "";
  return {
    a: messaggio.from || "",
    cc: copia,
    oggetto: prefissoOggetto(messaggio.subject, "R: "),
    corpo: citaOriginale(messaggio),
  };
}

/** Bozza di inoltro costruita localmente, senza il server. */
function bozzaInoltroLocale(messaggio) {
  return {
    a: "",
    cc: "",
    oggetto: prefissoOggetto(messaggio.subject, "I: "),
    corpo: citaOriginale(messaggio),
  };
}

/**
 * Riporta nella bozza gli allegati del messaggio originale, come fa Outlook con
 * Rispondi/Inoltro. Se il recupero fallisce la bozza resta aperta e lo si dichiara
 * con una nota (non un errore): non si perde il lavoro di scrittura.
 */
async function riportaAllegatiOriginale(overlay, messaggio) {
  if (!dentroTauri() || !messaggio || !messaggio.uid) return;
  try {
    const allegati = await comando("mail_allegati_messaggio", {
      folder: cartellaDi(messaggio),
      uid: messaggio.uid,
      accountId: accountDi(messaggio),
    });
    if (Array.isArray(allegati) && allegati.length) impostaAllegati(overlay, allegati);
  } catch (err) {
    notaInBozza(
      overlay,
      "Nota: gli allegati del messaggio originale non sono stati recuperati. La bozza è aperta: " +
        "puoi allegarli a mano. " +
        (err && err.message ? err.message : err),
      false,
    );
  }
}

/**
 * Apre la finestra di composizione per "Rispondi" / "Rispondi a tutti".
 * Col kernel (e con l'UID) i campi arrivano dal server; altrimenti si costruiscono
 * dai dati già in mano all'interfaccia. Nel percorso kernel la bozza riporta
 * anche gli allegati del messaggio originale.
 */
async function apriRisposta(messaggio, tutti) {
  if (!messaggio) return;
  const mittente = await mittenteAccount();
  let bozza = null;
  if (dentroTauri() && messaggio.uid) {
    const b = await comando("mail_bozza_risposta", {
      folder: cartellaDi(messaggio),
      uid: messaggio.uid,
      tutti,
      accountId: accountDi(messaggio),
    });
    if (b) bozza = { a: b.a, cc: b.cc || "", oggetto: b.oggetto, corpo: b.corpoCitato };
  }
  if (!bozza) bozza = bozzaRispostaLocale(messaggio, tutti);
  // Preferenza "includi sempre il messaggio originale in Rispondi": se è spenta
  // la bozza parte senza la citazione (solo destinatario e oggetto).
  if (preferenzeCorrenti && preferenzeCorrenti.composizioneIncludiOriginale === false) {
    bozza = { ...bozza, corpo: "" };
  }
  const overlay = apriComposizione({
    ...bozza,
    mittente,
    onInvia: inviaConKernel,
    onControllo: controlloPreInvio,
  });
  await riportaAllegatiOriginale(overlay, messaggio);
}

/** Apre la finestra di composizione per "Inoltra" (con gli allegati originali). */
async function apriInoltro(messaggio, destinatario = "") {
  if (!messaggio) return;
  const mittente = await mittenteAccount();
  let bozza = null;
  if (dentroTauri() && messaggio.uid) {
    const b = await comando("mail_bozza_inoltro", {
      folder: cartellaDi(messaggio),
      uid: messaggio.uid,
      accountId: accountDi(messaggio),
    });
    if (b) bozza = { a: "", cc: "", oggetto: b.oggetto, corpo: b.corpoCitato };
  }
  if (!bozza) bozza = bozzaInoltroLocale(messaggio);
  if (destinatario) bozza.a = destinatario;
  const overlay = apriComposizione({
    ...bozza,
    mittente,
    onInvia: inviaConKernel,
    onControllo: controlloPreInvio,
  });
  await riportaAllegatiOriginale(overlay, messaggio);
}

/** Apre una finestra di composizione vuota ("Nuovo messaggio di posta elettronica"). */
async function nuovoMessaggio() {
  apriComposizione({
    mittente: await mittenteAccount(),
    onInvia: inviaConKernel,
    onControllo: controlloPreInvio,
  });
}

/**
 * Invia il messaggio col comando `mail_invia` del kernel. La validazione locale
 * è già avvenuta nella finestra; qui si propaga l'eventuale errore del kernel.
 */
async function inviaConKernel(campi) {
  if (!dentroTauri()) {
    throw new Error("l'invio non è disponibile nel browser (solo prove visive)");
  }
  const accounts = await accountConfigurati();
  if (!accounts.length) throw new Error("nessun account configurato");
  // Il payload lo costruisce `payloadInvio` (in compose.js): è l'unico posto
  // dove sono elencate le chiavi richieste dal kernel — `cc` e `ccn` comprese.
  // Allegati (file + immagini incorporate) con contenuto in base64: il kernel
  // costruisce il MIME e, a invio riuscito, copia in «Posta inviata».
  const esito = await window.__TAURI__.core.invoke(
    "mail_invia",
    payloadInvio(campi, accounts[0].id),
  );
  // Dopo un invio riuscito la lista si aggiorna da sé. Senza questo, una mail
  // inviata a sé stessi non comparirebbe finché non si preme «Invia e ricevi» a
  // mano: l'invio era riuscito ma la vista restava ferma sulla cache vecchia.
  // Il refresh va in secondo piano, così la finestra di composizione mostra
  // subito il proprio esito invece di aspettare la rete.
  void inviaERicevi().catch((e) =>
    stato(`Aggiornamento dopo l'invio non riuscito: ${(e && e.message) || e}`, true),
  );
  return esito;
}

/**
 * Programma l'invio («Invia più tardi», blocco I2). Dentro Tauri passa da
 * `invio_programma`: il messaggio resta in coda locale e parte mentre l'app è
 * aperta. Nel browser lo dichiara (prova visiva: nessuna coda scritta).
 */
async function pianificaInvio(campi, quando) {
  if (!dentroTauri()) {
    return "Prova visiva: l'invio programmato resta in coda solo nell'app avviata.";
  }
  const accounts = await accountConfigurati();
  if (!accounts.length) throw new Error("nessun account configurato");
  const inv = await window.__TAURI__.core.invoke("invio_programma", {
    // Stesso payload dell'invio immediato (`payloadInvio`), più la data: così i
    // due percorsi non possono divergere su chiavi come `ccn`.
    dati: { quando, ...payloadInvio(campi, accounts[0].id) },
  });
  return `Invio programmato per ${etichettaRitardo(inv.quando)}. Resta in coda sul Mac e parte mentre l'app è aperta.`;
}

/**
 * Destinazione con modello del controllo del tono: **disattivata di default**.
 * La preferenza vive in `config.json` (Milestone 8: `controlloTonoAttivo`) e si
 * carica all'avvio; il pannello Assistente IA la espone. Con `false` il kernel
 * non chiama affatto il modello (nessuna chiamata di rete).
 */
function controlloConTono() {
  return !!(preferenzeCorrenti && preferenzeCorrenti.controlloTonoAttivo);
}

/**
 * Controllo prima dell'invio. Dentro Tauri delega al kernel
 * (`controllo_preinvio`); nel browser usa la simulazione `avvisiSimulati`
 * (solo per le prove visive). Non solleva **mai**: se il controllo fallisce si
 * torna un elenco vuoto, perché un avviso non deve impedire l'invio.
 */
async function controlloPreInvio(campi) {
  if (!dentroTauri()) return avvisiSimulati(campi);
  try {
    const avvisi = await window.__TAURI__.core.invoke("controllo_preinvio", {
      a: campi.a,
      cc: campi.cc,
      oggetto: campi.oggetto,
      corpo: campi.corpoTesto,
      numeroAllegati: campi.numeroAllegati || 0,
      conTono: controlloConTono(),
    });
    return Array.isArray(avvisi) ? avvisi : [];
  } catch (err) {
    console.warn("controllo_preinvio non riuscito:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Ricerca (blocco B): il campo "Cerca" in alto a destra
// ---------------------------------------------------------------------------

/** Cartella di un messaggio: quella della riga, o la selezione attiva. */
function cartellaDi(m) {
  return (m && m.folder) || cartellaAttiva || CARTELLA;
}

/**
 * Account di un messaggio (blocco J): quello della riga, o la selezione attiva.
 * Nella vista «Tutti gli account» ogni riga porta il suo `account`, quindi la
 * lettura e le azioni sanno da quale casella pescare.
 *
 * Blocco K: con **più** caselle e nessuna determinabile (una riga di ricerca
 * senza account) restituisce `null`, invece di ripiegare su un'altra casella.
 */
function accountDi(m) {
  return risolviAccountAzione({
    accountRiga: m && m.account,
    accountAttivo,
    accountCorrente: accountCorrenteId,
    numeroAccount: Array.isArray(gruppiCartelle) ? gruppiCartelle.length : 0,
  }).accountId || null;
}

/**
 * L'account con cui eseguire un'**azione** su un messaggio (blocco K). Se non è
 * determinabile con più caselle scrive un messaggio di stato e restituisce
 * `undefined`: l'azione va fermata, mai eseguita su un'altra casella per sbaglio.
 * Con una sola casella (o nessuna) restituisce `null`: il kernel usa il
 * predefinito, che è la casella stessa.
 */
function accountIdPerAzione(m) {
  const esito = risolviAccountAzione({
    accountRiga: m && m.account,
    accountAttivo,
    accountCorrente: accountCorrenteId,
    numeroAccount: Array.isArray(gruppiCartelle) ? gruppiCartelle.length : 0,
  });
  if (esito.mancante) {
    stato("Seleziona una casella nella barra laterale prima di agire sul messaggio.", true);
    return undefined;
  }
  return esito.accountId || null;
}

/**
 * Esegue la ricerca e disegna i risultati nell'area della lista. Dentro Tauri
 * usa il comando `mail_cerca` (indice FTS5 sulla cache); nel browser cerca nei
 * dati di esempio in memoria. Il testo vuoto equivale a chiudere la ricerca.
 */
async function eseguiRicerca(testo) {
  const t = String(testo == null ? "" : testo).trim();
  ricercaTesto = String(testo == null ? "" : testo);
  if (!t) return chiudiRicerca();

  ricercaAttiva = true;
  let risultati = [];
  let nota = null;

  // Blocco N: il limite e l'ambito vengono dal pannello «Cerca».
  if (dentroTauri()) {
    const esito = await comando("mail_cerca", { testo: t, limite: ricercaLimite });
    if (esito && Array.isArray(esito.risultati)) {
      risultati = esito.risultati.map(daRigaRicercaKernel);
      nota = esito.nota || null;
    } else {
      nota = "Ricerca non disponibile in questo momento (vedi console).";
    }
  } else {
    const esito = cercaNeiMessaggi(messaggiCorrenti, t, ricercaLimite);
    risultati = esito.risultati;
    nota = esito.nota;
  }
  // «Cartella corrente» restringe i risultati alla cartella aperta.
  risultati = filtraPerAmbito(risultati, ricercaAmbito, cartellaAttiva);

  ricercaRisultati = risultati;
  renderRisultati(
    listEl,
    { testo: t, risultati, nota },
    { onScegli: (m) => apriRisultatoRicerca(m), onChiudi: chiudiRicerca },
  );
  renderStatus(countEl, syncEl, accountEl, { count: risultati.length });
  if (syncEl) {
    syncEl.textContent = nota || intestazioneRicerca(t, risultati.length);
    syncEl.classList.remove("stato--errore");
  }
}

/** Apre nel pannello di lettura il messaggio scelto fra i risultati. */
async function apriRisultatoRicerca(m) {
  for (const r of ricercaRisultati) r.selected = false;
  m.selected = true;
  messaggioCorrente = m;
  await apriMessaggio(readingEl, m);
}

/** Chiude la ricerca, svuota il campo e torna alla lista normale. */
function chiudiRicerca() {
  ricercaAttiva = false;
  ricercaTesto = "";
  ricercaRisultati = [];
  if (timerRicerca) {
    clearTimeout(timerRicerca);
    timerRicerca = null;
  }
  if (searchInput) searchInput.value = "";
  ridisegna();
}

/**
 * Attende ~250 ms dall'ultimo tasto prima di cercare (Invio cerca subito). Con
 * la preferenza «Cerca mentre si digita» spenta (blocco N) non parte da sola:
 * si cerca con Invio, svuotando il campo si chiude.
 */
function programmataRicerca() {
  if (timerRicerca) clearTimeout(timerRicerca);
  const valore = searchInput ? searchInput.value : "";
  if (!valore.trim()) {
    chiudiRicerca();
    return;
  }
  if (!ricercaMentreSiDigita) return;
  timerRicerca = setTimeout(() => {
    timerRicerca = null;
    eseguiRicerca(searchInput.value);
  }, RITARDO_RICERCA_MS);
}

/** Collega il campo "Cerca": digitazione (con ritardo), Invio, Esc. */
function collegaRicerca() {
  if (!searchInput) return;
  searchInput.addEventListener("input", programmataRicerca);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (timerRicerca) {
        clearTimeout(timerRicerca);
        timerRicerca = null;
      }
      eseguiRicerca(searchInput.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      chiudiRicerca();
    }
  });
}

// ---------------------------------------------------------------------------
// Azioni sui messaggi (blocco A): riga di stato, modello, ridisegno
// ---------------------------------------------------------------------------

/** Scrive una riga nella barra di stato (mai un alert); in rosso se è un errore. */
function stato(testo, errore = false) {
  if (!syncEl) return;
  syncEl.textContent = testo;
  syncEl.classList.toggle("stato--errore", !!errore);
}

/**
 * Chiama un comando di posta del kernel. Restituisce `null` se è andata bene,
 * oppure la stringa d'errore in italiano da mostrare nella riga di stato.
 * Nel browser non si tocca il kernel: le azioni mutano i dati in memoria.
 */
async function azioneMail(nome, args) {
  if (!dentroTauri()) return null;
  try {
    await window.__TAURI__.core.invoke(nome, args);
    return null;
  } catch (err) {
    return String((err && err.message) || err);
  }
}

/**
 * Come `azioneMail`, ma restituisce anche il testo che il kernel manda in caso di
 * successo: alcune operazioni hanno qualcosa da dire (per esempio
 * `mail_elimina`, quando il server non supporta `UID EXPUNGE`).
 */
async function azioneMailConEsito(nome, args) {
  if (!dentroTauri()) return { errore: null, esito: null };
  try {
    const esito = await window.__TAURI__.core.invoke(nome, args);
    return { errore: null, esito: typeof esito === "string" ? esito : null };
  } catch (err) {
    return { errore: String((err && err.message) || err), esito: null };
  }
}

/**
 * Stato vuoto della lista nell'app vera. Con almeno una casella configurata è
 * solo la cartella a essere vuota, e lo si dice; senza caselle si spiega cosa
 * fare e si aprono le impostazioni in un clic — meglio di una lista vuota e muta.
 */
function renderStatoVuoto(listEl, readingEl) {
  if (readingEl) readingEl.replaceChildren();
  if (!listEl) return;
  listEl.replaceChildren();
  const box = document.createElement("div");
  box.className = "lista-vuota";
  const titolo = document.createElement("p");
  titolo.className = "lista-vuota-titolo";
  if (gruppiCartelle.length) {
    titolo.textContent = "Nessun elemento da visualizzare";
    const testo = document.createElement("p");
    testo.className = "lista-vuota-testo";
    testo.textContent = `La cartella «${etichettaCartellaSync(cartellaAttiva)}» è vuota.`;
    box.append(titolo, testo);
    listEl.append(box);
    return;
  }
  titolo.textContent = "Nessun account configurato";
  const testo = document.createElement("p");
  testo.className = "lista-vuota-testo";
  testo.textContent =
    "Per leggere la posta imposta la casella: indirizzo, server di posta in arrivo e in uscita, e la password. " +
    "La password resta nel Portachiavi di macOS, non in un file di configurazione.";
  const apri = document.createElement("button");
  apri.type = "button";
  apri.textContent = "Configura l'account…";
  apri.addEventListener("click", apriImpostazioniUI);
  box.append(titolo, testo, apri);
  listEl.append(box);
}

/** Toglie un messaggio dal modello (dopo Elimina/Archivia/Sposta/Indesiderato). */
function rimuoviDalModello(m) {
  const i = messaggiCorrenti.indexOf(m);
  if (i >= 0) messaggiCorrenti.splice(i, 1);
  if (messaggioCorrente === m) {
    messaggioCorrente = null;
    if (readingEl) renderLettura(readingEl, null);
  }
  ridisegna();
}

/** Ridisegna la lista applicando il filtro attivo e aggiorna il conteggio. */
function ridisegna() {
  if (!listEl) return;
  // Con la ricerca attiva la lista mostra i risultati: si rifà la ricerca,
  // così un'azione sul messaggio (es. spostalo) si riflette subito.
  if (ricercaAttiva) {
    eseguiRicerca(ricercaTesto);
    return;
  }
  if (raggruppaConversazioniAttivo) {
    const conv = filtraConversazioni(conversazioniCorrenti, filtroCorrente);
    const convOrdinate = ordinaMessaggi(conv, ordinaCampo, ordinaVerso);
    renderListaConversazioni(listEl, convOrdinate, { anteprima: prefLettura().anteprima });
    const n = convOrdinate.reduce((tot, c) => tot + c.numero, 0);
    renderStatus(countEl, syncEl, accountEl, { count: n });
    return;
  }
  const visibili = filtra(messaggiCorrenti, filtroCorrente);
  const ordinati = ordinaMessaggi(visibili, ordinaCampo, ordinaVerso);
  renderList(listEl, ordinati, { anteprima: prefLettura().anteprima, coloriCategorie: coloriCategorie() });
  renderStatus(countEl, syncEl, accountEl, { count: ordinati.length });
}

/** Evidenzia la voce "Filtra" del ribbon e ne mostra il filtro attivo. */
function evidenziaFiltro() {
  // Filtri rapidi della barra superiore: accesi solo se il filtro è uno dei due.
  document.querySelectorAll(".filtro-btn").forEach((b) => {
    b.setAttribute("aria-pressed", b.dataset.filtro === filtroCorrente ? "true" : "false");
  });
  const bottone = ribbonEl && ribbonEl.querySelector('[data-rb="filter"]');
  if (!bottone) return;
  const attivo = filtroCorrente !== "tutti";
  bottone.classList.toggle("rb--attivo", attivo);
  const lb = bottone.querySelector(".lb");
  if (lb) {
    lb.innerHTML = attivo ? `Filtro:<br>${etichettaFiltro(filtroCorrente)}` : "Filtra posta<br>elettronica";
  }
}

// ---------------------------------------------------------------------------
// Blocco I2 — «Ordina per», «Densità di visualizzazione», «Ricerca avanzata…»
// ---------------------------------------------------------------------------

/** Aggiorna le etichette delle voci «Ordina per» e «Densità» del ribbon. */
function aggiornaEtichetteVista() {
  if (!ribbonEl) return;
  const bSort = ribbonEl.querySelector('[data-rb="sort"]');
  if (bSort) {
    const lb = bSort.querySelector(".lb");
    if (lb) lb.innerHTML = `Ordina per:<br>${etichettaOrdinamento(ordinaCampo)} ${etichettaVerso(ordinaVerso).toLowerCase()}`;
  }
  const bDen = ribbonEl.querySelector('[data-rb="density"]');
  if (bDen) {
    const lb = bDen.querySelector(".lb");
    if (lb) lb.innerHTML = `Densità:<br>${etichettaDensita(densitaLista)}`;
  }
  applicaDensita(listEl, densitaLista);
}

/** Salva ordinamento o densità in `config.json` e ridisegna la lista. */
async function salvaVista(campi) {
  if (!preferenzeCorrenti) preferenzeCorrenti = impostazioniDiEsempio().preferenze;
  preferenzeCorrenti = Object.assign({}, preferenzeCorrenti, campi);
  aggiornaEtichetteVista();
  ridisegna();
  if (dentroTauri()) {
    await salvaImpostazioni({ theme: getTheme(), preferenze: preferenzeCorrenti });
  }
}

/** Menu «Ordina per»: sceglie campo e verso, salva e ridisegna. */
function apriOrdinaUI(ancora) {
  return apriMenuOrdina(ancora, {
    campo: ordinaCampo,
    verso: ordinaVerso,
    onScegli: async ({ campo, verso }) => {
      if (campo) ordinaCampo = campo;
      if (verso) ordinaVerso = verso;
      await salvaVista({ ordinaPer: ordinaCampo, ordinaVerso });
      stato(`Ordinamento: ${etichettaOrdinamento(ordinaCampo)}, ${etichettaVerso(ordinaVerso).toLowerCase()}.`);
    },
  });
}

/** Menu «Densità di visualizzazione»: cambia davvero l'altezza delle righe. */
function apriDensitaUI(ancora) {
  return apriMenuDensita(ancora, {
    densita: densitaLista,
    onScegli: async (id) => {
      densitaLista = id;
      await salvaVista({ densitaVisualizzazione: id });
      stato(`Densità di visualizzazione: ${etichettaDensita(id)}.`);
    },
  });
}

/** Modulo «Ricerca avanzata…»: costruisce la query e avvia la ricerca. */
function apriRicercaAvanzataUI() {
  return apriModuloRicercaAvanzata({
    onCerca: async (query) => {
      if (searchInput) searchInput.value = query;
      await eseguiRicerca(query);
    },
  });
}

// ---------------------------------------------------------------------------
// Blocco I2 — conferme di lettura e recapito all'arrivo
// ---------------------------------------------------------------------------

/**
 * Chiede al kernel se il messaggio appena aperto chiede una conferma e, in tal
 * caso, mostra la barra discreta. Nel browser non c'è rete: nessuna barra, si
 * dichiara che serve l'app avviata.
 */
async function collegaConferme(readingEl, messaggio) {
  if (!readingEl || !messaggio || !dentroTauri()) return;
  const folder = cartellaDi(messaggio);
  const uid = messaggio.uid;
  const accountId = accountDi(messaggio);
  if (!uid) return;
  let statoConferme = null;
  try {
    statoConferme = await window.__TAURI__.core.invoke("conferme_stato", { folder, uid, accountId });
  } catch {
    return; // niente rete o niente richiesta: nessuna barra, nessun errore grezzo
  }
  applicaConferme(readingEl, messaggio, statoConferme, { folder, uid, accountId });
}

/**
 * Registra lo stato delle conferme del messaggio aperto e lo disegna (blocco T).
 * Una sola porta d'ingresso alla copia conservata, perché la risposta cambia lo
 * stato: la barra ridisegnata dall'`onRispondi` deve lasciare la copia allineata,
 * altrimenti un ridisegno sul posto tornerebbe a chiedere una conferma già data.
 *
 * `dove` è `{ folder, uid, accountId }` — come raggiungere il messaggio nel
 * kernel. Viaggia con la copia perché serve anche alla barra rimessa dal
 * ridisegno: senza, i suoi pulsanti sarebbero muti.
 */
function applicaConferme(readingEl, messaggio, statoConferme, dove) {
  if (messaggio) confermeCorrente = { messaggio, statoConferme, dove };
  disegnaConferme(readingEl, messaggio, statoConferme, dove);
}

/** Rimette la barra delle conferme conservata (blocco T), guardia sul messaggio. */
function ripristinaConferme(el, msg) {
  if (!el || !confermeCorrente || confermeCorrente.messaggio !== msg) return;
  disegnaConferme(el, msg, confermeCorrente.statoConferme, confermeCorrente.dove);
}

/**
 * Disegna la barra delle conferme senza toccare la copia conservata: al clic la
 * scelta va al kernel, poi lo stato aggiornato ripassa da `applicaConferme`, così
 * barra e copia restano d'accordo. Il ridisegno della barra dopo la scelta lo fa
 * `barraConferma` da sé (senza più i pulsanti, perché le conferme risultano già
 * decise).
 */
function disegnaConferme(readingEl, messaggio, statoConferme, dove) {
  if (!readingEl) return;
  barraConferma(readingEl, statoConferme, {
    onRispondi: async (tipo, invia) => {
      // Senza `dove` la barra è quella rimessa dal ridisegno **nel browser**
      // (prova visiva `?view=conferma`), dove non c'è kernel da interrogare:
      // si dichiara invece di far finta di aver inviato.
      if (!dove) {
        stato("Prova visiva: conferma non inviata (solo dentro l'app).");
        return;
      }
      try {
        const esito = await window.__TAURI__.core.invoke(
          "conferma_rispondi",
          Object.assign({ tipo, invia }, dove),
        );
        stato(`${esito}`);
      } catch (err) {
        stato(`Conferma non inviata: ${String((err && err.message) || err)}`, true);
      }
      // Aggiorna la barra con la scelta appena registrata.
      const aggiornato = await window.__TAURI__.core
        .invoke("conferme_stato", dove)
        .catch(() => null);
      if (aggiornato) applicaConferme(readingEl, messaggio, aggiornato, dove);
    },
  });
}

/** Elenco delle cartelle di destinazione: dal kernel o, nel browser, dai dati. */
async function elencoCartelle() {
  const dalKernel = await comando("mail_cartelle");
  if (Array.isArray(dalKernel) && dalKernel.length) return dalKernel;
  const nomi = sampleFolders.filter((f) => f.kind !== "group").map((f) => f.name);
  return [...new Set(nomi)];
}

/** Messaggio selezionato o una riga di stato che invita a sceglierne uno. */
function selezionato(azione) {
  if (!messaggioCorrente) {
    stato(`Seleziona un messaggio per ${azione}.`, true);
    return null;
  }
  return messaggioCorrente;
}

async function eliminaSelezionato() {
  const m = selezionato("eliminarlo");
  if (!m) return;
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const { errore, esito } = await azioneMailConEsito("mail_elimina", {
    folder: cartellaDi(m),
    uid: m.uid,
    accountId,
  });
  if (errore) return stato(errore, true);
  rimuoviDalModello(m);
  // Il kernel può avvertire che il server non supporta UID EXPUNGE: si mostra.
  stato(esito || "Messaggio spostato in Posta eliminata.");
}

async function archiviaSelezionato() {
  const m = selezionato("archiviarlo");
  if (!m) return;
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const errore = await azioneMail("mail_archivia", { folder: cartellaDi(m), uid: m.uid, accountId });
  if (errore) return stato(errore, true);
  rimuoviDalModello(m);
  stato("Messaggio archiviato.");
}

async function segnalaIndesiderato() {
  const m = selezionato("segnalarlo come indesiderato");
  if (!m) return;
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const errore = await azioneMail("mail_indesiderato", {
    folder: cartellaDi(m),
    uid: m.uid,
    accountId,
  });
  if (errore) return stato(errore, true);
  rimuoviDalModello(m);
  stato("Messaggio spostato in Posta indesiderata.");
}

/** Seleziona la destinazione (menu dal comando `mail_cartelle`). */
async function apriSposta(ancora) {
  const m = selezionato("spostarlo");
  if (!m) return;
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const cartelle = await elencoCartelle();
  apriMenu(
    ancora,
    cartelle.map((c) => ({ id: c, etichetta: c, ic: "📁" })),
    async (v) => {
      const errore = await azioneMail("mail_sposta", {
        folder: cartellaDi(m),
        uid: m.uid,
        destinazione: v.id,
        accountId,
      });
      if (errore) return stato(errore, true);
      rimuoviDalModello(m);
      stato(`Messaggio spostato in "${v.id}".`);
    },
  );
}

/** Interruttore Letto / Da leggere. */
async function alternaLetto() {
  const m = selezionato("cambiarne lo stato di lettura");
  if (!m) return;
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const letto = !m.seen;
  const errore = await azioneMail("mail_set_seen", {
    folder: cartellaDi(m),
    uid: m.uid,
    letto,
    accountId,
  });
  if (errore) return stato(errore, true);
  m.seen = letto;
  ridisegna();
  if (readingEl && messaggioCorrente === m) renderLettura(readingEl, m);
  stato(letto ? "Messaggio segnato come letto." : "Messaggio segnato come da leggere.");
}

/** Interruttore Completa. */
async function alternaCompletato() {
  const m = selezionato("segnarne il completamento");
  if (!m) return;
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const completato = !m.completed;
  const errore = await azioneMail("mail_set_completato", {
    folder: cartellaDi(m),
    uid: m.uid,
    completato,
    accountId,
  });
  if (errore) return stato(errore, true);
  m.completed = completato;
  ridisegna();
  // Il pannello aperto porta la barra informativa «✔ Completato»: senza
  // ridisegnarlo resterebbe indietro finché non si riapre il messaggio, come già
  // fanno contrassegno e categoria.
  if (readingEl && messaggioCorrente === m) renderLettura(readingEl, m);
  stato(completato ? "Messaggio segnato come completato." : "Segno di completamento rimosso.");
}

/**
 * Menu "Categorizza": le categorie **definite** nel pannello «Categorie»
 * (blocco O), ognuna col suo colore e la spunta se il messaggio la porta già
 * (interruttore). In coda, una categoria si può anche scrivere a mano.
 * Agisce sul messaggio selezionato (o su quello aperto).
 */
function apriCategorizza(ancora) {
  const m = selezionato("categorizzarlo");
  if (!m) return;
  const attuali = categorieRiga(m);
  const definite =
    preferenzeCorrenti && Array.isArray(preferenzeCorrenti.categorie) && preferenzeCorrenti.categorie.length
      ? preferenzeCorrenti.categorie
      : categoriePredefinite();
  const voci = vociMenuCategorie(definite, attuali);
  apriMenu(ancora, voci, (v) => applicaCategoria(m, v.id), {
    campo: { placeholder: "Nuova categoria…", invia: (testo) => applicaCategoria(m, testo) },
  });
}

async function applicaCategoria(m, nome) {
  const pulito = String(nome == null ? "" : nome).trim();
  if (!pulito) return;
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const nuove = alternaCategoria(categorieRiga(m), pulito);
  const errore = await azioneMail("mail_set_categorie", {
    folder: cartellaDi(m),
    uid: m.uid,
    categorie: nuove,
    accountId,
  });
  if (errore) return stato(errore, true);
  m.categories = nuove;
  ridisegna();
  if (readingEl && messaggioCorrente === m) renderLettura(readingEl, m);
  stato(
    nuove.includes(pulito) ? `Categoria "${pulito}" aggiunta.` : `Categoria "${pulito}" rimossa.`,
  );
}

// ---------------------------------------------------------------------------
// Blocco I1 — menu contestuali (messaggio, conversazione, cartella), comandi
// sulle cartelle, Preferiti, conversazioni ignorate, contrassegno con scadenza,
// Rinvia / Inoltra come allegato / Copia nella cartella.
// ---------------------------------------------------------------------------

/** Carica le chiavi delle conversazioni ignorate **per account** (blocco L). */
async function caricaConversazioniIgnorate() {
  if (!dentroTauri()) return;
  const gruppi = Array.isArray(gruppiCartelle) ? gruppiCartelle : [];
  const account = gruppi.length ? gruppi.map((g) => g.account) : [""];
  const mappa = {};
  for (const id of account) {
    try {
      const elenco = await window.__TAURI__.core.invoke("conversazioni_ignorate", {
        accountId: id || null,
      });
      if (Array.isArray(elenco)) mappa[id] = elenco;
    } catch {
      /* offline o nessun account: nessuna conversazione ignorata */
    }
  }
  ignoratePerAccount = mappa;
}

/**
 * Le cartelle di **esempio** per le prove visive nel browser: due caselle, così
 * la barra laterale raggruppata per account si fotografa senza credenziali.
 */
export function gruppiDiEsempio() {
  return [
    {
      account: "mario.rossi@esempiogroup.it",
      email: "mario.rossi@esempiogroup.it",
      descrizione: "Posta di lavoro",
      predefinito: true,
      cartelle: [
        { nome: "INBOX", preferita: false, nonLetti: 3 },
        { nome: "Timbrature", preferita: false, nonLetti: 10621 },
        { nome: "Veeam Backup", preferita: false, nonLetti: 2857 },
        { nome: "Bozze", preferita: false, nonLetti: 0 },
        { nome: "Posta inviata", preferita: false, nonLetti: 0 },
        { nome: "Posta eliminata", preferita: false, nonLetti: 2 },
        { nome: "Piano manutenzione", preferita: true, nonLetti: 1 },
      ],
    },
    {
      account: "m.rossi@gmail.com",
      email: "m.rossi@gmail.com",
      descrizione: "Casella personale",
      predefinito: false,
      cartelle: [
        { nome: "INBOX", preferita: false, nonLetti: 1 },
        { nome: "Bozze", preferita: false, nonLetti: 0 },
        { nome: "Posta inviata", preferita: false, nonLetti: 0 },
      ],
    },
  ];
}

/** Ridisegna la barra laterale dall'albero raggruppato per account (blocco J). */
function disegnaSidebar() {
  const sidebar = document.querySelector("#sidebar");
  if (!sidebar) return;
  const nodi = alberoCartelle(gruppiCartelle, {
    selezione: { account: accountAttivo, cartella: cartellaAttiva },
    accountAperti,
  });
  renderSidebar(sidebar, nodi);
}

/**
 * Carica le cartelle della barra laterale **raggruppate per account** (blocco J)
 * e le disegna. Dentro Tauri arrivano da `cartelle_elenco` (un gruppo per
 * casella, con i non letti dalla cache); nel browser restano dati di esempio,
 * con due caselle, per il confronto visivo.
 */
async function caricaCartelle() {
  if (dentroTauri()) {
    let elenco = null;
    try {
      // `accountId: null` = tutti gli account (l'argomento è esplicito).
      elenco = await window.__TAURI__.core.invoke("cartelle_elenco", { accountId: null });
    } catch {
      elenco = null;
    }
    // App vera senza account (o server muto): nessuna cartella inventata.
    gruppiCartelle = Array.isArray(elenco) ? elenco : [];
    // La casella predefinita (o la prima) parte già aperta.
    const prima = gruppiCartelle.find((g) => g.predefinito) || gruppiCartelle[0];
    if (prima) accountAperti.add(prima.account);
  } else {
    gruppiCartelle = gruppiDiEsempio();
    for (const g of gruppiCartelle) accountAperti.add(g.account);
  }
  disegnaSidebar();
}

/** Le voci del sottomenu «Contrassegna», con le etichette del kernel (o locali). */
async function caricaVociScadenza() {
  if (!dentroTauri()) return;
  try {
    const voci = await window.__TAURI__.core.invoke("scadenze_voci");
    if (Array.isArray(voci) && voci.length) {
      vociScadenza = voci.map(([id, etichetta]) => ({ id, etichetta }));
    }
  } catch {
    /* restano quelle locali, identiche al riferimento */
  }
}

/** La data ISO proposta per una voce di scadenza (funzione pura del kernel). */
async function calcolaScadenza(tipo) {
  if (!dentroTauri()) return null;
  try {
    return await window.__TAURI__.core.invoke("mail_scadenza_proponi", {
      tipo,
      offsetMinuti: -new Date().getTimezoneOffset(),
    });
  } catch {
    return null;
  }
}

/** Finestrella modale coerente con lo stile del progetto (conferme e campi). */
function apriModale(opzioni) {
  const { titolo, testo, campo = false, valore = "", ok = "Conferma", annulla = "Annulla" } = opzioni;
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "i1-overlay";
    const box = document.createElement("div");
    box.className = "i1-modale";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", titolo);
    const h = document.createElement("div");
    h.className = "i1-modale-titolo";
    h.textContent = titolo;
    const p = document.createElement("p");
    p.className = "i1-modale-testo";
    p.textContent = testo;
    box.append(h, p);

    let input = null;
    if (campo) {
      input = document.createElement("input");
      input.type = "text";
      input.className = "i1-modale-input";
      input.value = valore;
      box.append(input);
    }

    const azioni = document.createElement("div");
    azioni.className = "i1-modale-azioni";
    const bAnn = document.createElement("button");
    bAnn.type = "button";
    bAnn.className = "i1-btn";
    bAnn.textContent = annulla;
    const bOk = document.createElement("button");
    bOk.type = "button";
    bOk.className = "i1-btn i1-btn--ok";
    bOk.textContent = ok;
    azioni.append(bAnn, bOk);
    box.append(azioni);
    overlay.append(box);
    document.body.append(overlay);

    const chiudi = (risultato) => {
      overlay.remove();
      document.removeEventListener("keydown", tasto, true);
      resolve(risultato);
    };
    const tasto = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        chiudi(campo ? null : false);
      }
    };
    bAnn.addEventListener("click", () => chiudi(campo ? null : false));
    bOk.addEventListener("click", () => chiudi(campo ? input.value.trim() : true));
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) chiudi(campo ? null : false);
    });
    document.addEventListener("keydown", tasto, true);
    if (input) {
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          chiudi(input.value.trim());
        }
      });
    } else {
      bOk.focus();
    }
  });
}

/** Conferma (Sì/No) di un'operazione distruttiva. */
function chiediConferma(titolo, testo) {
  return apriModale({ titolo, testo, ok: "Conferma" });
}

/** Chiede un testo (nome di cartella, destinatari). `null` se annullato. */
function chiediTesto(titolo, testo, valore = "", ok = "Conferma") {
  return apriModale({ titolo, testo, campo: true, valore, ok });
}

/** Ignora (o riattiva) una conversazione **di un account**, dal `thread_key`.
 * Reversibile. Blocco L: la scelta vale per quella casella. */
async function ignoraConversazione(chiave, ignora, account) {
  if (!chiave) {
    stato("Conversazione non riconosciuta: il messaggio non ha una chiave di conversazione.", true);
    return;
  }
  const accountId = account || accountAttivo || null;
  if (dentroTauri()) {
    const { errore, esito } = await azioneMailConEsito("conversazione_ignora", {
      threadKey: chiave,
      ignora,
      accountId,
    });
    if (errore) return stato(errore, true);
    await caricaConversazioniIgnorate();
    stato(esito || (ignora ? "Conversazione ignorata." : "Conversazione riattivata."));
  } else {
    const chiaveAccount = String(accountId || "");
    const attuali = ignorateDi(chiaveAccount);
    ignoratePerAccount[chiaveAccount] = ignora
      ? Array.from(new Set([...attuali, chiave]))
      : attuali.filter((k) => k !== chiave);
    stato(ignora ? "Conversazione ignorata." : "Conversazione riattivata.");
  }
  ridisegna();
}

/** Apre il selettore di una cartella e chiama `onScegli(nome)`. */
async function scegliCartella(ancora, onScegli) {
  const cartelle = await elencoCartelle();
  apriMenu(ancora, cartelle.map((c) => ({ id: c, etichetta: c, ic: "📁" })), (v) => onScegli(v.id));
}

/** Copia nella cartella… (l'originale resta). */
async function copiaIn(m, dest) {
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const errore = await azioneMail("mail_copia", {
    folder: cartellaDi(m),
    uid: m.uid,
    destinazione: dest,
    accountId,
  });
  if (errore) return stato(errore, true);
  stato(`Messaggio copiato in «${dest}».`);
}

/** Sposta nella cartella… (l'originale va via). */
async function spostaIn(m, dest) {
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const errore = await azioneMail("mail_sposta", {
    folder: cartellaDi(m),
    uid: m.uid,
    destinazione: dest,
    accountId,
  });
  if (errore) return stato(errore, true);
  rimuoviDalModello(m);
  stato(`Messaggio spostato in «${dest}».`);
}

/** Contrassegna con scadenza (o Rimuovi contrassegno). */
async function impostaScadenza(m, tipo) {
  let iso = null;
  if (tipo !== "rimuovi") {
    iso = await calcolaScadenza(tipo);
    if (!iso) {
      stato("Il contrassegno con scadenza si imposta con l'app avviata.", true);
      return;
    }
  }
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const errore = await azioneMail("mail_set_scadenza", {
    folder: cartellaDi(m),
    uid: m.uid,
    scadenza: iso,
    accountId,
  });
  if (errore) return stato(errore, true);
  m.flagged = !!iso;
  m.scadenza = iso;
  ridisegna();
  if (readingEl && messaggioCorrente === m) renderLettura(readingEl, m);
  stato(iso ? `Contrassegno impostato per ${iso}.` : "Contrassegno rimosso.");
}

/** Divide una stringa di destinatari in un elenco pulito. */
function dividiDestinatari(testo) {
  return String(testo || "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Rinvia: ricostruisce il messaggio originale e lo invia come nuovo. */
async function rinviaMessaggio(m) {
  const risposta = await chiediTesto(
    "Rinvia",
    "A chi rinviare il messaggio? (indirizzi separati da «;» o «,»)",
    "",
    "Invia",
  );
  if (risposta === null) return;
  const destinatari = dividiDestinatari(risposta);
  if (!destinatari.length) return stato("Indica almeno un destinatario.", true);
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const { errore, esito } = await azioneMailConEsito("mail_rinvia", {
    folder: cartellaDi(m),
    uid: m.uid,
    destinatari,
    accountId,
  });
  if (errore) return stato(errore, true);
  stato(esito || `Messaggio rinviato a ${destinatari.length} destinatari.`);
}

/** Inoltra come allegato: il messaggio originale come file .eml. */
async function inoltraComeAllegato(m) {
  const risposta = await chiediTesto(
    "Inoltra come allegato",
    "A chi inoltrare il messaggio come allegato .eml? (indirizzi separati da «;» o «,»)",
    "",
    "Invia",
  );
  if (risposta === null) return;
  const destinatari = dividiDestinatari(risposta);
  if (!destinatari.length) return stato("Indica almeno un destinatario.", true);
  const accountId = accountIdPerAzione(m);
  if (accountId === undefined) return;
  const { errore, esito } = await azioneMailConEsito("mail_inoltra_allegato", {
    folder: cartellaDi(m),
    uid: m.uid,
    destinatari,
    accountId,
  });
  if (errore) return stato(errore, true);
  stato(esito || `Messaggio inoltrato come allegato a ${destinatari.length} destinatari.`);
}

/** Salva la bozza corrente (⌘S in composizione) con `mail_salva_bozza`. */
async function salvaBozzaKernel(campi) {
  if (!dentroTauri()) {
    return "Bozza non salvata: «Salva come bozza» richiede l'app avviata con un account.";
  }
  return await window.__TAURI__.core.invoke("mail_salva_bozza", {
    a: campi.a || "",
    cc: campi.cc || "",
    ccn: campi.ccn || "",
    oggetto: campi.oggetto || "",
    corpoTesto: campi.corpoTesto || "",
    allegati: campi.allegati || [],
  });
}

/** Menu contestuale di un messaggio della lista. */
function apriMenuMessaggio(ancora, m) {
  const voci = vociMenuMessaggio(m, { ignorate: ignorateDi(m && m.account) });
  apriMenu(ancora, voci, (v) => eseguiVoceMenu(v, m, null, ancora));
}

/** Menu contestuale di una conversazione (rappresentata dal messaggio più recente). */
function apriMenuConversazione(ancora, c) {
  const voci = vociMenuConversazione(c, { ignorate: ignorateDi(c && c.account) });
  const rappresentante = (c.messaggi || [])[c.messaggi.length - 1] || { uid: c.uid, folder: CARTELLA };
  apriMenu(ancora, voci, (v) => eseguiVoceMenu(v, rappresentante, c, ancora));
}

/** Smista la voce scelta nel menu di un messaggio o di una conversazione. */
function eseguiVoceMenu(voce, m, conversazione, ancora) {
  const id = String(voce.id || "");
  if (id.startsWith("scadenza:")) return impostaScadenza(m, id.slice("scadenza:".length));
  switch (id) {
    case "rispondi":
      messaggioCorrente = m;
      return apriRisposta(m, false);
    case "rispondi-tutti":
      messaggioCorrente = m;
      return apriRisposta(m, true);
    case "inoltra":
      messaggioCorrente = m;
      return apriInoltra(m);
    case "rinvia":
      return rinviaMessaggio(m);
    case "inoltra-allegato":
      return inoltraComeAllegato(m);
    case "copia":
      return scegliCartella(ancora, (dest) => copiaIn(m, dest));
    case "sposta":
      return scegliCartella(ancora, (dest) => spostaIn(m, dest));
    case "elimina":
      messaggioCorrente = m;
      return eliminaSelezionato();
    case "archivia":
      messaggioCorrente = m;
      return archiviaSelezionato();
    case "letto":
      messaggioCorrente = m;
      return alternaLetto();
    case "categorizza":
      messaggioCorrente = m;
      return apriCategorizza(ancora);
    case "ignora": {
      const chiave = conversazione ? conversazione.chiave : m && m.threadKey;
      const account = (conversazione && conversazione.account) || (m && m.account) || accountAttivo;
      const ignora = !(chiave && ignorateDi(account).includes(chiave));
      return ignoraConversazione(chiave, ignora, account);
    }
    case "indesiderato":
      messaggioCorrente = m;
      return segnalaIndesiderato();
    default:
      return undefined;
  }
}

/** Menu contestuale di una cartella della barra laterale. */
function apriMenuCartella(ancora, cartella) {
  const voci = vociMenuCartella(cartella);
  apriMenu(ancora, voci, (v) => eseguiVoceCartella(v, cartella));
}

/** Le azioni del menu contestuale di una cartella. Blocco L: ogni azione passa
 * l'account **della cartella** cliccata; se non è risolvibile l'azione si ferma
 * con una riga di stato, invece di agire su un'altra casella. */
async function eseguiVoceCartella(voce, cartella) {
  const nome = cartella.nome;
  const scelta = risolviAccountCartella({
    accountCartella: cartella.account,
    accountAttivo,
    accountCorrente: accountCorrenteId,
    numeroAccount: Array.isArray(gruppiCartelle) ? gruppiCartelle.length : 0,
  });
  if (scelta.mancante) {
    return stato(
      "Seleziona una casella nella barra laterale prima di agire sulla cartella: " +
        "«Tutti gli account» non identifica una casella sola.",
      true,
    );
  }
  const accountId = scelta.accountId || null;
  switch (voce.id) {
    case "nuova-cartella": {
      const n = await chiediTesto("Nuova cartella", "Nome della nuova cartella:");
      if (!n) return;
      const { errore, esito } = await azioneMailConEsito("cartella_crea", {
        nome: n,
        genitore: cartella.kind === "group" ? null : null,
        accountId,
      });
      if (errore) return stato(errore, true);
      await caricaCartelle();
      stato(esito || `Cartella «${n}» creata.`);
      return;
    }
    case "rinomina-cartella": {
      const n = await chiediTesto("Rinomina cartella", `Nuovo nome per «${nome}»:`, nome);
      if (!n || n === nome) return;
      const { errore, esito } = await azioneMailConEsito("cartella_rinomina", {
        vecchio: nome,
        nuovo: n,
        accountId,
      });
      if (errore) return stato(errore, true);
      await caricaCartelle();
      stato(esito || `Cartella «${nome}» rinominata in «${n}».`);
      return;
    }
    case "elimina-cartella": {
      const ok = await chiediConferma("Elimina cartella", testoConfermaEliminaCartella(nome));
      if (!ok) return;
      const { errore, esito } = await azioneMailConEsito("cartella_elimina", { nome, accountId });
      if (errore) return stato(errore, true);
      await caricaCartelle();
      stato(esito || `Cartella «${nome}» eliminata.`);
      return;
    }
    case "svuota-cartella": {
      const ok = await chiediConferma("Svuota cartella", testoConfermaSvuotamento(nome));
      if (!ok) return;
      const { errore, esito } = await azioneMailConEsito("cartella_svuota", { nome, accountId });
      if (errore) return stato(errore, true);
      stato(esito || `Cartella «${nome}» svuotata.`);
      return;
    }
    case "segna-tutti-letti": {
      const { errore, esito } = await azioneMailConEsito("cartella_segna_tutta_letta", {
        nome,
        accountId,
      });
      if (errore) return stato(errore, true);
      stato(esito || `Tutti i messaggi di «${nome}» sono segnati come già letti.`);
      return;
    }
    case "preferita": {
      const preferita = !cartella.preferita;
      const { errore, esito } = await azioneMailConEsito("cartella_preferita", {
        nome,
        preferita,
        accountId,
      });
      if (errore) return stato(errore, true);
      await caricaCartelle();
      stato(esito || (preferita ? "Aggiunta ai Preferiti." : "Rimossa dai Preferiti."));
      return;
    }
    default:
      return undefined;
  }
}

/** Collega il clic destro della barra laterale al menu contestuale delle cartelle. */
function collegaMenuCartelle(sidebar) {
  if (!sidebar) return;
  sidebar.addEventListener("folder-contextmenu", (e) => {
    const d = e.detail || {};
    apriMenuCartella(e.target.closest(".folder") || sidebar, {
      nome: d.nome,
      preferita: !!d.preferita,
      account: d.account || "",
      kind: d.kind || "child",
    });
  });
}

/**
 * Collega i clic della barra laterale (blocco J): selezionare una cartella porta
 * la lista su **quell'account e quella cartella**; il nodo di una casella si
 * apre/chiude (▸/▾).
 */
function collegaSelezioneCartelle(sidebar) {
  if (!sidebar) return;
  sidebar.addEventListener("folder-selected", (e) => {
    const d = e.detail || {};
    selezionaCartella(d.account || "", d.cartella || CARTELLA_POSTA_IN_ARRIVO);
  });
  sidebar.addEventListener("folder-toggle", (e) => {
    const d = e.detail || {};
    if (!d.account) return; // «Tutti gli account» resta sempre aperto
    if (accountAperti.has(d.account)) accountAperti.delete(d.account);
    else accountAperti.add(d.account);
    disegnaSidebar();
  });
}

/** «Tutti» / «Non letti» della barra superiore: stesso filtro del nastro. */
function collegaFiltriRapidi() {
  document.querySelectorAll(".filtro-btn").forEach((b) => {
    b.addEventListener("click", () => {
      filtroCorrente = b.dataset.filtro;
      evidenziaFiltro();
      ridisegna();
    });
  });
}

/** Menu "Filtra posta elettronica": Tutti · Non letti · Contrassegnati · Con allegati · Oggi. */
function apriFiltro(ancora) {
  const voci = FILTRI.map((f) => ({
    id: f.id,
    etichetta: f.etichetta,
    ic: "▽",
    attivo: f.id === filtroCorrente,
  }));
  apriMenu(ancora, voci, (v) => {
    filtroCorrente = v.id;
    evidenziaFiltro();
    ridisegna();
    const n = filtra(messaggiCorrenti, filtroCorrente).length;
    stato(
      v.id === "tutti" ? "Filtro rimosso: tutti i messaggi." : `Filtro "${v.etichetta}" attivo (${n}).`,
    );
  });
}

/**
 * «Invia e ricevi» (blocco J). Con **una** casella sincronizza l'account
 * predefinito e mostra l'esito unico (come sempre); con **più** caselle usa
 * `mail_sync_tutti` e riporta l'esito **per account**, così una casella con
 * credenziali sbagliate non nasconde le altre. Al termine la barra laterale e la
 * lista si aggiornano (i conteggi dei non letti vengono dalla cache appena scritta).
 */
// ---------------------------------------------------------------------------
// Avanzamento di «Invia e ricevi» nella barra di stato
// ---------------------------------------------------------------------------

let barraSyncEl = null;
/** Le caselle di «Invia e ricevi» in corso; `null` a riposo, così la sincronizzazione automatica non accende la barra. */
let caselleInSync = null;
/** Quanto la barra resta piena prima di sparire. */
const BARRA_SYNC_CHIUSURA_MS = 500;

/** Mostra la barra: `frazione` 0..1, o `null` per l'avanzamento indeterminato. */
function mostraAvanzamentoSync(frazione) {
  if (!barraSyncEl) return;
  const indeterminato = frazione === null;
  barraSyncEl.hidden = false;
  barraSyncEl.classList.toggle("sync-progress--indeterminato", indeterminato);
  const riempimento = barraSyncEl.querySelector(".sync-progress-fill");
  if (indeterminato) {
    barraSyncEl.removeAttribute("aria-valuenow");
    if (riempimento) riempimento.style.width = "";
    return;
  }
  const percento = Math.round(Math.max(0, Math.min(1, frazione)) * 100);
  barraSyncEl.setAttribute("aria-valuenow", String(percento));
  if (riempimento) riempimento.style.width = `${percento}%`;
}

/** Fine di «Invia e ricevi»: la barra si riempie, poi sparisce (se nel frattempo non ne è partito un altro). */
function chiudiAvanzamentoSync() {
  caselleInSync = null;
  mostraAvanzamentoSync(1);
  setTimeout(() => {
    if (!caselleInSync && barraSyncEl) barraSyncEl.hidden = true;
  }, BARRA_SYNC_CHIUSURA_MS);
}

/** Ascolta gli eventi `sync-avanzamento` del kernel (solo dentro Tauri). */
function collegaAvanzamentoSync() {
  barraSyncEl = document.querySelector("#sync-progress");
  const eventi = window.__TAURI__ && window.__TAURI__.event;
  if (!eventi || typeof eventi.listen !== "function") return;
  eventi.listen(EVENTO_AVANZAMENTO_SYNC, (e) => {
    if (!caselleInSync || !e || !e.payload) return;
    const { frazione, testo } = statoAvanzamento(e.payload, caselleInSync);
    mostraAvanzamentoSync(frazione);
    stato(testo);
  });
}

/** Nel browser non c'è kernel: la barra scorre su cartelle d'esempio, per la prova visiva. */
async function avanzamentoDiProva() {
  const cartelle = ["INBOX", "Posta inviata", "Bozze", "Archivio"];
  const caselle = [{ id: "", email: "" }];
  for (let indice = 0; indice < cartelle.length; indice++) {
    const { frazione, testo } = statoAvanzamento({ account: "", cartella: cartelle[indice], indice, totale: cartelle.length }, caselle);
    mostraAvanzamentoSync(frazione);
    stato(testo);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function inviaERicevi() {
  mostraAvanzamentoSync(null);
  try {
    await eseguiInviaERicevi();
  } finally {
    chiudiAvanzamentoSync();
  }
}

async function eseguiInviaERicevi() {
  if (!dentroTauri()) {
    stato("Invio e ricezione in corso…");
    await avanzamentoDiProva();
    stato("Prova visiva: l'invio e la ricezione richiedono l'app avviata.");
    return;
  }
  stato("Invio e ricezione in corso…");
  const accounts = await accountConfigurati();
  caselleInSync = accounts;
  if (accounts.length <= 1) {
    const esito = await sincronizzaOra(accounts.length ? accounts[0].id : null);
    stato(esito, /non riuscit|errore|impossibile|rifiut/i.test(esito));
  } else {
    let esiti = null;
    try {
      esiti = await window.__TAURI__.core.invoke("mail_sync_tutti");
    } catch (err) {
      stato(`Sincronizzazione non riuscita: ${(err && err.message) || err}`, true);
      return;
    }
    const testo = riepilogoSyncTutti(esiti);
    stato(testo, Array.isArray(esiti) && esiti.some((e) => e.ok === false));
  }
  await caricaCartelle();
  await apriCartellaSelezionata();
}

/**
 * Collega le azioni del ribbon principale per chiave (`data-rb`). Ogni voce ha
 * un gestore; quelle non ancora disponibili nella v1 scrivono una riga di stato
 * chiara, così nessun pulsante resta muto.
 */
/**
 * Le tre schede della barra multifunzione: cambiare scheda ridisegna le voci.
 * Senza questo, «Organizza» e «Strumenti» sarebbero etichette morte.
 */
function collegaSchede() {
  const schede = document.querySelectorAll(".ribbon-tabs .tab");
  schede.forEach((t) => {
    t.addEventListener("click", () => {
      schedaCorrente = t.dataset.scheda || "home";
      schede.forEach((x) => x.classList.toggle("tab--active", x === t));
      document.querySelectorAll("#ribbon-groups").forEach((el) => renderRibbon(el, schedaCorrente));
      evidenziaFiltro();
    });
  });
}

function collegaRibbon(root) {
  ribbonEl = root;
  root.addEventListener("click", (e) => {
    const gruppo = e.target.closest(".rb");
    if (!gruppo) return;
    chiudiMenu();
    ribbonAzione(gruppo.dataset.rb, gruppo);
  });
}

/** Smista l'azione del ribbon. Le chiavi non gestite dichiarano la v1. */
function ribbonAzione(azione, gruppo) {
  switch (azione) {
    case "mail-new":
      return nuovoMessaggio();
    case "reply":
      return apriRisposta(messaggioCorrente, false);
    case "reply-all":
      return apriRisposta(messaggioCorrente, true);
    case "forward":
      return apriInoltra(messaggioCorrente);
    case "delete":
      return eliminaSelezionato();
    case "archive":
      return archiviaSelezionato();
    case "move":
      return apriSposta(gruppo);
    case "junk":
      return segnalaIndesiderato();
    case "rules":
      return apriRegoleUI();
    case "meeting":
      // Blocco G: la voce «Riunione» apre l'agenda a elenco degli inviti; da lì
      // si crea una nuova riunione («＋ Nuova riunione»).
      return apriAgendaUI();
    case "read-unread":
      return alternaLetto();
    case "categorize":
      return apriCategorizza(gruppo);
    case "complete":
      return alternaCompletato();
    case "filter":
      return apriFiltro(gruppo);
    case "sort":
      return apriOrdinaUI(gruppo);
    case "density":
      return apriDensitaUI(gruppo);
    case "advanced-search":
      return apriRicercaAvanzataUI();
    case "contact":
      // "Trova contatto": apre la rubrica col fuoco già nella ricerca.
      return apriRubricaUI({ focusRicerca: true });
    case "addressbook":
      return apriRubricaUI({});
    case "sync": {
      // Una sola sincronizzazione per volta: il pulsante resta in attesa finché finisce.
      if (gruppo.classList.contains("rb--in-attesa")) return;
      gruppo.classList.add("rb--in-attesa");
      return inviaERicevi().finally(() => gruppo.classList.remove("rb--in-attesa"));
    }
    case "settings":
      // «Impostazioni…» nella scheda Strumenti: la stessa finestra del «?» e di ⌘,.
      return apriImpostazioniUI();
    case "assistant":
      return apriAssistenteIA(opzioniAssistente());
    default:
      return stato(testoNonDisponibileRibbon(azione));
  }
}

/** Punto di ingresso della vista principale. */
export async function boot() {
  document.querySelectorAll("#ribbon-groups").forEach((el) => {
    renderRibbon(el);
    collegaRibbon(el);
  });
  document.querySelectorAll("#sidebar").forEach((el) => {
    renderSidebar(el);
    collegaMenuCartelle(el);
    collegaSelezioneCartelle(el);
  });

  const listEl_doc = document.querySelector("#message-list");
  listEl = listEl_doc;
  readingEl = document.querySelector("#reading-pane");
  mainEl = document.querySelector(".main");
  countEl = document.querySelector("#status-count");
  syncEl = document.querySelector("#status-sync");
  accountEl = document.querySelector("#status-account");
  searchInput = document.querySelector("#search-input");
  collegaRicerca();
  collegaSplitter();
  collegaFiltriRapidi();
  collegaAvanzamentoSync();

  // Preferenze dell'utente (Milestone 8): tema, firma, assistente. Il tema lo
  // applica `initTheme`; qui si caricano le preferenze e si collegano le
  // impostazioni (hub + pannello Assistente IA).
  await initTheme();
  const impostazioni = await caricaImpostazioni();
  // Blocco J: l'account attivo all'avvio è quello **predefinito** (o il primo).
  const accountsBoot = await accountConfigurati();
  const predefinitoBoot =
    (impostazioni && impostazioni.preferenze && impostazioni.preferenze.accountPredefinito) || "";
  const accountIniziale =
    accountsBoot.find((a) => a.id === predefinitoBoot) || accountsBoot[0] || null;
  accountCorrenteId = accountIniziale
    ? accountIniziale.id
    : dentroTauri()
      ? ""
      : "mario.rossi@esempiogroup.it";
  // Prova visiva (solo browser): ?lettura=destra&anteprima=1&carattere=… ecc.
  if (!dentroTauri()) adattaPreferenzeDaUrl(impostazioni);
  applicaPreferenze(impostazioni);
  if (
    impostazioni &&
    impostazioni.preferenze &&
    (impostazioni.preferenze.providerIa === "cloud" || impostazioni.preferenze.providerIa === "locale")
  ) {
    destinazioneIA = impostazioni.preferenze.providerIa;
  }
  // La voce "Firma" del ribbon di composizione apre il pannello Firme (blocco
  // D, seconda metà): è la sede della firma predefinita e della firma per account.
  impostaApriFirma(() => apriPannelloMailUI("firme"));
  // Blocco F: i campi A/Cc/Ccn della composizione chiedono i suggerimenti qui.
  impostaSuggeritoreDestinatari(suggerisciContatti);
  // Blocco G: la voce «Riunione» della composizione apre il modulo della nuova
  // riunione con destinatari e corpo già scritti (messaggio accompagnatorio).
  impostaApriRiunione((iniziale) => apriNuovaRiunioneUI(iniziale));
  // Blocco I1: ⌘S nella finestra di composizione salva la bozza in «Bozze».
  impostaSalvaBozza(salvaBozzaKernel);
  // Blocco R: la scelta della famiglia e della dimensione dalla finestra di
  // composizione si salva in config.json, come quella fatta dalle Impostazioni.
  impostaSalvaPreferenze(async (modifica) => {
    await salvaImpostazioni({
      theme: getTheme(),
      preferenze: Object.assign({}, preferenzeCorrenti || {}, modifica),
    });
  });
  // Blocco I2: «Invia più tardi» programma l'invio (coda locale, app aperta).
  impostaPianificaInvio(pianificaInvio);
  collegaImpostazioni();
  collegaSchede();

  // Blocco I1: cartelle della barra laterale (preferite in alto), voci del
  // sottomenu «Contrassegna» e conversazioni ignorate.
  await caricaVociScadenza();
  await caricaConversazioniIgnorate();
  await caricaCartelle();

  // Aggancio per le prove visive: ?view=account apre la finestra Account con
  // due caselle di esempio (blocco J), per confrontarla col mockup misurato
  // senza account né credenziali.
  if (new URLSearchParams(location.search).get("view") === "account") {
    apriAccountUI();
  }

  if (new URLSearchParams(location.search).get("view") === "compose") {
    apriComposizione({
      a: "luca.bianchi@esempiogroup.it",
      oggetto: "Piano manutenzione Q4",
      corpo: "Buongiorno,\n\ncome concordato preparo il piano di manutenzione per il fermo impianto di dicembre.",
      mittente: "mario.rossi@esempiogroup.it",
    });
    // Blocco I2: agganci per le prove visive dei popover nella composizione.
    const qs = new URLSearchParams(location.search);
    const ov = document.querySelector(".compose-overlay");
    if (ov && qs.get("later") === "1") {
      ov.querySelector('[data-act="invia-piu-tardi"]').click();
    }
    if (ov && qs.get("conferme") === "1") {
      ov.querySelector('[data-act="conferme"]').click();
    }
  }

  // Aggancio per le prove visive (blocco C): `?view=compose-allegati` apre la
  // composizione con due allegati e una tabella nel corpo, per fotografarla nei
  // due temi senza scegliere file a mano.
  if (new URLSearchParams(location.search).get("view") === "compose-allegati") {
    const overlay = apriComposizione({
      a: "luca.bianchi@esempiogroup.it",
      cc: "marco.ferrari@esempiogroup.it",
      oggetto: "Piano manutenzione Q4 — allegati e tabella",
      corpo:
        "Buongiorno,\n\n" +
        "come concordato vi allego il piano di manutenzione e il computo metrico.\n" +
        "Qui sotto il riepilogo degli interventi previsti a dicembre:\n\n" +
        "Resto a disposizione per qualunque chiarimento.\n\nMario",
      mittente: "mario.rossi@esempiogroup.it",
    });
    impostaAllegati(overlay, [
      { nome: "Piano manutenzione Q4.pdf", mime: "application/pdf", dimensione: 842311 },
      {
        nome: "Computo metrico capannone.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dimensione: 1248770,
      },
    ]);
    overlay.querySelector("#cmp-body").insertAdjacentHTML("beforeend", markupTabella(3, 4));
  }
  // Aggancio per le prove visive: ?view=assistente mostra nel pannello di lettura
  // la scheda del risultato IA con dati fittizi realistici, per confrontarla con
  // il mockup senza modello né account. Solo nel browser.
  const vista = new URLSearchParams(location.search).get("view");
  console.info(`tema applicato: ${getTheme()}`);

  // Dentro Tauri si sincronizza (richiede rete e account) e poi si legge dalla
  // cache; se non c'è ancora nulla si usano i dati di esempio, come nel browser.
  // Blocco J/N: solo con «Sincronizza all'avvio» attiva si tocca la rete al
  // lancio, e in quel caso si sincronizzano **tutte** le caselle (non solo la
  // prima). Spenta (default), si legge solo la cache già presente.
  let messaggi = null;
  if (dentroTauri()) {
    const accounts = await accountConfigurati();
    // Prima apertura: senza nessuna casella configurata si apre da sola la
    // finestra della casella, invece di lasciare una lista vuota che aspetta un
    // clic. La condizione è l'elenco account stesso — nessun flag da ricordare,
    // quindi si ripropone a ogni avvio finché non se ne configura una (e chi la
    // chiude con Esc la ritrova al riavvio, senza restare intrappolato).
    if (accounts.length === 0) apriAccountUI({ primoAvvio: true });
    if (deveSincronizzareAvvio(preferenzeCorrenti)) {
      if (accounts.length > 1) {
        // Ogni account porta il suo esito: uno che fallisce non blocca gli altri.
        await comando("mail_sync_tutti");
      } else if (accounts.length === 1) {
        await comando("mail_sync", { accountId: accounts[0].id });
      }
      // Si allinea `ultimaSyncMs` come fa `sincronizzaOra`: altrimenti il timer
      // (se c'è un intervallo) troverebbe l'ora a 0 e risincronizzerebbe dopo
      // un minuto, duplicando subito il lavoro appena fatto.
      if (accounts.length > 0) ultimaSyncMs = Date.now();
    }
    // La barra laterale (con i non letti appena scritti) e poi la lista.
    await caricaCartelle();
    messaggi = await listaDallaCache(listEl, countEl, syncEl, accountEl);
  }

  let statoVuoto = false;
  if (!messaggi || messaggi.length === 0) {
    if (dentroTauri()) {
      // È l'app vera: la lista resta vuota e si dice cosa fare. I messaggi di
      // esempio servono solo alle prove visive nel browser e non vanno mai
      // mostrati qui, altrimenti sembra che la casella contenga posta.
      statoVuoto = true;
      messaggi = [];
      renderStatus(countEl, syncEl, accountEl, {
        synced: "Nessun messaggio in cache.",
        account:
          (gruppiCartelle.length
            ? etichettaAccountAttivo(gruppiCartelle, { account: accountAttivo })
            : "") || "Nessun account configurato",
      });
    } else {
      messaggi = sampleMessages;
      renderStatus(countEl, syncEl, accountEl, {
        synced: "Tutte le cartelle sono aggiornate.",
        // Blocco J: la barra di stato dice l'account attivo (o «Tutti gli account»).
        account: etichettaAccountAttivo(gruppiCartelle, { account: accountAttivo }),
      });
    }
  }

  // Modello della lista: le azioni del ribbon (blocco A) mutano questi oggetti e
  // poi ridisegnano, senza ricaricare l'app.
  messaggiCorrenti = messaggi;
  // Blocco H: nel percorso browser (o con la cache piatta) le conversazioni si
  // costruiscono qui; dentro Tauri le ha già date `mail_conversazioni`.
  if (raggruppaConversazioniAttivo && conversazioniCorrenti.length === 0) {
    conversazioniCorrenti = raggruppaConversazioni(messaggiCorrenti);
  }
  if (!messaggiCorrenti.some((m) => m.selected) && messaggiCorrenti.length) {
    messaggiCorrenti[0].selected = true;
  }
  // Pulsante «Raggruppa per conversazione» (blocco H), in testa alla lista.
  const toggleRaggruppa = document.getElementById("raggruppa-toggle");
  if (toggleRaggruppa) toggleRaggruppa.addEventListener("click", alternaRaggruppa);
  evidenziaFiltro();
  ridisegna();

  listEl.addEventListener("message-selected", (e) => {
    for (const m of messaggiCorrenti) m.selected = false;
    if (e.detail) e.detail.selected = true;
    apriMessaggio(readingEl, e.detail);
  });

  // Il mouse resta su una riga non letta: dopo 1 secondo risulta letta.
  listEl.addEventListener("message-hover", (e) => programmaSegnaLettoAlPassaggio(e.detail));
  listEl.addEventListener("message-hover-end", annullaSegnaLettoAlPassaggio);

  // Blocco I1: clic destro su un messaggio o su una conversazione della lista.
  listEl.addEventListener("contextmenu-messaggio", (e) => {
    const riga = e.target.closest(".row") || listEl;
    apriMenuMessaggio(riga, e.detail && e.detail.messaggio);
  });
  listEl.addEventListener("contextmenu-conversazione", (e) => {
    const riga = e.target.closest(".conv") || listEl;
    apriMenuConversazione(riga, e.detail && e.detail.conversazione);
  });

  if (statoVuoto) {
    renderStatoVuoto(listEl, readingEl);
  } else {
    await apriMessaggio(readingEl, messaggi.find((m) => m.selected) || messaggi[0]);
  }

  // ?view=assistente: scheda IA simulata nel pannello di lettura (solo browser).
  if (vista === "assistente" && !dentroTauri()) {
    renderSchedaIA(readingEl, schedaDiEsempio("riassumi"));
  }

  // Aggancio per le prove visive: `?view=controllo` apre la composizione con un
  // testo di esempio che genera almeno due avvisi (allegato citato ma assente e
  // dato sensibile) e mostra subito la barra "Controllo prima dell'invio" con gli
  // avvisi simulati, senza inviare nulla. Solo nel browser: dentro Tauri il
  // controllo lo esegue il kernel (comando `controllo_preinvio`) al clic su Invia.
  if (vista === "controllo" && !dentroTauri()) {
    const overlay = apriComposizione({
      a: "luca.bianchi@esempiogroup.it",
      oggetto: "Accessi di rete — riepilogo",
      corpo:
        "Buongiorno,\n\n" +
        "in allegato trovi il riepilogo degli accessi di rete.\n" +
        "La password del firewall è Esempio2026! — non condividerla.",
      mittente: "mario.rossi@esempiogroup.it",
      onInvia: inviaConKernel,
      onControllo: controlloPreInvio,
    });
    await eseguiControllo(overlay, controlloPreInvio);
  }

  // Agganci per le prove visive (Milestone 8): `?view=impostazioni` apre l'hub
  // delle impostazioni e `?view=assistente-ia` il pannello dell'assistente, con
  // valori di esempio e salvataggi in memoria. Solo nel browser.
  if (vista === "impostazioni") {
    apriImpostazioniUI();
  }
  // Aggancio per le prove visive: ?view=impostazioni-generale apre il hub e
  // clicca il riquadro "Generale", per fotografare tema, lingua, cartella e
  // svuota-cache senza clic a mano. Solo nel browser.
  if (vista === "impostazioni-generale") {
    apriImpostazioniUI();
    const tileGen = Array.from(document.querySelectorAll(".settings-tile")).find(
      (t) => t.querySelector(".settings-tile-lb") && t.querySelector(".settings-tile-lb").textContent === "Generale",
    );
    if (tileGen) tileGen.click();
  }
  // `?view=impostazioni-lettura|composizione|carattere|correzione|ortografia`
  // apre direttamente un pannello del blocco D (prove visive e prova manuale).
  const pannelloDaUrl =
    /^impostazioni-(lettura|composizione|carattere|correzione|ortografia|firme|posta|privacy|notifiche|scelte-rapide|personali|visualizza|cerca|sincronizzazione|archiviazione|categorie|aspetto|accessibilita|contatti)$/.exec(
      vista || "",
    );
  if (pannelloDaUrl) apriPannelloMailUI(pannelloDaUrl[1]);
  if (vista === "assistente-ia") {
    apriAssistenteIA(opzioniAssistente());
  }
  // Aggancio per le prove visive (blocco A): `?view=filtro` apre il menu "Filtra
  // posta elettronica" sulla voce del ribbon, per fotografarlo senza clic.
  if (vista === "filtro") {
    const bottone = ribbonEl && ribbonEl.querySelector('[data-rb="filter"]');
    if (bottone) apriFiltro(bottone);
  }
  // Blocco R: `?view=lettura` apre il primo messaggio nel pannello di lettura.
  // In anteprima browser il corpo resta quello di esempio di `renderReading`:
  // l'iframe con il carattere e la scala si vede solo dentro l'app avviata.
  if (vista === "lettura") {
    const m = messaggiCorrenti.find((x) => x.selected) || messaggiCorrenti[0] || sampleMessages[0];
    apriMessaggio(readingEl, m);
  }
  // Blocco I1: prove visive dei menu contestuali (messaggio e cartella).
  if (vista === "menu-messaggio") {
    const m =
      messaggiCorrenti.find((x) => x.selected) || messaggiCorrenti[0] || sampleMessages[0];
    const riga = listEl && listEl.querySelector(".row");
    apriMenuMessaggio(riga || listEl || document.body, m);
  }
  if (vista === "menu-conversazione") {
    if (!raggruppaConversazioniAttivo) {
      raggruppaConversazioniAttivo = true;
      aggiornaToggleRaggruppa();
      conversazioniCorrenti = raggruppaConversazioni(messaggiCorrenti);
      ridisegna();
    }
    const conv =
      conversazioniCorrenti.find((c) => c.numero > 1) || conversazioniCorrenti[0];
    const rigaCor = listEl && listEl.querySelector(".conv");
    if (conv) apriMenuConversazione(rigaCor || listEl || document.body, conv);
  }
  if (vista === "menu-cartella") {
    const cart = document.querySelector("#sidebar .folder:not(.folder--group)");
    if (cart) {
      apriMenuCartella(cart, {
        nome: cart.dataset.cartella || "Posta in arrivo",
        preferita: cart.dataset.preferita === "1",
        kind: "child",
      });
    }
  }
  // Aggancio per le prove visive (blocco F): `?view=rubrica` apre la finestra
  // della rubrica con i contatti di esempio; `?focus=1` mette il fuoco nella
  // ricerca, come fa la voce "Trova contatto".
  if (vista === "rubrica") {
    const qs = new URLSearchParams(location.search);
    apriRubricaUI({
      focusRicerca: qs.get("focus") === "1",
      ricercaIniziale: qs.get("q") || "",
    });
  }
  // Aggancio per le prove visive (blocco H): `?view=conversazioni` forza la
  // lista raggruppata ed espande la prima conversazione con più messaggi (una
  // aperta e le altre chiuse). `?form=1` apre il modulo di una regola.
  if (vista === "conversazioni" && !dentroTauri()) {
    raggruppaConversazioniAttivo = true;
    aggiornaToggleRaggruppa();
    conversazioniCorrenti = raggruppaConversazioni(messaggiCorrenti);
    const multi = conversazioniCorrenti.find((c) => c.numero > 1) || conversazioniCorrenti[0];
    impostaConversazioniAperte(multi ? [multi.chiave] : []);
    ridisegna();
  }
  if (vista === "regole") {
    const ov = await apriRegoleUI();
    if (new URLSearchParams(location.search).get("form") === "1" && ov && ov.__apriRegolaDiEsempio) {
      ov.__apriRegolaDiEsempio();
    }
  }
  // Agganci per le prove visive (blocco G): `?view=agenda` apre l'agenda a
  // elenco con gli inviti di esempio; `?view=nuova-riunione` il modulo di una
  // nuova riunione; `?view=invito` la barra dell'invito nel pannello di lettura.
  if (vista === "agenda") {
    await apriAgendaUI();
  }
  if (vista === "nuova-riunione") {
    const qs = new URLSearchParams(location.search);
    apriNuovaRiunioneUI({
      invitati:
        qs.get("invitati") || "luca.bianchi@esempiogroup.it; marco.ferrari@esempiogroup.it",
      oggetto: qs.get("oggetto") || "Piano manutenzione Q4",
      descrizione:
        qs.get("messaggio") ||
        "Buongiorno, come concordato fissiamo la riunione per il piano di manutenzione Q4.",
    });
  }
  if (vista === "invito" && !dentroTauri()) {
    // Senza messaggio: un invito d'esempio, e nulla da conservare.
    disegnaInvito(readingEl, invitoEsempio());
  }
  // `?view=compose-suggerimenti`: apre la composizione e scrive un frammento nel
  // campo A per mostrare il riquadro dei suggerimenti (prova visiva).
  if (vista === "compose-suggerimenti") {
    const qs = new URLSearchParams(location.search);
    const frammento = qs.get("q") || "alb";
    const overlay = apriComposizione({
      a: "",
      oggetto: "Prova suggerimenti destinatari",
      mittente: "mario.rossi@esempiogroup.it",
      onInvia: inviaConKernel,
      onControllo: controlloPreInvio,
    });
    const campo = overlay.querySelector("#cmp-a");
    if (campo) {
      campo.value = frammento;
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  // Aggancio per le prove visive (blocco B): `?view=ricerca&q=...` scrive il
  // termine nel campo "Cerca" ed esegue la ricerca, per fotografare i risultati
  // (o il caso vuoto, con un termine che non trova nulla) senza digitare.
  if (vista === "ricerca") {
    const q = new URLSearchParams(location.search).get("q") || "piano";
    if (searchInput) searchInput.value = q;
    await eseguiRicerca(q);
  }
  // Blocco I2: prove visive dei menu e dei pannelli senza clic a mano.
  if (vista === "menu-ordina") {
    const bottone = ribbonEl && ribbonEl.querySelector('[data-rb="sort"]');
    if (bottone) apriOrdinaUI(bottone);
  }
  if (vista === "menu-densita") {
    const bottone = ribbonEl && ribbonEl.querySelector('[data-rb="density"]');
    if (bottone) apriDensitaUI(bottone);
  }
  if (vista === "ricerca-avanzata") {
    const ov = apriRicercaAvanzataUI();
    // Compila un campo per rendere leggibile la prova visiva.
    const campoDa = ov && ov.querySelector("#i2-da");
    if (campoDa) campoDa.value = "luca";
    const campoOgg = ov && ov.querySelector("#i2-ogg");
    if (campoOgg) campoOgg.value = "manutenzione";
  }
  if (vista === "conferma" && !dentroTauri()) {
    // Barra della conferma con dati di esempio, nel browser. Passa dallo stesso
    // disegno dell'app, senza `dove`: i pulsanti dichiarano che fuori dall'app
    // la conferma non parte, invece di restare muti.
    disegnaConferme(
      readingEl,
      null,
      { lettura: true, recapito: true, indirizzo: "luca@esempiogroup.it", letturaInviata: null, recapitoInviata: null },
      null,
    );
  }

  // Blocco J: prove visive della finestra Account col modulo di un **nuovo
  // account** (vuoto, con i suggerimenti in grigio).
  if (vista === "nuovo-account") {
    apriAccount({
      account: {},
      elenco: [accountDiEsempio, secondoAccountDiEsempio],
      predefinito: accountDiEsempio.id,
      onMostraTutte: apriImpostazioniUI,
      onSalva: async () => {},
      onConferma: async () => true,
      testoConferma: testoConfermaEliminaAccount,
    });
  }
  // Blocco M: prova visiva della diagnostica della connessione. Mostra la
  // finestra Account con i passi già provati (il caso «accesso rifiutato», dove
  // compaiono i consigli in italiano) senza toccare nessun server.
  if (vista === "diagnostica") {
    apriAccount({
      account: accountDiEsempio,
      elenco: [accountDiEsempio, secondoAccountDiEsempio],
      predefinito: accountDiEsempio.id,
      diagnostica: diagnosticaDiEsempio(),
      onMostraTutte: apriImpostazioniUI,
      onSalva: async () => {},
      onConferma: async () => true,
      testoConferma: testoConfermaEliminaAccount,
      onDiagnostica: async () => diagnosticaDiEsempio(),
    });
  }
  // Blocco J: prova visiva della barra laterale con due caselle e della
  // selezione attiva. `?view=cartelle&account=tutti` = «Tutti gli account»;
  // `?view=cartelle&account=gmail` = la seconda casella.
  if (vista === "cartelle") {
    const chi = (new URLSearchParams(location.search).get("account") || "tutti").toLowerCase();
    if (chi === "tutti") {
      accountAttivo = "";
    } else {
      const gruppo = gruppiCartelle.find(
        (g) => g.account.toLowerCase().includes(chi) || (g.email || "").toLowerCase().includes(chi),
      );
      accountAttivo = gruppo ? gruppo.account : "";
    }
    cartellaAttiva = CARTELLA_POSTA_IN_ARRIVO;
    for (const g of gruppiCartelle) accountAperti.add(g.account);
    disegnaSidebar();
    renderStatus(countEl, syncEl, accountEl, {
      account: etichettaAccountAttivo(gruppiCartelle, { account: accountAttivo }),
    });
  }

  // Blocco K: prova visiva delle **operazioni per account**. Mostra la barra
  // laterale con due caselle e i conteggi, esegue «Segna come letto» sulla
  // casella attiva e dichiara la riga di stato: il conteggio della casella agita
  // scende **solo** per quella, quello dell'altra resta invariato.
  if (vista === "operazioni-account") {
    if (!gruppiCartelle.length) gruppiCartelle = gruppiDiEsempio();
    for (const g of gruppiCartelle) accountAperti.add(g.account);
    const agita = gruppiCartelle[0] || null; // la casella aperta
    const altra = gruppiCartelle[1] || null; // l'altra, da lasciare intatta
    accountAttivo = agita ? agita.account : "";
    cartellaAttiva = CARTELLA_POSTA_IN_ARRIVO;
    disegnaSidebar();
    const primaNonLetti = agita ? nonLettiDi(agita) : 0;
    const altraNonLetti = altra ? nonLettiDi(altra) : 0;
    // L'azione "segna come letto" scende di uno **solo** sulla casella agita.
    if (agita) {
      const inbox = (agita.cartelle || []).find((c) => c.nome === CARTELLA_POSTA_IN_ARRIVO);
      if (inbox && inbox.nonLetti > 0) inbox.nonLetti -= 1;
    }
    disegnaSidebar();
    renderStatus(countEl, syncEl, accountEl, {
      account: etichettaAccountAttivo(gruppiCartelle, { account: accountAttivo }),
    });
    stato(
      `Segna come letto su ${agita ? agita.email : ""}: non letti ${primaNonLetti} → ` +
        `${Math.max(primaNonLetti - 1, 0)}. ${altra ? altra.email : ""}: non letti ` +
        `${altraNonLetti} (invariata).`,
    );
  }

  // Blocco L: prova visiva delle azioni **per account** su una cartella omonima.
  // La barra laterale ha due caselle con la stessa «Posta eliminata»: il menu
  // contestuale della seconda risolve l'account di **quella** cartella, così
  // svuotare/eliminare/rinominare non tocca la casella gemella. La riga di stato
  // lo dichiara.
  if (vista === "cartella-account") {
    if (!gruppiCartelle.length) gruppiCartelle = gruppiDiEsempio();
    // Entrambe le caselle hanno una «Posta eliminata», così il caso omonimo è visibile.
    for (const g of gruppiCartelle) {
      if (!(g.cartelle || []).some((c) => c.nome === "Posta eliminata")) {
        g.cartelle = [
          ...(g.cartelle || []),
          { nome: "Posta eliminata", preferita: false, nonLetti: 2 },
        ];
      }
      accountAperti.add(g.account);
    }
    const gemella = gruppiCartelle[0] || null;
    const scelta = gruppiCartelle[1] || gruppiCartelle[0] || null;
    accountAttivo = scelta ? scelta.account : "";
    cartellaAttiva = "Posta eliminata";
    disegnaSidebar();
    const nodo = Array.from(document.querySelectorAll("#sidebar .folder")).find(
      (n) => n.dataset.account === accountAttivo && n.dataset.cartella === "Posta eliminata",
    );
    apriMenuCartella(nodo || document.querySelector("#sidebar") || document.body, {
      nome: "Posta eliminata",
      preferita: false,
      account: accountAttivo,
      kind: "child",
    });
    renderStatus(countEl, syncEl, accountEl, {
      account: etichettaAccountAttivo(gruppiCartelle, { account: accountAttivo }),
    });
    stato(
      `Menu di «Posta eliminata» della casella ${scelta ? scelta.email : ""}: ` +
        "le azioni (svuota, elimina, rinomina) agiscono per account. " +
        `${gemella ? gemella.email : ""} resta intatta.`,
    );
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

export {
  setTheme,
  getTheme,
  nuovoMessaggio,
  apriRisposta,
  apriInoltro,
  apriComposizione,
  eseguiAzioneAssistita,
  // Esportate per le prove (tests/lettura-persistenza.test.mjs): il pannello di
  // lettura si prova con un DOM vero, senza avviare l'app.
  apriMessaggio,
  renderLettura,
  alternaCompletato,
};
