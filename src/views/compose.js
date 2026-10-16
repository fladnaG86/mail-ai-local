/**
 * Finestra di composizione "Nuovo messaggio" (task 5.1/5.2, Milestone 5;
 * controllo prima dell'invio, task 7.2, Milestone 7).
 *
 * Riproduce il riferimento misurato (§2.4 della spec, mockup-compose.html):
 * titolo 28 pt, ribbon 108 pt con le schede Messaggio/Opzioni, righe A:/Cc:/
 * Oggetto:, la barra "Controllo prima dell'invio" SOPRA il corpo e sotto le
 * righe dei campi, e la nota sulla copia in Posta inviata.
 *
 * Il controllo prima dell'invio non blocca MAI l'invio: al primo clic su
 * "Invia" fa partire il controllo; se ci sono avvisi li mostra nella barra e
 * l'invio avviene al secondo clic (o col pulsante "Invia lo stesso"). Il
 * pulsante Invia resta sempre attivo.
 *
 * La finestra è un pannello sopra la vista principale (la v1 usa una sola
 * finestra di sistema); i campi precompilati arrivano da chi la apre.
 *
 * `apriComposizione(opzioni)` accetta, oltre ai campi, `onInvia(campi)` e
 * `onControllo(campi)`: quest'ultima restituisce gli avvisi del controllo
 * pre-invio. Nel browser (prove visive) si usa `avvisiSimulati`, che non tocca
 * il modello.
 *
 * Blocco D: le preferenze di composizione (formato, a capo, carattere
 * predefinito, correzione automatica, ortografia) arrivano dal kernel e si
 * applicano davvero qui — vedi `impostaPreferenzeComposizione`.
 */

import {
  stileCarattere,
  limitaDimensione,
  normFormato,
  normalizzaSostituzioni,
  sostituzioneDaApplicare,
  sostituzioniPredefinite,
} from "./impostazioni-mail.js";
import { normalizzaFirme, nomeFirma, applicaFirmaAlCorpo } from "./firme.js";
import { collegaCampoDestinatario, normSuggerimentiLimite } from "./contatti.js";
import {
  markupFormattazione,
  COLORI_EVIDENZIAZIONE,
  stileZoom,
  etichettaRitardo,
  valoreDatetimeLocal,
  epochDaDatetimeLocal,
  ETICHETTE_CONFERME,
  PULSANTE_CHIUDI,
} from "./blocco-i2.js";
import { limitaZoomLettura } from "./accessibilita.js";

/** Firma del mittente in uso, caricata da `config.json` all'avvio. */
let firmaCorrente = "";

/** Firme disponibili nella finestra di composizione (blocco D, seconda metà). */
let firmeCorrenti = [];
/** Id della firma scelta all'apertura della finestra (la predefinita dell'account). */
let firmaIdDefault = "";

/** Azione da eseguire quando si chiede di configurare la firma (impostata da main.js). */
let apriFirma = null;

/**
 * Azione da eseguire per creare una **riunione** dalla composizione (blocco G):
 * impostata da `main.js`, apre il modulo della nuova riunione con i destinatari
 * e il corpo già scritti, così il messaggio fa da accompagnamento all'invito.
 */
let apriRiunioneCb = null;
/** Callback «Salva come bozza» (blocco I1), collegata da `main.js`. */
let salvaBozzaCb = null;

/**
 * Funzione che fornisce i suggerimenti dei destinatari (blocco F): impostata da
 * `main.js`, che dentro Tauri chiama `contatti_suggerisci` e nel browser usa i
 * dati di esempio. La finestra di composizione non conosce il kernel.
 */
let suggerisciDestinatari = null;

/**
 * Quanti suggerimenti chiedere sotto i campi A/Cc/Ccn: preferenza del pannello
 * «Contatti» (blocco Q), normalizzata come nel kernel. La registra
 * `impostaPreferenzeComposizione`.
 */
let limiteSuggerimenti = 8;

/** Registra la funzione dei suggerimenti per i campi A/Cc/Ccn. */
export function impostaSuggeritoreDestinatari(fn) {
  suggerisciDestinatari = typeof fn === "function" ? fn : null;
}

/** Sottotitolo predefinito della barra di controllo (nessun avviso). */
const CONTROLLO_SUB = "allegati citati nel testo · destinatari giusti · tono · dati sensibili";

/** Soglia dei destinatari oltre la quale la barra avvisa (specchia il kernel). */
const MAX_DESTINATARI = 10;

/** Frasi che citano un allegato (specchia i controlli del kernel). */
const CITAZIONI_ALLEGATO = [
  "in allegato",
  "ti allego",
  "vedi allegato",
  "attachment",
  "allego il",
  "allego la",
  "come allegato",
];

/**
 * Firma predefinita configurata.
 *
 * La firma è una preferenza dell'app e vive in `config.json` (campo
 * `firmaDelMittente`): la finestra principale la carica all'avvio con
 * `impostazioni_leggi` e la consegna con `impostaFirma`. Niente `localStorage`:
 * una preferenza salvata dal kernel deve restare nel kernel.
 */
export function firmaConfigurata() {
  return firmaCorrente;
}

/**
 * Imposta la firma predefinita in memoria (usata all'avvio da main.js e dal
 * pannello impostazioni quando l'utente la modifica: così compare subito nelle
 * nuove composizioni). Non persiste: a salvarla è `impostazioni_salva`.
 */
export function impostaFirma(firma) {
  firmaCorrente = String(firma == null ? "" : firma);
  firmeCorrenti = firmaCorrente.trim()
    ? [{ id: "predefinita", nome: "Firma", contenuto: firmaCorrente, html: false }]
    : [];
  firmaIdDefault = firmeCorrenti.length ? "predefinita" : "";
}

/**
 * Imposta l'elenco delle firme disponibili e quella predefinita (blocco D,
 * seconda metà). La finestra di composizione la inserisce all'apertura e offre
 * il selettore «Firma» per sceglierne un'altra.
 */
export function impostaFirme(firme, idPredefinito) {
  firmeCorrenti = normalizzaFirme(firme);
  firmaIdDefault = idPredefinito && firmeCorrenti.some((f) => f.id === idPredefinito)
    ? idPredefinito
    : firmeCorrenti.length
      ? firmeCorrenti[0].id
      : "";
  const scelta = firmeCorrenti.find((f) => f.id === firmaIdDefault);
  firmaCorrente = scelta ? scelta.contenuto : "";
}

/**
 * Registra la funzione che apre il pannello della firma (Assistente IA).
 * main.js la collega: la voce "Firma" del ribbon e il pannello condividono la
 * stessa sede, quindi non serve una seconda schermata per la firma.
 */
export function impostaApriFirma(fn) {
  apriFirma = typeof fn === "function" ? fn : null;
}

/**
 * Registra la funzione che apre il modulo di una nuova riunione (blocco G).
 * `main.js` la collega: la voce «Riunione» del ribbon di composizione apre il
 * modulo con i destinatari e il corpo già scritti.
 */
export function impostaApriRiunione(fn) {
  apriRiunioneCb = typeof fn === "function" ? fn : null;
}

/**
 * Registra la funzione che salva la bozza nella cartella «Bozze» (blocco I1).
 * `main.js` la collega: ⌘S nella finestra di composizione la invoca.
 */
export function impostaSalvaBozza(fn) {
  salvaBozzaCb = typeof fn === "function" ? fn : null;
}

/**
 * Registra la funzione che **programma l'invio** («Invia più tardi», blocco I2):
 * `main.js` la collega al comando `invio_programma`. Riceve i campi della
 * composizione e l'ora scelta (secondi epoch) e restituisce l'esito leggibile.
 */
export function impostaPianificaInvio(fn) {
  pianificaCb = typeof fn === "function" ? fn : null;
}

let pianificaCb = null;

/** Funzione del chiamante che salva le preferenze (blocco R). */
let salvaPreferenze = null;

/** Registra la funzione che persiste una modifica alle preferenze. */
export function impostaSalvaPreferenze(fn) {
  salvaPreferenze = typeof fn === "function" ? fn : null;
}

// ---------------------------------------------------------------------------
// Preferenze di composizione (blocco D): formato, a capo, carattere predefinito,
// correzione automatica e ortografia. Arrivano dal kernel con
// `impostaPreferenzeComposizione` e valgono per tutte le finestre di
// composizione aperte dopo la chiamata.
// ---------------------------------------------------------------------------

/** Default speculari a `config.rs` (usati finché il kernel non risponde). */
function prefsComposizioneDefault() {
  return {
    composizioneFormato: "html",
    composizioneACapo: true,
    composizioneIncludiOriginale: true,
    composizioneNuovaFinestra: false,
    carattereFamiglia: "Aptos",
    carattereDimensione: 12,
    correzioneAutomaticaAttiva: true,
    correzioneSostituzioni: sostituzioniPredefinite(),
    ortografiaAttiva: false,
    ortografiaLingua: "it-IT",
    confermaLetturaDefault: false,
    confermaRecapitoDefault: false,
  };
}

let prefsComposizione = prefsComposizioneDefault();

/** Normalizza e adotta le preferenze di composizione (le usa `main.js`). */
export function impostaPreferenzeComposizione(pref) {
  const d = prefsComposizioneDefault();
  const p = pref && typeof pref === "object" ? pref : {};
  const st = stileCarattere(p.carattereFamiglia, p.carattereDimensione);
  prefsComposizione = {
    composizioneFormato: normFormato(p.composizioneFormato),
    composizioneACapo: p.composizioneACapo !== false,
    composizioneIncludiOriginale: p.composizioneIncludiOriginale !== false,
    composizioneNuovaFinestra: !!p.composizioneNuovaFinestra,
    carattereFamiglia: st.fontFamily,
    carattereDimensione: limitaDimensione(st.fontSize, d.carattereDimensione),
    correzioneAutomaticaAttiva: p.correzioneAutomaticaAttiva !== false,
    correzioneSostituzioni: normalizzaSostituzioni(
      Array.isArray(p.correzioneSostituzioni) && p.correzioneSostituzioni.length
        ? p.correzioneSostituzioni
        : d.correzioneSostituzioni,
    ),
    ortografiaAttiva: !!p.ortografiaAttiva,
    ortografiaLingua: String(p.ortografiaLingua || d.ortografiaLingua),
    // Blocco I2: le conferme predefinite delle nuove composizioni.
    confermaLetturaDefault: !!p.confermaLetturaDefault,
    confermaRecapitoDefault: !!p.confermaRecapitoDefault,
  };
  // Blocco I2: lo zoom del corpo arriva dalle preferenze (50–400%).
  const z = Number(p.zoomComposizione);
  zoomCorpo = Number.isFinite(z) ? Math.min(400, Math.max(50, Math.round(z))) : 100;
  // Blocco Q: il numero di suggerimenti dei destinatari (pannello «Contatti»).
  limiteSuggerimenti = normSuggerimentiLimite(p.contattiSuggerimentiLimite);
  return prefsComposizione;
}

/** Le preferenze di composizione in vigore (sola lettura). */
export function preferenzeComposizione() {
  return Object.assign({}, prefsComposizione);
}

/** Fuga dei caratteri per l'inserimento nell'HTML dei campi. */
function fuga(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Testo con interruzioni di riga reso come HTML (per il corpo iniziale). */
function aHtml(testo) {
  return fuga(testo).replace(/\n/g, "<br>");
}

// ---------------------------------------------------------------------------
// Logica pura del controllo pre-invio (usata nel browser per le prove visive e
// testata con `node --test`). Nel percorso Tauri il controllo vero lo fa il
// kernel Rust (`controllo_preinvio`); qui ne esiste solo il rispecchiamento per
// il browser, senza modello.
// ---------------------------------------------------------------------------

/** Numero di indirizzi in un campo A:/Cc: (separatori virgola e punto e virgola). */
export function contaIndirizzi(campo) {
  return String(campo || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

/** Etichetta leggibile della gravità dell'avviso. */
export function etichettaGravita(gravita) {
  return gravita === "attenzione" ? "Attenzione" : "Informativo";
}

/** Vero se il testo contiene un IBAN italiano (anche con spazi). */
function ibanIt(testo) {
  const compatto = String(testo).replace(/[\s-]/g, "").toUpperCase();
  for (let i = 0; i + 27 <= compatto.length; i += 1) {
    if (!compatto.startsWith("IT", i)) continue;
    const s = compatto.slice(i, i + 27);
    if (
      /^\d{2}$/.test(s.slice(2, 4)) &&
      /^[A-Z]$/.test(s[4]) &&
      /^\d{10}$/.test(s.slice(5, 15)) &&
      /^[A-Z0-9]{12}$/.test(s.slice(15, 27))
    )
      return true;
  }
  return false;
}

/** Vero se il testo contiene una sequenza di 13–19 cifre (anche con spazi). */
function numeroCarta(testo) {
  let cifre = 0;
  let inSequenza = false;
  for (const c of String(testo)) {
    if (/[0-9]/.test(c)) {
      cifre += 1;
      inSequenza = true;
    } else if ((c === " " || c === "-") && inSequenza) {
      /* separatore dentro la sequenza */
    } else {
      if (cifre >= 13 && cifre <= 19) return true;
      cifre = 0;
      inSequenza = false;
    }
  }
  return cifre >= 13 && cifre <= 19;
}

/** Vero se il testo contiene un codice fiscale (16 caratteri, formato italiano). */
function codiceFiscale(testo) {
  const alto = String(testo).toUpperCase();
  for (let i = 0; i + 16 <= alto.length; i += 1) {
    const s = alto.slice(i, i + 16);
    if (/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(s)) return true;
  }
  return false;
}

/**
 * Controllo pre-invio SIMULATO per il percorso browser (nessun modello): produce
 * gli stessi avvisi che darebbe il kernel sui casi principali. Serve alle prove
 * visive; non è usato quando si gira dentro Tauri.
 */
export function avvisiSimulati(campi = {}) {
  const corpo = String(campi.corpoTesto || campi.corpo || "");
  const oggetto = String(campi.oggetto || "");
  const allegati = Number(campi.numeroAllegati || 0);
  const avvisi = [];

  const testo = `${oggetto}\n${corpo}`.toLowerCase();
  if (allegati === 0 && CITAZIONI_ALLEGATO.some((f) => testo.includes(f))) {
    avvisi.push({
      tipo: "allegato_mancante",
      gravita: "attenzione",
      messaggio:
        'Il testo cita un allegato ("in allegato", "ti allego", …) ma non c\'è nessun file allegato.',
    });
  }
  if (!oggetto.trim()) {
    avvisi.push({
      tipo: "oggetto_vuoto",
      gravita: "attenzione",
      messaggio: "L'oggetto è vuoto: un oggetto chiaro aiuta chi riceve.",
    });
  }
  const totale = contaIndirizzi(campi.a) + contaIndirizzi(campi.cc);
  if (totale > MAX_DESTINATARI) {
    avvisi.push({
      tipo: "troppi_destinatari",
      gravita: "attenzione",
      messaggio: `Ci sono ${totale} destinatari (soglia ${MAX_DESTINATARI}): controlla le copie.`,
    });
  }
  if (/password|pwd/i.test(corpo)) {
    avvisi.push({
      tipo: "dato_sensibile",
      gravita: "attenzione",
      messaggio: "Possibile password nel corpo: valuta un canale diverso.",
    });
  }
  if (ibanIt(corpo)) {
    avvisi.push({
      tipo: "dato_sensibile",
      gravita: "attenzione",
      messaggio: "Possibile IBAN italiano nel corpo.",
    });
  }
  if (numeroCarta(corpo)) {
    avvisi.push({
      tipo: "dato_sensibile",
      gravita: "attenzione",
      messaggio: "Possibile numero di carta nel corpo.",
    });
  }
  if (codiceFiscale(corpo)) {
    avvisi.push({
      tipo: "dato_sensibile",
      gravita: "attenzione",
      messaggio: "Possibile codice fiscale nel corpo.",
    });
  }
  return avvisi;
}

// ---------------------------------------------------------------------------
// Logica pura degli allegati e degli inserimenti (testata con `node --test`).
// Nessuna dipendenza dal DOM: si collauda a parte, poi l'interfaccia la usa.
// ---------------------------------------------------------------------------

/** Dimensione leggibile di un numero di byte (B/KB/MB), con la virgola decimale. */
export function dimensioneLeggibile(byte) {
  const n = Math.max(0, Math.trunc(Number(byte) || 0));
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Aggiunge un allegato all'elenco restituendone uno nuovo (non muta l'originale). */
export function aggiungiAllegato(elenco, allegato) {
  const lista = Array.isArray(elenco) ? elenco : [];
  return [
    ...lista,
    {
      nome: String((allegato && allegato.nome) || "allegato"),
      mime: String((allegato && allegato.mime) || "application/octet-stream"),
      dimensione: Math.max(0, Math.trunc(Number(allegato && allegato.dimensione) || 0)),
      contenuto: String((allegato && allegato.contenuto) || ""),
    },
  ];
}

/** Rimuove l'allegato all'indice indicato (un indice storto non cambia nulla). */
export function rimuoviAllegato(elenco, indice) {
  const lista = Array.isArray(elenco) ? elenco : [];
  return lista.filter((_, i) => i !== indice);
}

/** Somma dei byte dell'elenco degli allegati. */
export function totaleByte(elenco) {
  const lista = Array.isArray(elenco) ? elenco : [];
  return lista.reduce((somma, a) => somma + Math.max(0, Math.trunc(Number(a && a.dimensione) || 0)), 0);
}

/** Totale leggibile degli allegati (es. "2,3 MB"). */
export function totaleLeggibile(elenco) {
  return dimensioneLeggibile(totaleByte(elenco));
}

/** Markup di una tabella righe×colonne con celle vuote (modificabili nel corpo). */
export function markupTabella(righe, colonne) {
  const r = Math.max(1, Math.min(20, Math.trunc(Number(righe) || 1)));
  const c = Math.max(1, Math.min(20, Math.trunc(Number(colonne) || 1)));
  const riga = `<tr>${"<td><br></td>".repeat(c)}</tr>`;
  return `<table class="cmp-tabella"><tbody>${riga.repeat(r)}</tbody></table>`;
}

/**
 * Normalizza un indirizzo inserito a mano: se manca lo schema si assume
 * `https://`; gli schemi pericolosi (`javascript:`, `data:`, …) sono rifiutati
 * restituendo stringa vuota.
 */
export function normalizzaUrl(url) {
  const u = String(url == null ? "" : url).trim();
  if (!u) return "";
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  // Qualunque altro schema esplicito non è ammesso.
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return "";
  return `https://${u}`;
}

/**
 * Avvolge un collegamento: con del testo selezionato lo rende il testo del link
 * (`<a href="url">testo</a>`), senza selezione inserisce il solo collegamento.
 * Url non valido → stringa vuota (chi chiama lo dichiara all'utente).
 */
export function avvolgiCollegamento(testo, url) {
  const u = normalizzaUrl(url);
  if (!u) return "";
  const t = String(testo == null ? "" : testo).trim();
  const etichetta = t || u;
  return `<a href="${fuga(u)}">${fuga(etichetta)}</a>`;
}

/** Divide un data URL in `{ mime, base64 }` (mime vuoto se non è un data URL). */
export function dividiDataUrl(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(dataUrl == null ? "" : dataUrl));
  if (!m) return { mime: "", base64: "" };
  const mime = m[1] || "application/octet-stream";
  if (m[2]) return { mime, base64: m[3] || "" };
  // Non base64 (raro): il contenuto è percent-encoded, si decodifica.
  let testo = m[3] || "";
  try {
    testo = decodeURIComponent(testo);
  } catch {
    /* resta com'è */
  }
  return { mime, contenutoTesto: testo, base64: "" };
}

/** Gruppi del ribbon di composizione (misurati sul riferimento, §2.4).
 *
 * Le voci `act: "non-disponibile"` sono quelle del riferimento Outlook che in
 * questa v1 non hanno un consumatore: cliccandole dichiarano di non essere
 * disponibili, così nessun pulsante resta muto (l'etichetta arriva dal `lb`). */
const GRUPPI = [
  { act: "invia", ic: "➤", lb: "Invia", wide: false, chiaro: true },
  { act: "invia-piu-tardi", ic: "🕑", lb: "Invia più<br>tardi", wide: true },
  { act: "incolla", ic: "📋", lb: "Incolla" },
  { sep: true },
  { carattere: true },
  { sep: true },
  { paragrafo: true },
  { sep: true },
  { act: "non-disponibile", ic: "☀︎", lb: "Cambia<br>sfondo" },
  { act: "allega", ic: "📎", lb: "Allega<br>file" },
  { act: "collegamento", ic: "🔗", lb: "Inserisci<br>collegamento", wide: true },
  { act: "tabella", ic: "▦", lb: "Tabella" },
  { act: "immagine", ic: "🖼", lb: "Immagine<br>da file" },
  { act: "firma", ic: "✍︎", lb: "Firma" },
  { act: "riunione", ic: "📆", lb: "Riunione" },
  { act: "conferme", ic: "✔︎", lb: "Conferme di<br>lettura/recapito", wide: true },
  { act: "ritaglia", ic: "✂︎", lb: "Ritaglia" },
  { act: "non-disponibile", ic: "❗", lb: "Priorità<br>alta", wide: true },
  { act: "non-disponibile", ic: "↓", lb: "Priorità<br>bassa", wide: true },
  { act: "non-disponibile", ic: "👥", lb: "Controlla<br>nomi", wide: true },
];

/**
 * I tipi di carattere offerti dal menu «Carattere» (blocco R). Sono famiglie
 * di **sistema**, presenti su macOS e Windows: si scrive il nome della
 * famiglia, **nessun file di font** è copiato nel progetto. «Aptos» è la prima
 * perché è il predefinito della finestra (specchia `CARATTERE_FAMIGLIA_DEFAULT`).
 */
export const CARATTERI_COMPOSIZIONE = [
  "Aptos",
  "Georgia",
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Verdana",
];

/** Le dimensioni offerte dal menu: quelle usuali, dentro l'intervallo ammesso. */
export function elencoDimensioni() {
  return [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
}

/** Carattere: gruppo con i controlli accostati come nel riferimento.
 *
 * I tre comandi di carattere (grassetto, corsivo, sottolineato) agiscono sul
 * corpo `contenteditable` con `document.execCommand`, che è **deprecato** ma è
 * ancora implementato dalle webview di sistema (WKWebView/WebView2) e
 * dall'obiettivo di questo blocco: rendere vivi i pulsanti senza riscrivere a
 * mano la gestione della selezione. La scelta è dichiarata nel report.
 */
function htmlCarattere() {
  // La casella del gruppo "Carattere" mostra la famiglia e la dimensione in
  // vigore e le cambia davvero (blocco R): un clic apre l'elenco, la scelta
  // veste il corpo e resta per le composizioni successive. Lo zoom (A⁻/A⁺)
  // resta un'altra cosa: ingrandisce la vista, non il carattere del messaggio.
  const st = stileCarattere(prefsComposizione.carattereFamiglia, prefsComposizione.carattereDimensione);
  return `<div class="cmp-group cmp-group--carattere">
    <button type="button" class="cmp-font" data-font-menu="1" title="Tipo di carattere del corpo">${fuga(st.fontFamily)} (Corpo)</button>
    <button type="button" class="cmp-size" data-size-menu="1" title="Dimensione del carattere del corpo">${st.fontSize}</button>
    <span class="cmp-inl" data-zoom="fuori" title="Riduci lo zoom">A⁻</span><span class="cmp-inl" data-zoom="dentro" title="Aumenta lo zoom">A⁺</span>
    <span class="cmp-inl cmp-zoom" id="cmp-zoom" title="Zoom del corpo">${zoomCorpo}%</span>
    <span class="cmp-sep-lite"></span>
    <span class="cmp-inl cmp-b" data-cmd="bold" data-lb="Grassetto" title="Grassetto">G</span><span class="cmp-inl cmp-i" data-cmd="italic" data-lb="Corsivo" title="Corsivo">S</span>
    <span class="cmp-inl cmp-u" data-cmd="underline" data-lb="Sottolineato" title="Sottolineato">S</span>
    <span class="cmp-inl cmp-s" data-cmd2="barrato" data-lb="Barrato" title="Barrato">S̶</span>
    <span class="cmp-inl" data-cmd2="testo_normale" data-lb="Testo normale" title="Testo normale">A</span>
    <span class="cmp-inl" data-cmd2="cancella_formattazione" data-lb="Cancella formattazione" title="Cancella formattazione">✕A</span>
    <span class="cmp-inl" data-cmd="superscript" data-lb="Apice" title="Apice">x²</span><span class="cmp-inl" data-cmd="subscript" data-lb="Pedice" title="Pedice">x₂</span>
    <span class="cmp-inl cmp-evid" data-cmd2="evidenzia" data-lb="Colore evidenziazione carattere" title="Colore evidenziazione carattere">🖍</span>
  </div>`;
}

/**
 * Applica famiglia e dimensione al corpo della composizione e ridisegna la
 * casella del gruppo «Carattere». Usata dai due menu del ribbon.
 */
export function impostaCarattereCorpo(overlay, famiglia, dimensione) {
  const st = stileCarattere(famiglia, dimensione);
  prefsComposizione.carattereFamiglia = st.fontFamily;
  prefsComposizione.carattereDimensione = st.fontSize;
  const corpo = overlay.querySelector("#cmp-body");
  if (corpo) {
    corpo.style.fontFamily = st.fontFamily;
    corpo.style.fontSize = `${Math.round((st.fontSize * zoomCorpo) / 100)}px`;
  }
  const casella = overlay.querySelector(".cmp-font");
  if (casella) casella.textContent = `${st.fontFamily} (Corpo)`;
  const taglia = overlay.querySelector(".cmp-size");
  if (taglia) taglia.textContent = String(st.fontSize);
  return st;
}

/** Zoom corrente del corpo di composizione (percentuale, blocco I2). */
let zoomCorpo = 100;

/** Paragrafo: elenchi (puntato/numerato, vivi), rientri, allineamenti. */
function htmlParagrafo() {
  // Tutti i controlli hanno un consumatore: gli elenchi e gli allineamenti con
  // `execCommand` (lo stesso meccanismo delle voci del gruppo «Carattere»).
  return `<div class="cmp-group cmp-group--paragrafo">
    <span data-cmd="insertUnorderedList" title="Elenco puntato">≡</span>
    <span data-cmd="insertOrderedList" title="Elenco numerato">⋮≡</span>
    <span data-cmd="outdent" title="Riduci rientro">⇤</span><span data-cmd="indent" title="Aumenta rientro">⇥</span>
    <span data-cmd="justifyLeft" title="Allinea a sinistra">≡≡</span><span data-cmd="justifyCenter" title="Centra">≡≡</span><span data-cmd="justifyRight" title="Allinea a destra">≡≡</span>
  </div>`;
}

/** Corpo del ribbon: gruppi e separatori. */
function htmlRibbon() {
  let out = "";
  for (const g of GRUPPI) {
    if (g.sep) {
      out += '<span class="rb-sep"></span>';
      continue;
    }
    if (g.carattere) {
      out += htmlCarattere();
      continue;
    }
    if (g.paragrafo) {
      out += htmlParagrafo();
      continue;
    }
    const cls = ["rb", g.wide ? "rb--wide" : "", g.chiaro ? "rb--invia" : ""]
      .filter(Boolean)
      .join(" ");
    // `data-lb` è l'etichetta in chiaro: la usano le voci senza consumatore per
    // dire per nome che cosa non è disponibile nella v1.
    const dati = `${g.act ? ` data-act="${g.act}"` : ""} data-lb="${g.lb.replace(/<br>/g, " ")}"`;
    out += `<div class="${cls}"${dati}><div class="ic">${g.ic}</div><div class="lb">${g.lb}</div></div>`;
  }
  return out;
}

/** Barra "Controllo prima dell'invio", sopra il corpo (mockup-compose.html). */
function htmlControllo() {
  return `<div class="compose-controllo" id="cmp-controllo">
    <div class="cmp-cont-head">
      <span class="cmp-cont-ic" aria-hidden="true">✦</span>
      <span class="cmp-cont-titolo">Controllo prima dell'invio</span>
      <span class="cmp-cont-sub" id="cmp-cont-sub">${CONTROLLO_SUB}</span>
      <span class="cmp-cont-gear" aria-hidden="true">⚙</span>
    </div>
    <div class="cmp-cont-avvisi" id="cmp-cont-avvisi" role="status" aria-live="polite"></div>
    <div class="cmp-cont-azione" id="cmp-cont-azione"></div>
  </div>`;
}

/** Elenco degli allegati, sotto l'oggetto (nome, dimensione, X per toglierli). */
function htmlAllegati() {
  return `<div class="compose-allegati" id="cmp-allegati" hidden>
    <div class="cmp-allegati-elenco" id="cmp-allegati-elenco"></div>
    <p class="cmp-allegati-totale" id="cmp-allegati-totale"></p>
  </div>`;
}

/** Markup completo della finestra di composizione. */
function markup(opzioni) {
  const titolo = opzioni.titolo || `Senza titolo - ${opzioni.mittente || "nessun account"}`;
  const corpo = opzioni.corpo || "";
  // Blocco D: il corpo indossa il carattere predefinito, il tipo di a capo,
  // il controllo ortografico e la lingua scelti nelle impostazioni.
  const st = stileCarattere(prefsComposizione.carattereFamiglia, prefsComposizione.carattereDimensione);
  const cls = prefsComposizione.composizioneACapo ? "compose-body compose-body--acapo" : "compose-body";
  return `
  <div class="compose-window" role="dialog" aria-label="Nuovo messaggio">
    <header class="compose-titlebar">
      ${PULSANTE_CHIUDI}
      <span class="compose-tb-title">${fuga(titolo)}</span>
    </header>

    <nav class="compose-ribbon">
      <div class="compose-tabs">
        <span class="tab tab--active">Messaggio</span>
        <span class="tab">Opzioni</span>
      </div>
      <div class="compose-groups">${htmlRibbon()}</div>
    </nav>

    <div class="compose-fields">
      <div class="cmp-row">
        <label class="cmp-label" for="cmp-a">A:</label>
        <input class="cmp-input" id="cmp-a" type="text" autocomplete="off" value="${fuga(opzioni.a)}" />
        <span class="cmp-people">👤</span>
      </div>
      <div class="cmp-row cmp-row--cc">
        <label class="cmp-label" for="cmp-cc">Cc:</label>
        <input class="cmp-input" id="cmp-cc" type="text" autocomplete="off" value="${fuga(opzioni.cc)}" />
        <span class="cmp-people">👤</span>
      </div>
      <div class="cmp-row cmp-row--ccn">
        <label class="cmp-label" for="cmp-ccn">Ccn:</label>
        <input class="cmp-input" id="cmp-ccn" type="text" autocomplete="off" value="${fuga(opzioni.ccn)}" />
        <span class="cmp-people">👤</span>
      </div>
      <div class="cmp-row cmp-row--oggetto">
        <label class="cmp-label" for="cmp-oggetto">Oggetto:</label>
        <input class="cmp-input" id="cmp-oggetto" type="text" autocomplete="off" value="${fuga(opzioni.oggetto)}" />
      </div>
${htmlFirmaSelect()}
    </div>

    ${htmlAllegati()}

    ${htmlControllo()}

    <div class="cmp-i2-stato" id="cmp-i2-stato" hidden></div>

    ${opzioni.etichettaIA ? `<div class="compose-ai-nota">✦ ${fuga(opzioni.etichettaIA)}</div>` : ""}

    <div class="${cls}" id="cmp-body" contenteditable="true" spellcheck="${prefsComposizione.ortografiaAttiva ? "true" : "false"}" lang="${fuga(prefsComposizione.ortografiaLingua)}" style="font-family:${fuga(st.fontFamily)}, sans-serif;${stileZoom(zoomCorpo, st.fontSize)}">${aHtml(corpo)}</div>

    <div class="compose-esito" id="cmp-esito" role="status"></div>

    <p class="compose-nota">A invio riuscito il messaggio viene copiato in «Posta inviata» del server, quando la cartella è raggiungibile.</p>
  </div>`;
}

/** Il selettore «Firma» della finestra (vuoto se non ci sono firme). */
function htmlFirmaSelect() {
  if (!firmeCorrenti.length) return "";
  const opts = [`<option value=""${firmaIdDefault ? "" : " selected"}>Nessuna</option>`].concat(
    firmeCorrenti.map(
      (f) =>
        `<option value="${fuga(f.id)}"${f.id === firmaIdDefault ? " selected" : ""}>${fuga(nomeFirma(f))}</option>`,
    ),
  );
  return `      <div class="cmp-row cmp-row--firma">
        <label class="cmp-label" for="cmp-firma-sel">Firma:</label>
        <select class="cmp-input" id="cmp-firma-sel">${opts.join("")}</select>
      </div>`;
}

/**
 * Estrae dall'HTML del corpo le **immagini incorporate**: ognuna diventa un
 * allegato con `Content-ID` e nel markup inviato la sua `src` passa da `data:`
 * a `cid:` (così il MIME usa `multipart/related` e il destinatario vede
 * l'immagine nel corpo, non come file). L'anteprima nella bozza resta `data:`,
 * perché `cid:` non è risolvibile nella webview.
 */
function estraiImmaginiInline(corpoEl) {
  const contenitore = corpoEl.cloneNode(true);
  const immagini = [];
  contenitore.querySelectorAll("img[data-cid]").forEach((img) => {
    const { mime, base64 } = dividiDataUrl(img.getAttribute("src"));
    const cid = img.dataset.cid;
    if (!base64 || !cid) return;
    immagini.push({
      nome: img.getAttribute("alt") || "immagine",
      mime,
      contenuto: base64,
      contentId: cid,
    });
    img.setAttribute("src", `cid:${cid}`);
    img.removeAttribute("data-cid");
  });
  return { html: contenitore.innerHTML.trim(), immagini };
}

/**
 * L'HTML del corpo col carattere scelto (blocco R). Lo stile in linea del
 * `contenteditable` veste solo la finestra: senza questo involucro il
 * destinatario vede il proprio font, non quello scelto dal mittente. La
 * famiglia passa da `soloFamiglia` (niente virgolette né punti e virgola) e poi
 * da `fuga()`: due cinture, perché il valore sta in un attributo `style`. Un
 * corpo senza markup resta `""`: l'HTML non parte, com'è giusto.
 */
export function htmlConCarattere(html, famiglia, dimensione, zoom = 100) {
  const testo = String(html == null ? "" : html).trim();
  if (!testo) return "";
  const st = stileCarattere(famiglia, dimensione);
  const scala = limitaZoomLettura(zoom);
  const px = Math.round((st.fontSize * scala) / 100);
  // La famiglia può non esistere sulla macchina del destinatario (Aptos non è
  // installata di serie): senza una famiglia generica il client ripiegherebbe
  // sul proprio default, che è un serif. La coda `sans-serif` chiude quella
  // possibilità. `st.fontFamily` è già passato da `soloFamiglia`: niente
  // virgolette, punti e virgola o graffe. `fuga()` è la seconda cintura, per
  // l'attributo.
  const famigliaConRipiego = `${st.fontFamily}, sans-serif`;
  return `<div style="font-family:${fuga(famigliaConRipiego)};font-size:${px}px">${testo}</div>`;
}

/** Estrae i campi della finestra nella forma attesa dal comando `mail_invia`. */
function leggiCampi(overlay) {
  const corpoEl = overlay.querySelector("#cmp-body");
  const { html, immagini } = estraiImmaginiInline(corpoEl);
  const testo = corpoEl.innerText.replace(/\u00a0/g, " ").trimEnd();
  // Il corpo HTML si invia solo se c'è davvero del markup; altrimenti la sola parte testo.
  // Con formato «testo semplice» l'HTML non parte mai: si invia solo il testo.
  const corpoHtml =
    prefsComposizione.composizioneFormato === "testo"
      ? ""
      : /<[a-z][\s\S]*>/i.test(html)
        ? htmlConCarattere(
            html,
            prefsComposizione.carattereFamiglia,
            prefsComposizione.carattereDimensione,
            zoomCorpo,
          )
        : "";
  const allegati = (overlay.__allegati || []).map((a) => ({
    nome: a.nome,
    mime: a.mime,
    contenuto: a.contenuto,
  }))
    // Le immagini incorporate seguono gli allegati, con il loro Content-ID.
    .concat(immagini);
  return {
    a: overlay.querySelector("#cmp-a").value.trim(),
    cc: overlay.querySelector("#cmp-cc").value.trim(),
    ccn: overlay.querySelector("#cmp-ccn") ? overlay.querySelector("#cmp-ccn").value.trim() : "",
    oggetto: overlay.querySelector("#cmp-oggetto").value.trim(),
    corpoTesto: testo,
    corpoHtml,
    // Le immagini incorporate NON contano come "allegati" per il controllo
    // pre-invio: un testo che dice "in allegato" resta un avviso valido.
    numeroAllegati: (overlay.__allegati || []).length,
    allegati,
    // Blocco I2: conferme richieste in questa composizione.
    confermaLettura: !!overlay.__confermaLettura,
    confermaRecapito: !!overlay.__confermaRecapito,
  };
}

/**
 * Costruisce gli argomenti del comando `mail_invia` a partire dai campi della
 * finestra. Esiste come funzione pura perché **tutte** le chiavi richieste dal
 * kernel devono esserci: `cc` e `ccn` non sono opzionali lato Rust, e ometterne
 * una fa fallire l'invio con «missing required key» prima ancora di toccare la
 * rete. Tenerlo in un punto solo evita che i percorsi (invio immediato, invio
 * programmato) divergano.
 */
export function payloadInvio(campi, accountId) {
  const c = campi || {};
  return {
    accountId,
    a: c.a || "",
    cc: c.cc || "",
    ccn: c.ccn || "",
    oggetto: c.oggetto || "",
    corpoTesto: c.corpoTesto || "",
    corpoHtml: c.corpoHtml || "",
    allegati: c.allegati || [],
    confermaLettura: !!c.confermaLettura,
    confermaRecapito: !!c.confermaRecapito,
  };
}

/** Mostra una nota nella finestra (esito o errore). */
function nota(overlay, testo, errore) {
  const el = overlay.querySelector("#cmp-esito");
  el.textContent = testo || "";
  el.classList.toggle("compose-esito--errore", !!errore);
}

/** Avvisa che una funzione non è disponibile nella v1. */
function nonDisponibile(overlay, cosa) {
  nota(overlay, `${cosa}: non disponibile nella v1.`, true);
}

/**
 * «Riunione» nel ribbon di composizione (blocco G): apre il modulo di una nuova
 * riunione con i destinatari di A/Cc e con il corpo scritto come **messaggio
 * accompagnatorio** dell'invito. Non invia nulla: l'invito parte dal modulo.
 */
function apriRiunioneDaComposizione(overlay) {
  if (!apriRiunioneCb) {
    nonDisponibile(overlay, "Nuova riunione");
    return;
  }
  const corpoEl = overlay.querySelector("#cmp-body");
  const campi = ["#cmp-a", "#cmp-cc"]
    .map((s) => overlay.querySelector(s))
    .filter(Boolean)
    .map((i) => i.value.trim())
    .filter(Boolean);
  apriRiunioneCb({
    invitati: campi.join("; "),
    oggetto: (overlay.querySelector("#cmp-oggetto").value || "").trim(),
    descrizione: corpoEl ? corpoEl.innerText.trim() : "",
  });
}

/**
 * Scrive una nota nell'esito della finestra. Esportata perché `main.js` la usa
 * per la bozza di risposta/inoltro (per esempio quando gli allegati del
 * messaggio originale non si riescono a recuperare: la bozza resta aperta).
 */
export function notaInBozza(overlay, testo, errore = false) {
  nota(overlay, testo, errore);
}

/** Icona della gravità di un avviso. */
function iconaGravita(gravita) {
  return gravita === "attenzione" ? "⚠︎" : "ℹ︎";
}

/**
 * Disegna gli avvisi nella barra di controllo. Il pulsante "Invia lo stesso"
 * (conferma esplicita) invia comunque: la barra non blocca mai l'invio.
 */
function renderControllo(overlay, avvisi, onInviaLoStesso) {
  const box = overlay.querySelector("#cmp-cont-avvisi");
  if (!box) return;
  box.innerHTML = avvisi
    .map(
      (a) =>
        `<div class="cmp-avviso cmp-avviso--${fuga(a.gravita || "informativo")}">` +
        `<span class="cmp-avviso-ic" aria-hidden="true">${iconaGravita(a.gravita)}</span>` +
        `<span class="cmp-avviso-tit">${fuga(etichettaGravita(a.gravita))}</span>` +
        `<span class="cmp-avviso-msg">${fuga(a.messaggio)}</span></div>`,
    )
    .join("");
  const sub = overlay.querySelector("#cmp-cont-sub");
  if (sub)
    sub.textContent = `${avvisi.length} avvis${avvisi.length === 1 ? "o" : "i"} · l'invio è comunque possibile`;
  const azione = overlay.querySelector("#cmp-cont-azione");
  if (azione) {
    azione.innerHTML = '<button type="button" class="cmp-cont-lostesso">Invia lo stesso</button>';
    azione
      .querySelector("button")
      .addEventListener("click", () => onInviaLoStesso && onInviaLoStesso());
  }
}

/** Svuota la barra di controllo (nessun avviso). */
function svuotaControllo(overlay) {
  const box = overlay.querySelector("#cmp-cont-avvisi");
  if (box) box.innerHTML = "";
  const azione = overlay.querySelector("#cmp-cont-azione");
  if (azione) azione.innerHTML = "";
  const sub = overlay.querySelector("#cmp-cont-sub");
  if (sub) sub.textContent = CONTROLLO_SUB;
}

/**
 * Esegue il controllo pre-invio e, se ci sono avvisi, li mostra nella barra.
 * Restituisce l'elenco degli avvisi (vuoto se non c'è nulla da segnalare).
 * Esportata per le prove visive (`?view=controllo`), che mostrano la barra
 * senza dover inviare.
 */
export async function eseguiControllo(overlay, onControllo) {
  const campi = leggiCampi(overlay);
  let avvisi = [];
  if (typeof onControllo === "function") {
    try {
      avvisi = (await onControllo(campi)) || [];
    } catch {
      // Un controllo che fallisce non deve mai impedire l'invio: si tace.
      avvisi = [];
    }
  }
  if (Array.isArray(avvisi) && avvisi.length) {
    renderControllo(overlay, avvisi, () => invia(overlay, true));
  } else {
    svuotaControllo(overlay);
  }
  return avvisi;
}

// ---------------------------------------------------------------------------
// Interazione: allegati, inserimenti (tabella/immagine/collegamento), ritaglio,
// formattazione del corpo, avviso di chiusura. Tutto qui è legato al DOM.
// ---------------------------------------------------------------------------

/** Un `<input type="file">` nascosto (la scelta file nel webview passa da qui). */
function inputFileNascosto(accetta) {
  const input = document.createElement("input");
  input.type = "file";
  input.style.display = "none";
  if (accetta) input.accept = accetta;
  return input;
}

/** Legge un `File` (o `Blob`) come data URL. */
function leggiFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("lettura del file non riuscita"));
    reader.readAsDataURL(file);
  });
}

/**
 * Passa i file scelti a `<input type="file">`: ognuno entra nell'elenco con nome,
 * tipo, dimensione e contenuto base64. Scelta dichiarata: **non** si usa
 * `@tauri-apps/plugin-dialog` (il plugin non è in `package.json`/`Cargo.toml`),
 * quindi si legge con `FileReader` e si passa il base64 via IPC.
 */
async function allegaFiles(overlay, files) {
  if (!files || !files.length) return;
  for (const file of files) {
    try {
      const dataUrl = await leggiFileDataUrl(file);
      const { mime, base64 } = dividiDataUrl(dataUrl);
      const dimensione = Number(file.size) || Math.floor((base64.length * 3) / 4);
      overlay.__allegati = aggiungiAllegato(overlay.__allegati, {
        nome: file.name || "allegato",
        mime: mime || file.type || "application/octet-stream",
        dimensione,
        contenuto: base64,
      });
    } catch (err) {
      nota(overlay, `Impossibile leggere «${file.name}»: ${err && err.message ? err.message : err}`, true);
    }
  }
  renderAllegati(overlay);
  svuotaControllo(overlay);
}

/** "Allegato" del ribbon: apre il selettore file (nascosto) e allega quanto scelto. */
function allegaConDialogo(overlay) {
  const input = inputFileNascosto(null);
  input.multiple = true;
  overlay.append(input);
  input.addEventListener("change", () => {
    const files = input.files ? Array.from(input.files) : [];
    input.remove();
    if (files.length) allegaFiles(overlay, files);
  });
  // Alcune webview emettono `cancel` quando si chiude senza scegliere nulla.
  input.addEventListener("cancel", () => input.remove());
  input.click();
}

/** Disegna l'elenco degli allegati con nome, dimensione, X e il totale. */
function renderAllegati(overlay) {
  const box = overlay.querySelector("#cmp-allegati");
  const righe = overlay.querySelector("#cmp-allegati-elenco");
  if (!box || !righe) return;
  const elenco = overlay.__allegati || [];
  box.hidden = elenco.length === 0;
  righe.innerHTML = elenco
    .map(
      (a, i) =>
        `<div class="cmp-allegato" data-indice="${i}">` +
        `<span class="cmp-allegato-ic" aria-hidden="true">📎</span>` +
        `<span class="cmp-allegato-nome" title="${fuga(a.nome)}">${fuga(a.nome)}</span>` +
        `<span class="cmp-allegato-dim">${dimensioneLeggibile(a.dimensione)}</span>` +
        `<button type="button" class="cmp-allegato-x" data-rimuovi="${i}" ` +
        `aria-label="Togli l'allegato ${fuga(a.nome)}">✕</button></div>`,
    )
    .join("");
  const tot = overlay.querySelector("#cmp-allegati-totale");
  if (tot)
    tot.textContent = elenco.length
      ? `${elenco.length} allegat${elenco.length === 1 ? "o" : "i"} · ${totaleLeggibile(elenco)}`
      : "";
  righe.querySelectorAll("[data-rimuovi]").forEach((b) =>
    b.addEventListener("click", () => {
      overlay.__allegati = rimuoviAllegato(overlay.__allegati, Number(b.dataset.rimuovi));
      renderAllegati(overlay);
      svuotaControllo(overlay);
    }),
  );
}

/**
 * Imposta l'elenco degli allegati di una finestra di composizione già aperta.
 * Esportata per le prove visive (`?view=compose-allegati`) e per chi vuole
 * precompilare la finestra; l'interfaccia normale la riempie dal selettore file.
 */
export function impostaAllegati(overlay, elenco) {
  overlay.__allegati = (elenco || []).reduce((acc, a) => aggiungiAllegato(acc, a), []);
  renderAllegati(overlay);
  svuotaControllo(overlay);
  return overlay;
}

/** Piccolo modulo in linea (collegamento, tabella): risolve con i valori o `null`. */
function chiediModulo(overlay, { titolo, campi, conferma }) {
  return new Promise((resolve) => {
    const ospite = document.createElement("div");
    ospite.className = "cmp-prompt";
    ospite.innerHTML =
      `<div class="cmp-prompt-box">` +
      `<div class="cmp-prompt-titolo">${fuga(titolo)}</div>` +
      `<div class="cmp-prompt-campi">` +
      campi
        .map(
          (c) =>
            `<label class="cmp-prompt-riga"><span>${fuga(c.etichetta)}</span>` +
            `<input type="${c.tipo || "text"}" data-campo="${fuga(c.nome)}" ` +
            `value="${fuga(c.valore || "")}" ${c.tipo === "number" ? 'min="1" max="20"' : ""} /></label>`,
        )
        .join("") +
      `</div><div class="cmp-prompt-azioni">` +
      `<button type="button" data-prompt="annulla">Annulla</button>` +
      `<button type="button" data-prompt="ok" class="cmp-prompt-ok">${fuga(conferma || "Inserisci")}</button>` +
      `</div></div>`;
    overlay.append(ospite);
    const valori = () => {
      const out = {};
      ospite.querySelectorAll("[data-campo]").forEach((i) => {
        out[i.dataset.campo] = i.value;
      });
      return out;
    };
    const chiudiPrompt = (esito) => {
      ospite.remove();
      resolve(esito);
    };
    ospite.querySelector('[data-prompt="annulla"]').addEventListener("click", () => chiudiPrompt(null));
    ospite.querySelector('[data-prompt="ok"]').addEventListener("click", () => chiudiPrompt(valori()));
    ospite.addEventListener("keydown", (e) => {
      // Esc/Invio riguardano il modulo, non la finestra di composizione.
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        chiudiPrompt(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        chiudiPrompt(valori());
      }
    });
    const primo = ospite.querySelector("input");
    if (primo) primo.focus();
  });
}

/** Inserisce HTML nel corpo: alla selezione se il cursore è nel corpo, altrimenti in coda. */
function inserisciHtml(corpoEl, html) {
  corpoEl.focus();
  const sel = window.getSelection();
  const nelCorpo = sel && sel.rangeCount > 0 && corpoEl.contains(sel.anchorNode);
  if (nelCorpo) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frammento = range.createContextualFragment(html);
    range.insertNode(frammento);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    corpoEl.insertAdjacentHTML("beforeend", html);
  }
}

/** "Inserisci collegamento": avvolge la selezione o inserisce il solo collegamento. */
async function inserisciCollegamento(overlay) {
  const corpoEl = overlay.querySelector("#cmp-body");
  const sel = window.getSelection();
  const selezionato =
    sel && !sel.isCollapsed && corpoEl.contains(sel.anchorNode) ? sel.toString().trim() : "";
  const valori = await chiediModulo(overlay, {
    titolo: "Inserisci collegamento",
    campi: [{ nome: "url", etichetta: "Indirizzo", tipo: "text", valore: "https://" }],
    conferma: "Inserisci",
  });
  if (!valori) return;
  const html = avvolgiCollegamento(selezionato, valori.url);
  if (!html) {
    nota(overlay, "Indirizzo non valido: serve un collegamento http, https, mailto o tel.", true);
    return;
  }
  inserisciHtml(corpoEl, html);
  nota(overlay, "", false);
  svuotaControllo(overlay);
}

/** "Tabella": chiede righe × colonne e inserisce la tabella nel corpo. */
async function inserisciTabella(overlay) {
  const valori = await chiediModulo(overlay, {
    titolo: "Inserisci tabella",
    campi: [
      { nome: "righe", etichetta: "Righe", tipo: "number", valore: "2" },
      { nome: "colonne", etichetta: "Colonne", tipo: "number", valore: "3" },
    ],
    conferma: "Inserisci",
  });
  if (!valori) return;
  inserisciHtml(overlay.querySelector("#cmp-body"), markupTabella(valori.righe, valori.colonne));
  svuotaControllo(overlay);
}

/**
 * "Immagine da file": sceglie un'immagine e la inserisce come immagine
 * **incorporata** nel corpo. L'anteprima usa un data URL (visibile subito);
 * `data-cid` ricorda il Content-ID con cui, all'invio, la parte diventa
 * `cid:` dentro `multipart/related`.
 */
async function inserisciImmagine(overlay) {
  const input = inputFileNascosto("image/*");
  overlay.append(input);
  const file = await new Promise((resolve) => {
    input.addEventListener("change", () => resolve(input.files && input.files[0]));
    input.click();
  });
  input.remove();
  if (!file) return;
  const dataUrl = await leggiFileDataUrl(file);
  const { mime } = dividiDataUrl(dataUrl);
  if (!/^image\//i.test(mime)) {
    nota(overlay, "Il file scelto non è un'immagine.", true);
    return;
  }
  const cid = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@outlook-ai`;
  const img =
    `<img src="${fuga(dataUrl)}" data-cid="${fuga(cid)}" alt="${fuga(file.name || "immagine")}" ` +
    `class="cmp-img" />`;
  inserisciHtml(overlay.querySelector("#cmp-body"), img);
  svuotaControllo(overlay);
}

/**
 * "Ritaglia": se nel corpo c'è un'immagine selezionata apre un ritaglio su
 * canvas (trascina per scegliere l'area, «Ritaglia» per applicare e sostituire
 * l'immagine); senza un'immagine selezionata **lo dichiara**, senza restare muto.
 */
function apriRitaglio(overlay) {
  const img = overlay.__immagineSel;
  const corpoEl = overlay.querySelector("#cmp-body");
  if (!img || !corpoEl.contains(img)) {
    nota(
      overlay,
      "Ritaglia: seleziona prima un'immagine nel corpo (l'immagine incorporata con «Immagine da file»). " +
        "Senza un'immagine selezionata il ritaglio non è applicabile.",
      true,
    );
    return;
  }

  const panel = document.createElement("div");
  panel.className = "cmp-ritaglio";
  panel.innerHTML =
    `<div class="cmp-prompt-box">` +
    `<div class="cmp-prompt-titolo">Ritaglia immagine</div>` +
    `<p class="cmp-ritaglio-aiuto">Trascina sul riquadro per scegliere la parte da conservare, poi «Ritaglia».</p>` +
    `<div class="cmp-ritaglio-area"><canvas class="cmp-rit-canvas"></canvas></div>` +
    `<div class="cmp-prompt-azioni">` +
    `<button type="button" data-rit="annulla">Annulla</button>` +
    `<button type="button" data-rit="applica" class="cmp-prompt-ok">Ritaglia</button>` +
    `</div></div>`;
  overlay.append(panel);
  const canvas = panel.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const sorgente = new Image();
  let selezione = null;
  let inizio = null;

  const disegna = () => {
    const scala = Math.min(1, 600 / sorgente.naturalWidth, 400 / sorgente.naturalHeight);
    canvas.width = Math.max(1, Math.round(sorgente.naturalWidth * scala));
    canvas.height = Math.max(1, Math.round(sorgente.naturalHeight * scala));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sorgente, 0, 0, canvas.width, canvas.height);
    if (selezione) {
      ctx.save();
      ctx.strokeStyle = "#4BA0FF";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(selezione.x, selezione.y, selezione.w, selezione.h);
      ctx.restore();
    }
  };
  const posizione = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, e.clientX - r.left)),
      y: Math.max(0, Math.min(canvas.height, e.clientY - r.top)),
    };
  };
  canvas.addEventListener("mousedown", (e) => {
    inizio = posizione(e);
    selezione = null;
  });
  canvas.addEventListener("mousemove", (e) => {
    if (!inizio) return;
    const p = posizione(e);
    selezione = {
      x: Math.min(inizio.x, p.x),
      y: Math.min(inizio.y, p.y),
      w: Math.abs(p.x - inizio.x),
      h: Math.abs(p.y - inizio.y),
    };
    disegna();
  });
  window.addEventListener("mouseup", () => {
    inizio = null;
  });

  sorgente.onload = disegna;
  sorgente.onerror = () => {
    panel.remove();
    nota(overlay, "Ritaglia: l'immagine selezionata non è caricabile.", true);
  };
  sorgente.src = img.getAttribute("src");

  panel.querySelector('[data-rit="annulla"]').addEventListener("click", () => panel.remove());
  panel.querySelector('[data-rit="applica"]').addEventListener("click", () => {
    const scala = sorgente.naturalWidth / canvas.width;
    const area =
      selezione && selezione.w > 2 && selezione.h > 2
        ? selezione
        : { x: 0, y: 0, w: canvas.width, h: canvas.height };
    const sw = Math.max(1, Math.round(area.w * scala));
    const sh = Math.max(1, Math.round(area.h * scala));
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    out
      .getContext("2d")
      .drawImage(sorgente, Math.round(area.x * scala), Math.round(area.y * scala), sw, sh, 0, 0, sw, sh);
    img.setAttribute("src", out.toDataURL("image/png"));
    panel.remove();
    nota(overlay, `Ritaglio applicato: ${sw}×${sh} pixel.`, false);
    svuotaControllo(overlay);
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      panel.remove();
    }
  });
}

/** Esegue un comando di formattazione sul corpo (vedi nota su `execCommand`). */
function eseguiComando(overlay, comando) {
  const corpoEl = overlay.querySelector("#cmp-body");
  if (!corpoEl || !comando) return;
  corpoEl.focus();
  try {
    document.execCommand(comando, false, null);
    svuotaControllo(overlay);
  } catch (err) {
    nota(overlay, `Comando di formattazione non riuscito: ${err && err.message ? err.message : err}`, true);
  }
}

// ---------------------------------------------------------------------------
// Blocco I2 — formattazione estesa, zoom, invio programmato, conferme.
// ---------------------------------------------------------------------------

/** Aggiorna la riga di stato I2 della composizione (zoom, conferme, invio programmato). */
function aggiornaStatoI2(overlay) {
  const el = overlay.querySelector("#cmp-i2-stato");
  if (!el) return;
  const pezzi = [`Zoom ${zoomCorpo}%`];
  const conf = [];
  if (overlay.__confermaLettura) conf.push("conferma di lettura");
  if (overlay.__confermaRecapito) conf.push("conferma di recapito");
  if (conf.length) pezzi.push(`richieste: ${conf.join(" e ")}`);
  if (overlay.__invioProgrammato) pezzi.push(overlay.__invioProgrammato);
  el.textContent = pezzi.join(" · ");
  el.hidden = false;
}

/**
 * Applica un comando di formattazione al corpo (blocco I2). Con una selezione
 * si inserisce il markup〈Barrato / Testo normale / Cancella formattazione /
 * Colore evidenziazione carattere〉con `insertHTML`: **non si riscrive mai
 * `innerHTML` da `innerText`**, così il resto del contenuto formattato resta.
 * Senza selezione si usa il comando nativo, che vale per la digitazione seguente.
 */
function applicaFormattazione(overlay, comando, colore) {
  const corpoEl = overlay.querySelector("#cmp-body");
  if (!corpoEl || !comando) return;
  corpoEl.focus();
  const sel = window.getSelection && window.getSelection();
  const selezionato = sel ? sel.toString() : "";
  const html = markupFormattazione(comando, selezionato, colore);
  try {
    if (selezionato && html != null) {
      document.execCommand("insertHTML", false, html);
    } else if (comando === "testo_normale") {
      document.execCommand("fontName", false, prefsComposizione.carattereFamiglia);
      document.execCommand("fontSize", false, String(prefsComposizione.carattereDimensione));
    } else if (comando === "evidenzia") {
      document.execCommand("hiliteColor", false, colore || "transparent");
    } else if (comando === "barrato") {
      document.execCommand("strikeThrough", false, null);
    } else if (comando === "cancella_formattazione") {
      document.execCommand("removeFormat", false, null);
    }
    svuotaControllo(overlay);
  } catch (err) {
    nota(overlay, `Formattazione non riuscita: ${err && err.message ? err.message : err}`, true);
  }
}

/**
 * Riallinea il corpo e la casella dello zoom alla scala in vigore. Serve dopo
 * un salvataggio di preferenze: `applicaPreferenze` ri-deriva `zoomCorpo` da
 * `zoomComposizione`, quindi senza questo il corpo resterebbe alla misura di
 * prima mentre il prossimo A⁺/A⁻ partirebbe dal valore nuovo — e il testo si
 * rimpicciolirebbe invece di crescere.
 */
function aggiornaZoom(overlay) {
  const corpoEl = overlay.querySelector("#cmp-body");
  const st = stileCarattere(prefsComposizione.carattereFamiglia, prefsComposizione.carattereDimensione);
  if (corpoEl) {
    corpoEl.style.fontFamily = st.fontFamily;
    corpoEl.style.fontSize = `${Math.round((st.fontSize * zoomCorpo) / 100)}px`;
  }
  const etichetta = overlay.querySelector("#cmp-zoom");
  if (etichetta) etichetta.textContent = `${zoomCorpo}%`;
}

/** Cambia lo zoom del corpo (`ChunkZoom`): cambia davvero la dimensione del testo. */
function cambiaZoom(overlay, delta) {
  zoomCorpo = Math.min(400, Math.max(50, zoomCorpo + delta));
  aggiornaZoom(overlay);
  aggiornaStatoI2(overlay);
}

/**
 * Menu del tipo di carattere: elenco di famiglie di sistema, ognuna disegnata
 * col proprio carattere. La scelta veste subito il corpo e viene salvata.
 */
function apriMenuCarattere(overlay, ancora) {
  chiudiMenuCarattere(overlay);
  const menu = document.createElement("div");
  menu.className = "cmp-menu";
  menu.dataset.menuCarattere = "carattere";
  menu.innerHTML = CARATTERI_COMPOSIZIONE.map(
    (f) =>
      `<button type="button" class="cmp-menu-voce" data-famiglia="${fuga(f)}" style="font-family:${fuga(f)}">${fuga(f)}</button>`,
  ).join("");
  overlay.append(menu);
  menu.querySelectorAll("[data-famiglia]").forEach((b) =>
    b.addEventListener("click", async () => {
      impostaCarattereCorpo(overlay, b.dataset.famiglia, prefsComposizione.carattereDimensione);
      chiudiMenuCarattere(overlay);
      await salvaCarattere(overlay);
    }),
  );
  posizionaMenu(menu, ancora);
}

/** Menu della dimensione: elenco di punti, dentro l'intervallo ammesso. */
function apriMenuDimensione(overlay, ancora) {
  chiudiMenuCarattere(overlay);
  const menu = document.createElement("div");
  menu.className = "cmp-menu";
  menu.dataset.menuCarattere = "dimensione";
  menu.innerHTML = elencoDimensioni()
    .map((n) => `<button type="button" class="cmp-menu-voce" data-punti="${n}">${n}</button>`)
    .join("");
  overlay.append(menu);
  menu.querySelectorAll("[data-punti]").forEach((b) =>
    b.addEventListener("click", async () => {
      impostaCarattereCorpo(overlay, prefsComposizione.carattereFamiglia, Number(b.dataset.punti));
      chiudiMenuCarattere(overlay);
      await salvaCarattere(overlay);
    }),
  );
  posizionaMenu(menu, ancora);
}

/**
 * Toglie il menu del carattere aperto: uno solo per volta. Ritorna vero se
 * c'era davvero, così chi la chiama può fermarsi lì (l'Esc che chiude il menu
 * invece della finestra).
 */
function chiudiMenuCarattere(overlay) {
  const aperti = overlay.querySelectorAll("[data-menu-carattere]");
  aperti.forEach((m) => m.remove());
  return aperti.length > 0;
}

/** Mette il menu sotto il pulsante che l'ha aperto, dentro la finestra. */
function posizionaMenu(menu, ancora) {
  const r = ancora.getBoundingClientRect();
  const w = ancora.closest(".compose-overlay, .mail-settings-overlay") || document.body;
  const b = w.getBoundingClientRect();
  menu.style.left = `${r.left - b.left}px`;
  menu.style.top = `${r.bottom - b.top + 2}px`;
}

/**
 * Manda al chiamante la famiglia e la dimensione scelte, perché le salvi in
 * `config.json`, e riallinea subito il corpo: il salvataggio ri-deriva lo zoom,
 * quindi corpo ed etichetta vanno riportati alla scala in vigore.
 */
async function salvaCarattere(overlay) {
  if (!salvaPreferenze) return;
  // Il salvataggio fa ri-derivare `zoomCorpo` dalla preferenza salvata
  // (`zoomComposizione`), che non è quella che l'utente ha davanti: la scala
  // della finestra si conserva, altrimenti scegliere un carattere riporterebbe
  // lo zoom al valore di `config.json` sotto gli occhi di chi scrive.
  const scala = zoomCorpo;
  try {
    await salvaPreferenze({
      carattereFamiglia: prefsComposizione.carattereFamiglia,
      carattereDimensione: prefsComposizione.carattereDimensione,
    });
  } catch (e) {
    // Un salvataggio fallito non deve restare muto: il carattere è già
    // applicato a schermo, quindi l'utente deve sapere che non è stato scritto.
    nota(overlay, `Carattere non salvato: ${e && e.message ? e.message : e}`, true);
  }
  zoomCorpo = scala;
  aggiornaZoom(overlay);
}

/** Popover «Conferme di lettura/recapito» (`ChunkOutlookTracking`, in uscita). */
function apriConferme(overlay) {
  const esistente = overlay.querySelector(".cmp-conf-pop");
  if (esistente) {
    esistente.remove();
    return;
  }
  const pop = document.createElement("div");
  pop.className = "cmp-conf-pop";
  pop.innerHTML =
    `<label class="ai-check"><input type="checkbox" id="cmp-conf-lettura"${overlay.__confermaLettura ? " checked" : ""}> ${fuga(ETICHETTE_CONFERME.lettura)}</label>` +
    `<label class="ai-check"><input type="checkbox" id="cmp-conf-recapito"${overlay.__confermaRecapito ? " checked" : ""}> ${fuga(ETICHETTE_CONFERME.recapito)}</label>` +
    `<p class="im-nota">Le intestazioni compaiono solo se richieste: <b>Disposition-Notification-To</b> per la lettura, <b>Return-Receipt-To</b> per il recapito.</p>`;
  overlay.querySelector(".compose-window").append(pop);
  pop.querySelector("#cmp-conf-lettura").addEventListener("change", (e) => {
    overlay.__confermaLettura = e.target.checked;
    aggiornaStatoI2(overlay);
  });
  pop.querySelector("#cmp-conf-recapito").addEventListener("change", (e) => {
    overlay.__confermaRecapito = e.target.checked;
    aggiornaStatoI2(overlay);
  });
}

/** Popover «Invia più tardi»: data e ora, con scorciatoie. */
function apriInviaPiuTardi(overlay) {
  const esistente = overlay.querySelector(".cmp-later-pop");
  if (esistente) {
    esistente.remove();
    return;
  }
  const predef = Math.floor((Date.now() + 2 * 3600 * 1000) / 1000);
  const pop = document.createElement("div");
  pop.className = "cmp-later-pop";
  pop.innerHTML =
    `<div class="cmp-prompt-titolo">Invia più tardi</div>` +
    `<label class="cmp-label" for="cmp-later-quando">Data e ora:</label>` +
    `<input type="datetime-local" id="cmp-later-quando" class="cmp-input" value="${valoreDatetimeLocal(predef)}" />` +
    `<div class="cmp-later-preset">` +
    `<button type="button" data-ore="2">Tra 2 ore</button>` +
    `<button type="button" data-ore="4">Tra 4 ore</button>` +
    `<button type="button" data-domani="1">Domani alle 9:00</button>` +
    `</div>` +
    `<p class="im-nota">Il messaggio resta in coda sul Mac e parte a quell'ora <b>mentre l'app è aperta</b>. Non è un invio lato server: se l'app è chiusa, parte alla riapertura.</p>` +
    `<div class="cmp-prompt-azioni">` +
    `<button type="button" class="cmp-prompt-ok" id="cmp-later-ok">Programma l'invio</button>` +
    `<button type="button" id="cmp-later-no">Annulla</button></div>` +
    `<div class="compose-esito" id="cmp-later-esito"></div>`;
  overlay.querySelector(".compose-window").append(pop);
  const campo = pop.querySelector("#cmp-later-quando");
  pop.querySelectorAll("[data-ore]").forEach((b) =>
    b.addEventListener("click", () => {
      const ore = Number(b.dataset.ore);
      campo.value = valoreDatetimeLocal(Math.floor((Date.now() + ore * 3600 * 1000) / 1000));
    }),
  );
  const bDomani = pop.querySelector("[data-domani]");
  if (bDomani) {
    bDomani.addEventListener("click", () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      campo.value = valoreDatetimeLocal(Math.floor(d.getTime() / 1000));
    });
  }
  pop.querySelector("#cmp-later-no").addEventListener("click", () => pop.remove());
  pop.querySelector("#cmp-later-ok").addEventListener("click", () => programmaInvio(overlay, pop, campo.value));
}

/** Programma l'invio con `onPianifica(campi, quando)`. Resta in coda sul Mac. */
async function programmaInvio(overlay, pop, valore) {
  const esito = pop.querySelector("#cmp-later-esito");
  const quando = epochDaDatetimeLocal(valore);
  if (quando == null || quando <= Math.floor(Date.now() / 1000)) {
    esito.textContent = "Scegli un'ora futura.";
    esito.classList.add("stato--errore");
    return;
  }
  const campi = leggiCampi(overlay);
  if (!campi.a || !campi.oggetto) {
    esito.textContent = "Servono destinatario e oggetto prima di programmare l'invio.";
    return;
  }
  const pianifica = (overlay.__composeOpzioni || {}).onPianifica || pianificaCb;
  if (typeof pianifica !== "function") {
    esito.textContent = "Invio programmato non collegato in questa prova.";
    return;
  }
  esito.textContent = "Programmazione…";
  try {
    const testo = await pianifica(campi, quando);
    overlay.__invioProgrammato = `Invio programmato ${etichettaRitardo(quando)} — richiede l'app aperta`;
    aggiornaStatoI2(overlay);
    pop.remove();
    nota(overlay, testo || `Invio programmato ${etichettaRitardo(quando)}.`, false);
  } catch (e) {
    esito.textContent = `Non programmato: ${e && e.message ? e.message : e}`;
  }
}

/**
 * Correzione automatica (blocco D): a ogni tasto, se il testo prima del cursore
 * finisce con una chiave scritta come parola intera, la sostituisce nel nodo di
 * testo in cui si sta scrivendo e riporta il cursore dopo la correzione. Agisce
 * solo sul nodo del cursore, quindi non tocca il markup né le altre parole.
 */
function applicaCorrezione(corpoEl) {
  if (!prefsComposizione.correzioneAutomaticaAttiva) return false;
  const regole = prefsComposizione.correzioneSostituzioni;
  if (!regole.length) return false;
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const node = sel.anchorNode;
  if (!node || node.nodeType !== 3 || !corpoEl.contains(node)) return false;
  const testo = node.textContent || "";
  const off = Math.min(sel.anchorOffset, testo.length);
  const prima = testo.slice(0, off);
  const r = sostituzioneDaApplicare(prima, regole);
  if (!r) return false;
  const nuovoPrima = `${prima.slice(0, prima.length - r.da.length)}${r.a}`;
  node.textContent = nuovoPrima + testo.slice(off);
  const range = document.createRange();
  range.setStart(node, nuovoPrima.length);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

/** Avvisa che il messaggio non è stato inviato, senza impedire la chiusura. */
function avvisoChiusura(overlay, onChiudi) {
  if (overlay.querySelector(".cmp-chiusura")) return;
  const n = (overlay.__allegati || []).length;
  const box = document.createElement("div");
  box.className = "cmp-chiusura";
  box.innerHTML =
    `<div class="cmp-prompt-box">` +
    `<div class="cmp-prompt-titolo">Chiudere il messaggio?</div>` +
    `<p>${
      n
        ? `Ci sono ${n} allegat${n === 1 ? "o" : "i"} e il messaggio non è stato inviato.`
        : "Il messaggio non è stato inviato."
    } Se chiudi, la bozza va persa.</p>` +
    `<div class="cmp-prompt-azioni">` +
    `<button type="button" data-chiusura="no">Continua a scrivere</button>` +
    `<button type="button" data-chiusura="si" class="cmp-prompt-ok">Chiudi senza inviare</button>` +
    `</div></div>`;
  overlay.append(box);
  box.querySelector('[data-chiusura="no"]').addEventListener("click", () => box.remove());
  box.querySelector('[data-chiusura="si"]').addEventListener("click", () => {
    box.remove();
    onChiudi();
  });
}

/**
 * Tiene la finestra trascinata dentro lo schermo: `pos` è lo scarto dal centro.
 * Resta sempre visibile la barra del titolo (40 px) e almeno `margine` px in
 * orizzontale, così la finestra si può riafferrare.
 */
export function limitaPosizioneFinestra(pos, finestra, vista, margine = 80) {
  const sinistra = (vista.w - finestra.w) / 2;
  const alto = (vista.h - finestra.h) / 2;
  const limita = (v, min, max) => Math.max(min, Math.min(max, v));
  return {
    x: limita(pos.x, margine - finestra.w - sinistra, vista.w - margine - sinistra),
    y: limita(pos.y, -alto, vista.h - 40 - alto),
  };
}

/** Trascinamento della finestra dalla barra del titolo (non dai suoi pulsanti). */
function collegaTrascinamento(overlay) {
  const finestra = overlay.querySelector(".compose-window");
  const barra = overlay.querySelector(".compose-titlebar");
  if (!finestra || !barra) return;
  let pos = { x: 0, y: 0 };
  barra.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    const partenza = { mx: e.clientX, my: e.clientY, ...pos };
    barra.classList.add("compose-titlebar--trascina");
    const muovi = (ev) => {
      const r = finestra.getBoundingClientRect();
      pos = limitaPosizioneFinestra(
        { x: partenza.x + ev.clientX - partenza.mx, y: partenza.y + ev.clientY - partenza.my },
        { w: r.width, h: r.height },
        { w: window.innerWidth, h: window.innerHeight },
      );
      finestra.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    };
    const rilascia = () => {
      document.removeEventListener("mousemove", muovi);
      document.removeEventListener("mouseup", rilascia);
      barra.classList.remove("compose-titlebar--trascina");
    };
    document.addEventListener("mousemove", muovi);
    document.addEventListener("mouseup", rilascia);
  });
}

/**
 * Apre la finestra di composizione sopra la vista principale.
 *
 * `opzioni`: `{ a, cc, oggetto, corpo, titolo, mittente, onInvia, onControllo }`.
 * `onInvia(campi)` è una funzione asincrona che riceve `{ a, cc, oggetto,
 * corpoTesto, corpoHtml, numeroAllegati }` e restituisce l'esito leggibile;
 * `onControllo(campi)` restituisce gli avvisi del controllo prima dell'invio.
 * Restituisce l'elemento del pannello.
 */
export function apriComposizione(opzioni = {}) {
  // "Stessa finestra" (default): una sola bozza per volta; aprirne una nuova
  // sostituisce quella aperta. "Nuova finestra": la bozza già aperta resta
  // aperta. La v1 ha una sola finestra di sistema, quindi le due bozze si
  // affiancano con un piccolo scarto (vedi CSS): è la differenza osservabile.
  if (!prefsComposizione.composizioneNuovaFinestra) {
    document.querySelectorAll(".compose-overlay").forEach((el) => el.remove());
  }

  const overlay = document.createElement("div");
  overlay.className = "compose-overlay";
  // Con "nuova finestra" una bozza già aperta resta: questa si affianca con uno
  // scarto, così si vede che sono due.
  if (prefsComposizione.composizioneNuovaFinestra && document.querySelector(".compose-overlay")) {
    overlay.classList.add("compose-overlay--nuova");
  }
  overlay.innerHTML = markup({
    a: opzioni.a || "",
    cc: opzioni.cc || "",
    ccn: opzioni.ccn || "",
    oggetto: opzioni.oggetto || "",
    corpo: opzioni.corpo || "",
    titolo: opzioni.titolo,
    mittente: opzioni.mittente,
    etichettaIA: opzioni.etichettaIA,
  });
  document.body.append(overlay);
  collegaTrascinamento(overlay);
  // Le opzioni restano legate alla finestra: servono a "Invia lo stesso".
  overlay.__composeOpzioni = opzioni;
  // Elenco degli allegati di questa finestra: {nome, mime, dimensione, contenuto(base64)}.
  overlay.__allegati = [];
  // Ultima immagine del corpo toccata: è quella che "Ritaglia" ritaglia.
  overlay.__immagineSel = null;
  // Blocco I2: conferme predefinite (dalle impostazioni) e stato (invio programmato).
  overlay.__confermaLettura = prefsComposizione.confermaLetturaDefault;
  overlay.__confermaRecapito = prefsComposizione.confermaRecapitoDefault;
  overlay.__invioProgrammato = null;

  const corpoEl = overlay.querySelector("#cmp-body");

  // Il corpo parte con la firma configurata (vuota di default). Il selettore
  // «Firma» sostituisce quella precedente senza duplicarla.
  // Corpo formattato + firma come blocco a sé: cambiare firma non tocca il resto.
  corpoEl.innerHTML = aHtml(opzioni.corpo || "");
  applicaFirmaAlCorpo(corpoEl, firmaConfigurata().trim(), fuga);
  overlay.__firmaTesto = firmaConfigurata().trim();
  corpoEl.focus();

  const firmaSel = overlay.querySelector("#cmp-firma-sel");
  if (firmaSel) {
    firmaSel.addEventListener("change", () => {
      const f = firmeCorrenti.find((x) => x.id === firmaSel.value);
      const nuova = f ? f.contenuto : "";
      // Si sostituisce solo il blocco della firma: il corpo formattato
      // (grassetti, elenchi, tabelle, immagini) resta com'è.
      applicaFirmaAlCorpo(corpoEl, nuova, fuga);
      overlay.__firmaTesto = nuova;
      svuotaControllo(overlay);
    });
  }

  /** Vero se non c'è nulla di scritto (nessun avviso di chiusura in quel caso). */
  const nullaScritto = () => {
    const campi = ["#cmp-a", "#cmp-cc", "#cmp-ccn", "#cmp-oggetto"].map((s) => {
      const el = overlay.querySelector(s);
      return el ? el.value.trim() : "";
    });
    return (
      !campi.some(Boolean) &&
      !corpoEl.innerText.trim() &&
      !(overlay.__allegati || []).length
    );
  };
  const chiudiSubito = () => {
    overlay.__immagini = null;
    overlay.__immagineSel = null;
    overlay.remove();
  };
  // Come Outlook: se c'è una bozza non inviata o degli allegati si avvisa, ma
  // chiudere resta possibile ("Chiudi senza inviare").
  const chiudi = () => {
    if (nullaScritto()) chiudiSubito();
    else avvisoChiusura(overlay, chiudiSubito);
  };

  // Scorciatoie come nel riferimento: Esc chiude, ⌘W chiude, ⌘↩ invia dal corpo,
  // ⌘S salva la bozza nella cartella «Bozze» (blocco I1).
  overlay.addEventListener("keydown", (e) => {
    // Blocco R: se un menu del carattere è aperto, l'Esc chiude quello e non la
    // finestra — chiudere il messaggio per togliersi un elenco di font davanti
    // sarebbe una sorpresa. Il menu resta comunque dentro l'overlay, quindi
    // sparisce anche quando è la finestra a chiudersi.
    if (e.key === "Escape" && chiudiMenuCarattere(overlay)) return;
    if (e.key === "Escape") chiudi();
    if (e.key === "w" && e.metaKey) chiudi();
    if (e.key === "Enter" && e.metaKey) invia(overlay, false);
    if (e.key === "s" && e.metaKey) {
      e.preventDefault();
      salvaBozza(overlay);
    }
  });
  // Un clic fuori dal menu lo chiude: le due caselle ne tengono uno alla volta e
  // non lo lasciano appeso mentre si scrive altrove. Il clic sulle caselle è
  // escluso perché è il loro stesso click a decidere (apre o richiude).
  overlay.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (t.closest && (t.closest(".cmp-menu") || t.closest("[data-font-menu]") || t.closest("[data-size-menu]"))) return;
    chiudiMenuCarattere(overlay);
  });
  // Clic sul velo scuro sotto la finestra: chiude (con l'eventuale avviso).
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) chiudi();
  });
  // La ✕ della barra del titolo passa dalla stessa `chiudi`: con una bozza non
  // inviata o allegati presenti scatta l'avviso «Chiudi senza inviare», come
  // per Esc e ⌘W — non si chiude di nascosto.
  overlay.querySelector(".win-close").addEventListener("click", chiudi);

  // Modificare i campi azzera gli avvisi e la conferma: il controllo ripeterà.
  for (const sel of ["#cmp-a", "#cmp-cc", "#cmp-ccn", "#cmp-oggetto", "#cmp-body"]) {
    const el = overlay.querySelector(sel);
    if (el) el.addEventListener("input", () => svuotaControllo(overlay));
  }

  // Completamento dei destinatari (blocco F): i campi A, Cc e Ccn mostrano i
  // suggerimenti dalla rubrica e dagli indirizzi già visti (frecce + Invio o
  // mouse). La funzione dei suggerimenti arriva da main.js.
  for (const sel of ["#cmp-a", "#cmp-cc", "#cmp-ccn"]) {
    const campo = overlay.querySelector(sel);
    if (campo) collegaCampoDestinatario(campo, { suggerire: suggerisciDestinatari, limite: limiteSuggerimenti });
  }

  // Correzione automatica (blocco D) mentre si scrive nel corpo.
  corpoEl.addEventListener("input", () => {
    if (applicaCorrezione(corpoEl)) svuotaControllo(overlay);
  });

  // Trascinare un file sulla finestra lo allega (comportamento di Outlook).
  overlay.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    overlay.classList.add("compose-overlay--drop");
  });
  overlay.addEventListener("dragleave", (e) => {
    if (e.target === overlay) overlay.classList.remove("compose-overlay--drop");
  });
  overlay.addEventListener("drop", (e) => {
    e.preventDefault();
    overlay.classList.remove("compose-overlay--drop");
    const files =
      e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) allegaFiles(overlay, files);
  });

  // Toccando un'immagine del corpo la si "seleziona": è quella che "Ritaglia"
  // ritaglia. Un clic altrove la deseleziona.
  corpoEl.addEventListener("click", (e) => {
    overlay.__immagineSel = e.target && e.target.tagName === "IMG" ? e.target : null;
  });

  // Gruppi del ribbon con azione.
  overlay.querySelectorAll("[data-act]").forEach((el) => {
    el.addEventListener("click", () => {
      const act = el.dataset.act;
      if (act === "invia") {
        invia(overlay, false);
      } else if (act === "allega") {
        allegaConDialogo(overlay);
      } else if (act === "collegamento") {
        inserisciCollegamento(overlay);
      } else if (act === "tabella") {
        inserisciTabella(overlay);
      } else if (act === "immagine") {
        inserisciImmagine(overlay);
      } else if (act === "ritaglia") {
        apriRitaglio(overlay);
      } else if (act === "firma") {
        // La firma si configura nel pannello Assistente IA (Impostazioni):
        // main.js collega la funzione che apre quel pannello.
        if (apriFirma) apriFirma();
        else nonDisponibile(overlay, "Configurazione della firma");
      } else if (act === "riunione") {
        apriRiunioneDaComposizione(overlay);
      } else if (act === "invia-piu-tardi") {
        apriInviaPiuTardi(overlay);
      } else if (act === "conferme") {
        apriConferme(overlay);
      } else {
        nonDisponibile(overlay, el.dataset.lb || "Questa funzione");
      }
    });
  });

  // Controlli di formattazione (grassetto, corsivo, sottolineato, elenchi):
  // `mousedown` non ruba il fuoco al corpo, così la selezione resta e il comando
  // agisce sul testo scelto (vedi nota su `execCommand`).
  overlay.querySelectorAll("[data-cmd]").forEach((el) => {
    el.addEventListener("mousedown", (e) => e.preventDefault());
    el.addEventListener("click", () => eseguiComando(overlay, el.dataset.cmd));
  });

  // Blocco I2: i quattro comandi di formattazione estesa e lo zoom.
  overlay.querySelectorAll("[data-cmd2]").forEach((el) => {
    el.addEventListener("mousedown", (e) => e.preventDefault());
    el.addEventListener("click", () =>
      applicaFormattazione(overlay, el.dataset.cmd2, COLORI_EVIDENZIAZIONE[0].valore),
    );
  });
  overlay.querySelectorAll("[data-zoom]").forEach((el) => {
    el.addEventListener("mousedown", (e) => e.preventDefault());
    el.addEventListener("click", () => cambiaZoom(overlay, el.dataset.zoom === "dentro" ? 10 : -10));
  });

  // Blocco R: la casella della famiglia e quella della dimensione aprono il
  // proprio menu. Un secondo clic sulla stessa casella lo richiude, come gli
  // altri popover del ribbon; `apriMenu*` chiude comunque quello già aperto,
  // così non se ne vedono mai due.
  overlay.querySelectorAll("[data-font-menu]").forEach((el) => {
    el.addEventListener("click", () => {
      if (overlay.querySelector('[data-menu-carattere="carattere"]')) {
        chiudiMenuCarattere(overlay);
        return;
      }
      apriMenuCarattere(overlay, el);
    });
  });
  overlay.querySelectorAll("[data-size-menu]").forEach((el) => {
    el.addEventListener("click", () => {
      if (overlay.querySelector('[data-menu-carattere="dimensione"]')) {
        chiudiMenuCarattere(overlay);
        return;
      }
      apriMenuDimensione(overlay, el);
    });
  });

  aggiornaStatoI2(overlay);
  return overlay;
}

/**
 * Salva la bozza corrente con `onSalvaBozza(campi)` (blocco I1): l'APPEND in
 * «Bozze» con il flag `\Draft`. Non invia nulla e non chiude la finestra: la
 * bozza resta aperta. Se la funzione non è collegata lo dichiara.
 */
async function salvaBozza(overlay) {
  const opzioni = overlay.__composeOpzioni || {};
  const salva = opzioni.onSalvaBozza || salvaBozzaCb;
  if (typeof salva !== "function") {
    nota(overlay, "Salva come bozza non è collegato in questa prova.", true);
    return;
  }
  const campi = leggiCampi(overlay);
  nota(overlay, "Salvataggio della bozza…", false);
  try {
    const esito = await salva(campi);
    nota(overlay, esito || "Bozza salvata.", false);
  } catch (err) {
    nota(overlay, `Bozza non salvata: ${err && err.message ? err.message : err}`, true);
  }
}

/**
 * Valida i campi (destinatario presente e oggetto non vuoto, come il kernel),
 * esegue il controllo prima dell'invio e delega l'invio a `onInvia`.
 *
 * `forza` vero salta il controllo: è la conferma esplicita ("Invia lo stesso")
 * dopo che gli avvisi sono già stati mostrati. **Il controllo non blocca mai**:
 * al primo clic con avvisi non si invia, si mostrano gli avvisi; il secondo clic
 * invia.
 */
async function invia(overlay, forza) {
  const opzioni = overlay.__composeOpzioni || {};
  const campi = leggiCampi(overlay);
  if (!campi.a) {
    nota(overlay, "Destinatario mancante: indicare almeno un indirizzo nel campo A:.", true);
    return;
  }
  if (!campi.oggetto) {
    nota(overlay, "Oggetto mancante: scrivere un oggetto prima di inviare.", true);
    return;
  }

  // Controllo prima dell'invio: avvisa ma non blocca.
  if (!forza) {
    const avvisi = await eseguiControllo(overlay, opzioni.onControllo);
    if (avvisi.length) {
      nota(
        overlay,
        "Controllo completato: vedi gli avvisi. Clicca di nuovo Invia (o \"Invia lo stesso\") per inviare comunque.",
        false,
      );
      return;
    }
  } else {
    svuotaControllo(overlay);
  }

  // Il solo comando di invio è la voce "Invia" del ribbon, come nel riferimento.
  const bottone = overlay.querySelector('[data-act="invia"]');
  if (bottone) bottone.classList.add("rb--in-attesa");
  nota(overlay, "Invio in corso…", false);
  try {
    const esito = await opzioni.onInvia(campi);
    nota(overlay, esito || "Messaggio inviato.", false);
    // A invio riuscito la finestra si chiude da sola dopo un momento.
    setTimeout(() => overlay.remove(), 900);
  } catch (err) {
    nota(overlay, `Invio non riuscito: ${err && err.message ? err.message : err}`, true);
    if (bottone) bottone.classList.remove("rb--in-attesa");
  }
}
