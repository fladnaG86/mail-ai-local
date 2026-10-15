/**
 * Finestra "Account" (Milestone 2.3, estesa dal **blocco J — più caselle**).
 *
 * Riproduce la finestra del riferimento misurata nella spec §2.5: 738 × 742 pt,
 * pannello di sinistra da 200 pt con l'elenco degli account, a destra il modulo
 * con Descrizione account, Informazioni personali e Informazioni server (IMAP e
 * SMTP con porta e SSL).
 *
 * Blocco J: il pannello di sinistra elenca **tutti** gli account configurati (non
 * solo il primo) con l'account **predefinito** segnalato; cliccando un account lo
 * si modifica; **«＋ Nuovo account»** apre un modulo vuoto e **aggiunge** senza
 * toccare gli altri (il salvataggio per id è un upsert: un indirizzo diverso crea
 * una riga nuova); **«−»** elimina con conferma; **«Sincronizza ora»** agisce
 * sull'account aperto. Dopo ogni operazione la lista si aggiorna **senza**
 * riaprire la finestra (`onRicarica`).
 *
 * La password NON viene mai salvata nel file di configurazione: il kernel la
 * scrive nel Keychain di macOS (`account_save` → `secrets`). I campi dei server
 * mostrano in grigio i valori di riferimento Esempio Host come *suggerimento*: si
 * salvano solo quando l'utente li conferma.
 *
 * Scelte dichiarate, per non fingere funzioni che non ci sono:
 * - "Avanzate…" e "Altre opzioni…" dichiarano di non essere disponibili nella v1;
 * - dopo il salvataggio compare una riga discreta "Account salvato · Sincronizza
 *   ora": serve a provare subito che le credenziali funzionino.
 */

import { PULSANTE_CHIUDI } from "./blocco-i2.js";

const SUGGERIMENTI = {
  imapHost: "imaps.esempiohost.it",
  imapPort: "993",
  smtpHost: "smtps.esempiohost.it",
  smtpPort: "465",
};

/** Valori di esempio per il percorso browser (prove visive). */
export const accountDiEsempio = {
  id: "mario.rossi@esempiogroup.it",
  description: "mario.rossi@esempiogroup.it",
  fullName: "Mario Rossi",
  email: "mario.rossi@esempiogroup.it",
  username: "mario.rossi@esempiogroup.it",
  imapHost: "imaps.esempiohost.it",
  imapPort: 993,
  imapSsl: true,
  smtpHost: "smtps.esempiohost.it",
  smtpPort: 465,
  smtpSsl: true,
};

/** Una seconda casella di esempio: serve alle prove visive con due account. */
export const secondoAccountDiEsempio = {
  id: "m.rossi@gmail.com",
  description: "Casella personale",
  fullName: "Mario Rossi",
  email: "m.rossi@gmail.com",
  username: "m.rossi@gmail.com",
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapSsl: true,
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSsl: true,
};

function dentroTauri() {
  return typeof window !== "undefined" && !!(window.__TAURI__ && window.__TAURI__.core);
}

async function comando(nome, args) {
  if (!dentroTauri()) return null;
  try {
    return await window.__TAURI__.core.invoke(nome, args);
  } catch (err) {
    console.warn(`comando ${nome} non riuscito:`, err);
    throw err;
  }
}

/** Fuga dell'HTML per i valori scritti dall'utente. */
function fuga(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Le righe del pannello di sinistra (blocco J): una per account, con
 * l'indicazione dell'**account predefinito** e della riga **selezionata**. È una
 * funzione pura: la usano la finestra e i test.
 */
export function righeAccount(elenco = [], predefinitoId = "", selezionatoId = "") {
  return (Array.isArray(elenco) ? elenco : []).map((a) => ({
    id: a.id,
    nome: a.description || a.email || a.id,
    email: a.email || "",
    predefinito: !!a.id && a.id === predefinitoId,
    selezionato: !!a.id && a.id === selezionatoId,
  }));
}

/**
 * Trasforma i campi del modulo nell'oggetto `Account` atteso dal kernel
 * (serde camelCase) più la password. Funzione pura: la usano i test.
 */
export function creaAccountDaCampi(campi) {
  const testo = (v) => String(v == null ? "" : v).trim();
  const intero = (v) => {
    const n = Number.parseInt(String(v == null ? "" : v).trim(), 10);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    account: {
      id: testo(campi.email) || testo(campi.username),
      description: testo(campi.description) || testo(campi.email),
      fullName: testo(campi.fullName),
      email: testo(campi.email),
      username: testo(campi.username),
      imapHost: testo(campi.imapHost),
      imapPort: intero(campi.imapPort),
      imapSsl: !!campi.imapSsl,
      smtpHost: testo(campi.smtpHost),
      smtpPort: intero(campi.smtpPort),
      smtpSsl: !!campi.smtpSsl,
    },
    password: String(campi.password == null ? "" : campi.password),
  };
}

/**
 * Controlla i campi prima di salvare. Restituisce l'elenco degli errori in
 * italiano: vuoto significa che si può salvare.
 */
export function erroriAccount(campi, { richiediPassword = true } = {}) {
  const errori = [];
  const t = (v) => String(v == null ? "" : v).trim();
  const emailOk = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t(v));
  const portaOk = (v) => {
    const n = Number.parseInt(t(v), 10);
    return Number.isFinite(n) && n > 0 && n < 65536;
  };

  if (!emailOk(campi.email)) errori.push("Indirizzo email mancante o non valido.");
  if (!t(campi.username)) errori.push("Nome utente mancante (di solito è l'indirizzo completo).");
  if (!t(campi.imapHost)) errori.push("Server di posta in arrivo mancante.");
  if (!portaOk(campi.imapPort)) errori.push("Porta di posta in arrivo non valida.");
  if (!t(campi.smtpHost)) errori.push("Server di posta in uscita mancante.");
  if (!portaOk(campi.smtpPort)) errori.push("Porta di posta in uscita non valida.");
  if (richiediPassword && !t(campi.password)) errori.push("Password mancante.");
  return errori;
}

/**
 * Blocco M — diagnostica della connessione: formattazione per la finestra e per
 * gli appunti, più i consigli in italiano.
 *
 * Sono funzioni **pure** (nessun DOM, nessuna rete): le usano la finestra Account
 * e i test `node --test`. Il kernel produce, per ogni passo, il testo tecnico
 * esatto del server; qui si aggiunge la riga che spiega a una persona non tecnica
 * che cosa significa e che cosa controllare.
 */

/** Icona del passo nella finestra: ✓ se riuscito, ✗ se in errore. */
export function iconaPasso(esito) {
  return esito === "ok" ? "✓" : "✗";
}

/**
 * Consiglio in italiano per un passo in errore: che cosa significa e che cosa
 * controllare. `dettaglio` è il testo del server o dell'errore di rete: quando
 * contiene un indizio noto (autenticazione rifiutata, certificato scaduto, DNS)
 * il consiglio diventa più preciso.
 */
export function consiglioDiagnostica(passo, dettaglio = "") {
  const p = String(passo || "").toLowerCase();
  const d = String(dettaglio || "").toLowerCase();
  const ha = (...chiavi) => chiavi.some((c) => d.includes(c));

  if (p === "nome server") {
    return (
      "Il nome del server non è stato trovato, come quando si sbaglia un indirizzo. " +
      "Controlla com'è scritto: su Esempio Host è imaps.esempiohost.it per la posta in arrivo e " +
      "smtps.esempiohost.it per quella in uscita, senza «http://», senza spazi e senza barre. " +
      "Se sei fuori ufficio, verifica anche di avere una connessione a Internet."
    );
  }
  if (p === "connessione") {
    return (
      "Il server esiste ma non risponde sulla porta indicata, come una porta chiusa. " +
      "Controlla il numero di porta (993 per la posta in arrivo, 465 per quella in uscita) " +
      "e che un firewall o l'antivirus non stiano bloccando il programma."
    );
  }
  if (p === "certificato") {
    if (ha("scadut", "expired")) {
      return (
        "Il certificato di sicurezza del server è scaduto: la connessione non può essere " +
        "considerata sicura. Non dipende dalla tua password né dalla tua configurazione: " +
        "segnalalo all'assistenza del tuo fornitore di posta."
      );
    }
    return (
      "La connessione non è stata messa in sicurezza (TLS): il certificato del server non è " +
      "stato accettato. Controlla che la casella «Usa SSL» sia spuntata e che l'orologio del " +
      "Mac sia all'ora giusta; se il problema resta, non è la tua password."
    );
  }
  if (p === "saluto del server") {
    return (
      "Il server ha risposto in modo inatteso: probabilmente non è un server di posta, oppure " +
      "la porta o il tipo di cifratura sono sbagliati (TLS diretto sulla 993/465, oppure " +
      "STARTTLS sulla 143/587). Controlla porta e casella «Usa SSL»."
    );
  }
  if (p === "accesso") {
    if (ha("portachiavi", "keychain")) {
      return (
        "Non c'è una password salvata per questo account. Scrivila nella finestra Account " +
        "(va nel Portachiavi di macOS, non in un file) e premi di nuovo «Prova connessione…»."
      );
    }
    if (
      ha(
        "authenticationfailed",
        "authentication failed",
        "rifiutato l'accesso",
        "invalid credentials",
        "535",
        "5.7.8",
        "login failed",
      )
    ) {
      return (
        "Il server ha rifiutato utente o password. Verifica il nome utente: su Esempio Host è di solito " +
        "l'indirizzo completo (nome@dominio.it), non solo la parte prima della chiocciola. Se il " +
        "nome utente è giusto, la password salvata non è più valida: riscrivila nella finestra " +
        "Account e riprova."
      );
    }
    return (
      "La connessione è arrivata al server ma l'accesso non è stato accettato. Controlla nome " +
      "utente e password nella finestra Account; se il provider le richiede, verifica anche che " +
      "l'accesso da programmi esterni sia abilitato."
    );
  }
  if (p === "cartelle") {
    return (
      "L'accesso è riuscito, ma il server non ha elencato le cartelle. Riprova fra qualche minuto: " +
      "di solito è un disservizio temporaneo del server di posta, non un problema del tuo account."
    );
  }
  return (
    "Questo passo non è riuscito. Il testo qui sopra è la risposta del server: incollalo a chi ti " +
    "assiste con il pulsante «Copia il risultato»."
  );
}

/**
 * Le righe mostrate nella finestra: per ogni passo l'icona, il nome, il testo
 * tecnico del server e — se il passo è fallito — il consiglio in italiano.
 */
export function formattaPassi(passi = []) {
  return (Array.isArray(passi) ? passi : []).map((p) => {
    const esito = p && p.esito === "ok" ? "ok" : "errore";
    const passo = String((p && p.passo) || "");
    const dettaglio = String((p && p.dettaglio) || "");
    return {
      passo,
      esito,
      icona: iconaPasso(esito),
      dettaglio,
      consiglio: esito === "errore" ? consiglioDiagnostica(passo, dettaglio) : "",
    };
  });
}

/**
 * Il testo completo da mettere negli appunti: tutto ciò che serve a chi assiste
 * l'utente, senza dover descrivere a voce che cosa si vede in finestra.
 * Accetta uno o più esiti (ricezione e invio).
 */
export function testoDiagnostica(esiti = []) {
  const blocchi = (Array.isArray(esiti) ? esiti : [])
    .filter(Boolean)
    .map((e) => {
      const righe = [`=== Prova della connessione — ${String(e.protocollo || "")} ===`];
      for (const r of formattaPassi(e.passi)) {
        righe.push(`${r.icona} ${r.passo}: ${r.dettaglio}`);
        if (r.consiglio) righe.push(`   → ${r.consiglio}`);
      }
      righe.push(`Risultato: ${String(e.riepilogo || "")}`);
      return righe.join("\n");
    });
  return blocchi.join("\n\n");
}

/** Legge i campi dal modulo della finestra. */
function leggiCampi(overlay) {
  const val = (sel) => {
    const el = overlay.querySelector(sel);
    return el ? el.value : "";
  };
  const chk = (sel) => {
    const el = overlay.querySelector(sel);
    return !!(el && el.checked);
  };
  return {
    description: val("#acc-descrizione"),
    fullName: val("#acc-nome"),
    email: val("#acc-email"),
    username: val("#acc-utente"),
    password: val("#acc-password"),
    imapHost: val("#acc-imap-host"),
    imapPort: val("#acc-imap-porta"),
    imapSsl: chk("#acc-imap-ssl"),
    smtpHost: val("#acc-smtp-host"),
    smtpPort: val("#acc-smtp-porta"),
    smtpSsl: chk("#acc-smtp-ssl"),
  };
}

/** Mostra un esito nella riga di stato della finestra. */
function stato(overlay, testo, errore = false) {
  const riga = overlay.querySelector("#acc-stato");
  if (!riga) return;
  riga.textContent = testo;
  riga.classList.toggle("acc-stato--errore", !!errore);
}

/**
 * Il testo del pannello di sinistra quando non c'è nessun account.
 *
 * Dipende da **come** è stata aperta la finestra, perché la stessa frase in due
 * situazioni diverse è un errore in una delle due:
 * - apertura normale (`primoAvvio: false`): il modulo è chiuso, quindi si dice
 *   dove sta il pulsante;
 * - primo avvio (`primoAvvio: true`): la finestra si apre da sé **col modulo
 *   già pronto** (`boot()`), e invitare a premere «＋ Nuovo account» sarebbe
 *   l'istruzione per un'azione già avvenuta. Si dice invece cosa fare nel
 *   modulo che si ha davanti.
 *
 * Funzione pura: la prova non ha bisogno di un DOM.
 */
export function testoElencoVuoto({ primoAvvio = false } = {}) {
  return primoAvvio
    ? "Nessun account configurato.<br>Compila i campi qui a destra per aggiungere la tua casella."
    : "Nessun account configurato.<br>Aggiungine uno con «＋ Nuovo account».";
}

/** Markup dell'elenco degli account (pannello di sinistra, blocco J). */
function markupElenco(statoWin) {
  const righe = righeAccount(statoWin.elenco, statoWin.predefinito, statoWin.selezionato);
  if (!righe.length) {
    return `<div class="acc-vuoto">${testoElencoVuoto({ primoAvvio: statoWin.primoAvvio })}</div>`;
  }
  return righe
    .map(
      (r) => `
      <div class="acc-riga ${r.selezionato ? "acc-riga--sel" : ""}" data-account="${fuga(r.id)}" role="button" tabindex="0">
        <div class="acc-riga-desc">${r.predefinito ? "Account predefinito" : "Account"}</div>
        <div class="acc-riga-nome"><span class="acc-punto"></span> ${fuga(r.nome)}</div>
        <div class="acc-riga-mail">${fuga(r.email)}</div>
      </div>`,
    )
    .join("");
}

/**
 * Markup della prova della connessione (blocco M): i pulsanti e i passi con
 * ✓/✗. Vuoto finché non si preme «Prova connessione…».
 */
function markupDiagnostica(esiti, selezionato) {
  const lista = Array.isArray(esiti) ? esiti.filter(Boolean) : [];
  const passi = lista
    .map((e) => {
      const righe = formattaPassi(e.passi)
        .map(
          (r) => `
        <div class="acc-diag-passo acc-diag-passo--${r.esito}">
          <span class="acc-diag-icona">${r.icona}</span>
          <div class="acc-diag-testo">
            <div class="acc-diag-nome">${fuga(r.passo)}</div>
            <div class="acc-diag-dettaglio">${fuga(r.dettaglio)}</div>
            ${r.consiglio ? `<div class="acc-diag-consiglio">${fuga(r.consiglio)}</div>` : ""}
          </div>
        </div>`,
        )
        .join("");
      return `
      <div class="acc-diag-blocco">
        <div class="acc-diag-titolo">${fuga(e.protocollo || "")}${e.protocollo === "IMAP" ? " · posta in arrivo" : e.protocollo === "SMTP" ? " · posta in uscita" : ""}</div>
        ${righe}
        <div class="acc-diag-riepilogo ${e.interrotto ? "acc-diag-riepilogo--errore" : ""}">${fuga(e.riepilogo || "")}</div>
      </div>`;
    })
    .join("");

  return `
      <div class="acc-sezione">Prova della connessione</div>
      <div class="acc-diag-azioni">
        <button class="mail-btn" id="acc-prova" type="button" ${selezionato ? "" : "disabled"}
                title="${selezionato ? "Prova passo per passo la connessione dell'account selezionato" : "Seleziona un account da provare"}">Prova connessione…</button>
        <button class="mail-btn" id="acc-copia" type="button" ${lista.length ? "" : "disabled"}
                title="${lista.length ? "Copia tutti i passi negli appunti, da incollare a chi ti assiste" : "Nessuna prova da copiare"}">Copia il risultato</button>
      </div>
      <div class="acc-diag" id="acc-diag">${
        lista.length
          ? passi
          : `<div class="acc-diag-vuoto">Nessuna prova eseguita. «Prova connessione…» controlla il nome del server, la connessione, il certificato, il saluto, l'accesso e le cartelle: si ferma al primo passo che non riesce e riporta la risposta del server.</div>`
      }</div>`;
}

/** Markup del modulo dell'account selezionato (o del nuovo account). */
function markupModulo(account, statoWin) {
  const v = (x) => fuga(x == null ? "" : x);
  const ph = (valore, suggerimento) =>
    valore === "" || valore == null ? ` placeholder="${v(suggerimento)}"` : ` value="${v(valore)}"`;
  const nuovo = !account.id;
  const predefinito = !nuovo && account.id === statoWin.predefinito;

  return `
    <div class="account-modulo">
      <div class="acc-intestazione">
        <span class="acc-badge">IMAP</span>
        <div>
          <div class="acc-titolo">${v(account.email) || "Nuovo account"}</div>
          <div class="acc-sottotitolo">${nuovo ? "Nuovo account" : "Account IMAP"}${predefinito ? " · predefinito" : ""}</div>
        </div>
        ${
          nuovo || predefinito
            ? ""
            : `<button class="mail-btn acc-predefinito" id="acc-rendi-predefinito" type="button"
                 title="Apri questa casella all'avvio">Rendi predefinito</button>`
        }
      </div>

      <div class="acc-riga-campo">
        <label for="acc-descrizione">Descrizione account:</label>
        <input id="acc-descrizione" class="acc-input"${ph(account.description, "nome del tuo account")}>
      </div>

      <div class="acc-sezione">Informazioni personali</div>
      <div class="acc-riga-campo">
        <label for="acc-nome">Nome completo:</label>
        <input id="acc-nome" class="acc-input"${ph(account.fullName, "Nome Cognome")}>
      </div>
      <div class="acc-riga-campo">
        <label for="acc-email">Indirizzo email:</label>
        <input id="acc-email" class="acc-input"${ph(account.email, "nome@dominio.it")}>
      </div>

      <div class="acc-sezione">Informazioni server</div>
      <div class="acc-riga-campo">
        <label for="acc-utente">Nome utente:</label>
        <input id="acc-utente" class="acc-input"${ph(account.username, "nome@dominio.it")}>
      </div>
      <div class="acc-riga-campo">
        <label for="acc-password">Password:</label>
        <input id="acc-password" class="acc-input" type="password" placeholder="nel Keychain di macOS">
      </div>
      <div class="acc-riga-campo">
        <label for="acc-imap-host">Server posta in arrivo:</label>
        <div class="acc-host">
          <input id="acc-imap-host" class="acc-input"${ph(account.imapHost, SUGGERIMENTI.imapHost)}>
          <span class="acc-due-punti">:</span>
          <input id="acc-imap-porta" class="acc-input acc-porta"${ph(account.imapPort, SUGGERIMENTI.imapPort)}>
        </div>
      </div>
      <div class="acc-opzioni">
        <label><input type="checkbox" id="acc-imap-ssl" ${account.imapSsl ? "checked" : ""}> Usa SSL per la connessione (scelta consigliata)</label>
      </div>
      <div class="acc-riga-campo">
        <label for="acc-smtp-host">Server posta in uscita:</label>
        <div class="acc-host">
          <input id="acc-smtp-host" class="acc-input"${ph(account.smtpHost, SUGGERIMENTI.smtpHost)}>
          <span class="acc-due-punti">:</span>
          <input id="acc-smtp-porta" class="acc-input acc-porta"${ph(account.smtpPort, SUGGERIMENTI.smtpPort)}>
        </div>
      </div>
      <div class="acc-opzioni">
        <label><input type="checkbox" id="acc-smtp-ssl" ${account.smtpSsl ? "checked" : ""}> Usa SSL per la connessione (scelta consigliata)</label>
        <button class="mail-btn" type="button" disabled title="non disponibile nella v1">Altre opzioni…</button>
      </div>

      ${markupDiagnostica(statoWin.diagnostica, statoWin.selezionato)}

      <div class="acc-piede">
        <span class="acc-stato" id="acc-stato">La password va nel Portachiavi di macOS, non nel file di configurazione.</span>
      </div>
    </div>`;
}

function markup(statoWin) {
  const account = statoWin.modulo || {};
  return `
  <div class="compose-overlay" id="acc-overlay">
    <div class="account-window">
      <div class="compose-titlebar">
        ${PULSANTE_CHIUDI}
        <span class="compose-tb-title">Account</span>
        <button class="mail-btn" id="acc-mostra-tutte" type="button">Mostra tutte</button>
      </div>

      <div class="account-corpo">
        <div class="account-elenco">
          <div class="acc-elenco-lista">${markupElenco(statoWin)}</div>
          <div class="acc-azioni">
            <button class="mail-btn acc-azione" id="acc-nuovo" type="button" title="Nuovo account">＋ Nuovo account</button>
            <button class="mail-btn acc-azione" id="acc-elimina" type="button" ${statoWin.selezionato ? "" : "disabled"}
                    title="${statoWin.selezionato ? "Elimina l'account selezionato" : "Seleziona un account da eliminare"}">−</button>
            <button class="mail-btn acc-azioni-punti" type="button" disabled title="non disponibile nella v1">⋯</button>
          </div>
        </div>

        <div class="account-modulo-contenitore">${markupModulo(account, statoWin)}</div>
      </div>
    </div>
  </div>`;
}

/**
 * Copia un testo negli appunti. Prova prima l'API moderna (che nella finestra
 * Tauri richiede un contesto sicuro) e ripiega sulla selezione temporanea, che
 * funziona anche quando l'API non è disponibile. Funzione pura rispetto allo
 * stato della finestra: la usano anche i test con un DOM finto.
 */
export async function copiaTesto(testo) {
  const t = String(testo == null ? "" : testo);
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch (err) {
    // Cade nel ripiego: l'API può mancare o essere rifiutata.
  }
  try {
    if (typeof document === "undefined") return false;
    const area = document.createElement("textarea");
    area.value = t;
    area.setAttribute("readonly", "");
    area.style.position = "absolute";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return !!ok;
  } catch (err) {
    return false;
  }
}

/**
 * Apre la finestra Account. Opzioni: `account` (account aperto nel modulo),
 * `elenco` (tutti gli account configurati), `predefinito` (id dell'account
 * predefinito), `onSalva`, `onElimina`, `onSincronizza`, `onPredefinito`,
 * `onRicarica` (rilegge elenco e predefinito senza riaprire la finestra),
 * `onConferma` (conferma testuale in una finestrella), `onMostraTutte`,
 * `onDiagnostica` (blocco M: esegue la prova della connessione e restituisce
 * l'elenco degli esiti) e `diagnostica` (esiti già pronti, per le prove visive).
 */
export function apriAccount(opzioni = {}) {
  document.querySelectorAll("#acc-overlay").forEach((el) => el.remove());

  const statoWin = {
    elenco: Array.isArray(opzioni.elenco) ? opzioni.elenco.slice() : [],
    predefinito: opzioni.predefinito || (opzioni.elenco && opzioni.elenco[0] ? opzioni.elenco[0].id : ""),
    selezionato: opzioni.account && opzioni.account.id ? opzioni.account.id : "",
    modulo: opzioni.account ? { ...opzioni.account } : {},
    ultimoSalvato: null,
    // Primo avvio: la finestra l'ha aperta `boot()` da sé, col modulo già
    // pronto. Cambia solo il testo dell'elenco vuoto, che altrimenti direbbe di
    // premere «＋ Nuovo account» — un'azione già avvenuta (vedi
    // `testoElencoVuoto`).
    primoAvvio: !!opzioni.primoAvvio,
    // Blocco M: l'esito della prova della connessione (ricezione + invio),
    // conservato nello stato così sopravvive a un ridisegno della finestra.
    diagnostica: Array.isArray(opzioni.diagnostica) ? opzioni.diagnostica.slice() : [],
  };

  const finestra = document.createElement("div");
  finestra.innerHTML = markup(statoWin);
  const overlay = finestra.firstElementChild;
  document.body.append(overlay);

  const chiudi = () => overlay.remove();
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") chiudi();
  });
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) chiudi();
  });

  /**
   * Ridisegna il contenuto della finestra (elenco e modulo) e ricollega i
   * gestori. Dopo un salvataggio o un'eliminazione la lista è aggiornata senza
   * chiudere e riaprire la finestra.
   */
  const ridisegna = (esito, errore = false) => {
    overlay.innerHTML = markup(statoWin);
    collega();
    if (esito !== undefined && esito !== null) stato(overlay, esito, errore);
  };

  /** Rilegge elenco e predefinito dal kernel (senza riaprire la finestra). */
  const ricarica = async () => {
    if (typeof opzioni.onRicarica !== "function") return;
    const fresco = await opzioni.onRicarica();
    if (fresco) {
      if (Array.isArray(fresco.elenco)) statoWin.elenco = fresco.elenco;
      if (fresco.predefinito !== undefined) statoWin.predefinito = fresco.predefinito || "";
      if (Array.isArray(fresco.elenco) && statoWin.selezionato) {
        const ancora = fresco.elenco.find((a) => a.id === statoWin.selezionato);
        if (ancora) statoWin.modulo = { ...ancora };
        else {
          statoWin.selezionato = "";
          statoWin.modulo = {};
        }
      }
    }
  };

  /** Salva: valida, chiama il kernel, poi offre la sincronizzazione. */
  const salva = async () => {
    const campi = leggiCampi(overlay);
    const errori = erroriAccount(campi, { richiediPassword: false });
    if (errori.length) {
      stato(overlay, errori.join(" "), true);
      return;
    }
    const dati = creaAccountDaCampi(campi);
    stato(overlay, "Salvataggio…");
    try {
      if (typeof opzioni.onSalva === "function") await opzioni.onSalva(dati);
      statoWin.ultimoSalvato = dati.account;
      await ricarica();
      statoWin.selezionato = dati.account.id;
      statoWin.modulo = { ...dati.account };
      ridisegna();
      statoSalvato(dati);
    } catch (err) {
      stato(overlay, `Salvataggio non riuscito: ${err && err.message ? err.message : err}`, true);
    }
  };

  /** Riga di stato dopo un salvataggio, con «Sincronizza ora» sull'account. */
  const statoSalvato = (dati) => {
    const riga = overlay.querySelector("#acc-stato");
    if (!riga) return;
    riga.classList.remove("acc-stato--errore");
    riga.replaceChildren();
    riga.append("Account salvato. ");
    const link = document.createElement("button");
    link.type = "button";
    link.className = "acc-link";
    link.textContent = "Sincronizza ora";
    link.addEventListener("click", () => sincronizza(dati.account.id));
    riga.append(link);
  };

  /** Sincronizza l'account indicato (o quello aperto nel modulo). */
  const sincronizza = async (idAccount) => {
    const id = idAccount || statoWin.selezionato;
    if (!id) {
      stato(overlay, "Scegli prima un account da sincronizzare.", true);
      return;
    }
    stato(overlay, "Sincronizzazione in corso…");
    try {
      const esito =
        typeof opzioni.onSincronizza === "function"
          ? await opzioni.onSincronizza(id)
          : "sincronizzazione non disponibile";
      stato(overlay, String(esito || "Cartelle aggiornate."));
    } catch (err) {
      stato(overlay, `Sincronizzazione non riuscita: ${err && err.message ? err.message : err}`, true);
    }
  };

  /**
   * Prova la connessione dell'account selezionato (blocco M): chiede al kernel
   * `diagnostica_account` e `diagnostica_smtp`, che provano i passi in ordine e
   * si fermano al primo errore, e mostra il risultato con ✓/✗ e il consiglio in
   * italiano. Non dipende dalla cache: funziona anche a sincronizzazione rotta.
   */
  const provaConnessione = async () => {
    const id = statoWin.selezionato;
    if (!id) {
      stato(overlay, "Scegli prima un account da provare.", true);
      return;
    }
    const bottone = overlay.querySelector("#acc-prova");
    if (bottone) bottone.disabled = true;
    stato(overlay, "Prova della connessione in corso… può richiedere alcuni secondi.");
    try {
      const esiti =
        typeof opzioni.onDiagnostica === "function"
          ? await opzioni.onDiagnostica(id)
          : [];
      statoWin.diagnostica = Array.isArray(esiti) ? esiti.filter(Boolean) : [];
      ridisegna();
      const fallito = statoWin.diagnostica.some((e) => e && e.interrotto);
      stato(
        overlay,
        fallito
          ? "Prova conclusa: qualche passo non è riuscito. Il dettaglio è qui sotto."
          : "Prova conclusa: tutti i passi sono riusciti.",
        fallito,
      );
    } catch (err) {
      statoWin.diagnostica = [
        {
          protocollo: "prova",
          passi: [
            {
              passo: "avvio",
              esito: "errore",
              dettaglio: String((err && err.message) || err),
            },
          ],
          interrotto: true,
          riepilogo: "La prova non è potuta partire.",
        },
      ];
      ridisegna();
      stato(overlay, "La prova non è potuta partire.", true);
    }
  };

  /** Copia negli appunti tutti i passi provati, da incollare a chi assiste. */
  const copiaRisultato = async () => {
    const testo = testoDiagnostica(statoWin.diagnostica);
    if (!testo) {
      stato(overlay, "Non c'è ancora nulla da copiare: premi prima «Prova connessione…».", true);
      return;
    }
    const ok = await copiaTesto(testo);
    stato(
      overlay,
      ok
        ? "Risultato copiato negli appunti: puoi incollarlo a chi ti assiste."
        : "Non è stato possibile copiare: seleziona il testo qui sotto e copialo a mano.",
      !ok,
    );
  };

  /** Elimina l'account selezionato, con conferma esplicita. */
  const elimina = async () => {
    const id = statoWin.selezionato;
    if (!id) return;
    const account = statoWin.elenco.find((a) => a.id === id) || { id };
    let ok = true;
    if (typeof opzioni.onConferma === "function") {
      ok = await opzioni.onConferma(
        "Elimina account",
        typeof opzioni.testoConferma === "function"
          ? opzioni.testoConferma(account)
          : `Eliminare l'account «${account.email || id}»?`,
      );
    }
    if (!ok) return;
    stato(overlay, "Eliminazione…");
    try {
      const esito = typeof opzioni.onElimina === "function" ? await opzioni.onElimina(id) : null;
      statoWin.selezionato = "";
      statoWin.modulo = {};
      await ricarica();
      ridisegna(typeof esito === "string" && esito ? esito : `Account «${id}» eliminato.`);
    } catch (err) {
      stato(overlay, `Eliminazione non riuscita: ${err && err.message ? err.message : err}`, true);
    }
  };

  /** Segna l'account selezionato come predefinito (quello aperto all'avvio). */
  const rendiPredefinito = async () => {
    const id = statoWin.selezionato;
    if (!id) return;
    try {
      const esito =
        typeof opzioni.onPredefinito === "function"
          ? await opzioni.onPredefinito(id)
          : null;
      await ricarica();
      ridisegna(typeof esito === "string" && esito ? esito : `Account predefinito: ${id}.`);
    } catch (err) {
      stato(overlay, `Non è stato possibile segnare l'account predefinito: ${err && err.message ? err.message : err}`, true);
    }
  };

  /** Ricollega i gestori al contenuto appena disegnato. */
  const collega = () => {
    // La ✕ della barra del titolo: dentro `collega` perché `ridisegna` rifà il
    // markup della finestra e i gestori vanno ricollegati ogni volta.
    overlay.querySelector(".win-close").addEventListener("click", chiudi);
    overlay.querySelector("#acc-mostra-tutte").addEventListener("click", () => {
      chiudi();
      if (typeof opzioni.onMostraTutte === "function") opzioni.onMostraTutte();
    });

    // Elenco: un clic apre quell'account nel modulo (blocco J).
    overlay.querySelectorAll(".acc-riga").forEach((riga) => {
      const id = riga.dataset.account;
      const apri = () => {
        const a = statoWin.elenco.find((x) => x.id === id) || { id };
        statoWin.selezionato = id;
        statoWin.modulo = { ...a };
        ridisegna();
      };
      riga.addEventListener("click", apri);
      riga.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          apri();
        }
      });
    });

    // «＋ Nuovo account»: modulo vuoto, si aggiunge senza toccare gli altri.
    overlay.querySelector("#acc-nuovo").addEventListener("click", () => {
      statoWin.selezionato = "";
      statoWin.modulo = {};
      ridisegna();
    });
    overlay.querySelector("#acc-elimina").addEventListener("click", elimina);
    const bPredefinito = overlay.querySelector("#acc-rendi-predefinito");
    if (bPredefinito) bPredefinito.addEventListener("click", rendiPredefinito);

    // Blocco M: la prova della connessione e la copia del risultato.
    overlay.querySelector("#acc-prova").addEventListener("click", provaConnessione);
    overlay.querySelector("#acc-copia").addEventListener("click", copiaRisultato);

    // Il salvataggio avviene alla conferma di un campo (come prima del blocco J).
    overlay.querySelectorAll(".acc-input").forEach((input) => {
      input.addEventListener("change", salva);
    });
    overlay.querySelectorAll("#acc-imap-ssl, #acc-smtp-ssl").forEach((c) => {
      c.addEventListener("change", salva);
    });

    // Blocco M: se la prova è già stata eseguita, porta in vista il primo passo
    // fallito. Senza questo, in una finestra da 742 pt l'errore resterebbe sotto
    // la piega del riquadro scorrevole e sembrerebbe che sia andato tutto bene.
    const riquadro = overlay.querySelector(".acc-diag");
    const primoErrore = riquadro && riquadro.querySelector(".acc-diag-passo--errore");
    if (riquadro && primoErrore) {
      const salto =
        primoErrore.getBoundingClientRect().top -
        riquadro.getBoundingClientRect().top +
        riquadro.scrollTop;
      riquadro.scrollTop = Math.max(0, salto - 20);
    }
  };

  collega();
  return overlay;
}
