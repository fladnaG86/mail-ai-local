/**
 * Blocco I2 — vista, ricerca avanzata, formattazione, invio programmato,
 * conferme di lettura/recapito e i pannelli «Scelte rapide da tastiera» e
 * «Impostazioni personali».
 *
 * Come gli altri moduli delle viste, ha due parti ben separate:
 * - le funzioni PURE (ordinamento della lista, costruzione della query avanzata,
 *   etichette del ritardo, stile dello zoom, markup della formattazione): le
 *   collaudano i test `node:test`, senza DOM e senza kernel;
 * - i pezzi di interfaccia (menu «Ordina per»/«Densità», modulo della ricerca
 *   avanzata, barra della conferma, i due pannelli delle impostazioni).
 *
 * Etichette del riferimento, usate alla lettera: `Ordina per`, `Compatta`,
 * `Accogliente`, `Spaziosa`, `Barrato`, `Cancella formattazione`,
 * `Testo normale`, `Colore evidenziazione carattere`, `Invia più tardi`,
 * `Richiedi conferma di lettura`, `Richiedi conferma di recapito`.
 */

import { rendiSpostabile } from "./finestre.js";
import { apriMenu, fugaHtml } from "./mail-actions.js";

// ---------------------------------------------------------------------------
// Funzioni PURE
// ---------------------------------------------------------------------------

/** Campi di «Ordina per», con le etichette del riferimento. */
export const ORDINAMENTI = [
  { id: "data", etichetta: "Data" },
  { id: "mittente", etichetta: "Mittente" },
  { id: "oggetto", etichetta: "Oggetto" },
  { id: "dimensione", etichetta: "Dimensione" },
];

/** Versi dell'ordinamento. */
export const VERSI = [
  { id: "crescente", etichetta: "Crescente" },
  { id: "discendente", etichetta: "Discendente" },
];

/** Densità di visualizzazione della lista, con le etichette del riferimento. */
export const DENSITA_LISTA = [
  { id: "compatta", etichetta: "Compatta" },
  { id: "accogliente", etichetta: "Accogliente" },
  { id: "spaziosa", etichetta: "Spaziosa" },
];

/** Etichetta di un campo di ordinamento (fallback: il primo). */
export function etichettaOrdinamento(id) {
  const v = ORDINAMENTI.find((x) => x.id === id);
  return v ? v.etichetta : ORDINAMENTI[0].etichetta;
}

/** Etichetta di un verso (fallback: discendente). */
export function etichettaVerso(id) {
  const v = VERSI.find((x) => x.id === id);
  return v ? v.etichetta : "Discendente";
}

/** Etichetta di una densità (fallback: accogliente). */
export function etichettaDensita(id) {
  const v = DENSITA_LISTA.find((x) => x.id === id);
  return v ? v.etichetta : "Accogliente";
}

/** Campi di «Colore evidenziazione carattere», nell'ordine del riferimento. */
export const COLORI_EVIDENZIAZIONE = [
  { etichetta: "Giallo", valore: "#ffff00" },
  { etichetta: "Verde", valore: "#00ff00" },
  { etichetta: "Turchese", valore: "#00ffff" },
  { etichetta: "Rosa", valore: "#ff99ff" },
  { etichetta: "Nessuno", valore: "" },
];

/**
 * Vero se `nodo` (dentro `radice`, il corpo del messaggio) è evidenziato: il
 * primo antenato con uno sfondo dichiarato decide, così uno sfondo trasparente
 * più interno annulla quello colorato esterno. Serve a 🖍 per fare da
 * interruttore: sul testo evidenziato toglie, altrove mette.
 */
export function evidenziazioneAttiva(nodo, radice) {
  return !!elementoEvidenziato(nodo, radice);
}

/** L'antenato di `nodo` che lo evidenzia (vedi `evidenziazioneAttiva`), o null. */
function elementoEvidenziato(nodo, radice) {
  let el = nodo && nodo.nodeType === 1 ? nodo : nodo && nodo.parentElement;
  while (el && el !== radice && radice && radice.contains(el)) {
    if (el.tagName === "MARK") return el;
    const sfondo = (el.style && el.style.backgroundColor) || "";
    if (sfondo) return /^(transparent|initial|inherit|rgba\(0,\s*0,\s*0,\s*0\))$/i.test(sfondo.trim()) ? null : el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Col cursore (nessuna selezione) dentro il testo evidenziato, porta il cursore
 * fuori dall'evidenziazione: spezza l'elemento evidenziato nel punto del cursore
 * e mette il cursore fra le due metà, così il testo scritto dopo non è più
 * evidenziato e quello già scritto resta com'era. `hiliteColor transparent` da
 * solo non basta: il motore di editing riporta il cursore dentro lo span. Per
 * lo stesso motivo il cursore sta dopo uno spazio a larghezza zero (U+200B) in
 * un nodo di testo suo. Vero se ha agito.
 */
export function esciDallEvidenziazione(selezione, radice) {
  if (!selezione || !selezione.rangeCount || !selezione.isCollapsed) return false;
  const evidenziato = elementoEvidenziato(selezione.anchorNode, radice);
  if (!evidenziato) return false;
  const doc = evidenziato.ownerDocument;
  const punto = selezione.getRangeAt(0);
  // La parte dopo il cursore va in una copia dell'elemento, subito dopo.
  const coda = doc.createRange();
  coda.setStart(punto.startContainer, punto.startOffset);
  coda.setEndAfter(evidenziato.lastChild || evidenziato);
  const resto = coda.extractContents();
  if (resto.textContent) {
    const seconda = evidenziato.cloneNode(false);
    seconda.append(resto);
    evidenziato.after(seconda);
  }
  const libero = doc.createTextNode("​");
  evidenziato.after(libero);
  const cursore = doc.createRange();
  cursore.setStart(libero, 1);
  cursore.collapse(true);
  selezione.removeAllRanges();
  selezione.addRange(cursore);
  return true;
}

/** Dimensione approssimata di un messaggio per l'ordinamento per dimensione. */
export function dimensioneDi(m) {
  if (!m) return 0;
  if (typeof m.dimensione === "number") return m.dimensione;
  if (typeof m.size === "number") return m.size;
  const corpo = Array.isArray(m.body) ? m.body.join(" ") : m.body || m.anteprima || "";
  return String(corpo).length + (m.has_attachments ? 1000000 : 0);
}

/** Vero se il campo è uno dei quattro ammessi. */
export function ordinamentoValido(campo) {
  return ORDINAMENTI.some((x) => x.id === campo);
}

/**
 * Ordina un elenco di messaggi secondo campo e verso (blocco I2). Non muta
 * l'originale. I campi non riconosciuti ricadono su «data»; i versi non
 * riconosciuti su «discendente», come nel kernel.
 */
export function ordinaMessaggi(lista, campo = "data", verso = "discendente") {
  const campoEff = ordinamentoValido(campo) ? campo : "data";
  const versoEff = verso === "crescente" ? 1 : -1;
  const chiave = {
    data: (m) => (typeof m.timestamp === "number" ? m.timestamp : 0),
    mittente: (m) => String((m.from || "").toLowerCase()),
    oggetto: (m) => String((m.subject || "").toLowerCase()),
    dimensione: (m) => dimensioneDi(m),
  }[campoEff];
  return (lista || [])
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ka = chiave(a.m);
      const kb = chiave(b.m);
      let esito = 0;
      if (typeof ka === "number" && typeof kb === "number") esito = ka - kb;
      else esito = String(ka).localeCompare(String(kb), "it");
      if (esito !== 0) return esito * versoEff;
      return a.i - b.i; // ordinamento stabile
    })
    .map((x) => x.m);
}

const DUE = (n) => String(n).padStart(2, "0");

/** Data `AAAA-MM-GG` da un valore `datetime-local` o da secondi epoch. */
function partiData(quando) {
  const d = typeof quando === "number" ? new Date(quando * 1000) : new Date(quando);
  return d;
}

/**
 * Etichetta leggibile di un invio programmato, rapportata ad «adesso» (ms):
 * «tra 2 ore», «tra 15 minuti», «domani alle 9:00», «oggi alle 18:00»,
 * «lun 12/10 alle 08:30». Pura: l'ora è un parametro.
 */
export function etichettaRitardo(quandoEpoch, adessoMs = Date.now()) {
  const d = partiData(quandoEpoch);
  const adesso = new Date(adessoMs);
  const minuti = Math.round((d.getTime() - adesso.getTime()) / 60000);
  if (minuti < 0) return "in ritardo";
  if (minuti < 1) return "adesso";
  if (minuti < 60) return `tra ${minuti} minut${minuti === 1 ? "o" : "i"}`;
  const ore = Math.round(minuti / 60);
  const stessoGiorno =
    d.getFullYear() === adesso.getFullYear() &&
    d.getMonth() === adesso.getMonth() &&
    d.getDate() === adesso.getDate();
  const ora = `${DUE(d.getHours())}:${DUE(d.getMinutes())}`;
  if (minuti <= 180) return `tra ${ore} or${ore === 1 ? "a" : "e"}`;
  const domani = new Date(adesso);
  domani.setDate(domani.getDate() + 1);
  const eDomani =
    d.getFullYear() === domani.getFullYear() &&
    d.getMonth() === domani.getMonth() &&
    d.getDate() === domani.getDate();
  if (stessoGiorno) return `oggi alle ${ora}`;
  if (eDomani) return `domani alle ${ora}`;
  const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  return `${GIORNI[d.getDay()]} ${DUE(d.getDate())}/${DUE(d.getMonth() + 1)} alle ${ora}`;
}

/** Stile CSS dello zoom del corpo: `font-size: Npx` (percentuale limitata). */
export function stileZoom(percent, basePx) {
  const p = Math.min(400, Math.max(50, Number(percent) || 100));
  return `font-size: ${Math.round((basePx * p) / 100)}px`;
}

/** Valore `datetime-local` (`AAAA-MM-GGTHH:MM`) da secondi epoch. */
export function valoreDatetimeLocal(quandoEpoch) {
  const d = partiData(quandoEpoch);
  return `${d.getFullYear()}-${DUE(d.getMonth() + 1)}-${DUE(d.getDate())}T${DUE(d.getHours())}:${DUE(d.getMinutes())}`;
}

/** Secondi epoch da un valore `datetime-local`. `null` se non è una data valida. */
export function epochDaDatetimeLocal(valore) {
  if (!valore) return null;
  const ms = new Date(valore).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

/** Fuga dei caratteri HTML (come nel resto dell'interfaccia). */
export function fuga(s) {
  return fugaHtml(s);
}

/**
 * Costruisce la query per il motore FTS5 dai campi del modulo «Ricerca
 * avanzata…». È lo stesso linguaggio a prefissi che il kernel sa leggere
 * (`da:`, `oggetto:`, `a:`, `con:allegato`/`senza:allegato`, `non:letto`,
 * `dopo:`/`prima:`), quindi il motore resta uno solo.
 */
export function costruisciQueryAvanzata(campi = {}) {
  const parti = [];
  const pulito = (v) => String(v == null ? "" : v).trim().replace(/\s+/g, " ");
  const da = pulito(campi.da);
  if (da) parti.push(`da:${da}`);
  const oggetto = pulito(campi.oggetto);
  if (oggetto) parti.push(`oggetto:${oggetto}`);
  const a = pulito(campi.a);
  if (a) parti.push(`a:${a}`);
  if (campi.conAllegato === true) parti.push("con:allegato");
  else if (campi.conAllegato === false) parti.push("senza:allegato");
  if (campi.nonLetti) parti.push("non:letto");
  if (dataValida(campi.periodoDa)) parti.push(`dopo:${pulito(campi.periodoDa)}`);
  if (dataValida(campi.periodoA)) parti.push(`prima:${pulito(campi.periodoA)}`);
  return parti.join(" ");
}

/** Vero se la stringa è una data `AAAA-MM-GG` (o con `THH:MM`). */
export function dataValida(s) {
  const v = String(s == null ? "" : s).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2})?)?$/.exec(v);
  if (!m) return false;
  const mese = Number(m[2]);
  const giorno = Number(m[3]);
  return mese >= 1 && mese <= 12 && giorno >= 1 && giorno <= 31;
}

/**
 * Markup HTML di un comando di formattazione, applicato al testo (o alla
 * selezione). È lo specchio puro dell'omonima funzione Rust (`composizione.rs`):
 * l'interfaccia lo inserisce nel `contenteditable` con `insertHTML`, **senza mai
 * riscrivere `innerHTML` da `innerText`**.
 */
export function markupFormattazione(comando, testo, colore) {
  const t = fuga(testo);
  switch (comando) {
    case "barrato":
      return `<s>${t}</s>`;
    case "testo_normale":
      return `<span style="font-family: inherit; font-size: inherit">${t}</span>`;
    case "cancella_formattazione":
      return t;
    case "evidenzia": {
      const c = String(colore == null ? "" : colore).trim();
      return c ? `<span style="background-color: ${fuga(c)}">${t}</span>` : t;
    }
    default:
      return null;
  }
}

/**
 * Scorciatoie da tastiera effettivamente attive nel programma, ricavate dai
 * gestori `keydown` presenti in `src/main.js` e in `src/views/compose.js`. Le
 * stesse voci sono dichiarate nel kernel (`scelte_rapide`): il pannello le
 * mostra, non le inventa.
 */
export const SCORCIATOIE = [
  { tasti: "⌘ ,", azione: "Apri le Impostazioni", contesto: "Finestra principale" },
  { tasti: "Esc", azione: "Chiudi la ricerca in corso", contesto: "Campo Cerca" },
  { tasti: "Invio", azione: "Esegui la ricerca subito", contesto: "Campo Cerca" },
  { tasti: "⌘ ↩", azione: "Invia il messaggio dal corpo", contesto: "Composizione" },
  { tasti: "⌘ S", azione: "Salva come bozza (cartella Bozze)", contesto: "Composizione" },
  { tasti: "⌘ W", azione: "Chiudi la finestra di composizione", contesto: "Composizione" },
  { tasti: "Esc", azione: "Chiudi la composizione", contesto: "Composizione" },
  { tasti: "↑ ↓", azione: "Scegli un suggerimento fra i destinatari", contesto: "Composizione · A/Cc/Ccn" },
  { tasti: "Invio", azione: "Conferma il suggerimento selezionato", contesto: "Composizione · A/Cc/Ccn" },
];

/** Applica una densità come attributo sul contenitore della lista. */
export function classeDensita(id) {
  const d = DENSITA_LISTA.some((x) => x.id === id) ? id : "accogliente";
  return `lista--${d}`;
}

/** Testo delle due conferme, con l'esito richiesto dal riferimento. */
export const ETICHETTE_CONFERME = {
  lettura: "Richiedi conferma di lettura",
  recapito: "Richiedi conferma di recapito",
  invia: "Invia la conferma",
  nonInviare: "Non inviare",
  barra: "Il mittente ha chiesto una conferma",
};

/** Vero se il messaggio in arrivo chiede almeno una conferma. */
export function chiedeConferma(stato) {
  return !!(stato && (stato.lettura || stato.recapito));
}

// ---------------------------------------------------------------------------
// Interfaccia — menu della lista principale
// ---------------------------------------------------------------------------

/** Menu «Ordina per»: campo e verso in un unico menù, con la voce attiva. */
export function apriMenuOrdina(ancora, { campo, verso, onScegli }) {
  const voci = [];
  for (const o of ORDINAMENTI) {
    voci.push({ id: `campo:${o.id}`, etichetta: o.etichetta, ic: "⇅", attivo: o.id === campo });
  }
  voci.push({ sep: true });
  for (const v of VERSI) {
    voci.push({ id: `verso:${v.id}`, etichetta: v.etichetta, ic: "↕", attivo: v.id === verso });
  }
  return apriMenu(ancora, voci, (v) => {
    const [tipo, valore] = v.id.split(":");
    onScegli(tipo === "campo" ? { campo: valore } : { verso: valore });
  });
}

/** Menu «Densità di visualizzazione»: Compatta · Accogliente · Spaziosa. */
export function apriMenuDensita(ancora, { densita, onScegli }) {
  const voci = DENSITA_LISTA.map((d) => ({
    id: d.id,
    etichetta: d.etichetta,
    ic: "☰",
    attivo: d.id === densita,
  }));
  return apriMenu(ancora, voci, (v) => onScegli(v.id));
}

/** Applica la densità: un attributo sul contenitore, non un ridisegno dell'app. */
export function applicaDensita(contenitore, id) {
  if (!contenitore) return;
  contenitore.dataset.densita = DENSITA_LISTA.some((x) => x.id === id) ? id : "accogliente";
}

// ---------------------------------------------------------------------------
// Interfaccia — modulo «Ricerca avanzata…»
// ---------------------------------------------------------------------------

/** Apri il modulo della ricerca avanzata. `onCerca(query)` riceve la query. */
export function apriModuloRicercaAvanzata(opzioni = {}) {
  document.querySelectorAll(".i2-ricerca-overlay").forEach((el) => el.remove());
  const overlay = document.createElement("div");
  overlay.className = "i2-ricerca-overlay compose-overlay";
  overlay.innerHTML = `
    <div class="i2-ricerca-win" role="dialog" aria-label="Ricerca avanzata">
      <header class="compose-titlebar">
        ${PULSANTE_CHIUDI}
        <span class="compose-tb-title">Ricerca avanzata</span>
      </header>
      <div class="i2-ricerca-campi">
        <div class="cmp-row"><label class="cmp-label" for="i2-da">Da:</label>
          <input class="cmp-input" id="i2-da" type="text" autocomplete="off" /></div>
        <div class="cmp-row"><label class="cmp-label" for="i2-ogg">Oggetto:</label>
          <input class="cmp-input" id="i2-ogg" type="text" autocomplete="off" /></div>
        <div class="cmp-row"><label class="cmp-label" for="i2-a">A:</label>
          <input class="cmp-input" id="i2-a" type="text" autocomplete="off" /></div>
        <div class="cmp-row"><label class="cmp-label" for="i2-alle">Con allegato:</label>
          <select class="cmp-input" id="i2-alle">
            <option value="">Non specificato</option>
            <option value="si">Sì</option>
            <option value="no">No</option>
          </select></div>
        <label class="ai-check"><input type="checkbox" id="i2-nonletti"> Solo i messaggi non letti</label>
        <div class="cmp-row"><label class="cmp-label" for="i2-periodo-da">Periodo da:</label>
          <input class="cmp-input" id="i2-periodo-da" type="date" /></div>
        <div class="cmp-row"><label class="cmp-label" for="i2-periodo-a">a:</label>
          <input class="cmp-input" id="i2-periodo-a" type="date" /></div>
      </div>
      <div class="i2-ricerca-azioni">
        <button type="button" class="cmp-cont-lostesso" id="i2-cerca">Cerca</button>
        <button type="button" class="i2-annulla" id="i2-chiudi">Annulla</button>
      </div>
      <div class="compose-esito" id="i2-esito" role="status"></div>
    </div>`;
  document.body.append(overlay);
  rendiSpostabile(overlay);

  const campo = (id) => overlay.querySelector(`#${id}`);
  const chiudi = () => overlay.remove();
  overlay.querySelector(".win-close").addEventListener("click", chiudi);
  const esegui = () => {
    const campi = {
      da: campo("i2-da").value,
      oggetto: campo("i2-ogg").value,
      a: campo("i2-a").value,
      conAllegato: campo("i2-alle").value === "si" ? true : campo("i2-alle").value === "no" ? false : null,
      nonLetti: campo("i2-nonletti").checked,
      periodoDa: campo("i2-periodo-da").value,
      periodoA: campo("i2-periodo-a").value,
    };
    const query = costruisciQueryAvanzata(campi);
    if (!query) {
      overlay.querySelector("#i2-esito").textContent = "Scegli almeno un criterio di ricerca.";
      return;
    }
    chiudi();
    if (typeof opzioni.onCerca === "function") opzioni.onCerca(query);
  };
  overlay.querySelector("#i2-cerca").addEventListener("click", esegui);
  overlay.querySelector("#i2-chiudi").addEventListener("click", chiudi);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) chiudi();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") chiudi();
    if (e.key === "Enter" && e.target.tagName === "INPUT") esegui();
  });
  overlay.querySelector("#i2-da").focus();
  return overlay;
}

// ---------------------------------------------------------------------------
// Interfaccia — barra della conferma di lettura/recapito (arrivo)
// ---------------------------------------------------------------------------

/**
 * Barra discreta in cima al messaggio aperto quando il mittente ha chiesto una
 * conferma. Mostra i pulsanti «Invia la conferma» / «Non inviare»; se la scelta
 * è già registrata lo dichiara. Nessuna conferma parte da sé.
 */
export function barraConferma(readingEl, stato, opzioni = {}) {
  if (!readingEl) return null;
  const esistente = readingEl.querySelector(".i2-conferma");
  if (esistente) esistente.remove();
  if (!chiedeConferma(stato)) return null;

  const tipi = [];
  if (stato.lettura) tipi.push({ tipo: "lettura", etichetta: "conferma di lettura" });
  if (stato.recapito) tipi.push({ tipo: "recapito", etichetta: "conferma di recapito" });

  const barra = document.createElement("div");
  barra.className = "i2-conferma info-bar";
  const giàScelte = tipi.every((t) =>
    t.tipo === "lettura" ? stato.letturaInviata != null : stato.recapitoInviata != null,
  );
  const testo = tipi.map((t) => t.etichetta).join(" e ");
  if (giàScelte) {
    const esiti = tipi
      .map((t) => {
        const v = t.tipo === "lettura" ? stato.letturaInviata : stato.recapitoInviata;
        return `${t.etichetta}: ${v ? "inviata" : "non inviata"}`;
      })
      .join(" · ");
    barra.innerHTML = `<span>${fugaHtml(ETICHETTE_CONFERME.barra)} — ${fugaHtml(esiti)}.</span>`;
  } else {
    barra.innerHTML =
      `<span>${fugaHtml(ETICHETTE_CONFERME.barra)} (${fugaHtml(testo)}).</span>` +
      `<button type="button" class="i2-conf-invia">${fugaHtml(ETICHETTE_CONFERME.invia)}</button>` +
      `<button type="button" class="i2-conf-no">${fugaHtml(ETICHETTE_CONFERME.nonInviare)}</button>`;
    const rispondi = (invia) => {
      const primo = tipi.find((t) =>
        t.tipo === "lettura" ? stato.letturaInviata == null : stato.recapitoInviata == null,
      );
      if (primo && typeof opzioni.onRispondi === "function") {
        opzioni.onRispondi(primo.tipo, invia);
      }
    };
    barra.querySelector(".i2-conf-invia").addEventListener("click", () => rispondi(true));
    barra.querySelector(".i2-conf-no").addEventListener("click", () => rispondi(false));
  }
  // In cima al pannello di lettura, sotto la barra dell'assistente.
  readingEl.prepend(barra);
  return barra;
}

// ---------------------------------------------------------------------------
// Interfaccia — pannelli delle impostazioni mancanti
// ---------------------------------------------------------------------------

/**
 * Il pulsante di chiusura di una finestra interna, in testa alla barra del
 * titolo (dove stavano i pallini finti dei semafori, rimossi). I semafori veri
 * sono quelli nativi della finestra di sistema: qui serve un segno visibile di
 * come si chiude la finestra interna. Un'unica stringa per tutte le finestre,
 * così il disegno non diverge; ogni finestra lo collega alla propria `chiudi`.
 */
export const PULSANTE_CHIUDI =
  '<button type="button" class="win-close" data-chiudi="1" title="Chiudi" aria-label="Chiudi">✕</button>';

export function chromePannello(titolo, contenuto) {
  return `
    <div class="ai-settings-win mail-settings-win" role="dialog" aria-label="${fuga(titolo)}">
      <header class="settings-titlebar">
        ${PULSANTE_CHIUDI}
        <span class="settings-title">${fuga(titolo)}</span>
        <button type="button" class="settings-showall">Mostra tutte</button>
      </header>
      <div class="settings-body">${contenuto}</div>
      <div class="settings-nota" role="status" aria-live="polite"></div>
    </div>`;
}

export function apriOverlayPannello(titolo, contenuto, opzioni) {
  document.querySelectorAll(".mail-settings-overlay").forEach((el) => el.remove());
  const overlay = document.createElement("div");
  overlay.className = "mail-settings-overlay";
  overlay.innerHTML = chromePannello(titolo, contenuto);
  document.body.append(overlay);
  rendiSpostabile(overlay);
  const notaEl = overlay.querySelector(".settings-nota");
  const nota = (t, err) => {
    notaEl.textContent = t || "";
    notaEl.classList.toggle("settings-nota--errore", !!err);
  };
  const chiudi = () => overlay.remove();
  // La ✕ della barra del titolo passa dalla stessa `chiudi` di Esc e del clic
  // sul velo: un solo modo di chiudere, nessuna via parallela.
  overlay.querySelector(".win-close").addEventListener("click", chiudi);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) chiudi();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") chiudi();
  });
  const mostraTutte = overlay.querySelector(".settings-showall");
  if (mostraTutte) {
    mostraTutte.addEventListener("click", () => {
      chiudi();
      if (typeof opzioni.onMostraTutte === "function") opzioni.onMostraTutte();
    });
  }
  return { overlay, nota, chiudi };
}

/**
 * Pannello «Scelte rapide da tastiera»: l'elenco delle scorciatoie davvero
 * attive. `opzioni.scorciatoie` è l'elenco (dal kernel o quello predefinito).
 */
export function apriPannelloScelteRapide(opzioni = {}) {
  const elenco = Array.isArray(opzioni.scorciatoie) && opzioni.scorciatoie.length
    ? opzioni.scorciatoie
    : SCORCIATOIE;
  const righe = elenco
    .map(
      (s) =>
        `<div class="i2-scorciatoia"><span class="i2-tasti">${fuga(s.tasti)}</span>` +
        `<span class="i2-azione">${fuga(s.azione)}</span>` +
        `<span class="i2-contesto">${fuga(s.contesto)}</span></div>`,
    )
    .join("");
  const contenuto = `
    <div class="settings-sec">Scelte rapide da tastiera</div>
    <div class="settings-hr"></div>
    <p class="im-nota">Sono le scorciatoie effettivamente attive in questa versione. L'elenco è ricavato dai comandi presenti nel programma: nulla è elencato che non funzioni.</p>
    <div class="i2-scorciatoie">${righe}</div>`;
  const p = apriOverlayPannello("Scelte rapide da tastiera", contenuto, opzioni);
  return p.overlay;
}

/**
 * Pannello «Impostazioni personali»: nome, iniziali, indirizzo di risposta
 * predefinito. **L'immagine del profilo non compare**: in un client IMAP non ha
 * alcun effetto osservabile, quindi non la si mostra (non si finge).
 *
 * L'indirizzo di risposta finisce nel campo `Reply-To` dei messaggi in uscita;
 * nome e iniziali vestono il mittente mostrato nel pannello di lettura.
 */
export function apriPannelloPersonali(opzioni = {}) {
  const prefs = opzioni.preferenze || {};
  const p = apriOverlayPannello(
    "Impostazioni personali",
    `<div class="settings-sec">Identità</div>
     <div class="settings-hr"></div>
     <div class="settings-grid">
       <div class="settings-lbl">Nome:</div>
       <input class="settings-fld" type="text" id="i2-nome" autocomplete="off" value="${fuga(prefs.personaliNome || "")}" />
       <div class="settings-lbl">Iniziali:</div>
       <input class="settings-fld settings-fld--num" type="text" id="i2-iniziali" maxlength="3" autocomplete="off" value="${fuga(prefs.personaliIniziali || "")}" />
     </div>
     <div class="settings-sec">Risposta</div>
     <div class="settings-hr"></div>
     <div class="settings-grid">
       <div class="settings-lbl">Indirizzo di risposta:</div>
       <input class="settings-fld" type="text" id="i2-risposta" autocomplete="off" value="${fuga(prefs.rispostaPredefinita || "")}" />
     </div>
     <p class="im-nota">L'indirizzo di risposta predefinito entra nel campo <b>Reply-To</b> dei messaggi in uscita. Vuoto = nessuna intestazione.</p>
     <p class="im-nota">L'immagine del profilo non è disponibile: in un client IMAP locale non avrebbe alcun effetto osservabile, quindi non viene mostrata.</p>
     <div class="ai-avvia-riga">
       <button type="button" class="ai-btn2" id="i2-salva-personali">Salva</button>
     </div>`,
    opzioni,
  );
  const q = (id) => p.overlay.querySelector(`#${id}`);
  q("i2-salva-personali").addEventListener("click", async () => {
    const nuove = {
      personaliNome: q("i2-nome").value.trim(),
      personaliIniziali: q("i2-iniziali").value.trim().slice(0, 3).toUpperCase(),
      rispostaPredefinita: q("i2-risposta").value.trim(),
    };
    q("i2-iniziali").value = nuove.personaliIniziali;
    if (typeof opzioni.onApplica === "function") {
      opzioni.onApplica(Object.assign({}, opzioni.preferenze, nuove));
    }
    if (typeof opzioni.onSalva !== "function") {
      p.nota("Salvato (prova visiva: nessun file scritto).");
      return;
    }
    try {
      const esito = await opzioni.onSalva({
        theme: typeof opzioni.getTema === "function" ? opzioni.getTema() : "system",
        preferenze: Object.assign({}, opzioni.preferenze, nuove),
      });
      p.nota(esito || "Salvato.");
    } catch (e) {
      p.nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  });
  return p.overlay;
}
