//! Segreti nel Keychain tramite il crate `keyring` (servizio "outlook-ai").
//! Nessuna password passa mai dal file di configurazione.

use keyring::{Entry, Error as KeyringError};
use std::collections::HashMap;
use std::sync::Mutex;

/// Nome del servizio nel Keychain.
const SERVIZIO: &str = "outlook-ai";

/// Deposito dei segreti. In produzione usa il Keychain del sistema;
/// per i test usa un backend in memoria, così i test non toccano il
/// Keychain reale. Il backend di test è compilato sempre (non dietro
/// `#[cfg(test)]`) perché i test di integrazione in `tests/` vedono la
/// libreria come normale dipendenza, senza `cfg(test)`.
pub struct Store {
    /// Backend in memoria: `Some` = test, `None` = Keychain di sistema.
    memoria: Option<Mutex<HashMap<String, String>>>,
}

impl Store {
    /// Deposito reale, collegato al Keychain di macOS.
    pub fn real() -> Self {
        Store { memoria: None }
    }

    /// Deposito in memoria per i test: nessun accesso al Keychain.
    pub fn in_memory_for_tests() -> Self {
        Store {
            memoria: Some(Mutex::new(HashMap::new())),
        }
    }

    /// Salva (o sovrascrive) la password di un account.
    pub fn set(&self, account_id: &str, password: &str) -> std::result::Result<(), KeyringError> {
        match &self.memoria {
            Some(map) => {
                map.lock()
                    .expect("mutex del backend in memoria")
                    .insert(account_id.to_string(), password.to_string());
                Ok(())
            }
            None => {
                let entry = Entry::new(SERVIZIO, account_id)?;
                entry.set_password(password)
            }
        }
    }

    /// Recupera la password di un account (`NoEntry` se assente).
    pub fn get(&self, account_id: &str) -> std::result::Result<String, KeyringError> {
        match &self.memoria {
            Some(map) => map
                .lock()
                .expect("mutex del backend in memoria")
                .get(account_id)
                .cloned()
                .ok_or(KeyringError::NoEntry),
            None => {
                let entry = Entry::new(SERVIZIO, account_id)?;
                entry.get_password()
            }
        }
    }

    /// Elimina la password di un account.
    pub fn delete(&self, account_id: &str) -> std::result::Result<(), KeyringError> {
        match &self.memoria {
            Some(map) => {
                map.lock()
                    .expect("mutex del backend in memoria")
                    .remove(account_id);
                Ok(())
            }
            None => {
                let entry = Entry::new(SERVIZIO, account_id)?;
                entry.delete_credential()
            }
        }
    }
}
