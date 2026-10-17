//! Segreti nel Keychain tramite il crate `keyring` (servizio "outlook-ai").
//! Nessuna password passa mai dal file di configurazione.

use keyring::{Entry, Error as KeyringError};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// Nome del servizio nel Keychain.
const SERVIZIO: &str = "outlook-ai";

/// Password già lette dal Keychain, finché l'app resta aperta. Ogni lettura del
/// Keychain può far comparire la richiesta di macOS, e il kernel ne fa una a ogni
/// operazione (sincronizzazione, corpo, invio...): con la cache c'è al massimo
/// una richiesta per account a ogni avvio. Vive solo in memoria, mai su disco.
#[derive(Default)]
pub struct CacheSegreti {
    password: Mutex<HashMap<String, String>>,
}

impl CacheSegreti {
    /// La password di `account_id`: dalla cache, o da `carica` la prima volta.
    /// Un errore di `carica` non si ricorda, così la volta dopo si riprova.
    pub fn leggi(
        &self,
        account_id: &str,
        carica: impl FnOnce() -> std::result::Result<String, KeyringError>,
    ) -> std::result::Result<String, KeyringError> {
        if let Some(p) = self.mappa().get(account_id) {
            return Ok(p.clone());
        }
        let password = carica()?;
        self.ricorda(account_id, &password);
        Ok(password)
    }

    /// Tiene in cache una password appena salvata nel Keychain.
    pub fn ricorda(&self, account_id: &str, password: &str) {
        self.mappa().insert(account_id.to_string(), password.to_string());
    }

    /// Toglie dalla cache la password di un account eliminato.
    pub fn dimentica(&self, account_id: &str) {
        self.mappa().remove(account_id);
    }

    fn mappa(&self) -> std::sync::MutexGuard<'_, HashMap<String, String>> {
        // Un panico con il lucchetto preso non rende inservibile la cache.
        self.password.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// La cache del Keychain di sistema: una per processo, perché `Store::real()` si
/// crea a ogni chiamata.
static CACHE_KEYCHAIN: LazyLock<CacheSegreti> = LazyLock::new(CacheSegreti::default);

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
                entry.set_password(password)?;
                CACHE_KEYCHAIN.ricorda(account_id, password);
                Ok(())
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
            None => CACHE_KEYCHAIN.leggi(account_id, || {
                Entry::new(SERVIZIO, account_id)?.get_password()
            }),
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
                CACHE_KEYCHAIN.dimentica(account_id);
                let entry = Entry::new(SERVIZIO, account_id)?;
                entry.delete_credential()
            }
        }
    }
}
