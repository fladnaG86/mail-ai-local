//! Protezione della posta indesiderata durante la sincronizzazione (blocco D,
//! seconda metà).
//!
//! La regola è quella dichiarata nel pannello: con la protezione **attiva**, i
//! messaggi appena arrivati da un mittente bloccato vengono **spostati** nella
//! cartella Posta indesiderata (sul server e in cache); con la protezione
//! **spenta** vengono solo **marcati** (restano dov'è, con lo stato
//! `indesiderato` in cache).
//!
//! Le due fasi sono separate di proposito, come nel resto del kernel: la rete
//! (`sposta_sul_server`, asincrona) non incrocia mai la cache (sincrona), perché
//! la `rusqlite::Connection` è `Send` ma non `Sync` e non deve restare presa
//! attraverso un `await` nel future di un comando Tauri.
//!
//! `uids_da_mittenti_bloccati` e `aggiorna_cache` sono pure/sincrone e si
//! collaudano senza rete; `sposta_sul_server` si collauda con `FakeSource`.

use crate::mail::ops;
use crate::mail::{MailSource, MessageHeader};
use crate::store::Store;

/// Esito della protezione su una cartella: quanti messaggi sono stati spostati
/// e quanti solo marcati.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct EsitoProtezione {
    pub spostati: usize,
    pub marcati: usize,
}

/// UID dei messaggi le cui intestazioni arrivano da un mittente bloccato.
/// Il confronto è sull'indirizzo estratto ("Nome <utente@host>" → "utente@host")
/// e ignora le maiuscole, come `Store::aggiungi_mittente_bloccato`.
pub fn uids_da_mittenti_bloccati(
    headers: &[MessageHeader],
    bloccati: &[String],
) -> Vec<String> {
    if bloccati.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    for h in headers {
        let Some(da) = h.from.as_deref() else { continue };
        let Some(indirizzo) = ops::estrai_indirizzo(da) else {
            continue;
        };
        if bloccati.iter().any(|b| b == &indirizzo) {
            out.push(h.uid.clone());
        }
    }
    out
}

/// Fase di rete: sposta sul server i messaggi degli UID indicati verso la
/// cartella indesiderata. Restituisce gli UID spostati con successo; quelli che
/// il server rifiuta (o l'assenza di una cartella indesiderata) restano fuori e
/// chi chiama li marcherà soltanto. Non è mai un errore: è la protezione che
/// degrada, non la sincronizzazione che fallisce.
pub async fn sposta_sul_server(
    src: &dyn MailSource,
    folder: &str,
    uids: &[String],
    destinazione: Option<&str>,
) -> Vec<String> {
    let Some(dest) = destinazione else {
        return Vec::new();
    };
    let mut spostati = Vec::new();
    for uid in uids {
        if ops::server_sposta(src, folder, uid, dest).await.is_ok() {
            spostati.push(uid.clone());
        }
    }
    spostati
}

/// Fase di cache (sincrona): applica alla cache l'esito delle due fasi.
/// Con protezione "attiva" gli UID spostati sul server vengono spostati in cache
/// verso la stessa destinazione; tutti gli altri (server che ha rifiutato,
/// nessuna cartella indesiderata, protezione spenta) vengono marcati
/// `indesiderato`. Blocco K: confinata all'account della casella sincronizzata.
pub fn aggiorna_cache(
    cache: &Store,
    account: &str,
    folder: &str,
    uids: &[String],
    spostati: &[String],
    destinazione: Option<&str>,
    protezione: &str,
) -> Result<EsitoProtezione, String> {
    let mut esito = EsitoProtezione::default();
    let attiva = protezione == "attiva";
    for uid in uids {
        let spostato = attiva
            && destinazione.is_some()
            && spostati.iter().any(|u| u == uid);
        if spostato {
            cache
                .sposta(account, folder, uid, destinazione.expect("destinazione verificata"))
                .map_err(|e| e.to_string())?;
            esito.spostati += 1;
        } else {
            cache
                .set_indesiderato(account, folder, uid, true)
                .map_err(|e| e.to_string())?;
            esito.marcati += 1;
        }
    }
    Ok(esito)
}
