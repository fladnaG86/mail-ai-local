/**
 * Vista principale: ribbon, albero cartelle, lista messaggi, pannello di lettura.
 * Nel browser la lista usa i dati di esempio (servono al confronto visivo con i mockup);
 * dentro Tauri (milestone 3) arriva dalla cache locale tramite `mail_list`; dalla
 * milestone 4 il corpo arriverà dal fetch IMAP.
 */

import {
  statoRiga,
  fugaHtml,
  htmlCelleMessaggio,
  chiaveIconaCartella,
  svgIconaCartella,
  NON_DISPONIBILI_V1,
  testoNonDisponibileRibbon,
} from "./mail-actions.js";
import { targhetteCategorie } from "./categorie.js";
import { stileCarattere } from "./impostazioni-mail.js";
import { limitaZoomLettura, ZOOM_LETTURA_MAX, ZOOM_LETTURA_MIN } from "./accessibilita.js";

// --- dati di esempio (usati solo quando l'app gira nel browser) ---

/**
 * Giorni abbreviati come nel riferimento (lun, mar, …). Dichiarati **prima** dei
 * dati d'esempio: quelli chiamano `formatDate` mentre il modulo si definisce, e
 * in una `const` l'accesso anticipato è un errore (TDZ), non `undefined`.
 */
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

export const sampleFolders = [
  { name: "Tutti gli account", kind: "group", open: false },
  { name: "mario.rossi@esempiogroup.it", kind: "group", open: true },
  { name: "Posta in arrivo", kind: "sel" },
  { name: "Bozze", kind: "child" },
  { name: "Posta inviata", kind: "child" },
  { name: "Posta eliminata", kind: "child", count: 2 },
  { name: "Posta in arrivo", kind: "group", open: true, nested: true },
  { name: "Bozze", kind: "child" },
  { name: "Archivio", kind: "child" },
  { name: "Posta inviata", kind: "child" },
  { name: "Posta eliminata", kind: "child", count: 41 },
  { name: "Posta indesiderata", kind: "child" },
  { name: "Timbrature", kind: "child", count: 10621 },
  { name: "Veeam Backup", kind: "child", count: 2857 },
  { name: "Cartelle smart", kind: "group", open: true },
  { name: "Messaggio contrassegnato", kind: "child" },
  { name: "Sul mio computer", kind: "group", open: false },
];

/**
 * Le due caselle dei dati d'esempio. Devono essere **le stesse** di
 * `gruppiDiEsempio()` (`src/main.js`), o le righe porterebbero un `account`
 * che la barra laterale non conosce e nessuna casella risulterebbe attiva.
 */
const CASELLA_LAVORO = "mario.rossi@esempiogroup.it";
const CASELLA_PERSONALE = "m.rossi@gmail.com";

/**
 * Messaggi d'esempio del percorso browser: la **stessa forma** che
 * `daRigaKernel` produce dal kernel, così le prove visive non mentono.
 *
 * In particolare ogni riga porta `uid`, `account` e `folder` — senza, `accountDi`
 * non sa da quale casella pescare e ogni azione si ferma con «Seleziona una
 * casella nella barra laterale prima di agire sul messaggio». Le caselle sono
 * **due** di proposito: è la vista aggregata «Tutti gli account», cioè il caso
 * in cui il difetto si vedeva.
 *
 * `date` non si scrive a mano: è la resa di `timestamp`, così le due non possono
 * divergere. `body` resta perché lo leggono la resa nel browser, la ricerca in
 * memoria (`search.js`), la stima di dimensione per l'ordinamento
 * (`blocco-i2.js`) e la citazione della bozza di risposta (`main.js`).
 */
export const sampleMessages = [
  {
    uid: "101", account: CASELLA_LAVORO, folder: "INBOX",
    timestamp: 1791818760, date: formatDate(1791818760),
    from: "Luca Bianchi", subject: "Piano manutenzione Q4",
    selected: true, flagged: true,
    seen: false, completed: false, categories: ["Lavoro"], has_attachments: false,
    initial: "LB", avatarBg: "#D2691E", to: "'Mario Rossi'",
    body: [
      "Mario,",
      "per il piano Q4 servono gli interventi su VED (linea compositi) e Beta (quadri elettrici).",
      "Il fermo impianto è previsto la prima settimana di dicembre: servirebbe la lista degli interventi",
      "e i costi entro il 20/11.",
      "",
      "Saluti",
    ],
  },
  {
    uid: "102", account: CASELLA_LAVORO, folder: "INBOX",
    timestamp: 1791815820, date: formatDate(1791815820),
    from: "BETA - Industrial Services", subject: "Nuovo dato inserito nel form contatti del sito",
    seen: false, flagged: false, completed: false, categories: [], has_attachments: false,
  },
  {
    uid: "103", account: CASELLA_LAVORO, folder: "INBOX",
    timestamp: 1791814800, date: formatDate(1791814800),
    from: "marco.ferrari@esempiogroup.it", subject: "I: Prenotazione ritiro AMAZON DHL",
    seen: true, flagged: false, completed: false, categories: ["Fornitori"], has_attachments: true,
  },
  {
    uid: "104", account: CASELLA_LAVORO, folder: "INBOX",
    timestamp: 1791813960, date: formatDate(1791813960),
    from: "NOREPLY@DHL.COM", subject: "Prenotazione ritiro AMAZON DHL",
    seen: false, flagged: true, completed: true, categories: ["Fornitori"], has_attachments: true,
  },
  {
    uid: "105", account: CASELLA_LAVORO, folder: "INBOX",
    timestamp: 1791813840, date: formatDate(1791813840),
    from: "comunicazioni@staff.esempiohost.it",
    subject: "Accessi eseguiti da un nuovo dispositivo all'account v*d@pec.example…",
    seen: true, flagged: false, completed: false, categories: [], has_attachments: false,
  },
  {
    uid: "106", account: CASELLA_LAVORO, folder: "INBOX",
    timestamp: 1791811800, date: formatDate(1791811800),
    from: "comunicazioni@staff.esempiohost.it",
    subject: "mago.esempiogroup.it verrà migrato sul nuovo servizio Terzo livello…",
    seen: true, flagged: false, completed: false, categories: ["Manutenzione"], has_attachments: false,
  },
  {
    // La seconda casella: senza, la vista aggregata non avrebbe nulla da
    // distinguere e il difetto dell'account non sarebbe osservabile nel browser.
    uid: "201", account: CASELLA_PERSONALE, folder: "INBOX",
    timestamp: 1791811680, date: formatDate(1791811680),
    from: "comunicazioni@staff.esempiohost.it",
    subject: "portale.esempiogroup.it verrà migrato sul nuovo servizio Terzo livello…",
    seen: true, flagged: false, completed: false, categories: [], has_attachments: true,
  },
];

/** Formatta una data Unix come nel riferimento: "lun 12/10/26, 17:26". */
export function formatDate(epochSeconds) {
  const d = new Date(epochSeconds * 1000);
  const due = (n) => String(n).padStart(2, "0");
  const anno = String(d.getFullYear()).slice(-2);
  return `${GIORNI[d.getDay()]} ${due(d.getDate())}/${due(d.getMonth() + 1)}/${anno}, ${due(d.getHours())}:${due(d.getMinutes())}`;
}

/** Etichetta di gruppo temporale per una data Unix. */
export function etichettaGruppo(epochSeconds) {
  if (!epochSeconds) return "Oggi";
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const giorno = new Date(epochSeconds * 1000);
  giorno.setHours(0, 0, 0, 0);
  const giorni = Math.round((oggi - giorno) / 86400000);
  if (giorni <= 0) return "Oggi";
  if (giorni === 1) return "Ieri";
  if (giorni <= 7) return "Questa settimana";
  return "Precedenti";
}

/**
 * Trasforma una riga del kernel Rust (comando `mail_list`) nella forma attesa
 * dalla lista. I nomi dei campi arrivano in camelCase dal comando Tauri.
 */
export function daRigaKernel(r) {
  return {
    uid: r.uid,
    // Account e cartella di provenienza: il kernel li manda in **ogni** riga
    // (`MailRow`), e senza di loro la lista aggregata «Tutti gli account» non sa
    // da quale casella e da quale cartella pescare — due caselle possono avere
    // lo stesso UID, quindi ogni azione si fermava con «Seleziona una casella
    // nella barra laterale» (`accountDi`). Stringa vuota quando mancano: chi li
    // legge ha già il ripiego sulla selezione attiva.
    account: r.account || "",
    folder: r.folder || "",
    from: r.from || "(mittente sconosciuto)",
    subject: r.subject || "(nessun oggetto)",
    date: formatDate(r.date),
    timestamp: r.date,
    seen: r.seen,
    has_attachments: r.hasAttachments,
    // Stato di Outlook: il kernel li manda già (milestone 9); se una riga non
    // li avesse, i default (false / elenco vuoto) non rompono la resa.
    flagged: !!r.flagged,
    completed: !!r.completed,
    categories: Array.isArray(r.categories) ? r.categories : [],
    // Anteprima del testo dal corpo in cache (la lista la mostra solo se la
    // preferenza "anteprima nella lista" è attiva).
    anteprima: r.anteprima || "",
    // Chiave della conversazione, per «Ignora conversazione» dal menu.
    threadKey: r.threadKey || "",
  };
}

/**
 * Trasforma una conversazione del kernel (comando `mail_conversazioni`) nella
 * forma attesa dalla lista raggruppata: riepilogo + i messaggi (in camelCase).
 */
export function daConversazioneKernel(r) {
  return {
    chiave: r.chiave,
    numero: r.numero,
    nonLetti: r.nonLetti,
    from: r.from || "(mittente sconosciuto)",
    subject: r.subject || "(nessun oggetto)",
    date: formatDate(r.date),
    timestamp: r.date,
    seen: r.seen,
    has_attachments: r.hasAttachments,
    anteprima: r.anteprima || "",
    messaggi: (r.messaggi || []).map(daRigaKernel),
  };
}

/** Chiavi delle conversazioni espanse (persistono fra un ridisegno e l'altro). */
const conversazioniAperte = new Set();

/** Forza lo stato di espansione delle conversazioni (usato dalle prove visive). */
export function impostaConversazioniAperte(chiavi) {
  conversazioniAperte.clear();
  for (const k of chiavi || []) conversazioniAperte.add(k);
}

/** Apre o chiude una conversazione, aggiornando il DOM senza ridisegnare. */
function alternaConversazione(blocco, chiave) {
  const figli = blocco.querySelector(".conv-figli");
  const caret = blocco.querySelector(".conv-caret");
  const aperta = figli.hidden;
  figli.hidden = !aperta;
  caret.textContent = aperta ? "▾" : "▸";
  blocco.classList.toggle("conv--aperta", aperta);
  if (aperta) conversazioniAperte.add(chiave);
  else conversazioniAperte.delete(chiave);
}

/**
 * Disegna la lista **raggruppata per conversazione** (blocco H): una riga per
 * conversazione, con il numero di messaggi e l'indicatore dei non letti,
 * **espandibile** per vedere i singoli messaggi. Il click sull'intestazione
 * seleziona il messaggio più recente; il triangolino apre/chiude.
 *
 * Con `opzioni.anteprima` mostra l'anteprima del testo (preferenza di lettura).
 */
export function renderListaConversazioni(root, conversazioni = [], opzioni = {}) {
  root.replaceChildren();
  let gruppoCorrente = null;
  for (const c of conversazioni) {
    const gruppo = etichettaGruppo(c.timestamp);
    if (gruppo !== gruppoCorrente) {
      root.append(el("div", "group-row", gruppo));
      gruppoCorrente = gruppo;
    }
    const aperta = conversazioniAperte.has(c.chiave);
    const blocco = el("div", "conv" + (aperta ? " conv--aperta" : ""));
    blocco.dataset.chiave = c.chiave;

    const nonLetti = Number(c.nonLetti) || 0;
    const classeNonLetto = nonLetti > 0 ? " row--nonletto" : "";
    const anteprima = opzioni.anteprima ? testoAnteprima(c) : "";
    const prevHtml = anteprima ? `<span class="row-preview"> — ${fugaHtml(anteprima)}</span>` : "";
    const contatore =
      c.numero > 1
        ? `<span class="conv-count" title="${c.numero} messaggi">[${c.numero}]</span>`
        : "";

    const header = el("div", `row row--conv${classeNonLetto}`);
    header.innerHTML = htmlCelleMessaggio(
      { from: c.from, subject: c.subject, date: c.date, has_attachments: c.has_attachments },
      { nonLetto: nonLetti > 0, completato: false },
      {
        anteprimaHtml: ` ${contatore}${prevHtml}`,
        targhette: nonLetti > 0 ? `<span class="conv-nonletti">${nonLetti}</span>` : "",
      },
    );
    // Nella prima colonna l'intestazione porta la freccia che apre/chiude, non il pallino.
    const colonnaFreccia = header.querySelector(".cell--dot");
    colonnaFreccia.className = "cell cell--dot conv-caret";
    colonnaFreccia.textContent = aperta ? "▾" : "▸";

    const figli = el("div", "conv-figli");
    figli.hidden = !aperta;
    for (const m of c.messaggi || []) {
      const st = statoRiga(m);
      const riga = document.createElement("div");
      riga.className = ["row", "row--msg", ...st.classi.slice(1)].join(" ");
      riga.dataset.uid = m.uid || "";
      riga.innerHTML = htmlCelleMessaggio(m, st, {
        targhette: st.categorie.map((x) => `<span class="cat-tag">${fugaHtml(x)}</span>`).join(""),
      });
      riga.addEventListener("click", (e) => {
        e.stopPropagation();
        for (const r of root.querySelectorAll(".row")) r.classList.remove("row--sel");
        riga.classList.add("row--sel");
        root.dispatchEvent(new CustomEvent("message-selected", { detail: m, bubbles: true }));
      });
      collegaPassaggio(riga, root, m);
      riga.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        root.dispatchEvent(
          new CustomEvent("contextmenu-messaggio", { detail: { messaggio: m }, bubbles: true }),
        );
      });
      figli.append(riga);
    }

    header.querySelector(".conv-caret").addEventListener("click", (e) => {
      e.stopPropagation();
      alternaConversazione(blocco, c.chiave);
    });
    header.addEventListener("click", () => {
      for (const r of root.querySelectorAll(".row")) r.classList.remove("row--sel");
      header.classList.add("row--sel");
      const rappresentante = (c.messaggi || [])[c.messaggi.length - 1] || null;
      root.dispatchEvent(
        new CustomEvent("message-selected", { detail: rappresentante, bubbles: true }),
      );
    });
    // Clic destro sull'intestazione: menu contestuale della conversazione.
    header.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const rappresentante = (c.messaggi || [])[c.messaggi.length - 1] || null;
      root.dispatchEvent(
        new CustomEvent("contextmenu-conversazione", {
          detail: { conversazione: c, messaggio: rappresentante },
          bubbles: true,
        }),
      );
    });

    blocco.append(header, figli);
    root.append(blocco);
  }
}

// --- ribbon (gruppi del riferimento + gruppo Assistente) ---
// `key` è la chiave stabile dell'azione: `src/main.js` la usa per collegare la
// voce (niente confronti sul testo etichetta). Le chiavi senza gestore sono le
// voci non disponibili nella v1 (vedi `NOMI_VOCI_V1`).
const ribbonGroups = [
  { key: "mail-new", ic: "✉︎", lb: "Nuovo messaggio<br>di posta elettronica" },
  { key: "new-items", ic: "📅", lb: "Nuovi<br>elementi" },
  { sep: true },
  { key: "delete", ic: "🗑", lb: "Elimina" },
  { key: "archive", ic: "🗄", lb: "Archivio" },
  { sep: true },
  { key: "reply", ic: "↩", lb: "Rispondi" },
  { key: "reply-all", ic: "↩↩", lb: "Rispondi<br>a tutti" },
  { key: "forward", ic: "↪", lb: "Inoltra" },
  { key: "meeting", ic: "📆", lb: "Riunione" },
  { key: "attach", ic: "📎", lb: "Allegato" },
  { sep: true },
  { key: "background", ic: "☀︎", lb: "Cambia<br>sfondo" },
  { key: "move", ic: "↦", lb: "Sposta" },
  { key: "junk", ic: "🚫", lb: "Indesiderato" },
  { key: "rules", ic: "⚙", lb: "Regole" },
  { sep: true },
  { key: "read-unread", ic: "✉︎", lb: "Letto/Da<br>leggere" },
  { key: "categorize", ic: "🏷", lb: "Categorizza" },
  { key: "complete", ic: "✔︎", lb: "Completa" },
  { key: "filter", ic: "▽", lb: "Filtra posta<br>elettronica", wide: true },
  { key: "sort", ic: "⇅", lb: "Ordina per", wide: true },
  { key: "density", ic: "☰", lb: "Densità di<br>visualizzazione", wide: true },
  { key: "advanced-search", ic: "🔍", lb: "Ricerca<br>avanzata…" },
  { sep: true },
  { key: "contact", ic: "👤", lb: "Trova<br>contatto" },
  { key: "addressbook", ic: "📖", lb: "Rubrica" },
  { key: "sync", ic: "↻", lb: "Invia e<br>ricevi" },
  { key: "settings", ic: "⚙️", lb: "Impostazioni…" },
  { sep: true },
  { key: "assistant", ic: "✦", lb: "Assistente", ai: true },
];

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

/**
 * Le schede della barra multifunzione e le voci che ognuna mostra. Sono le tre
 * schede del riferimento (Home, Organizza, Strumenti); alcune voci compaiono in
 * più di una scheda, esattamente come nell'originale.
 */
export const SCHEDE = {
  home: [
    "mail-new", "new-items", "reply", "reply-all", "forward", "meeting", "attach",
    "delete", "archive", "move", "junk", "read-unread", "categorize", "complete",
    "filter", "sort", "density", "assistant",
  ],
  organizza: [
    "delete", "archive", "move", "junk", "rules", "read-unread", "categorize",
    "complete", "filter", "sort",
  ],
  strumenti: ["sync", "rules", "contact", "addressbook", "advanced-search", "settings", "assistant"],
};

/** Le voci di una scheda, nell'ordine della definizione (coi loro separatori). */
export function vociScheda(scheda = "home") {
  const chiavi = SCHEDE[scheda] || SCHEDE.home;
  const volute = new Set(chiavi);
  const scelte = [];
  ribbonGroups.forEach((g, i) => {
    if (g.sep) return;
    if (!volute.has(g.key)) return;
    // Il separatore si tiene se nella definizione precede questa voce: così la
    // scheda conserva la spaziatura dell'originale senza inventarne una nuova.
    // Mai in testa: se è la prima voce della scheda, un separatore non ha senso.
    const precedente = ribbonGroups[i - 1];
    if (precedente && precedente.sep && scelte.length) scelte.push({ sep: true });
    scelte.push(g);
  });
  return scelte;
}

export function renderRibbon(root, scheda = "home") {
  root.replaceChildren();
  for (const g of vociScheda(scheda)) {
    if (g.sep) {
      root.append(el("span", "rb-sep"));
      continue;
    }
    const cls = ["rb", g.wide ? "rb--wide" : "", g.ai ? "rb--ai" : ""].filter(Boolean).join(" ");
    const nodo = el("div", cls, `<div class="ic">${g.ic}</div><div class="lb">${g.lb}</div>`);
    nodo.dataset.rb = g.key;
    // Le voci ancora non disponibili nella v1 si dichiarano col titolo, così
    // l'utente sa prima del clic che non fanno nulla (la riga di stato lo dice
    // comunque al clic).
    if (NON_DISPONIBILI_V1.has(g.key)) nodo.title = testoNonDisponibileRibbon(g.key);
    root.append(nodo);
  }
}

/**
 * Disegna la barra laterale. Accetta sia l'elenco piatto storico (dati di
 * esempio del browser) sia l'**albero raggruppato per account** del blocco J
 * (`alberoCartelle` in `views/cartelle-account.js`): nodi di gruppo («Tutti gli
 * account» e un nodo per casella, espandibile) e figli (le cartelle, con il
 * conteggio dei non letti).
 *
 * Il clic su una cartella emette `folder-selected` (`{ account, cartella }`);
 * il clic su un nodo di gruppo emette `folder-toggle` (`{ account }`). La voce
 * attiva porta la classe `folder--attivo`, così la selezione è sempre visibile.
 */
export function renderSidebar(root, folders = sampleFolders) {
  root.replaceChildren();
  for (const f of folders) {
    const nome = f.nome || f.name;
    const preferita = !!f.preferita;
    const group = f.kind === "group";
    const attivo = !!f.attivo || f.kind === "sel";
    const conta = f.nonLetti != null ? f.nonLetti : f.count;
    const prefix = group ? (f.open ? "▾　" : "▸　") : preferita ? "★ " : "";
    const count = conta ? `<span class="count">${conta}</span>` : "";
    const cls = [
      "folder",
      f.kind === "child" ? "folder--child" : "",
      attivo ? "folder--sel" : "",
      group ? "folder--group" : "",
      preferita ? "folder--preferita" : "",
      f.predefinito ? "folder--predefinito" : "",
      f.owner === "tutti" ? "folder--aggregato" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const chiaveIcona = chiaveIconaCartella(f.cartella || nome);
    const icona = group
      ? ""
      : `<span class="folder-ic" data-icona="${chiaveIcona}">${svgIconaCartella(chiaveIcona)}</span>`;
    const nodo = el("div", cls, `${icona}${prefix}${fugaHtml(nome)}${count}`);
    nodo.dataset.cartella = f.cartella || nome;
    nodo.dataset.kind = f.kind || "child";
    if (f.account) nodo.dataset.account = f.account;
    if (f.owner) nodo.dataset.owner = f.owner;
    if (preferita) nodo.dataset.preferita = "1";
    if (f.predefinito) {
      nodo.dataset.predefinito = "1";
      nodo.title = "Account predefinito (quello aperto all'avvio)";
    }
    // Il clic seleziona la cartella (o apre/chiude il nodo della casella).
    nodo.addEventListener("click", () => {
      if (group) {
        root.dispatchEvent(
          new CustomEvent("folder-toggle", {
            detail: { account: f.account || "", owner: f.owner || "" },
            bubbles: true,
          }),
        );
        return;
      }
      root.dispatchEvent(
        new CustomEvent("folder-selected", {
          detail: {
            account: f.account || "",
            cartella: f.cartella || nome,
            nome,
            preferita,
          },
          bubbles: true,
        }),
      );
    });
    // Il clic destro apre il menu contestuale della cartella (blocco I1): il
    // dispatcher vive in `src/main.js`. Sul nodo aggregato non ha senso.
    if (f.owner !== "tutti") {
      nodo.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        root.dispatchEvent(
          new CustomEvent("folder-contextmenu", {
            detail: {
              nome,
              preferita,
              account: f.account || "",
              kind: f.kind || "child",
              x: e.clientX,
              y: e.clientY,
            },
            bubbles: true,
          }),
        );
      });
    }
    root.append(nodo);
  }
}

/**
 * Avvisa la lista quando il mouse entra o esce dalla riga di un messaggio: chi
 * ascolta (`main.js`) decide se e quando segnarlo come letto.
 */
function collegaPassaggio(riga, root, messaggio) {
  riga.addEventListener("mouseenter", () =>
    root.dispatchEvent(new CustomEvent("message-hover", { detail: messaggio, bubbles: true })),
  );
  riga.addEventListener("mouseleave", () =>
    root.dispatchEvent(new CustomEvent("message-hover-end", { bubbles: true })),
  );
}

/**
 * Disegna la lista con le righe di gruppo ("Oggi" / "Ieri" / "Questa settimana").
 * Accetta sia i messaggi di esempio del browser sia le righe della cache.
 *
 * Ogni riga riflette lo stato del messaggio: grassetto se non letto, ⚑ pieno se
 * contrassegnato, una targhetta per categoria e ✔ se completato (vedi `statoRiga`).
 * Con `opzioni.anteprima` vero mostra anche l'anteprima del testo in coda
 * all'oggetto (preferenza "Mostra l'anteprima del testo nella lista").
 */
export function renderList(root, messages = sampleMessages, opzioni = {}) {
  root.replaceChildren();
  let gruppoCorrente = null;
  for (const m of messages) {
    const gruppo = m.group || etichettaGruppo(m.timestamp);
    if (gruppo !== gruppoCorrente) {
      root.append(el("div", "group-row", gruppo));
      gruppoCorrente = gruppo;
    }
    const st = statoRiga(m);
    const classi = st.classi.slice();
    if (m.selected) classi.push("row--sel");
    const row = document.createElement("div");
    row.className = classi.join(" ");
    row.dataset.uid = m.uid || "";
    // Targhette delle categorie: col colore definito nel pannello «Categorie».
    const targhette = targhetteCategorie(st.categorie, opzioni.coloriCategorie);
    const anteprima = opzioni.anteprima ? testoAnteprima(m) : "";
    const prevHtml = anteprima
      ? `<span class="row-preview"> — ${fugaHtml(anteprima)}</span>`
      : "";
    row.innerHTML = htmlCelleMessaggio(m, st, { anteprimaHtml: prevHtml, targhette });
    row.addEventListener("click", () => {
      for (const r of root.querySelectorAll(".row")) r.classList.remove("row--sel");
      row.classList.add("row--sel");
      root.dispatchEvent(new CustomEvent("message-selected", { detail: m, bubbles: true }));
    });
    collegaPassaggio(row, root, m);
    // Clic destro: menu contestuale del messaggio (blocco I1).
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      root.dispatchEvent(
        new CustomEvent("contextmenu-messaggio", { detail: { messaggio: m }, bubbles: true }),
      );
    });
    root.append(row);
  }
}

/**
 * Testo dell'anteprima di un messaggio: quello arrivato dal kernel (`anteprima`)
 * o, per i dati di esempio, la prima riga utile del corpo. Spazi normalizzati.
 */
export function testoAnteprima(m) {
  let t = m && (m.anteprima || "");
  if (!t && m && Array.isArray(m.body)) t = m.body.filter(Boolean).join(" ");
  if (!t && m && typeof m.body === "string") t = m.body;
  return String(t || "").replace(/\s+/g, " ").trim();
}

/**
 * I passi della scala di lettura (blocco R): gli stessi limiti di
 * `ZOOM_LETTURA_*`, ma a scatti leggibili invece che a colpi di 5%. A⁻/A⁺ si
 * muovono qui dentro.
 */
export const PASSI_ZOOM_LETTURA = [50, 75, 100, 125, 150, 200, 300, 400];

/**
 * Il passo successivo della scala di lettura: `verso` è `"dentro"` (più grande)
 * o `"fuori"` (più piccolo). Ai limiti il valore resta al limite — mai `NaN`,
 * mai zero. Un valore fuori lista si aggancia al passo successivo in quella
 * direzione, così un valore arrivato da un `config.json` modificato a mano non
 * blocca i pulsanti.
 */
export function passoZoomLettura(corrente, verso) {
  const n = limitaZoomLettura(corrente);
  const dentro = verso === "dentro";
  const candidati = dentro
    ? PASSI_ZOOM_LETTURA.filter((p) => p > n)
    : PASSI_ZOOM_LETTURA.filter((p) => p < n).reverse();
  if (candidati.length) return candidati[0];
  return dentro ? ZOOM_LETTURA_MAX : ZOOM_LETTURA_MIN;
}

export function renderReading(root, message, opzioni = {}) {
  root.replaceChildren();

  const aiBar = el("div", "ai-bar");
  // Selettore della destinazione dei dati: il valore è il provider ("locale"|"cloud"),
  // l'etichetta visibile dice dove vanno i dati ("locale · thinkingcap-27b").
  aiBar.innerHTML = `
    <span class="label">Assistente:</span>
    <button class="ai-btn ai-btn--primary" data-ai="summarize">✦ Riassumi</button>
    <button class="ai-btn ai-btn--accent" data-ai="reply">✦ Rispondi</button>
    <button class="ai-btn" data-ai="actions">✦ Estrai azioni</button>
    <button class="ai-btn" data-ai="translate">✦ Traduci</button>
    <select class="ai-model-select" aria-label="Destinazione dei dati">
      <option value="locale">locale · thinkingcap-27b</option>
      <option value="cloud">cloud · OpenRouter</option>
    </select>
    <span class="lettura-zoom">
      <button class="ai-btn" data-zoom-lettura="fuori" title="Riduci il testo del messaggio">A⁻</button>
      <span id="lettura-zoom-val" class="lettura-zoom-val">100%</span>
      <button class="ai-btn" data-zoom-lettura="dentro" title="Ingrandisci il testo del messaggio">A⁺</button>
    </span>`;
  root.append(aiBar);

  if (!message) {
    root.append(el("div", "mail-body", `<span class="sender-addr">Seleziona un messaggio per leggerlo.</span>`));
    return;
  }

  root.append(el("div", "mail-subject", message.subject));

  // Targhette delle categorie sotto l'oggetto, se ce ne sono.
  const categorie = Array.isArray(message.categories) ? message.categories : [];
  if (categorie.length) {
    // Targhette con il colore definito nel pannello «Categorie».
    root.append(el("div", "mail-cats", targhetteCategorie(categorie, opzioni.coloriCategorie)));
  }

  const sender = el("div", "mail-sender");
  sender.innerHTML = `
    <span class="avatar" style="background:${message.avatarBg || "#5B6B7B"}">${message.initial || ""}</span>
    <span>
      <span class="sender-name">${message.from}</span>
      <span class="sender-addr">&lt;${message.from.includes("@") ? message.from : message.from.toLowerCase().replace(/\s+/g, ".") + "@example.it"}&gt;</span>
      <div class="sender-to">A: ${message.to || "'Mario Rossi'"}</div>
    </span>
    <span class="mail-date">${message.date}</span>`;
  root.append(sender);

  // Barra informativa: compare solo se il messaggio ha uno stato da dichiarare
  // (contrassegnato e/o completato), così non resta una riga fissa e fuorviante.
  const stato = [];
  if (message.flagged) stato.push("⚑　Contrassegnato");
  if (message.completed) stato.push("✔　Completato");
  if (stato.length) root.append(el("div", "info-bar", stato.join("　·　")));

  // La scheda del risultato IA non è più statica: la disegna renderSchedaIA
  // (src/views/assistant.js) dopo l'azione dell'utente.

  const body = el("div", "mail-body");
  body.innerHTML = (message.body || ["(corpo del messaggio)"]).join("<br>");
  root.append(body);

  // Contenitore degli allegati: riempito quando il corpo arriva dal kernel.
  root.append(el("div", "attachments"));
}

/**
 * Prepara il corpo per l'HTML sanificato arrivato dal kernel (Milestone 4):
 * svuota `.mail-body`, vi mette la barra con "Mostra immagini" e un
 * `<iframe sandbox>` SENZA `allow-scripts` (nessuno script del corpo può
 * girare), e restituisce i nodi su cui il chiamante scrive.
 */
export function preparaCorpo(root) {
  const body = root.querySelector(".mail-body");
  if (!body) return null;
  body.replaceChildren();

  const barra = el("div", "mail-body-tools");
  const btnImmagini = el("button", "mail-btn", "🖼 Mostra immagini");
  btnImmagini.type = "button";
  barra.append(btnImmagini);

  const frame = el("iframe", "mail-frame");
  // sandbox vuoto: nessuno script, nessuna navigazione; il documento di `srcdoc`
  // resta a origine opaca e non tocca il documento dell'app.
  frame.setAttribute("sandbox", "");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("title", "Corpo del messaggio");
  body.append(barra, frame);

  const allegati = root.querySelector(".attachments") || el("div", "attachments");
  if (!allegati.parentNode) root.append(allegati);
  allegati.replaceChildren();

  return { frame, btnImmagini, allegati };
}

/** Scrive l'HTML sanificato dentro l'iframe, attraverso `srcdoc`. */
export function mostraCorpoHtml(lettura, html, stile = {}) {
  if (!lettura) return;
  lettura.frame.setAttribute("srcdoc", documentoCorpo(html, stile));
}

/**
 * Avvolge l'HTML sanificato in un documento minimo con lo stile di lettura. Il
 * documento eredita la CSP dell'app: le immagini remote partono solo dopo il
 * consenso, perché finché non sono consentite sono già state sostituite dal
 * sanitizzatore con il segnaposto.
 *
 * Con `stile` (blocco R) il corpo indossa la famiglia e la dimensione scelte in
 * «Tipi di carattere», moltiplicate per la scala di lettura. Senza `stile` il
 * documento resta quello di sempre (13px di sistema): l'impaginazione di un
 * messaggio di un client esterno non cambia se l'utente non ha scelto nulla.
 */
export function documentoCorpo(html, stile = {}) {
  const base =
    "html,body{margin:0;padding:8px 4px;background:#ffffff;color:#111111}" +
    "a{color:#0b62c4}img{max-width:100%;height:auto}" +
    ".immagine-esterna-bloccata{display:inline-block;border:1px dashed #9a9a9a;" +
    "border-radius:3px;padding:1px 6px;color:#666666;font-style:italic;font-size:12px}";
  const s =
    stile && (stile.famiglia != null || stile.dimensione != null)
      ? stileLettura(stile.famiglia, stile.dimensione, stile.zoom)
      : null;
  // La famiglia può non esistere su questa macchina (Aptos non è installata di
  // serie): senza una famiglia generica il browser ripiegherebbe sul proprio
  // default, che è un serif. La coda `sans-serif` chiude quella possibilità.
  const regola = s
    ? `html,body{font-family:${fugaHtml(`${s.famiglia}, sans-serif`)};font-size:${s.px}px;line-height:1.6}`
    : "html,body{font:13px/1.6 -apple-system,'Segoe UI',Arial,sans-serif}";
  return (
    '<!doctype html><html lang="it"><head><meta charset="utf-8"><style>' +
    base +
    regola +
    "</style></head><body>" +
    html +
    "</body></html>"
  );
}

/**
 * Lo stile di lettura calcolato: famiglia (default «Aptos»), dimensione in pixel
 * già moltiplicata per la scala di lettura, e la stringa pronta per un
 * attributo `style`. La famiglia arriva **già ripulita** da `soloFamiglia`
 * (`stileCarattere` la applica): nessuna virgoletta, nessun `;` o `{` che possa
 * cambiare una dichiarazione. `fugaHtml` al momento dell'uso è una seconda
 * cintura, non la difesa principale.
 */
export function stileLettura(famiglia, dimensione, zoom = 100) {
  const st = stileCarattere(famiglia, dimensione);
  const scala = limitaZoomLettura(zoom);
  const px = Math.round((st.fontSize * scala) / 100);
  return {
    famiglia: st.fontFamily,
    px,
    variabili: `--lettura-famiglia:${st.fontFamily};--lettura-px:${px}px;`,
  };
}

/**
 * Vero se il corpo letto va ridisegnato: cambiano la famiglia, la dimensione o
 * la scala di lettura. Tutto il resto (anteprima in lista, posizione del
 * pannello, immagini) agisce altrove e non deve toccare il messaggio aperto.
 */
export function serveRidisegnareLettura(vecchie, nuove) {
  const a = vecchie || {};
  const b = nuove || {};
  if (String(a.carattereFamiglia || "") !== String(b.carattereFamiglia || "")) return true;
  if (Number(a.carattereDimensione || 0) !== Number(b.carattereDimensione || 0)) return true;
  return limitaZoomLettura(a.letturaZoom) !== limitaZoomLettura(b.letturaZoom);
}

/** Fallback: testo semplice (con fuga dei caratteri) reso come paragrafi HTML. */
export function testoInParagrafi(testo) {
  const fuga = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (testo || "")
    .split(/\n{2,}/)
    .map((blocco) => `<p>${fuga(blocco).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Elenca gli allegati sotto il corpo: nome, tipo, dimensione e pulsante di
 * salvataggio. `onSalva(allegato, bottone, riga)` è chiamato solo su clic:
 * nessun file nasce prima di quell'azione.
 */
export function mostraAllegati(radice, allegati, onSalva) {
  radice.replaceChildren();
  if (!allegati || allegati.length === 0) return;
  radice.append(el("div", "attach-title", `Allegati (${allegati.length})`));
  for (const a of allegati) {
    const riga = el("div", "attach");
    riga.innerHTML = `<span class="attach-icon">📎</span>
      <span class="attach-name">${a.name}</span>
      <span class="attach-meta">${a.mime} · ${formatoDimensione(a.size)}</span>`;
    const bottone = el("button", "mail-btn", "Salva");
    bottone.type = "button";
    bottone.addEventListener("click", () => onSalva(a, bottone, riga));
    riga.append(bottone);
    radice.append(riga);
  }
}

/** Dimensione leggibile: "9 B", "12,3 kB", "1,4 MB". */
export function formatoDimensione(byte) {
  if (!byte) return "0 B";
  const unita = ["B", "kB", "MB", "GB"];
  let valore = byte;
  let i = 0;
  while (valore >= 1024 && i < unita.length - 1) {
    valore /= 1024;
    i += 1;
  }
  const testo = i === 0 ? String(valore) : valore.toFixed(1).replace(".", ",");
  return `${testo} ${unita[i]}`;
}

/**
 * Sostituisce il corpo del messaggio nel pannello di lettura con il testo
 * arrivato dal kernel (comando `mail_body`).
 */
export function impostaCorpo(root, testo) {
  const body = root.querySelector(".mail-body");
  if (body) body.textContent = testo;
}

export function renderStatus(countEl, syncEl, accountEl, { count, synced, account }) {
  if (count !== undefined) countEl.textContent = `Elementi: ${count}`;
  if (synced !== undefined) syncEl.textContent = synced;
  if (account !== undefined) accountEl.textContent = account;
}
