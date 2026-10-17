/**
 * Azioni sui messaggi della finestra principale (blocco A).
 *
 * Il modulo ha due parti ben separate:
 * - le funzioni PURE (filtri e resa di una riga) — le usano `renderList` e i
 *   test `node:test`, senza toccare il DOM e senza dipendere dal kernel;
 * - il menu a comparsa (`apriMenu`) e i nomi delle voci, condivisi dal ribbon
 *   per Sposta / Categorizza / Filtra.
 *
 * I nomi e gli argomenti dei comandi del kernel sono quelli del contratto:
 * `{ folder, uid, … }` — qui non si chiama il kernel, si descrive soltanto lo
 * stato; la chiamata vive in `src/main.js`.
 */

/** Filtri del menu "Filtra posta elettronica", nell'ordine del riferimento. */
export const FILTRI = [
  { id: "tutti", etichetta: "Tutti" },
  { id: "non-letti", etichetta: "Non letti" },
  { id: "contrassegnati", etichetta: "Contrassegnati" },
  { id: "allegati", etichetta: "Con allegati" },
  { id: "oggi", etichetta: "Oggi" },
];

/** Etichetta leggibile di un filtro (fallback: "Tutti"). */
export function etichettaFiltro(id) {
  const f = FILTRI.find((x) => x.id === id);
  return f ? f.etichetta : FILTRI[0].etichetta;
}

/**
 * Vero se il messaggio è stato ricevuto oggi (stesso giorno di `adesso`).
 * Come `etichettaGruppo`, un messaggio senza `timestamp` conta come di oggi:
 * è il caso dei dati di esempio del browser, che non hanno una data Unix.
 */
export function messaggioOggi(m, adesso = Date.now()) {
  if (!m) return false;
  if (m.timestamp === undefined || m.timestamp === null) return true;
  const d = new Date(m.timestamp * 1000);
  const a = new Date(adesso);
  return (
    d.getFullYear() === a.getFullYear() &&
    d.getMonth() === a.getMonth() &&
    d.getDate() === a.getDate()
  );
}

/** Vero se il messaggio supera il filtro indicato. */
export function passaFiltro(m, filtro, adesso = Date.now()) {
  if (!m) return false;
  switch (filtro) {
    case "non-letti":
      return !m.seen;
    case "contrassegnati":
      return !!m.flagged;
    case "allegati":
      return !!m.has_attachments;
    case "oggi":
      return messaggioOggi(m, adesso);
    case "tutti":
    default:
      return true;
  }
}

/** Applica un filtro a un elenco di messaggi (non muta l'originale). */
export function filtra(messaggi, filtro = "tutti", adesso = Date.now()) {
  return (messaggi || []).filter((m) => passaFiltro(m, filtro, adesso));
}

/** «Nome <indirizzo>» come lo manda il kernel → nome e indirizzo (vuoto se manca). */
export function nomeEmail(mittente) {
  const s = String(mittente || "").trim();
  const m = s.match(/^(.*?)\s*<([^<>]*)>\s*$/);
  if (!m) return { nome: s, email: "" };
  const nome = m[1].replace(/^"(.*)"$/, "$1").trim();
  return nome ? { nome, email: m[2].trim() } : { nome: m[2].trim(), email: "" };
}

/** Le iniziali dell'avatar: due parole → due iniziali, una parola → due lettere. */
export function inizialiAvatar(mittente) {
  const { nome, email } = nomeEmail(mittente);
  const base = (nome || email).split("@")[0];
  const parole = base.split(/[^\p{L}]+/u).filter(Boolean);
  if (parole.length >= 2) return (parole[0][0] + parole[1][0]).toUpperCase();
  if (parole.length === 1) return parole[0].slice(0, 2).toUpperCase();
  return "?";
}

const COLORI_AVATAR = ["#C2562B", "#B8860B", "#4E8F5B", "#2E8B8B", "#4A78B5", "#7A62B8", "#B0568A", "#7A8591"];

/** Un colore stabile per mittente: lo stesso indirizzo ha sempre lo stesso avatar. */
export function coloreAvatar(chiave) {
  let h = 0;
  for (const c of String(chiave || "")) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return COLORI_AVATAR[h % COLORI_AVATAR.length];
}

/** Quale icona dare a una cartella, dal nome italiano o da quello del server. */
export function chiaveIconaCartella(nome) {
  const n = String(nome || "").toLowerCase();
  if (/bozze|draft/.test(n)) return "bozze";
  if (/inviat|sent/.test(n)) return "inviata";
  if (/elimina|trash|cestin|deleted/.test(n)) return "cestino";
  if (/archiv/.test(n)) return "archivio";
  if (/indesider|spam|junk/.test(n)) return "indesiderata";
  if (n === "inbox" || n === "posta in arrivo") return "arrivo";
  return "cartella";
}

const DISEGNI_CARTELLA = {
  arrivo: '<path d="M2 9l2-5h8l2 5v4H2z M2 9h4l1 2h2l1-2h4"/>',
  bozze: '<path d="M3 13l1-3 7-7 2 2-7 7z M9.5 4.5l2 2"/>',
  inviata: '<path d="M2 8l12-5-4 11-3-4z M7 10l7-7"/>',
  cestino: '<path d="M3 4h10 M6 4V2.5h4V4 M4.5 4l.7 9h5.6l.7-9 M7 6.5v4 M9 6.5v4"/>',
  archivio: '<path d="M2 3h12v3H2z M3 6v7h10V6 M6.5 9h3"/>',
  indesiderata: '<circle cx="8" cy="8" r="5.5"/><path d="M4 4l8 8"/>',
  cartella: '<path d="M2 4.5h4l1.5 1.5H14v7H2z"/>',
};

/** L'icona SVG (16px, tratto) di una cartella: prende il colore del testo. */
export function svgIconaCartella(chiave) {
  const disegno = DISEGNI_CARTELLA[chiave] || DISEGNI_CARTELLA.cartella;
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${disegno}</svg>`;
}

/**
 * Le celle di una riga di messaggio — pallino, mittente con avatar, oggetto,
 * icone di stato, data, categorie — uguali per lista piatta, conversazioni e
 * ricerca. `st` è `statoRiga(m)`; `extra.anteprimaHtml` e `extra.targhette` sono
 * HTML già fatto dal chiamante.
 */
export function htmlCelleMessaggio(m, st, extra = {}) {
  const { nome, email } = nomeEmail(m.from);
  const emailHtml = email ? `<span class="from-email">${fugaHtml(email)}</span>` : "";
  return `
      <span class="cell cell--dot"><span class="dot${st.nonLetto ? " dot--on" : ""}"></span></span>
      <span class="cell cell--from"><span class="avatar" style="background:${coloreAvatar(email || nome)}">${fugaHtml(inizialiAvatar(m.from))}</span><span class="from-txt"><span class="from-nome">${fugaHtml(nome)}</span>${emailHtml}</span></span>
      <span class="cell cell--subject">${fugaHtml(m.subject)}${extra.anteprimaHtml || ""}</span>
      <span class="cell cell--icons">${st.completato ? '<span class="ic ic--done">✔</span>' : ""}${m.has_attachments ? '<span class="ic ic--att">📎</span>' : ""}<span class="ic ic--star${m.flagged ? " ic--on" : ""}">${m.flagged ? "★" : "☆"}</span></span>
      <span class="cell cell--date row-date">${fugaHtml(m.date)}</span>
      <span class="cell cell--cat">${extra.targhette || ""}</span>`;
}

/** Fuga dell'HTML dei valori che l'utente può scrivere (es. una categoria). */
export function fugaHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Vero se il messaggio è stato marcato come completato. */
export function completatoRiga(m) {
  return !!(m && m.completed);
}

/** Categorie di un messaggio (sempre un elenco, mai undefined). */
export function categorieRiga(m) {
  return m && Array.isArray(m.categories) ? m.categories.slice() : [];
}

/** Pallino della colonna sinistra: pieno se NON letto, vuoto se letto. */
export function pallinoRiga(m) {
  return m && m.seen ? "○" : "▣";
}

/** Icona del contrassegno: piena (⚑) solo quando il messaggio è contrassegnato. */
export function bandieraRiga(m) {
  return m && m.flagged ? "⚑" : "";
}

/** Classi CSS della riga, derivate dallo stato del messaggio. */
export function classiRiga(m) {
  const classi = ["row"];
  if (m && !m.seen) classi.push("row--nonletto");
  if (m && m.flagged) classi.push("row--contrassegnato");
  if (completatoRiga(m)) classi.push("row--completato");
  return classi;
}

/**
 * Stato di resa di una riga, tutto in un solo oggetto: lo usano `renderList`
 * e i test. `nonLetto` guida il grassetto, `contrassegnato` l'icona ⚑,
 * `completato` l'indicatore ✔, `categorie` le targhette.
 */
export function statoRiga(m) {
  return {
    nonLetto: !(m && m.seen),
    contrassegnato: !!(m && m.flagged),
    completato: completatoRiga(m),
    categorie: categorieRiga(m),
    pallino: pallinoRiga(m),
    bandiera: bandieraRiga(m),
    classi: classiRiga(m),
  };
}

/** Categorie offerte dal menu "Categorizza" (l'utente può scriverne altre). */
export const CATEGORIE_PREDEFINITE = [
  "Lavoro",
  "Personale",
  "Fornitori",
  "Manutenzione",
  "Urgente",
  "Da fare",
];

/**
 * Aggiunge o toglie una categoria (interruttore): se c'è la toglie, se non c'è
 * la mette in coda. Un nome vuoto non cambia nulla. Non muta l'elenco originale.
 */
export function alternaCategoria(categorie, nome) {
  const pulito = String(nome == null ? "" : nome).trim();
  const attuali = Array.isArray(categorie) ? categorie.slice() : [];
  if (!pulito) return attuali;
  const i = attuali.indexOf(pulito);
  if (i >= 0) attuali.splice(i, 1);
  else attuali.push(pulito);
  return attuali;
}

/**
 * Nomi leggibili delle voci del ribbon **non disponibili** nella v1: servono a
 * scrivere una riga di stato chiara invece di lasciare un pulsante muto.
 *
 * «Riunione» non compare più qui: dal blocco G (versione inviti) apre l'agenda
 * a elenco degli inviti di riunione.
 */
export const NOMI_VOCI_V1 = {
  "new-items": "Nuovi elementi",
  attach: "Allegato",
  background: "Cambia sfondo",
};

/** Riga di stato per una voce del ribbon non disponibile nella v1. */
export function testoNonDisponibileRibbon(chiave) {
  const nome = NOMI_VOCI_V1[chiave] || chiave;
  return `${nome}: non disponibile nella v1.`;
}

/** Insieme delle chiavi del ribbon non disponibili nella v1. */
export const NON_DISPONIBILI_V1 = new Set(Object.keys(NOMI_VOCI_V1));

// ---------------------------------------------------------------------------
// Menu contestuali (blocco I1): voci per tipo di elemento, etichette esatte del
// riferimento e testi delle conferme. Funzioni PURE: le usano il disegno del
// menu (sotto) e i test `node:test`, senza toccare il DOM.
// ---------------------------------------------------------------------------

/** Le voci del sottomenu «Contrassegna», con le etichette del riferimento. */
export const SCADENZE = [
  { id: "piu-tardi-oggi", etichetta: "Più tardi oggi" },
  { id: "questa-sera", etichetta: "Questa sera" },
  { id: "domani", etichetta: "Domani" },
  { id: "prossima-settimana", etichetta: "Prossima settimana" },
  { id: "rimuovi", etichetta: "Rimuovi contrassegno" },
];

/** Etichetta leggibile di una voce di scadenza. */
export function etichettaScadenza(id) {
  const v = SCADENZE.find((s) => s.id === id);
  return v ? v.etichetta : SCADENZE[0].etichetta;
}

/** Vero se la conversazione a cui appartiene l'elemento è fra quelle ignorate. */
export function conversazioneIgnorata(m, ignorate) {
  const chiave = m && m.threadKey;
  return !!chiave && (ignorate || []).includes(chiave);
}

/** Le voci del sottomenu «Contrassegna», nella forma delle voci di menu. */
export function vociSottomenuContrassegna() {
  return SCADENZE.map((s) => ({ id: `scadenza:${s.id}`, etichetta: s.etichetta, ic: "⚑" }));
}

/**
 * Le voci del menu contestuale di un **messaggio** della lista, nell'ordine del
 * riferimento. Le etichette cambiano con lo stato:
 * `Segna come già letto` / `Segna come da leggere`,
 * `Ignora conversazione` / `Non ignorare più`,
 * `Segna come indesiderato` / `Segna come non indesiderato`.
 * `opzioni.ignorate` è l'elenco delle chiavi di conversazione ignorate.
 */
export function vociMenuMessaggio(m, opzioni = {}) {
  const ignorate = opzioni.ignorate || [];
  return [
    { id: "rispondi", etichetta: "Rispondi", ic: "↩" },
    { id: "rispondi-tutti", etichetta: "Rispondi a tutti", ic: "↩↩" },
    { id: "inoltra", etichetta: "Inoltra", ic: "↪" },
    { id: "rinvia", etichetta: "Rinvia", ic: "↻" },
    { id: "inoltra-allegato", etichetta: "Inoltra come allegato", ic: "📎" },
    { sep: true },
    { id: "copia", etichetta: "Copia nella cartella…", ic: "⧉" },
    { id: "sposta", etichetta: "Sposta nella cartella…", ic: "↦" },
    { id: "elimina", etichetta: "Elimina", ic: "🗑" },
    { id: "archivia", etichetta: "Archivia", ic: "🗄" },
    { sep: true },
    { id: "letto", etichetta: m && m.seen ? "Segna come da leggere" : "Segna come già letto", ic: "✉" },
    { id: "categorizza", etichetta: "Categorizza", ic: "🏷" },
    { id: "contrassegna", etichetta: "Contrassegna", ic: "⚑", sottomenu: vociSottomenuContrassegna() },
    { sep: true },
    { id: "ignora", etichetta: conversazioneIgnorata(m, ignorate) ? "Non ignorare più" : "Ignora conversazione", ic: "🚫" },
    { id: "indesiderato", etichetta: m && m.indesiderato ? "Segna come non indesiderato" : "Segna come indesiderato", ic: "⛔" },
  ];
}

/** Le voci del menu contestuale di una **conversazione** della lista. */
export function vociMenuConversazione(c, opzioni = {}) {
  const ignorate = opzioni.ignorate || [];
  const ignorata = !!c && ignorate.includes(c.chiave);
  return [
    { id: "rispondi", etichetta: "Rispondi", ic: "↩" },
    { id: "rispondi-tutti", etichetta: "Rispondi a tutti", ic: "↩↩" },
    { id: "inoltra", etichetta: "Inoltra", ic: "↪" },
    { id: "rinvia", etichetta: "Rinvia", ic: "↻" },
    { id: "inoltra-allegato", etichetta: "Inoltra come allegato", ic: "📎" },
    { sep: true },
    { id: "copia", etichetta: "Copia nella cartella…", ic: "⧉" },
    { id: "sposta", etichetta: "Sposta nella cartella…", ic: "↦" },
    { id: "elimina", etichetta: "Elimina", ic: "🗑" },
    { id: "archivia", etichetta: "Archivia", ic: "🗄" },
    { sep: true },
    { id: "letto", etichetta: c && c.seen ? "Segna come da leggere" : "Segna come già letto", ic: "✉" },
    { id: "contrassegna", etichetta: "Contrassegna", ic: "⚑", sottomenu: vociSottomenuContrassegna() },
    { sep: true },
    { id: "ignora", etichetta: ignorata ? "Non ignorare più" : "Ignora conversazione", ic: "🚫" },
  ];
}

/**
 * Le voci del menu contestuale di una **cartella** della barra laterale. Per un
 * gruppo (account) c'è solo «Nuova cartella»; per una cartella vera tutte le voci
 * del riferimento, con «Aggiungi a Preferiti» / «Rimuovi da Preferiti» secondo
 * lo stato.
 */
export function vociMenuCartella(cartella) {
  const nuova = { id: "nuova-cartella", etichetta: "Nuova cartella", ic: "📁" };
  if (!cartella || cartella.kind === "group") return [nuova];
  // Come in Outlook, una cartella di sistema non si rinomina né si elimina: la
  // voce resta visibile, disattivata, e dice perché.
  const sistema = cartellaDiSistema(cartella.nome)
    ? {
        disabilitata: true,
        nota: `«${cartella.nome}» è una cartella di sistema: il server la usa per ruolo, quindi non si rinomina né si elimina.`,
      }
    : {};
  return [
    nuova,
    { id: "rinomina-cartella", etichetta: "Rinomina cartella", ic: "✎", ...sistema },
    { id: "elimina-cartella", etichetta: "Elimina cartella", ic: "🗑", ...sistema },
    { id: "svuota-cartella", etichetta: "Svuota cartella", ic: "🧹" },
    { sep: true },
    { id: "segna-tutti-letti", etichetta: "Segna tutti come già letti", ic: "✉" },
    { id: "preferita", etichetta: cartella.preferita ? "Rimuovi da Preferiti" : "Aggiungi a Preferiti", ic: "★" },
  ];
}

/**
 * Nomi delle cartelle di sistema, confrontati sull'ultimo componente del nome
 * («INBOX.Drafts» → «Drafts»). Sono quelli con cui il kernel riconosce le
 * cartelle per ruolo (`NOMI_*` in `src-tauri/src/mail/ops.rs`), più la Posta in
 * arrivo.
 */
const NOMI_CARTELLE_SISTEMA = [
  "inbox", "posta in arrivo",
  "bozze", "drafts", "bozza", "draft",
  "posta inviata", "sent", "sent items", "sent messages", "elementi inviati", "inviata",
  "posta eliminata", "trash", "eliminata", "deleted items", "deleted messages", "cestino",
  "posta indesiderata", "junk", "junk e-mail", "indesiderata", "spam",
  "archivio", "archive", "all mail",
];

/** Vero se `nome` è una cartella di sistema (Posta in arrivo, Bozze, Inviata, …). */
export function cartellaDiSistema(nome) {
  const n = String(nome || "").trim().toLowerCase();
  if (!n) return false;
  const ultimo = n.split(/[/\\.]/).pop().trim();
  return NOMI_CARTELLE_SISTEMA.includes(n) || NOMI_CARTELLE_SISTEMA.includes(ultimo);
}

/** Testo della conferma prima di **eliminare** una cartella (mai muta). */
export function testoConfermaEliminaCartella(nome) {
  return `Eliminare la cartella «${nome}» e tutto il suo contenuto? L'operazione non può essere annullata.`;
}

/** Testo della conferma prima di **svuotare** una cartella. */
export function testoConfermaSvuotaCartella(nome) {
  return `Svuotare la cartella «${nome}»? Tutti i messaggi saranno eliminati definitivamente.`;
}

/** Testo della conferma dedicata a **Svuota Posta eliminata**. */
export function testoConfermaSvuotaPostaEliminata() {
  return "Svuotare Posta eliminata? Tutti i messaggi saranno eliminati definitivamente.";
}

/** Vero se il nome è la Posta eliminata (per la conferma dedicata). */
export function ePostaEliminata(nome) {
  return [
    "posta eliminata",
    "trash",
    "eliminata",
    "deleted items",
    "deleted messages",
    "cestino",
  ].includes(String(nome == null ? "" : nome).trim().toLowerCase());
}

/** La conferma di svuotamento giusta per la cartella indicata. */
export function testoConfermaSvuotamento(nome) {
  return ePostaEliminata(nome) ? testoConfermaSvuotaPostaEliminata() : testoConfermaSvuotaCartella(nome);
}

// ---------------------------------------------------------------------------
// Menu a comparsa (DOM): un livello e sottomenu («Contrassegna»)
// ---------------------------------------------------------------------------

let menuAperti = [];
let ancoraRadice = null;
let chiudiAlClick = null;

function chiudiAlTasto(e) {
  if (e.key === "Escape") chiudiMenu();
}

/** Chiude tutti i menu aperti (un livello o più), se ce ne sono. */
export function chiudiMenu() {
  for (const m of menuAperti) m.remove();
  menuAperti = [];
  ancoraRadice = null;
  if (chiudiAlClick) {
    document.removeEventListener("mousedown", chiudiAlClick, true);
    chiudiAlClick = null;
  }
  document.removeEventListener("keydown", chiudiAlTasto, true);
}

/** Posiziona un menu sotto l'elemento a cui è ancorato, dentro lo schermo. */
function posiziona(menu, ancora, punto) {
  // Un menu contestuale (clic destro) si apre dove si è fatto clic, gli altri
  // sotto la loro ancora; se sotto non c'è posto, sopra.
  const r = punto
    ? { left: punto.x, top: punto.y, bottom: punto.y }
    : ancora && ancora.getBoundingClientRect
      ? ancora.getBoundingClientRect()
      : { left: 0, top: 0, bottom: 0 };
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const left = Math.max(4, Math.min(r.left, window.innerWidth - mw - 8));
  let top = r.bottom + 2;
  if (top + mh > window.innerHeight - 4) top = Math.max(4, (r.top || 0) - mh - 2);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

/**
 * Crea un livello di menu. `annidato` vero è un sottomenu: non chiude il livello
 * padre, così «Contrassegna» apre la sua tendina senza far sparire il resto.
 *
 * `voci` è un elenco di `{ id, etichetta, ic, attivo, sottomenu }` oppure
 * `{ sep: true }`. `onScegli(voce)` è chiamato solo al clic su una voce senza
 * sottomenu. Con `opzioni.campo` si aggiunge in coda una schermata di testo;
 * con `opzioni.punto` ({x, y}) il menu si apre in quel punto (clic destro).
 */
function creaLivello(ancora, voci, onScegli, opzioni, annidato) {
  if (!annidato) chiudiMenu();
  const menu = document.createElement("div");
  menu.className = "rb-menu" + (annidato ? " rb-menu--sottomenu" : "");
  menu.setAttribute("role", "menu");

  for (const v of voci) {
    if (v.sep) {
      const s = document.createElement("div");
      s.className = "rb-menu-sep";
      menu.append(s);
      continue;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rb-menu-voce" + (v.attivo ? " rb-menu-voce--attivo" : "");
    b.setAttribute("role", "menuitem");
    // Una voce disattivata resta visibile e dice perché (`nota`), mai muta.
    if (v.disabilitata) {
      b.disabled = true;
      b.setAttribute("aria-disabled", "true");
      if (v.nota) b.title = v.nota;
    }
    const freccia = Array.isArray(v.sottomenu) ? `<span class="rb-menu-freccia">▸</span>` : "";
    // Una voce con `colore` (voce «Categorizza») mostra l'icona nel colore
    // della categoria; negli altri menu l'icona resta neutra.
    const stileIc = v.colore ? ` style="color: ${fugaHtml(v.colore)}"` : "";
    b.innerHTML = `<span class="rb-menu-ic"${stileIc}>${v.attivo ? "✓" : fugaHtml(v.ic || "")}</span><span class="rb-menu-lb">${fugaHtml(v.etichetta)}</span>${freccia}`;
    if (Array.isArray(v.sottomenu)) {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        creaLivello(b, v.sottomenu, onScegli, {}, true);
      });
    } else {
      b.addEventListener("click", () => {
        chiudiMenu();
        onScegli(v);
      });
    }
    menu.append(b);
  }

  if (opzioni.campo) {
    const riga = document.createElement("div");
    riga.className = "rb-menu-campo";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "rb-menu-input";
    input.placeholder = opzioni.campo.placeholder || "";
    const aggiungi = document.createElement("button");
    aggiungi.type = "button";
    aggiungi.className = "rb-menu-aggiungi";
    aggiungi.textContent = "Aggiungi";
    const invia = () => {
      const t = input.value.trim();
      if (!t) return;
      chiudiMenu();
      opzioni.campo.invia(t);
    };
    aggiungi.addEventListener("click", invia);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        invia();
      }
    });
    riga.append(input, aggiungi);
    menu.append(riga);
  }

  document.body.append(menu);
  if (!annidato) ancoraRadice = ancora;
  menuAperti.push(menu);
  posiziona(menu, ancora, annidato ? null : opzioni.punto);

  if (!chiudiAlClick) {
    chiudiAlClick = (e) => {
      const dentro = menuAperti.some((m) => m.contains(e.target));
      const suAncora = ancoraRadice && ancoraRadice.contains && ancoraRadice.contains(e.target);
      if (!dentro && !suAncora) chiudiMenu();
    };
    document.addEventListener("mousedown", chiudiAlClick, true);
    document.addEventListener("keydown", chiudiAlTasto, true);
  }
  return menu;
}

/**
 * Apre un menu ancorato a un elemento (una voce del ribbon, una riga della lista,
 * una cartella della barra laterale). Un sottomenu si apre dalla voce stessa.
 */
export function apriMenu(ancora, voci, onScegli, opzioni = {}) {
  return creaLivello(ancora, voci, onScegli, opzioni, false);
}
