//! Sincronizzazione incrementale (task 3.4, Milestone 3).
//!
//! Per ogni cartella si chiedono alla sorgente le intestazioni più recenti e si
//! scrivono in cache con `upsert_header`, che è idempotente sull'unicità
//! `(account, folder, uid)`. Un messaggio è "nuovo" se il suo UID è più alto del
//! più alto già presente in cache per quella cartella.
//!
//! Le due fasi sono separate di proposito: `fetch_folder` tocca solo la rete
//! (asincrono) e `apply_folder` solo la cache (sincrono). Così i comandi Tauri
//! possono scaricare senza tenere un riferimento alla cache attraverso un
//! `await` (la connessione SQLite non è `Sync`).

use serde::{Deserialize, Serialize};

use crate::mail::conversazioni;
use crate::mail::{MailSource, MessageHeader, Result};
use crate::store::{self, Store};

/// Esito della sincronizzazione di una cartella.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FolderSyncSummary {
    pub folder: String,
    /// Quanti messaggi nuovi (UID più alto del massimo in cache) sono stati aggiunti.
    pub new_messages: usize,
}

/// Esito della sincronizzazione di un account, cartella per cartella.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SyncSummary {
    pub folders: Vec<FolderSyncSummary>,
}

impl SyncSummary {
    /// Totale dei messaggi nuovi su tutte le cartelle.
    pub fn new_messages(&self) -> usize {
        self.folders.iter().map(|f| f.new_messages).sum()
    }
}

/// Scarica le intestazioni di una cartella (solo rete, nessun accesso alla cache).
pub async fn fetch_folder(
    source: &dyn MailSource,
    folder: &str,
    limit: usize,
) -> Result<Vec<MessageHeader>> {
    source.headers(folder, limit).await
}

/// Applica alla cache le intestazioni già scaricate e conta i nuovi messaggi.
pub fn apply_folder(
    store: &Store,
    account_id: &str,
    folder: &str,
    headers: &[MessageHeader],
) -> Result<FolderSyncSummary> {
    let massimo_in_cache = store.max_uid(account_id, folder)?;
    let mut nuovi = 0;
    for h in headers {
        if e_piu_recente(&h.uid, massimo_in_cache) {
            nuovi += 1;
        }
        store.upsert_header(&a_riga_cache(account_id, folder, h))?;
    }
    Ok(FolderSyncSummary {
        folder: folder.to_string(),
        new_messages: nuovi,
    })
}

/// Sincronizza una cartella: scarica le intestazioni e le applica alla cache.
pub async fn sync_folder(
    source: &dyn MailSource,
    store: &Store,
    account_id: &str,
    folder: &str,
    limit: usize,
) -> Result<FolderSyncSummary> {
    let headers = fetch_folder(source, folder, limit).await?;
    apply_folder(store, account_id, folder, &headers)
}

/// Sincronizza tutte le cartelle visibili di un account.
pub async fn sync_account(
    source: &dyn MailSource,
    store: &Store,
    account_id: &str,
    limit: usize,
) -> Result<SyncSummary> {
    let cartelle = source.folders().await?;
    let mut riepiloghi = Vec::with_capacity(cartelle.len());
    for cartella in cartelle {
        riepiloghi.push(sync_folder(source, store, account_id, &cartella.name, limit).await?);
    }
    Ok(SyncSummary {
        folders: riepiloghi,
    })
}

/// Vero se `uid` è più alto del massimo già in cache (o se la cache è vuota).
/// Un UID non numerico viene trattato come nuovo, per non perderlo.
/// È pubblico perché la notifica (blocco E) usa la stessa definizione di
/// «messaggio nuovo» del riepilogo di sincronizzazione.
pub fn e_piu_recente(uid: &str, massimo: Option<u32>) -> bool {
    match uid.parse::<u32>() {
        Ok(n) => Some(n) > massimo,
        Err(_) => true,
    }
}

/// Converte un'intestazione della sorgente in una riga della cache.
fn a_riga_cache(account_id: &str, folder: &str, h: &MessageHeader) -> store::Header {
    store::Header {
        account: account_id.to_string(),
        folder: folder.to_string(),
        uid: h.uid.clone(),
        message_id: h.message_id.clone(),
        subject: h.subject.clone(),
        sender: h.from.clone(),
        recipients: h.to.clone(),
        date: h.date,
        seen: h.seen,
        has_attachments: h.has_attachments,
        // La chiave di conversazione si calcola dopo, su tutte le righe della
        // cartella (anche su quelle già in cache): vedi `aggiorna_thread`.
        thread_key: None,
        in_reply_to: h.in_reply_to.clone(),
        references: h.references.clone(),
    }
}

/// Ricalcola e scrive la chiave di conversazione di **tutte** le righe di una
/// cartella **di un account**, incrociando i messaggi appena arrivati con quelli
/// già in cache (una risposta può riferirsi a un messaggio di ieri). È sincrona:
/// non tocca la rete, si chiama dentro lo stesso ambito dell'`apply_folder`.
///
/// Blocco K: l'account è parte della chiave di ricerca — il raggruppamento è
/// confinato alla casella, così lo stesso oggetto in due caselle diverse non si
/// unisce in un'unica conversazione.
pub fn aggiorna_thread(store: &Store, account: &str, folder: &str) -> Result<usize> {
    let righe = store.thread_inputs(account, folder)?;
    let chiavi = conversazioni::chiavi_conversazione(&righe);
    for (riga, chiave) in righe.iter().zip(&chiavi) {
        store.set_thread_key(account, folder, &riga.uid, chiave)?;
    }
    Ok(righe.len())
}
