/**
 * Rubrica dei contatti e completamento dei destinatari (blocco F).
 *
 * Il modulo ha due parti, come gli altri del progetto:
 * - funzioni **pure** (formattazione del suggerimento, filtro/ordinamento,
 *   testo di conferma dell'eliminazione, scomposizione di un mittente):
 *   collaudate con `node --test`, senza DOM e senza kernel;
 * - la **finestra della rubrica** (`apriRubrica`) e il **completamento dei
 *   destinatari** (`collegaCampoDestinatario`), che sono solo disegno e scelte.
 *
 * I comandi del kernel si chiamano da `src/main.js` (contratto: `contatti_elenco`,
 * `contatto_salva`, `contatto_elimina`, `contatti_importa_vcard`,
 * `contatti_esporta_vcard`, `contatti_suggerisci`); qui non si tocca il kernel.
 */

import { rendiSpostabile } from "./finestre.js";
import { fugaHtml as fuga } from "./mail-actions.js";
import { PULSANTE_CHIUDI } from "./blocco-i2.js";
import { apriGruppi } from "./gruppi.js";

/** Numero di suggerimenti mostrati sotto un campo dei destinatari. */
export const LIMITE_SUGGERIMENTI = 8;
/** Intervallo ammesso per il numero di suggerimenti (pannello «Contatti»). */
export const LIMITE_SUGGERIMENTI_MIN = 3;
export const LIMITE_SUGGERIMENTI_MAX = 20;

// ---------------------------------------------------------------------------
// Funzioni pure
// ---------------------------------------------------------------------------

/**
 * Campi di ordinamento della rubrica (pannello «Contatti»). `Nome` e `Cognome`
 * sono le voci del riferimento (`Preferences.Panes.AddressBook.strings`:
 * «Ordina i risultati nel riquadro Ricerca contatti per:» → Nome, Cognome);
 * `Azienda` è un campo del nostro modello, con l'etichetta già in uso.
 */
export const ORDINAMENTI_RUBRICA = [
  { id: "nome", etichetta: "Nome" },
  { id: "cognome", etichetta: "Cognome" },
  { id: "azienda", etichetta: "Azienda" },
];
export const ORDINAMENTO_RUBRICA_DEFAULT = "nome";

/**
 * Formati del nome visualizzato di un contatto. Le etichette non sono inventate:
 * sono la concatenazione dei campi reali (`Nome`, `Cognome`, `Azienda`), gli
 * stessi nomi che Outlook mostra in «Formato indirizzo predefinito:» con
 * «Anteprima:».
 */
export const FORMATI_NOME_CONTATTO = [
  { id: "nome_cognome", etichetta: "Nome Cognome" },
  { id: "cognome_nome", etichetta: "Cognome Nome" },
  { id: "azienda", etichetta: "Azienda" },
];
export const FORMATO_NOME_DEFAULT = "nome_cognome";

/** Ordinamento valido (sconosciuto → default). Specchia `config.rs`. */
export function normOrdinamento(id) {
  return ORDINAMENTI_RUBRICA.some((o) => o.id === id) ? id : ORDINAMENTO_RUBRICA_DEFAULT;
}

/** Formato del nome valido (sconosciuto → default). Specchia `config.rs`. */
export function normFormatoNome(id) {
  return FORMATI_NOME_CONTATTO.some((f) => f.id === id) ? id : FORMATO_NOME_DEFAULT;
}

/**
 * Numero di suggerimenti ammesso: fuori dall'intervallo (o non numerico) torna
 * al default, come per il limite della ricerca. Specchia `config.rs`.
 */
export function normSuggerimentiLimite(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < LIMITE_SUGGERIMENTI_MIN || v > LIMITE_SUGGERIMENTI_MAX) {
    return LIMITE_SUGGERIMENTI;
  }
  return v;
}

/**
 * Nome visualizzato di un contatto secondo il formato scelto. Mai vuoto: se il
 * formato scelto non ha i dati (es. nessuna azienda) ripiega sull'indirizzo, così
 * una riga della rubrica non resta mai bianca.
 */
export function nomeVisualizzato(c, formato = FORMATO_NOME_DEFAULT) {
  const f = normFormatoNome(formato);
  const nome = String((c && c.nome) || "").trim();
  const cognome = String((c && c.cognome) || "").trim();
  const azienda = String((c && c.azienda) || "").trim();
  const email = String((c && c.email) || "").trim();
  let testo;
  if (f === "cognome_nome") testo = `${cognome} ${nome}`.trim();
  else if (f === "azienda") testo = azienda || `${nome} ${cognome}`.trim();
  else testo = `${nome} ${cognome}`.trim();
  return testo || azienda || email;
}

/**
 * Nome visualizzato di un contatto: "Nome Cognome" oppure l'indirizzo se non
 * c'è un nome. Accetta sia un contatto della rubrica (`nome`/`cognome`) sia un
 * suggerimento (che porta già `nome` composto). Il formato è facoltativo: senza,
 * si comporta come prima del pannello «Contatti».
 */
export function nomeContatto(c, formato = FORMATO_NOME_DEFAULT) {
  return nomeVisualizzato(c, formato);
}

/**
 * Ordina i contatti secondo il campo scelto (vedi `ORDINAMENTI_RUBRICA`). Stabile
 * e non mutante; i contatti senza il campo richiesto finiscono in fondo, così
 * restano raggiungibili senza finti raggruppamenti.
 */
export function ordinaContatti(elenco, campo = ORDINAMENTO_RUBRICA_DEFAULT) {
  const c = normOrdinamento(campo);
  const chiave = (x) => {
    const nome = String((x && x.nome) || "").trim();
    const cognome = String((x && x.cognome) || "").trim();
    const azienda = String((x && x.azienda) || "").trim();
    if (c === "cognome") return `${cognome} ${nome}`.trim();
    if (c === "azienda") return azienda;
    return `${nome} ${cognome}`.trim();
  };
  return (elenco || [])
    .map((x, i) => ({ x, i, k: chiave(x).toLowerCase() }))
    .sort((a, b) => {
      // Chi non ha il campo (chiave vuota) va in fondo.
      if (!a.k && b.k) return 1;
      if (a.k && !b.k) return -1;
      const esito = a.k.localeCompare(b.k, "it");
      return esito !== 0 ? esito : a.i - b.i;
    })
    .map((p) => p.x);
}

/**
 * Riga dell'«Anteprima:» del pannello «Contatti»: nome nel formato scelto più
 * l'indirizzo fra parentesi angolari. Senza nome, resta il solo indirizzo.
 */
export function anteprimaFormato(formato, contatto) {
  const email = String((contatto && contatto.email) || "").trim();
  const nome = nomeVisualizzato(contatto, formato);
  if (nome && nome.toLowerCase() !== email.toLowerCase()) return `${nome} <${email}>`;
  return email || nome;
}

/**
 * Riga del suggerimento come la mostra Outlook: «Nome Cognome <indirizzo>»,
 * oppure il solo indirizzo se non c'è un nome (deve funzionare col solo
 * indirizzo, senza nome).
 */
export function formattaSuggerimento(c) {
  const email = String((c && c.email) || "").trim();
  const nome = String((c && c.nome) || "").trim();
  if (nome && nome.toLowerCase() !== email.toLowerCase()) return `${nome} <${email}>`;
  return email;
}

/**
 * Filtra e ordina i suggerimenti per pertinenza: la corrispondenza **all'inizio**
 * dell'indirizzo o del nome precede quella interna. Deduplica per indirizzo,
 * tenendo la **prima** occorrenza (chi chiama mette la rubrica davanti).
 *
 * Un testo vuoto restituisce i primi `limite` (ordine per nome). Speculare alla
 * funzione Rust `contatti::suggerisci_da`, per il percorso browser.
 */
export function filtroSuggerimenti(elenco, testo, limite = LIMITE_SUGGERIMENTI) {
  const q = String(testo || "").trim().toLowerCase();
  const n = limite > 0 ? limite : LIMITE_SUGGERIMENTI;
  const visti = new Set();
  const conPunteggio = [];
  for (const s of elenco || []) {
    const email = String((s && s.email) || "").trim();
    if (!email) continue;
    const emailLc = email.toLowerCase();
    if (visti.has(emailLc)) continue;
    visti.add(emailLc);
    const nome = String((s && s.nome) || "").trim();
    const nomeLc = (nome || email).toLowerCase();
    let punteggio;
    if (!q) punteggio = 0;
    else if (emailLc.startsWith(q)) punteggio = 0;
    else if (nomeLc.startsWith(q)) punteggio = 1;
    else if (emailLc.includes(q)) punteggio = 2;
    else if (nomeLc.includes(q)) punteggio = 3;
    else continue;
    conPunteggio.push({ punteggio, s });
  }
  conPunteggio.sort(
    (a, b) =>
      a.punteggio - b.punteggio ||
      String(a.s.nome || "").toLowerCase().localeCompare(String(b.s.nome || "").toLowerCase()) ||
      String(a.s.email || "").localeCompare(String(b.s.email || "")),
  );
  return conPunteggio.slice(0, n).map((x) => x.s);
}

/** Testo della conferma prima di eliminare un contatto (mai muto). */
export function testoConfermaEliminazione(c) {
  const chi = formattaSuggerimento(c) || String((c && c.email) || "").trim();
  return `Eliminare «${chi}» dalla rubrica? I dati del contatto saranno rimossi e non si possono recuperare.`;
}

/** Divide un nome in `{ nome, cognome }`: primo token = nome, il resto = cognome. */
function spezzaNome(nome) {
  const parti = String(nome || "")
    .split(/\s+/)
    .filter(Boolean);
  if (!parti.length) return { nome: "", cognome: "" };
  if (parti.length === 1) return { nome: parti[0], cognome: "" };
  return { nome: parti[0], cognome: parti.slice(1).join(" ") };
}

/**
 * Scompone un mittente "Nome Cognome <utente@host>" in `{ nome, cognome, email }`.
 * Con il solo indirizzo restituisce nome e cognome vuoti.
 */
export function scomponiMittente(testo) {
  const t = String(testo || "").trim();
  const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(t);
  if (m) {
    const nome = m[1].trim().replace(/^["']|["']$/g, "");
    const email = m[2].trim();
    return Object.assign(spezzaNome(nome), { email });
  }
  return { nome: "", cognome: "", email: t };
}

/** Contatti e indirizzi di esempio, per le prove visive nel browser. */
export const CONTATTI_ESEMPIO = [
  { id: 1, nome: "Luca", cognome: "Bianchi", email: "luca.bianchi@esempiogroup.it", telefono: "+39 011 5550101", azienda: "Azienda Esempio", note: "Referente manutenzione" },
  { id: 2, nome: "Marco", cognome: "Ferrari", email: "marco.ferrari@esempiogroup.it", telefono: "", azienda: "Azienda Esempio", note: "" },
  { id: 3, nome: "", cognome: "", email: "info@beta.it", telefono: "+39 011 5550202", azienda: "Beta Industrial Services", note: "Fornitore quadri elettrici" },
  { id: 4, nome: "Anna", cognome: "Verdi", email: "anna.verdi@example.it", telefono: "", azienda: "", note: "" },
];

/** Suggerimenti di esempio: rubrica + qualche indirizzo "già visto". */
export function suggerimentiEsempio() {
  return CONTATTI_ESEMPIO.map((c) => ({ nome: nomeContatto(c), email: c.email, origine: "rubrica" })).concat([
    { nome: "Beta - Industrial Services", email: "comunicazioni@staff.esempiohost.it", origine: "messaggi" },
    { nome: "NOREPLY@DHL.COM", email: "noreply@dhl.com", origine: "messaggi" },
  ]);
}

// ---------------------------------------------------------------------------
// Completamento dei destinatari (A / Cc / Ccn)
// ---------------------------------------------------------------------------

/** Il frammento da suggerire: il testo dopo l'ultimo separatore (`,` o `;`). */
function frammentoCorrente(valore) {
  const v = String(valore || "");
  const i = Math.max(v.lastIndexOf(","), v.lastIndexOf(";"));
  return (i >= 0 ? v.slice(i + 1) : v).trim();
}

/**
 * Collega a un campo dei destinatari il riquadro dei suggerimenti. `opzioni`
 * porta `suggerire(testo, limite)` (asincrona, restituisce `[{nome, email}]`).
 *
 * Si naviga con le frecce e si sceglie con Invio o col mouse; senza alcun
 * suggerimento **non compare alcun riquadro** (nessun rettangolo vuoto).
 * Restituisce un `{ chiudi }` per staccare il riquadro.
 */
export function collegaCampoDestinatario(input, opzioni = {}) {
  if (!input) return { chiudi() {} };
  const suggerire = typeof opzioni.suggerire === "function" ? opzioni.suggerire : null;
  // Pannello «Contatti»: quanti suggerimenti chiedere. Assente → il default.
  const limite = normSuggerimentiLimite(opzioni.limite);

  let riquadro = null;
  let voci = [];
  let sel = -1;
  let sequenza = 0;

  const chiudi = () => {
    if (riquadro) riquadro.remove();
    riquadro = null;
    voci = [];
    sel = -1;
  };

  const scegli = (i) => {
    const s = voci[i];
    if (!s) return;
    const v = input.value;
    const taglio = Math.max(v.lastIndexOf(","), v.lastIndexOf(";"));
    const prima = taglio >= 0 ? v.slice(0, taglio + 1) + " " : "";
    // Blocco U: un gruppo si espande negli indirizzi dei suoi membri.
    const scelta =
      s.origine === "gruppo" && Array.isArray(s.membri) && s.membri.length
        ? s.membri.join("; ")
        : formattaSuggerimento(s);
    input.value = `${prima}${scelta}; `;
    chiudi();
    input.focus();
    // Il campo è cambiato: il controllo pre-invio si azzera (nessun riquadro si
    // riapre, perché ora il frammento dopo il `;` è vuoto).
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const disegna = () => {
    if (!voci.length) {
      chiudi();
      return;
    }
    if (!riquadro) {
      riquadro = document.createElement("div");
      riquadro.className = "cmp-sugg";
      riquadro.setAttribute("role", "listbox");
      document.body.append(riquadro);
      const r = input.getBoundingClientRect();
      riquadro.style.left = `${r.left}px`;
      riquadro.style.top = `${r.bottom + 2}px`;
      riquadro.style.minWidth = `${r.width}px`;
    }
    riquadro.innerHTML = voci
      .map(
        (s, i) =>
          `<div class="cmp-sugg-voce${i === sel ? " cmp-sugg-voce--sel" : ""}" role="option" data-i="${i}">` +
          `<span class="cmp-sugg-nome">${fuga((s.nome || "").trim() || s.email)}</span>` +
          (s.email ? `<span class="cmp-sugg-mail">&lt;${fuga(s.email)}&gt;</span>` : "") +
          (s.origine === "messaggi" ? `<span class="cmp-sugg-origine">già visto</span>` : "") +
          (s.origine === "gruppo" ? `<span class="cmp-sugg-origine">gruppo</span>` : "") +
          `</div>`,
      )
      .join("");
    riquadro.querySelectorAll(".cmp-sugg-voce").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        scegli(Number(el.dataset.i));
      });
    });
  };

  const cerca = async () => {
    if (!suggerire) return;
    const frammento = frammentoCorrente(input.value);
    if (!frammento) {
      chiudi();
      return;
    }
    const mia = ++sequenza;
    let esito = [];
    try {
      esito = (await suggerire(frammento, limite)) || [];
    } catch {
      esito = [];
    }
    // Una risposta arrivata in ritardo non sovrascrive una ricerca più recente.
    if (mia !== sequenza) return;
    voci = Array.isArray(esito) ? esito : [];
    sel = voci.length ? 0 : -1;
    disegna();
  };

  input.addEventListener("input", () => {
    cerca();
  });
  input.addEventListener("keydown", (e) => {
    if (!riquadro) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      sel = Math.min(sel + 1, voci.length - 1);
      disegna();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      sel = Math.max(sel - 1, 0);
      disegna();
    } else if (e.key === "Enter") {
      if (sel >= 0) {
        e.preventDefault();
        e.stopPropagation();
        scegli(sel);
      } else {
        chiudi();
      }
    } else if (e.key === "Escape") {
      e.stopPropagation();
      chiudi();
    }
  });
  input.addEventListener("blur", () => setTimeout(chiudi, 120));

  return { chiudi };
}

// ---------------------------------------------------------------------------
// Finestra della rubrica
// ---------------------------------------------------------------------------

/** Campi del modulo della rubrica (ordine di visualizzazione). */
const CAMPI_MODULO = [
  { nome: "nome", etichetta: "Nome" },
  { nome: "cognome", etichetta: "Cognome" },
  { nome: "email", etichetta: "Email" },
  { nome: "telefono", etichetta: "Telefono" },
  { nome: "azienda", etichetta: "Azienda" },
  { nome: "ruolo", etichetta: "Ruolo" },
  { nome: "indirizzo", etichetta: "Indirizzo postale" },
  { nome: "note", etichetta: "Note" },
];

/** Blocco U: le liste di recapiti «in più» della scheda (email e telefoni). */
const LISTE_RECAPITI = [
  { nome: "emailAltre", etichetta: "Altre email", aggiungi: "＋ Aggiungi email" },
  { nome: "telefoni", etichetta: "Altri telefoni", aggiungi: "＋ Aggiungi telefono" },
];

/** Etichette proposte per un recapito (si può scrivere anche altro). */
const ETICHETTE_RECAPITO = ["lavoro", "casa", "cellulare", "fax", "altro"];

function rigaRecapito(r = {}) {
  return `<div class="rubrica-recapito">
      <input type="text" data-recapito="etichetta" list="rubrica-etichette" placeholder="etichetta" value="${fuga(r.etichetta || "")}" autocomplete="off" spellcheck="false" aria-label="Etichetta" />
      <input type="text" data-recapito="valore" value="${fuga(r.valore || "")}" autocomplete="off" spellcheck="false" aria-label="Valore" />
      <button type="button" class="rubrica-recapito-togli" data-togli title="Togli">✕</button>
    </div>`;
}

/** I recapiti di una lista del modulo, senza le righe lasciate vuote. */
function leggiRecapiti(contenitore) {
  return [...contenitore.querySelectorAll(".rubrica-recapito")]
    .map((riga) => ({
      etichetta: riga.querySelector("[data-recapito=etichetta]").value.trim(),
      valore: riga.querySelector("[data-recapito=valore]").value.trim(),
    }))
    .filter((r) => r.valore);
}

function riga(contatto, formato) {
  const nome = nomeVisualizzato(contatto, formato) || "(senza nome)";
  const azienda = contatto.azienda ? `<span class="rubrica-azienda">${fuga(contatto.azienda)}</span>` : "";
  // Blocco U5: un contatto entrato dopo un invio si riconosce.
  const auto = contatto.origine === "automatico" ? `<span class="rubrica-auto" title="Aggiunto alla rubrica dopo un invio">aggiunto da sé</span>` : "";
  return `<div class="rubrica-riga" role="option" data-id="${contatto.id}">
      <span class="rubrica-nome">${fuga(nome)}</span>
      <span class="rubrica-mail">&lt;${fuga(contatto.email)}&gt;</span>
      ${auto}${azienda}
    </div>`;
}

function modulo(contatto) {
  const c = contatto || {};
  const campi = CAMPI_MODULO.map((f) => {
    const valore = fuga(c[f.nome] == null ? "" : c[f.nome]);
    return `<label class="rubrica-campo"><span>${f.etichetta}</span>
      <input type="text" data-campo="${f.nome}" value="${valore}" autocomplete="off" spellcheck="false" /></label>`;
  }).join("");
  const liste = LISTE_RECAPITI.map((l) => {
    const voci = Array.isArray(c[l.nome]) ? c[l.nome] : [];
    return `<div class="rubrica-campo"><span>${l.etichetta}</span>
      <div data-lista="${l.nome}">${voci.map(rigaRecapito).join("")}</div>
      <button type="button" class="rubrica-link" data-aggiungi="${l.nome}">${l.aggiungi}</button></div>`;
  }).join("");
  const etichette = ETICHETTE_RECAPITO.map((e) => `<option value="${e}"></option>`).join("");
  return `<div class="rubrica-modulo">
      <div class="rubrica-modulo-titolo">${contatto && contatto.id ? "Modifica contatto" : "Nuovo contatto"}</div>
      ${campi}
      ${liste}
      <datalist id="rubrica-etichette">${etichette}</datalist>
      <div class="rubrica-modulo-azioni">
        <button type="button" class="rubrica-btn" data-form="annulla">Annulla</button>
        <button type="button" class="rubrica-btn rubrica-btn--ok" data-form="salva">Salva</button>
      </div>
    </div>`;
}

function markup() {
  return `
  <div class="rubrica-win" role="dialog" aria-label="Rubrica">
    <header class="rubrica-titlebar">
      ${PULSANTE_CHIUDI}
      <span class="rubrica-title">Rubrica</span>
    </header>
    <div class="rubrica-toolbar">
      <span class="rubrica-cerca-box">
        <span aria-hidden="true">🔍</span>
        <input class="rubrica-cerca" id="rubrica-cerca" type="search" placeholder="Cerca un contatto" autocomplete="off" spellcheck="false" />
      </span>
      <button type="button" class="rubrica-btn" data-az="nuovo">＋ Nuovo contatto</button>
      <button type="button" class="rubrica-btn" data-az="modifica">Modifica</button>
      <button type="button" class="rubrica-btn" data-az="elimina">Elimina</button>
      <button type="button" class="rubrica-btn" data-az="importa">Importa vCard…</button>
      <button type="button" class="rubrica-btn" data-az="esporta">Esporta in vCard</button>
      <button type="button" class="rubrica-btn" data-az="gruppi">Gruppi…</button>
      <label class="rubrica-filtro"><input type="checkbox" id="rubrica-solo-auto" /> Solo aggiunti automaticamente</label>
    </div>
    <div class="rubrica-corpo">
      <div class="rubrica-lista" id="rubrica-lista" role="listbox" aria-label="Contatti"></div>
      <div class="rubrica-scheda" id="rubrica-scheda"></div>
    </div>
    <div class="rubrica-nota" role="status" aria-live="polite"></div>
  </div>`;
}

/**
 * Apre la finestra della rubrica.
 *
 * `opzioni`:
 * - `onElenco(filtro)` → contatti (dentro Tauri `contatti_elenco`); assente =
 *   elenco di esempio (prove visive);
 * - `onSalva(contatto)` → `{ id, aggiornato }`; `onElimina(id)` → numero;
 * - `onImporta(testoVcf)` → esito; `onEsporta()` → percorso del file;
 * - `onApriComposizione(email)` → apre una nuova composizione (doppio clic);
 * - `focusRicerca` vero → il fuoco va nel campo di ricerca (voce "Trova contatto");
 * - `ricercaIniziale` → testo già scritto nel campo di ricerca (prove visive);
 * - `gruppi` → opzioni della finestra «Gruppi» (`onElenco`, `onSalva`, `onElimina`).
 */
export function apriRubrica(opzioni = {}) {
  document.querySelectorAll(".rubrica-overlay").forEach((el) => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "rubrica-overlay";
  overlay.innerHTML = markup();
  document.body.append(overlay);
  rendiSpostabile(overlay);

  const listaEl = overlay.querySelector("#rubrica-lista");
  const schedaEl = overlay.querySelector("#rubrica-scheda");
  const cercaEl = overlay.querySelector("#rubrica-cerca");
  const notaEl = overlay.querySelector(".rubrica-nota");

  let elenco = [];
  let filtro = "";
  let selezione = null;
  let contattoInModulo = null;
  // Pannello «Contatti» (blocco Q): formato del nome e ordine della rubrica
  // arrivano dal chiamante (main.js → config.json). Assenti, si comportano come
  // prima del pannello.
  const formatoNome = normFormatoNome(opzioni.formatoNome || FORMATO_NOME_DEFAULT);
  const ordinamento = normOrdinamento(opzioni.ordinamento || ORDINAMENTO_RUBRICA_DEFAULT);

  const nota = (testo, errore) => {
    notaEl.textContent = testo || "";
    notaEl.classList.toggle("rubrica-nota--errore", !!errore);
  };
  const chiudi = () => overlay.remove();

  const soloAutoEl = overlay.querySelector("#rubrica-solo-auto");
  soloAutoEl.addEventListener("change", () => disegnaLista());
  const disegnaLista = () => {
    const q = filtro.trim().toLowerCase();
    const base = soloAutoEl.checked ? elenco.filter((c) => c.origine === "automatico") : elenco;
    const filtrati = !q
      ? base
      : base.filter((c) =>
          [c.nome, c.cognome, c.email, c.azienda]
            .map((v) => String(v || "").toLowerCase())
            .some((v) => v.includes(q)),
        );
    // L'ordine è la preferenza del pannello «Contatti»: la rubrica si mostra
    // ordinata come richiesto, non nell'ordine di arrivo del database.
    const visibili = ordinaContatti(filtrati, ordinamento);
    if (!visibili.length) {
      listaEl.innerHTML = `<div class="rubrica-vuoto">${
        q
          ? "Nessun contatto corrisponde alla ricerca."
          : soloAutoEl.checked
            ? "Nessun contatto aggiunto automaticamente."
            : "La rubrica è vuota: usa «Nuovo contatto» o «Importa vCard»."
      }</div>`;
      return;
    }
    listaEl.innerHTML = visibili.map((c) => riga(c, formatoNome)).join("");
    listaEl.querySelectorAll(".rubrica-riga").forEach((el) => {
      el.classList.toggle("rubrica-riga--sel", selezione && Number(el.dataset.id) === selezione.id);
      el.addEventListener("click", () => {
        selezione = elenco.find((c) => c.id === Number(el.dataset.id)) || null;
        disegnaLista();
      });
      el.addEventListener("dblclick", () => {
        const c = elenco.find((x) => x.id === Number(el.dataset.id));
        if (c && c.email && typeof opzioni.onApriComposizione === "function") {
          opzioni.onApriComposizione(c.email);
          chiudi();
        }
      });
    });
  };

  const ricarica = async () => {
    let righe;
    if (typeof opzioni.onElenco === "function") {
      try {
        righe = await opzioni.onElenco(filtro);
      } catch (e) {
        nota(`Non riesco a leggere la rubrica: ${e && e.message ? e.message : e}`, true);
        righe = [];
      }
    } else {
      righe = CONTATTI_ESEMPIO.slice();
    }
    elenco = Array.isArray(righe) ? righe : [];
    if (selezione && !elenco.some((c) => c.id === selezione.id)) selezione = null;
    disegnaLista();
    return elenco;
  };

  const apriForm = (contatto) => {
    contattoInModulo = contatto;
    schedaEl.innerHTML = modulo(contatto);
    schedaEl.querySelector('[data-campo="nome"]').focus();
    schedaEl.querySelector('[data-form="annulla"]').addEventListener("click", () => {
      schedaEl.innerHTML = "";
      contattoInModulo = null;
    });
    // Righe dei recapiti: «＋» ne aggiunge una vuota, «✕» la toglie.
    schedaEl.addEventListener("click", (e) => {
      const aggiungi = e.target.closest("[data-aggiungi]");
      if (aggiungi) {
        const lista = schedaEl.querySelector(`[data-lista="${aggiungi.dataset.aggiungi}"]`);
        lista.insertAdjacentHTML("beforeend", rigaRecapito());
        lista.lastElementChild.querySelector("[data-recapito=valore]").focus();
        return;
      }
      const togli = e.target.closest("[data-togli]");
      if (togli) togli.closest(".rubrica-recapito").remove();
    });
    schedaEl.querySelector('[data-form="salva"]').addEventListener("click", async () => {
      // Si parte dal contatto com'era: i campi che il modulo non mostra
      // (es. l'origine) viaggiano intatti, e il kernel — che in modifica
      // riscrive tutto — non li cancella.
      const nuovo = Object.assign({}, contatto || {}, { id: contatto && contatto.id ? contatto.id : null });
      schedaEl.querySelectorAll("[data-campo]").forEach((i) => {
        nuovo[i.dataset.campo] = i.value;
      });
      schedaEl.querySelectorAll("[data-lista]").forEach((l) => {
        nuovo[l.dataset.lista] = leggiRecapiti(l);
      });
      if (!String(nuovo.email || "").trim()) {
        nota("L'indirizzo è obbligatorio: senza indirizzo il contatto non si può salvare.", true);
        return;
      }
      if (typeof opzioni.onSalva !== "function") {
        // Prova visiva: si aggiorna solo l'elenco in memoria.
        const aggiornato = Object.assign({ id: nuovo.id || Date.now() }, nuovo);
        const i = elenco.findIndex((c) => c.id === aggiornato.id);
        if (i >= 0) elenco[i] = aggiornato;
        else elenco.push(aggiornato);
        schedaEl.innerHTML = "";
        contattoInModulo = null;
        disegnaLista();
        nota("Salvato (prova visiva: nessun file scritto).");
        return;
      }
      try {
        const esito = await opzioni.onSalva(nuovo);
        schedaEl.innerHTML = "";
        contattoInModulo = null;
        await ricarica();
        nota(esito && esito.aggiornato ? "Contatto aggiornato." : "Contatto aggiunto alla rubrica.");
      } catch (e) {
        nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
      }
    });
  };

  const scegliPerAzione = (nomeAzione) => {
    if (!selezione) {
      nota(`Seleziona prima un contatto da ${nomeAzione}.`, true);
      return null;
    }
    return selezione;
  };

  // Cintura: i pulsanti della barra.
  overlay.querySelector(".win-close").addEventListener("click", chiudi);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) chiudi();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !schedaEl.innerHTML) chiudi();
  });

  cercaEl.addEventListener("input", () => {
    filtro = cercaEl.value;
    disegnaLista();
  });

  overlay.querySelectorAll("[data-az]").forEach((b) => {
    b.addEventListener("click", async () => {
      const az = b.dataset.az;
      if (az === "nuovo") {
        apriForm(null);
      } else if (az === "modifica") {
        const c = scegliPerAzione("modificare");
        if (c) apriForm(c);
      } else if (az === "elimina") {
        const c = scegliPerAzione("eliminare");
        if (!c) return;
        // Conferma esplicita con il testo collaudato (mai un'eliminazione muta).
        const conferma = document.createElement("div");
        conferma.className = "rubrica-conferma";
        conferma.innerHTML =
          `<div class="rubrica-conferma-box"><p>${fuga(testoConfermaEliminazione(c))}</p>` +
          `<div class="rubrica-modulo-azioni">` +
          `<button type="button" class="rubrica-btn" data-conf="no">Annulla</button>` +
          `<button type="button" class="rubrica-btn rubrica-btn--ok" data-conf="si">Elimina</button></div></div>`;
        overlay.append(conferma);
        conferma.querySelector('[data-conf="no"]').addEventListener("click", () => conferma.remove());
        conferma.querySelector('[data-conf="si"]').addEventListener("click", async () => {
          conferma.remove();
          try {
            if (typeof opzioni.onElimina === "function") await opzioni.onElimina(c.id);
            elenco = elenco.filter((x) => x.id !== c.id);
            selezione = null;
            disegnaLista();
            nota("Contatto eliminato.");
          } catch (e) {
            nota(`Non eliminato: ${e && e.message ? e.message : e}`, true);
          }
        });
      } else if (az === "importa") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".vcf,text/vcard,text/x-vcard";
        input.style.display = "none";
        overlay.append(input);
        input.addEventListener("change", async () => {
          const file = input.files && input.files[0];
          input.remove();
          if (!file) return;
          const testo = await file.text();
          if (typeof opzioni.onImporta !== "function") {
            nota("Importazione non collegata in questa prova.", true);
            return;
          }
          try {
            const esito = await opzioni.onImporta(testo);
            await ricarica();
            nota(testoImportazione(esito));
          } catch (e) {
            nota(`Importazione non riuscita: ${e && e.message ? e.message : e}`, true);
          }
        });
        input.click();
      } else if (az === "esporta") {
        if (typeof opzioni.onEsporta !== "function") {
          nota("Esportazione non collegata in questa prova.", true);
          return;
        }
        try {
          const percorso = await opzioni.onEsporta();
          nota(percorso ? `Rubrica esportata in: ${percorso}` : "Esportazione non riuscita (vedi console).");
        } catch (e) {
          nota(`Esportazione non riuscita: ${e && e.message ? e.message : e}`, true);
        }
      } else if (az === "gruppi") {
        // Blocco U4: la finestra dei gruppi (col kernel se il chiamante lo collega).
        apriGruppi(opzioni.gruppi || {});
      }
    });
  });

  ricarica().then(() => {
    if (opzioni.ricercaIniziale) {
      cercaEl.value = opzioni.ricercaIniziale;
      filtro = cercaEl.value;
      disegnaLista();
    }
    if (opzioni.focusRicerca) cercaEl.focus();
  });

  return overlay;
}

/** Frase dell'esito di un'importazione: importati, aggiornati, ignorati. */
export function testoImportazione(esito) {
  if (!esito || typeof esito !== "object") return "Importazione completata.";
  const pezzi = [`${esito.importati || 0} aggiunti`, `${esito.aggiornati || 0} aggiornati`];
  if (esito.senzaEmail) pezzi.push(`${esito.senzaEmail} scartati (senza indirizzo)`);
  const conflitti = Array.isArray(esito.conflitti) ? esito.conflitti : [];
  if (conflitti.length) pezzi.push(`${conflitti.length} saltati (indirizzo già di un altro contatto)`);
  let testo = `Importazione: ${pezzi.join(", ")}.`;
  if (conflitti.length) testo += ` Saltati: ${conflitti.join("; ")}.`;
  if (Array.isArray(esito.ignorati) && esito.ignorati.length) {
    testo += ` Campi non supportati e ignorati: ${esito.ignorati.join(", ")}.`;
  }
  return testo;
}
