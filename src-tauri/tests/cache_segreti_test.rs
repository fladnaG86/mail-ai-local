//! La password si legge dal Portachiavi una volta sola per avvio: ogni lettura
//! del Keychain può far comparire la richiesta di macOS, e il kernel la chiedeva
//! a ogni operazione (sincronizzazione, corpo, invio...). La cache vive solo in
//! memoria, finché l'app resta aperta: niente su disco.

use keyring::Error as KeyringError;
use outlook_ai_lib::secrets::CacheSegreti;
use std::cell::Cell;

#[test]
fn la_seconda_lettura_non_tocca_il_portachiavi() {
    let cache = CacheSegreti::default();
    let letture = Cell::new(0);
    let carica = || {
        letture.set(letture.get() + 1);
        Ok("s3gr3t0".to_string())
    };
    assert_eq!(cache.leggi("acct:mario", carica).unwrap(), "s3gr3t0");
    assert_eq!(cache.leggi("acct:mario", carica).unwrap(), "s3gr3t0");
    assert_eq!(letture.get(), 1);
}

#[test]
fn ogni_account_ha_la_sua_password() {
    let cache = CacheSegreti::default();
    cache.leggi("a", || Ok("uno".to_string())).unwrap();
    assert_eq!(cache.leggi("b", || Ok("due".to_string())).unwrap(), "due");
    assert_eq!(cache.leggi("a", || Ok("altro".to_string())).unwrap(), "uno");
}

#[test]
fn un_errore_non_si_ricorda_e_la_volta_dopo_si_riprova() {
    let cache = CacheSegreti::default();
    assert!(matches!(cache.leggi("a", || Err(KeyringError::NoEntry)), Err(KeyringError::NoEntry)));
    assert_eq!(cache.leggi("a", || Ok("arrivata".to_string())).unwrap(), "arrivata");
}

#[test]
fn salvare_una_password_nuova_aggiorna_la_cache() {
    let cache = CacheSegreti::default();
    cache.leggi("a", || Ok("vecchia".to_string())).unwrap();
    cache.ricorda("a", "nuova");
    assert_eq!(cache.leggi("a", || Ok("dal portachiavi".to_string())).unwrap(), "nuova");
}

#[test]
fn eliminare_l_account_toglie_la_password_dalla_cache() {
    let cache = CacheSegreti::default();
    cache.leggi("a", || Ok("vecchia".to_string())).unwrap();
    cache.dimentica("a");
    assert_eq!(cache.leggi("a", || Ok("riletta".to_string())).unwrap(), "riletta");
}
