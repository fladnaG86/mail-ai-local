/**
 * Blocco J — più caselle: l'albero della barra laterale raggruppato per account.
 *
 * Funzioni **pure** (nessun DOM, nessuna chiamata): costruiscono le voci della
 * barra laterale dalla struttura che restituisce `cartelle_elenco` e calcolano
 * lo stato attivo, i conteggi dei non letti e i testi delle conferme. Le usano
 * `main.js` e i test (`node --test tests/*.mjs`).
 *
 * Struttura del riferimento (Outlook): in cima **«Tutti gli account»**, sotto un
 * nodo per ogni casella con le sue cartelle; i **Preferiti** restano dentro il
 * loro account, in alto (★). Selezionare una cartella porta la lista su
 * **quell'account e quella cartella**; «Tutti gli account → Posta in arrivo»
 * mostra la posta di tutte le caselle insieme.
 *
 * Le etichette sono quelle del riferimento: «Tutti gli account», «Posta in
 * arrivo», «Nuovo account».
 */

/** Etichetta del nodo che aggrega tutte le caselle (riferimento). */
export const TUTTI_GLI_ACCOUNT = "Tutti gli account";
/** Cartella aggregata sotto «Tutti gli account» (nome IMAP della posta in arrivo). */
export const POSTA_IN_ARRIVO = "Posta in arrivo";
/** Nome IMAP della posta in arrivo: è la cartella che si aggrega. */
export const CARTELLA_POSTA_IN_ARRIVO = "INBOX";
/** Etichetta del pulsante che apre un modulo vuoto (riferimento). */
export const NUOVO_ACCOUNT = "Nuovo account";

/** L'account di un gruppo in forma breve (email o descrizione). */
export function nomeAccount(gruppo) {
  const g = gruppo || {};
  return String(g.descrizione || g.email || g.account || "");
}

/** Somma i non letti delle cartelle di un gruppo. */
export function nonLettiDi(gruppo) {
  const cartelle = (gruppo && gruppo.cartelle) || [];
  return cartelle.reduce((tot, c) => tot + (Number(c && c.nonLetti) || 0), 0);
}

/** Il non letto di una singola cartella in un gruppo (0 se assente). */
function nonLettiCartella(gruppo, nome) {
  const c = ((gruppo && gruppo.cartelle) || []).find(
    (x) => (x.nome || "") === nome,
  );
  return c ? Number(c.nonLetti) || 0 : 0;
}

/**
 * Vero se il nodo è quello attivo. La selezione è `{ account, cartella }`:
 * `account` vuoto/assente significa «Tutti gli account». Un nodo attivo è
 * visibile in barra laterale (classe `.folder--sel`), quindi la selezione è
 * sempre osservabile.
 */
export function eAttivo(nodo, selezione = {}) {
  const n = nodo || {};
  if (n.kind === "group") return false;
  const account = String(selezione.account || "");
  const cartella = String(selezione.cartella || "");
  if (String(n.account || "") !== account) return false;
  // Il nodo aggregato di «Tutti gli account» copre la sola Posta in arrivo.
  const mia = n.account === "" ? CARTELLA_POSTA_IN_ARRIVO : String(n.cartella || "");
  return mia === cartella;
}

/**
 * L'albero della barra laterale da una struttura `cartelle_elenco` (blocco J).
 *
 * Restituisce un elenco **piatto** di nodi, nell'ordine di disegno:
 * «Tutti gli account» con la sua «Posta in arrivo» aggregata (il totale dei non
 * letti di tutte le caselle), poi un nodo per account (▸/▾) con le sue cartelle
 * (i Preferiti ★ restano in alto, dentro l'account).
 *
 * `opzioni.accountAperti` è l'insieme degli account espansi; `selezione` lo
 * stato attivo (`{ account, cartella }`).
 */
export function alberoCartelle(gruppi = [], opzioni = {}) {
  const selezione = opzioni.selezione || {};
  const aperti = opzioni.accountAperti || new Set();
  const aperto = (id) => (aperti instanceof Set ? aperti.has(id) : (aperti || []).includes(id));

  // 1. «Tutti gli account» (aggregato): sempre in cima, sempre aperto. Il suo
  // conteggio è il totale dei non letti di **tutte** le cartelle di tutte le
  // caselle; la sua «Posta in arrivo» conta solo le Posta in arrivo aggregate.
  const nodi = [];
  const elenco = Array.isArray(gruppi) ? gruppi : [];
  const totaleNonLetti = elenco.reduce((tot, g) => tot + nonLettiDi(g), 0);
  const inboxNonLetti = nonLettiAggregato(elenco, CARTELLA_POSTA_IN_ARRIVO);
  nodi.push({
    kind: "group",
    nome: TUTTI_GLI_ACCOUNT,
    account: "",
    open: true,
    owner: "tutti",
    nonLetti: totaleNonLetti,
  });
  nodi.push({
    kind: "child",
    nome: POSTA_IN_ARRIVO,
    account: "",
    cartella: CARTELLA_POSTA_IN_ARRIVO,
    nonLetti: inboxNonLetti,
    owner: "tutti",
    attivo: eAttivo({ account: "", kind: "child" }, selezione),
  });

  // 2. Un nodo per ogni casella configurata.
  for (const g of elenco) {
    const id = String(g.account || "");
    const espanso = aperto(id);
    nodi.push({
      kind: "group",
      nome: g.email || g.descrizione || id,
      account: id,
      open: espanso,
      predefinito: !!g.predefinito,
      nonLetti: nonLettiDi(g),
      owner: id,
    });
    if (!espanso) continue;
    // I **Preferiti** restano in alto dentro il loro account (★), come nel
    // riferimento; a parità, l'ordine è quello dato dal kernel (alfabetico).
    const cartelle = (Array.isArray(g.cartelle) ? g.cartelle : [])
      .slice()
      .sort((a, b) => Number(!!b.preferita) - Number(!!a.preferita));
    for (const c of cartelle) {
      nodi.push({
        kind: "child",
        nome: c.nome || "",
        account: id,
        cartella: c.nome || "",
        preferita: !!c.preferita,
        nonLetti: Number(c.nonLetti) || 0,
        owner: id,
        attivo: eAttivo(
          { kind: "child", account: id, cartella: c.nome || "" },
          selezione,
        ),
      });
    }
  }
  return nodi;
}

/**
 * Il non letto di una cartella in un gruppo, con il nome della cartella
 * aggregata risolto: comodo per i test e per le etichette.
 */
export function nonLettiAggregato(gruppi, cartella = CARTELLA_POSTA_IN_ARRIVO) {
  const elenco = Array.isArray(gruppi) ? gruppi : [];
  return elenco.reduce((tot, g) => tot + nonLettiCartella(g, cartella), 0);
}

/** Le etichette della barra di stato per la selezione attiva. */
export function etichettaAccountAttivo(gruppi, selezione = {}) {
  const account = String(selezione.account || "");
  if (!account) return TUTTI_GLI_ACCOUNT;
  const g = (gruppi || []).find((x) => String(x.account) === account);
  return g ? g.email || nomeAccount(g) : account;
}

/** Testo leggibile della cartella attiva (per la barra di stato). */
export function etichettaCartellaAttiva(selezione = {}) {
  const cartella = String(selezione.cartella || "");
  if (cartella === CARTELLA_POSTA_IN_ARRIVO) return POSTA_IN_ARRIVO;
  return cartella || POSTA_IN_ARRIVO;
}

/**
 * Testo della conferma di eliminazione di un account (blocco J). Dice cosa
 * succede **ai dati**: si rimuove solo quella casella, i suoi messaggi in cache
 * locale e la password nel Portachiavi; gli altri account non si toccano e sul
 * server non cambia nulla.
 */
export function testoConfermaEliminaAccount(account) {
  const nome = typeof account === "string" ? account : nomeAccount(account);
  return (
    `Eliminare l'account «${nome}»?\n\n` +
    "Vengono rimossi la configurazione di questa casella, la password dal Portachiavi " +
    "di macOS e i messaggi di questo account dalla cache locale. " +
    "Gli altri account non vengono toccati. Sul server di posta non cambia nulla."
  );
}

/**
 * Riepilogo leggibile dell'esito di `mail_sync_tutti` per la barra di stato: una
 * riga per account, con «N messaggi nuovi» oppure l'errore di quella casella.
 * Un account fallito non nasconde l'esito degli altri.
 */
export function riepilogoSyncTutti(esiti) {
  const elenco = Array.isArray(esiti) ? esiti : [];
  if (!elenco.length) return "Nessun account configurato: apri Impostazioni → Account.";
  const pezzi = elenco.map((e) => {
    const nome = String(e.email || e.account || "account");
    if (e.ok === false) {
      return `${nome}: non aggiornato — ${e.errore || "errore non specificato"}`;
    }
    const nuovi = Number(e.nuovi) || 0;
    return `${nome}: ${nuovi} ${nuovi === 1 ? "messaggio nuovo" : "messaggi nuovi"}`;
  });
  const falliti = elenco.filter((e) => e.ok === false).length;
  const testa =
    elenco.length === 1
      ? "Invia e ricevi:"
      : falliti > 0
        ? `Invia e ricevi su ${elenco.length} account (${falliti} non aggiornato/i):`
        : `Invia e ricevi su ${elenco.length} account:`;
  return `${testa} ${pezzi.join(" · ")}`;
}

/**
 * Blocco K — su **quale** casella agire per un'azione su un messaggio.
 *
 * Ordine di scelta: l'account della **riga** (ogni riga della lista aggregata lo
 * porta), poi la **selezione attiva** della barra laterale e, solo con **una**
 * casella, il predefinito. Con **più** caselle e nessuno dei due — per esempio
 * una riga di ricerca senza account, nella vista «Tutti gli account» — non si
 * sceglie una casella a caso: `mancante` è vero e l'azione va fermata con un
 * messaggio di stato, invece di agire su un'altra casella.
 */
export function risolviAccountAzione({
  accountRiga,
  accountAttivo,
  accountCorrente,
  numeroAccount,
} = {}) {
  const riga = String(accountRiga || "");
  if (riga) return { accountId: riga, mancante: false };
  const attivo = String(accountAttivo || "");
  if (attivo) return { accountId: attivo, mancante: false };
  const n = Number(numeroAccount) || 0;
  if (n <= 1) {
    // Una sola casella: il predefinito del kernel è lei.
    return { accountId: String(accountCorrente || ""), mancante: false };
  }
  return { accountId: "", mancante: true };
}

/**
 * Blocco L — su **quale** casella agire per un'azione su una **cartella** della
 * barra laterale.
 *
 * L'ordine di scelta è: l'**account della cartella** cliccata (ogni voce della
 * barra laterale lo porta), poi la **selezione attiva** e, solo con **una**
 * casella, il predefinito. La differenza dal messaggio è che una cartella ha
 * sempre un account; l'unico caso senza è il nodo aggregato «Tutti gli account»
 * (`account` vuoto). Con **più** caselle e un account non risolvibile (`mancante`
 * vero) l'azione va fermata con una riga di stato, invece di agire — per esempio
 * svuotare o eliminare — su una casella scelta a caso.
 */
export function risolviAccountCartella({
  accountCartella,
  accountAttivo,
  accountCorrente,
  numeroAccount,
} = {}) {
  const della = String(accountCartella || "");
  if (della) return { accountId: della, mancante: false };
  const attivo = String(accountAttivo || "");
  if (attivo) return { accountId: attivo, mancante: false };
  const n = Number(numeroAccount) || 0;
  if (n <= 1) {
    return { accountId: String(accountCorrente || ""), mancante: false };
  }
  return { accountId: "", mancante: true };
}
