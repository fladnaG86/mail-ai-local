/**
 * Ricerca (blocco B): il comportamento del campo "Cerca" in alto a destra.
 *
 * Due parti, tenute separate:
 * - le funzioni PURE — interpretazione dei prefissi in stile Outlook, anteprima
 *   attorno alla corrispondenza, ricerca sui dati in memoria (percorso browser),
 *   evidenziazione del termine e testo dell'intestazione dei risultati. Le
 *   usano `renderRisultati`, `src/main.js` e i test `node:test`, senza DOM;
 * - il disegno dei risultati nell'area della lista (`renderRisultati`).
 *
 * Il contratto col kernel è quello del comando `mail_cerca`:
 * `{ risultati: [{ folder, uid, oggetto, mittente, data, anteprima, nonLetto,
 *    allegati, contrassegnato, completato, categorie, timestamp }], nota }`.
 * L'anteprima arriva già col termine fra « »; qui il termine viene anche
 * marcato con `<mark>` per l'evidenziazione visiva.
 */

import { fugaHtml, statoRiga } from "./mail-actions.js";
import { formatDate } from "./main-view.js";

/** Lunghezza massima approssimativa dell'anteprima, in caratteri (come il kernel). */
export const ANTEPRIMA_MAX = 200;

/** Ritardo (ms) fra un tasto e la ricerca: non si cerca a ogni carattere. */
export const RITARDO_RICERCA_MS = 250;

/** Numero massimo di risultati mostrati (come il limite predefinito del kernel). */
export const LIMITE_RICERCA = 50;

// ---------------------------------------------------------------------------
// Query in stile Outlook (funzioni pure)
// ---------------------------------------------------------------------------

/**
 * Interpreta la stringa di ricerca: `da:`, `oggetto:`, `con:allegato`,
 * `non:letto` (senza distinzione di maiuscole) più il testo libero.
 * Un prefisso `con:`/`non:` con un valore diverso resta testo libero.
 */
export function analizzaQuery(raw) {
  const q = { testo: "", da: null, oggetto: null, conAllegato: false, nonLetto: false };
  const liberi = [];
  for (const token of String(raw == null ? "" : raw).split(/\s+/)) {
    if (!token) continue;
    const minuscolo = token.toLowerCase();
    const da = token.slice(3);
    if (minuscolo.startsWith("da:") && da) {
      q.da = da;
      continue;
    }
    if (minuscolo.startsWith("oggetto:") && token.slice(8)) {
      q.oggetto = token.slice(8);
      continue;
    }
    if (minuscolo === "con:allegato" || minuscolo === "con:allegati") {
      q.conAllegato = true;
      continue;
    }
    if (minuscolo === "non:letto" || minuscolo === "non:letti") {
      q.nonLetto = true;
      continue;
    }
    liberi.push(token);
  }
  q.testo = liberi.join(" ");
  return q;
}

/** Termine da evidenziare: la prima parola libera, altrimenti `oggetto:` o `da:`. */
export function termineEvidenza(raw) {
  const q = analizzaQuery(raw);
  return q.testo.split(/\s+/).filter(Boolean)[0] || q.oggetto || q.da || "";
}

// ---------------------------------------------------------------------------
// Anteprima (funzione pura, speculare a `ricerca::anteprima` del kernel)
// ---------------------------------------------------------------------------

/** Sostituisce a capo/tabulazioni con spazi e comprime gli spazi ripetuti. */
function normalizza(testo) {
  return String(testo == null ? "" : testo).replace(/\s+/g, " ").trim();
}

/** Primi `max` caratteri, con i puntini se il testo è stato tagliato. */
function taglia(testo, max) {
  const t = Array.from(testo);
  return t.length <= max ? testo : `${t.slice(0, max).join("")}…`;
}

/** Posizione (in caratteri) e lunghezza della prima occorrenza, senza maiuscole. */
function trovaCi(testo, termine) {
  const t = Array.from(testo.toLowerCase());
  const m = Array.from(termine.toLowerCase());
  if (!m.length || m.length > t.length) return null;
  for (let i = 0; i + m.length <= t.length; i += 1) {
    if (t.slice(i, i + m.length).join("") === m.join("")) return { start: i, len: m.length };
  }
  return null;
}

/** Frammento attorno alla corrispondenza, termine fra « », con ellissi ai bordi. */
function finestraEvidenziata(testo, start, mlen) {
  const t = Array.from(testo);
  const inizio = Math.max(0, start - 60);
  const fine = Math.min(t.length, start + mlen + 140);
  let out = "";
  if (inizio > 0) out += "…";
  out += t.slice(inizio, start).join("");
  out += `«${t.slice(start, start + mlen).join("")}»`;
  out += t.slice(start + mlen, fine).join("");
  if (fine < t.length) out += "…";
  return out;
}

/**
 * Anteprima attorno al termine: cerca prima nel corpo, poi nell'oggetto; se il
 * termine non c'è restituisce l'inizio del corpo. Il termine è fra « ».
 */
export function anteprima(corpo, oggetto, termine) {
  const testo = normalizza(corpo);
  const term = String(termine == null ? "" : termine).trim();
  if (!term) return taglia(testo, ANTEPRIMA_MAX);
  const nelCorpo = trovaCi(testo, term);
  if (nelCorpo) return finestraEvidenziata(testo, nelCorpo.start, nelCorpo.len);
  const ogg = normalizza(oggetto);
  const inOggetto = trovaCi(ogg, term);
  if (inOggetto) return finestraEvidenziata(ogg, inOggetto.start, inOggetto.len);
  return taglia(testo, ANTEPRIMA_MAX);
}

/** Testo del corpo di un messaggio in memoria (stringa o righe). */
function corpoDi(m) {
  if (!m) return "";
  if (Array.isArray(m.body)) return m.body.join("\n");
  return typeof m.body === "string" ? m.body : "";
}

// ---------------------------------------------------------------------------
// Ricerca sui dati in memoria (percorso browser)
// ---------------------------------------------------------------------------

/**
 * Cerca fra i messaggi in memoria, con le stesse regole del kernel: i prefissi
 * filtrano e il testo libero deve comparire (tutte le parole, come sottostringa)
 * in oggetto, mittente o corpo. Restituisce `{ risultati, nota }`; `nota` resta
 * `null` (nel browser non c'è un indice che possa rifiutare l'espressione).
 */
export function cercaNeiMessaggi(messaggi, testo, limite = LIMITE_RICERCA) {
  const q = analizzaQuery(testo);
  const parole = q.testo.split(/\s+/).filter(Boolean).map((p) => p.toLowerCase());
  const risultati = [];
  for (const m of messaggi || []) {
    if (q.conAllegato && !m.has_attachments) continue;
    if (q.nonLetto && m.seen) continue;
    const mittente = String(m.from || "");
    const oggetto = String(m.subject || "");
    const corpo = corpoDi(m);
    if (q.da && !mittente.toLowerCase().includes(q.da.toLowerCase())) continue;
    if (q.oggetto && !oggetto.toLowerCase().includes(q.oggetto.toLowerCase())) continue;
    const campi = `${oggetto}\n${mittente}\n${corpo}`.toLowerCase();
    if (!parole.every((p) => campi.includes(p))) continue;
    risultati.push({
      ...m,
      folder: m.folder || "INBOX",
      anteprima: anteprima(corpo, oggetto, termineEvidenza(testo)),
    });
    if (risultati.length >= limite) break;
  }
  return { risultati, nota: null };
}

// ---------------------------------------------------------------------------
// Adattamento della riga del kernel alla forma della lista
// ---------------------------------------------------------------------------

/**
 * Trasforma un risultato del comando `mail_cerca` nella forma attesa dal resto
 * dell'interfaccia (la stessa di `daRigaKernel`): la data viene riformattata
 * come nella lista, `nonLetto` invertito in `seen`.
 */
export function daRigaRicercaKernel(r) {
  return {
    // Casella di provenienza: la ricerca attraversa le caselle, quindi senza
    // questo campo `accountDi` non sa da dove pescare il messaggio e ogni azione
    // su un risultato si ferma con «Seleziona una casella nella barra laterale».
    // Stringa vuota quando manca: chi lo legge ha già il ripiego sulla selezione
    // attiva (stesso patto di `daRigaKernel`, `src/views/main-view.js`).
    account: r.account || "",
    folder: r.folder,
    uid: r.uid,
    from: r.mittente || "(mittente sconosciuto)",
    subject: r.oggetto || "(nessun oggetto)",
    date: formatDate(r.timestamp),
    timestamp: r.timestamp,
    seen: !r.nonLetto,
    has_attachments: !!r.allegati,
    flagged: !!r.contrassegnato,
    completed: !!r.completato,
    categories: Array.isArray(r.categorie) ? r.categorie : [],
    anteprima: r.anteprima || "",
  };
}

// ---------------------------------------------------------------------------
// Testi dell'intestazione (funzioni pure)
// ---------------------------------------------------------------------------

/** Intestazione dei risultati: `Risultati per «testo»: N`. */
export function intestazioneRicerca(testo, n) {
  const t = String(testo == null ? "" : testo).trim();
  return `Risultati per «${t}»: ${Number(n) || 0}`;
}

/** Caso vuoto: `Nessun risultato per «testo»`. */
export function testoNessunRisultato(testo) {
  const t = String(testo == null ? "" : testo).trim();
  return `Nessun risultato per «${t}»`;
}

// ---------------------------------------------------------------------------
// Evidenziazione (funzione pura → HTML)
// ---------------------------------------------------------------------------

/** Fuga dei caratteri speciali di una regex, per cercarla alla lettera. */
function fugaRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Restituisce l'HTML dell'anteprima con ogni occorrenza del termine racchiusa in
 * `<mark class="search-hit">`. Il testo è messo in fuga: nessun HTML dell'utente
 * o del mittente può finire grezzo nella pagina.
 */
export function evidenzia(testo, termine) {
  const fuga = fugaHtml(testo == null ? "" : testo);
  const t = String(termine == null ? "" : termine).trim();
  if (!t) return fuga;
  const re = new RegExp(fugaRegex(t), "gi");
  return fuga.replace(re, (trovato) => `<mark class="search-hit">${trovato}</mark>`);
}

// ---------------------------------------------------------------------------
// Disegno dei risultati (DOM)
// ---------------------------------------------------------------------------

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

/**
 * Disegna i risultati nell'area della lista, con l'intestazione
 * (`Risultati per «…»: N`) e una X per tornare alla posta. `onScegli(m)` apre il
 * risultato nel pannello di lettura; `onChiudi()` chiude la ricerca.
 * Caso vuoto: la riga "Nessun risultato per «…»", mai una lista muta.
 */
export function renderRisultati(root, dati, azioni = {}) {
  root.replaceChildren();
  const risultati = (dati && dati.risultati) || [];
  const testo = (dati && dati.testo) || "";
  const nota = (dati && dati.nota) || null;

  const testata = el("div", "search-head");
  testata.append(
    el("span", "search-head-title", fugaHtml(intestazioneRicerca(testo, risultati.length))),
  );
  const chiudi = el("button", "search-close", "✕");
  chiudi.type = "button";
  chiudi.title = "Chiudi i risultati e torna alla posta";
  chiudi.setAttribute("aria-label", "Chiudi la ricerca");
  if (azioni.onChiudi) chiudi.addEventListener("click", azioni.onChiudi);
  testata.append(chiudi);
  root.append(testata);

  if (nota) root.append(el("div", "search-nota", fugaHtml(nota)));

  if (!risultati.length) {
    root.append(el("div", "search-empty", fugaHtml(testoNessunRisultato(testo))));
    return;
  }

  const termine = termineEvidenza(testo);
  for (const m of risultati) {
    const st = statoRiga(m);
    const classi = ["srow", ...st.classi.filter((c) => c !== "row")];
    if (m.selected) classi.push("srow--sel");
    const riga = document.createElement("div");
    riga.className = classi.join(" ");
    riga.dataset.uid = m.uid || "";
    riga.dataset.folder = m.folder || "";
    const targhette = st.categorie
      .map((c) => `<span class="cat-tag">${fugaHtml(c)}</span>`)
      .join("");
    riga.innerHTML = `
      <div class="srow-top">
        <span class="cell cell--flag">${st.pallino}</span>
        <span class="cell cell--from">${fugaHtml(m.from)}</span>
        <span class="cell cell--subject">${fugaHtml(m.subject)}</span>
        <span class="cell cell--date row-date">${fugaHtml(m.date)}</span>
        <span class="cell cell--cat">${targhette}</span>
        <span class="cell cell--done">${st.completato ? "✔" : ""}</span>
        <span class="cell cell--flag">${st.bandiera}</span>
      </div>
      <div class="srow-preview">${evidenzia(m.anteprima, termine)}</div>`;
    riga.addEventListener("click", () => {
      for (const r of root.querySelectorAll(".srow")) r.classList.remove("srow--sel");
      riga.classList.add("srow--sel");
      if (azioni.onScegli) azioni.onScegli(m);
    });
    root.append(riga);
  }
}
