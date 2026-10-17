//! Operazioni sui messaggi (blocco A), replicando il comportamento di Outlook
//! sopra IMAP standard: letto, contrassegnato, completato, categorie, sposta,
//! elimina, archivia, indesiderato, elenco cartelle.
//!
//! Regola unica: **prima il server, poi la cache**. Le operazioni di rete
//! (`server_*`) parlano con la `MailSource`; quelle di cache aggiornano lo
//! `Store` solo dopo che il server ha confermato. Se il server rifiuta l'errore
//! è leggibile in italiano e la cache resta invariata. Le operazioni locali
//! (completato, categorie) valgono anche offline.
//!
//! Le funzioni combinate (`imposta_flag`, `sposta`, `elimina`, …) fanno le due
//! fasi in sequenza e servono ai test e a chi tiene insieme rete e cache; i
//! comandi Tauri usano le due fasi separate perché la connessione SQLite non è
//! `Sync` e non deve restare aperta attraverso un `await`.

use crate::mail::{FlagOp, MailSource};
use crate::store::Store;

/// Nomi con cui si riconosce la cartella della posta eliminata, in ordine di
/// preferenza. Il confronto è sull'ultimo componente del nome, così va bene sia
/// "Trash" sia "[Gmail]/Trash" sia "INBOX.Posta eliminata".
pub const NOMI_ELIMINATA: &[&str] = &[
    "Posta eliminata",
    "Trash",
    "Eliminata",
    "Deleted Items",
    "Deleted Messages",
    "Cestino",
];

/// Nomi con cui si riconosce la cartella Archivio.
pub const NOMI_ARCHIVIO: &[&str] = &["Archivio", "Archive", "All Mail"];

/// Nomi con cui si riconosce la cartella della posta indesiderata.
pub const NOMI_INDESIDERATA: &[&str] = &[
    "Posta indesiderata",
    "Junk",
    "Junk E-mail",
    "Indesiderata",
    "Spam",
];

/// Nomi con cui si riconosce la cartella della posta inviata, in ordine di
/// preferenza (Outlook/Esempio Host la chiamano "Posta inviata", altri server "Sent").
pub const NOMI_INVIATA: &[&str] = &[
    "Posta inviata",
    "Sent",
    "Sent Items",
    "Sent Messages",
    "Elementi inviati",
    "Inviata",
];

/// Nomi con cui si riconosce la cartella delle **Bozze**, dove «Salva come
/// bozza» deposita il messaggio con il flag `\Draft`.
pub const NOMI_BOZZE: &[&str] = &["Bozze", "Drafts", "Bozza", "Draft"];

/// Esito della rimozione di un messaggio.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EsitoEliminazione {
    /// Spostato nella cartella della posta eliminata indicata.
    Spostato(String),
    /// Nessuna cartella della posta eliminata sul server: il messaggio è stato
    /// rimosso definitivamente (flag `\Deleted` + `EXPUNGE`). `ripiego_ampio` è
    /// `true` se il server non supporta `UID EXPUNGE` e l'operazione ha ripulito
    /// anche altri messaggi marcati `\Deleted`: va detto all'utente.
    Rimosso { ripiego_ampio: bool },
}

// ---------------------------------------------------------------------------
// Rete (server)
// ---------------------------------------------------------------------------

/// Imposta un flag di sistema sul server (`UID STORE`).
pub async fn server_imposta_flag(
    src: &dyn MailSource,
    folder: &str,
    uid: &str,
    flag: FlagOp,
    valore: bool,
) -> Result<(), String> {
    src.imposta_flag(folder, uid, flag, valore)
        .await
        .map_err(|e| e.to_string())
}

/// Sposta un messaggio sul server. La cartella di destinazione vuota è un
/// errore leggibile prima di toccare la rete.
pub async fn server_sposta(
    src: &dyn MailSource,
    folder: &str,
    uid: &str,
    destinazione: &str,
) -> Result<(), String> {
    if destinazione.trim().is_empty() {
        return Err("cartella di destinazione mancante".to_string());
    }
    src.sposta(folder, uid, destinazione)
        .await
        .map_err(|e| e.to_string())
}

/// Elimina un messaggio: sceglie la cartella della posta eliminata fra quelle
/// del server e vi sposta il messaggio; se non esiste, ripiega sulla rimozione
/// definitiva (`\Deleted` + `EXPUNGE`). Restituisce quale dei due casi è
/// avvenuto, perché la cache va aggiornata di conseguenza.
pub async fn server_elimina(
    src: &dyn MailSource,
    folder: &str,
    uid: &str,
) -> Result<EsitoEliminazione, String> {
    let nomi = cartelle(src).await?;
    match trova_cartella(&nomi, NOMI_ELIMINATA) {
        // Se il messaggio è già nella posta eliminata, "eliminare" significa
        // rimuoverlo per davvero.
        Some(destinazione) if !destinazione.eq_ignore_ascii_case(folder) => {
            server_sposta(src, folder, uid, &destinazione).await?;
            Ok(EsitoEliminazione::Spostato(destinazione))
        }
        _ => {
            let ripiego_ampio = src
                .elimina_definitivamente(folder, uid)
                .await
                .map_err(|e| e.to_string())?;
            Ok(EsitoEliminazione::Rimosso { ripiego_ampio })
        }
    }
}

/// Archivia un messaggio: lo sposta nell'Archivio e restituisce il nome della
/// cartella usata. Senza cartella Archivio l'errore dice cosa manca.
pub async fn server_archivia(
    src: &dyn MailSource,
    folder: &str,
    uid: &str,
) -> Result<String, String> {
    let nomi = cartelle(src).await?;
    let archivio = trova_cartella(&nomi, NOMI_ARCHIVIO).ok_or_else(|| {
        "cartella Archivio non trovata sul server: crea una cartella \"Archivio\" per poter \
         archiviare i messaggi"
            .to_string()
    })?;
    server_sposta(src, folder, uid, &archivio).await?;
    Ok(archivio)
}

/// Sposta un messaggio nella posta indesiderata e restituisce il nome della
/// cartella usata. Senza cartella indesiderata l'errore dice cosa manca.
pub async fn server_indesiderato(
    src: &dyn MailSource,
    folder: &str,
    uid: &str,
) -> Result<String, String> {
    let nomi = cartelle(src).await?;
    let indesiderata = trova_cartella(&nomi, NOMI_INDESIDERATA).ok_or_else(|| {
        "cartella Posta indesiderata non trovata sul server: crea una cartella \"Posta \
         indesiderata\" per poter segnalare i messaggi"
            .to_string()
    })?;
    server_sposta(src, folder, uid, &indesiderata).await?;
    Ok(indesiderata)
}

/// Prova ad aggiungere le keyword IMAP corrispondenti alle categorie. **Non
/// fallisce mai**: le keyword non sono garantite dal protocollo e le categorie
/// restano comunque locali in cache. Un server che non le supporta risponde
/// `false`, un errore viene semplicemente ignorato.
pub async fn server_categorie(src: &dyn MailSource, folder: &str, uid: &str, categorie: &[String]) {
    for categoria in categorie {
        let keyword = keyword_da_categoria(categoria);
        if keyword.is_empty() {
            continue;
        }
        let _ = src.aggiungi_keyword(folder, uid, &keyword).await;
    }
}

// ---------------------------------------------------------------------------
// Cache locale
// ---------------------------------------------------------------------------

/// Aggiorna il flag in cache (la copia locale, dopo il "sì" del server).
/// Per account (blocco K).
pub fn cache_imposta_flag(
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    flag: FlagOp,
    valore: bool,
) -> Result<(), String> {
    let esito = match flag {
        FlagOp::Seen => cache.set_seen(account, folder, uid, valore),
        FlagOp::Flagged => cache.set_flagged(account, folder, uid, valore),
    };
    esito.map_err(|e| e.to_string())
}

/// Salva le categorie in cache. Un elenco vuoto le rimuove. Per account.
pub fn cache_set_categorie(
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    categorie: &[String],
) -> Result<(), String> {
    cache
        .set_categorie(account, folder, uid, categorie)
        .map_err(|e| e.to_string())
}

/// Sposta il messaggio in cache e aggiunge il mittente all'elenco dei bloccati.
/// Il mittente si legge **prima** dello spostamento (dopo, la riga è altrove).
/// Per account (blocco K).
pub fn applica_indesiderato(
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    destinazione: &str,
    mittente: Option<&str>,
) -> Result<(), String> {
    cache
        .sposta(account, folder, uid, destinazione)
        .map_err(|e| e.to_string())?;
    if let Some(m) = mittente {
        if let Some(indirizzo) = estrai_indirizzo(m) {
            cache
                .aggiungi_mittente_bloccato(&indirizzo)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// "Completato" (il contrassegno per il completamento): è **locale**, come nel
/// riferimento, quindi vale anche offline e non tocca il server. Per account.
pub fn set_completato(
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    completato: bool,
) -> Result<(), String> {
    cache
        .set_completato(account, folder, uid, completato)
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Operazioni combinate (rete + cache, in quest'ordine)
// ---------------------------------------------------------------------------

/// Letto / da leggere: prima il server, poi la cache (per account, blocco K).
pub async fn imposta_flag(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    flag: FlagOp,
    valore: bool,
) -> Result<(), String> {
    server_imposta_flag(src, folder, uid, flag, valore).await?;
    cache_imposta_flag(cache, account, folder, uid, flag, valore)
}

/// Sposta: prima il server, poi la cache (per account, blocco K).
pub async fn sposta(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    destinazione: &str,
) -> Result<(), String> {
    server_sposta(src, folder, uid, destinazione).await?;
    cache
        .sposta(account, folder, uid, destinazione)
        .map_err(|e| e.to_string())
}

/// Elimina scegliendo la cartella giusta; la cache segue l'esito del server.
/// Restituisce quale dei due esiti è avvenuto (spostato o rimosso), così il
/// chiamante sa cosa è successo davvero. Per account (blocco K).
pub async fn elimina(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
) -> Result<EsitoEliminazione, String> {
    let esito = server_elimina(src, folder, uid).await?;
    match &esito {
        EsitoEliminazione::Spostato(destinazione) => cache
            .sposta(account, folder, uid, destinazione)
            .map_err(|e| e.to_string())?,
        EsitoEliminazione::Rimosso { .. } => {
            cache.rimuovi(account, folder, uid).map_err(|e| e.to_string())?
        }
    }
    Ok(esito)
}

/// Archivia: sposta nell'Archivio sul server e in cache (per account, blocco K).
pub async fn archivia(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
) -> Result<(), String> {
    let archivio = server_archivia(src, folder, uid).await?;
    cache
        .sposta(account, folder, uid, &archivio)
        .map_err(|e| e.to_string())
}

/// Indesiderato: sposta nella posta indesiderata e blocca il mittente.
/// Per account (blocco K).
pub async fn indesiderato(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
) -> Result<(), String> {
    let mittente = cache
        .mittente(account, folder, uid)
        .map_err(|e| e.to_string())?;
    let destinazione = server_indesiderato(src, folder, uid).await?;
    applica_indesiderato(cache, account, folder, uid, &destinazione, mittente.as_deref())
}

/// Categorie: prova le keyword sul server (senza fallire se non supportate) e
/// le salva comunque in cache. Per account (blocco K).
pub async fn set_categorie(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    categorie: Vec<String>,
) -> Result<(), String> {
    server_categorie(src, folder, uid, &categorie).await;
    cache_set_categorie(cache, account, folder, uid, &categorie)
}

/// Elenco dei nomi delle cartelle del server, per il selettore "Sposta".
pub async fn cartelle(src: &dyn MailSource) -> Result<Vec<String>, String> {
    let cartelle = src.folders().await.map_err(|e| e.to_string())?;
    Ok(cartelle.into_iter().map(|f| f.name).collect())
}

/// Copia un messaggio **già composto** (RFC 822) nella cartella "Posta inviata"
/// del server con IMAP `APPEND`, dopo un invio riuscito. Restituisce il nome
/// della cartella usata.
///
/// Non sposta nulla e non tocca la cache: è una copia in sola aggiunta. Se la
/// cartella non esiste sul server l'errore è leggibile e **non è un guasto**: il
/// chiamante decide se è fatale, e per l'invio non lo è (l'invio è già riuscito).
pub async fn copia_in_inviata(src: &dyn MailSource, grezzo: &[u8]) -> Result<String, String> {
    let nomi = cartelle(src).await?;
    let inviata = trova_cartella(&nomi, NOMI_INVIATA).ok_or_else(|| {
        "cartella \"Posta inviata\" non trovata sul server (cercata fra Posta inviata, Sent, \
         Inviata)"
            .to_string()
    })?;
    src.aggiungi_a_cartella(&inviata, grezzo)
        .await
        .map_err(|e| e.to_string())?;
    Ok(inviata)
}

// ---------------------------------------------------------------------------
// Blocco I1 — copia, cartelle, conversazioni ignorate, scadenza.
// ---------------------------------------------------------------------------

/// Copia un messaggio in un'altra cartella del server (`UID COPY`), **senza**
/// toccare l'originale. Come per lo spostamento, la destinazione vuota è un
/// errore leggibile prima di toccare la rete.
pub async fn server_copia(
    src: &dyn MailSource,
    folder: &str,
    uid: &str,
    destinazione: &str,
) -> Result<(), String> {
    if destinazione.trim().is_empty() {
        return Err("cartella di destinazione mancante".to_string());
    }
    src.copia(folder, uid, destinazione)
        .await
        .map_err(|e| e.to_string())
}

/// **Copia**: prima il server, poi la cache. A differenza di `sposta`, la riga
/// originale **resta** e nasce una riga nuova nella destinazione. Per account.
pub async fn copia(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    destinazione: &str,
) -> Result<(), String> {
    server_copia(src, folder, uid, destinazione).await?;
    cache
        .copia(account, folder, uid, destinazione)
        .map_err(|e| e.to_string())
}

/// Crea una cartella sul server. Un nome vuoto è un errore leggibile.
pub async fn server_crea_cartella(src: &dyn MailSource, nome: &str) -> Result<(), String> {
    if nome.trim().is_empty() {
        return Err("il nome della cartella è vuoto: non c'è nulla da creare".to_string());
    }
    src.crea_cartella(nome.trim()).await.map_err(|e| e.to_string())
}

/// Rinomina una cartella sul server. Nome nuovo vuoto → errore leggibile.
pub async fn server_rinomina_cartella(
    src: &dyn MailSource,
    vecchio: &str,
    nuovo: &str,
) -> Result<String, String> {
    if vecchio.trim().eq_ignore_ascii_case("INBOX") {
        return Err(
            "la Posta in arrivo (INBOX) non si può rinominare: in IMAP tutta la posta \
             in arrivo finirebbe nella cartella col nome nuovo"
                .to_string(),
        );
    }
    if nuovo.trim().is_empty() {
        return Err(
            "il nuovo nome della cartella è vuoto: non c'è nulla da rinominare".to_string(),
        );
    }
    // Se il server non dice il separatore, il nome si usa com'è (come prima).
    let delimitatore = src.delimitatore(vecchio).await.unwrap_or(None);
    let completo = nome_completo_rinomina(vecchio, nuovo, delimitatore.as_deref());
    src.rinomina_cartella(vecchio, &completo)
        .await
        .map_err(|e| e.to_string())?;
    Ok(completo)
}

/// Il nome completo della cartella rinominata. Scrivendo solo il nome nuovo, la
/// cartella resta sotto lo stesso genitore: con il separatore `.`,
/// «INBOX.Progetti» → «Clienti» diventa «INBOX.Clienti». Sui server che tengono
/// tutto sotto `INBOX.` una cartella fuori da INBOX verrebbe rifiutata. Un nome
/// che contiene già il separatore, o un separatore sconosciuto, si usa com'è.
pub fn nome_completo_rinomina(vecchio: &str, nuovo: &str, delimitatore: Option<&str>) -> String {
    let nuovo = nuovo.trim();
    let Some(d) = delimitatore.filter(|d| !d.is_empty()) else {
        return nuovo.to_string();
    };
    if nuovo.contains(d) {
        return nuovo.to_string();
    }
    match vecchio.rfind(d) {
        Some(i) => format!("{}{d}{nuovo}", &vecchio[..i]),
        None => nuovo.to_string(),
    }
}

/// Elimina una cartella sul server (`DELETE`).
pub async fn server_elimina_cartella(src: &dyn MailSource, nome: &str) -> Result<(), String> {
    src.elimina_cartella(nome).await.map_err(|e| e.to_string())
}

/// Svuota una cartella sul server (tutti i messaggi).
pub async fn server_svuota_cartella(src: &dyn MailSource, nome: &str) -> Result<(), String> {
    src.svuota_cartella(nome).await.map_err(|e| e.to_string())
}

/// Segna tutti i messaggi di una cartella come letti sul server.
pub async fn server_segna_tutta_letta(src: &dyn MailSource, nome: &str) -> Result<(), String> {
    src.segna_tutta_letta(nome).await.map_err(|e| e.to_string())
}

/// **Crea cartella**: server, poi cache (registra il nome) **per account**. Se il
/// server rifiuta la cache non viene toccata. Blocco L: per account.
pub async fn crea_cartella(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    nome: &str,
) -> Result<(), String> {
    server_crea_cartella(src, nome).await?;
    cache
        .registra_cartella(account, nome.trim())
        .map_err(|e| e.to_string())
}

/// **Rinomina cartella**: server, poi cache (messaggi e registro) **per account**.
pub async fn rinomina_cartella(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    vecchio: &str,
    nuovo: &str,
) -> Result<(), String> {
    let completo = server_rinomina_cartella(src, vecchio, nuovo).await?;
    cache
        .rinomina_cartella_cache(account, vecchio, &completo)
        .map_err(|e| e.to_string())
}

/// **Elimina cartella**: server, poi cache (messaggi e voce del registro) **per
/// account**.
pub async fn elimina_cartella(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    nome: &str,
) -> Result<(), String> {
    server_elimina_cartella(src, nome).await?;
    cache
        .elimina_cartella_cache(account, nome)
        .map_err(|e| e.to_string())
}

/// **Svuota cartella**: server, poi cache **per account**. Restituisce quanti
/// messaggi ha rimosso dalla cache.
pub async fn svuota_cartella(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    nome: &str,
) -> Result<usize, String> {
    server_svuota_cartella(src, nome).await?;
    cache
        .svuota_cartella_cache(account, nome)
        .map_err(|e| e.to_string())
}

/// **Segna tutti come già letti**: server, poi cache **per account**. Restituisce
/// quante righe ha aggiornato in cache.
pub async fn segna_cartella_letta(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    nome: &str,
) -> Result<usize, String> {
    server_segna_tutta_letta(src, nome).await?;
    cache
        .segna_cartella_letta_cache(account, nome)
        .map_err(|e| e.to_string())
}

/// Gestisce **un messaggio di una conversazione ignorata**: lo segna come letto
/// e, se c'è una cartella della posta eliminata, ce lo sposta. Prima il server,
/// poi la cache. `destinazione` è `None` quando il server non ha una Posta
/// eliminata: in quel caso il messaggio resta dove sta ma viene segnato letto.
pub async fn gestisci_conversazione_ignorata(
    src: &dyn MailSource,
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    destinazione: Option<&str>,
) -> Result<(), String> {
    server_imposta_flag(src, folder, uid, FlagOp::Seen, true).await?;
    cache_imposta_flag(cache, account, folder, uid, FlagOp::Seen, true)?;
    if let Some(dest) = destinazione.filter(|d| !d.eq_ignore_ascii_case(folder)) {
        server_sposta(src, folder, uid, dest).await?;
        cache
            .sposta(account, folder, uid, dest)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Salva (o rimuove) la data del contrassegno **in cache** e allinea il
/// contrassegno: con una data il messaggio è contrassegnato, senza data non lo è.
/// È metadato locale (IMAP non ha una data di scadenza); il flag `\Flagged` lo
/// porta anche il server, dove disponibile, tramite `cache_imposta_flag`.
/// Per account (blocco K).
pub fn set_scadenza(
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    scadenza: Option<&str>,
) -> Result<(), String> {
    cache
        .set_scadenza(account, folder, uid, scadenza)
        .map_err(|e| e.to_string())?;
    cache
        .set_flagged(account, folder, uid, scadenza.is_some())
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------

/// Trova la cartella che corrisponde a uno dei nomi noti, in ordine di
/// preferenza. Il confronto è per l'ultimo componente del nome (così
/// "[Gmail]/Trash" conta come "Trash") e ignora le maiuscole.
pub fn trova_cartella(cartelle: &[String], nomi: &[&str]) -> Option<String> {
    for nome in nomi {
        for cartella in cartelle {
            if cartella.eq_ignore_ascii_case(nome)
                || ultimo_componente(cartella).eq_ignore_ascii_case(nome)
            {
                return Some(cartella.clone());
            }
        }
    }
    None
}

/// L'ultimo componente di un nome di cartella gerarchico ("INBOX.Junk" → "Junk").
fn ultimo_componente(nome: &str) -> &str {
    nome.rsplit(['/', '\\', '.']).next().unwrap_or(nome).trim()
}

/// Trasforma una categoria in una keyword IMAP valida: un atomo senza spazi né
/// caratteri speciali (ammessi lettere, cifre, `-` e `_`).
fn keyword_da_categoria(categoria: &str) -> String {
    let pulita: String = categoria
        .trim()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    pulita.trim_matches('_').to_string()
}

/// Estrae l'indirizzo da "Nome <utente@host>". Se non c'è una forma fra
/// parentesi angolari restituisce la stringa ripulita, in minuscolo. `None`
/// quando non c'è nulla di sensato da bloccare.
pub fn estrai_indirizzo(mittente: &str) -> Option<String> {
    let m = mittente.trim();
    if m.is_empty() {
        return None;
    }
    if let Some(inizio) = m.find('<') {
        if let Some(fine) = m[inizio + 1..].find('>') {
            let indirizzo = m[inizio + 1..inizio + 1 + fine].trim();
            if !indirizzo.is_empty() {
                return Some(indirizzo.to_ascii_lowercase());
            }
        }
    }
    Some(m.to_ascii_lowercase())
}
