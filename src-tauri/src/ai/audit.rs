//! Registro delle richieste inviate al cloud (task 6.3, Milestone 6).
//!
//! Serve al requisito di tracciabilità (spec §6): **una riga per ogni richiesta
//! effettivamente partita verso il cloud**, con data/ora, provider, modello,
//! azione, `PROMPT_VERSION` e SHA-256 del testo inviato. **Mai il testo**: nel
//! registro entra solo l'impronta, così il log non diventa una seconda copia
//! della posta.
//!
//! Il registro riusa la cache SQLite (`store::Store`, tabella `ai_audit`), senza
//! toccare le tabelle dei messaggi.

use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};

use crate::store::{self, Store};

/// Voce del registro, senza il testo: solo l'impronta.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VoceAudit {
    pub provider: String,
    pub modello: String,
    pub azione: String,
    pub prompt_version: String,
    pub hash_testo: String,
}

/// Destinazione del registro. La trait è `Send + Sync` perché il client IA la
/// porta attraverso gli `await` dei comandi Tauri (il future di un comando deve
/// essere `Send`, e il client è preso in prestito condiviso mentre risponde il
/// modello).
pub trait Registro: Send + Sync {
    fn registra(&self, voce: &VoceAudit);
}

/// Calcola lo SHA-256 esadecimale (minuscolo) di un testo.
pub fn sha256_hex(testo: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(testo.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Registro su SQLite: implementazione reale della trait [`Registro`].
///
/// Lo `Store` è protetto da un `Mutex`: una `rusqlite::Connection` è `Send` ma
/// non `Sync`, e il registro deve poter essere condiviso attraverso gli `await`.
pub struct RegistroStore {
    store: Mutex<Store>,
}

impl RegistroStore {
    /// Apre (o crea) il database del registro al percorso indicato.
    pub fn apri(path: &Path) -> store::Result<Self> {
        Ok(RegistroStore {
            store: Mutex::new(Store::open(path)?),
        })
    }

    /// Registro sopra uno store già aperto (usato dai test).
    pub fn new(store: Store) -> Self {
        RegistroStore {
            store: Mutex::new(store),
        }
    }
}

impl Registro for RegistroStore {
    /// Scrive la riga nel registro. Un errore di scrittura non interrompe la
    /// richiesta IA: la tracciabilità è importante ma non deve far fallire
    /// l'azione dell'utente (l'anomalia resterebbe comunque un guasto del disco).
    fn registra(&self, voce: &VoceAudit) {
        let adesso = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        if let Ok(store) = self.store.lock() {
            let _ = store.audit_log(&store::AuditEntry {
                timestamp: adesso,
                provider: voce.provider.clone(),
                modello: voce.modello.clone(),
                azione: voce.azione.clone(),
                prompt_version: voce.prompt_version.clone(),
                hash_testo: voce.hash_testo.clone(),
            });
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn hash_sha256_noto_e_stabile() {
        // Vettore noto: SHA-256("abc").
        let atteso = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert_eq!(sha256_hex("abc"), atteso);
        // Stesso input, stesso hash.
        assert_eq!(sha256_hex("abc"), sha256_hex("abc"));
    }
}
