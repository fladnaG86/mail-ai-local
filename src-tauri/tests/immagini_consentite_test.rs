//! «Mostra immagini» si chiede una volta sola per messaggio: il consenso resta
//! nella cache (colonna `immagini_consentite`), sopravvive alla
//! sincronizzazione e vale solo per quella riga di quella casella. E il pulsante
//! ha senso solo se il corpo ha davvero immagini remote bloccate.

use outlook_ai_lib::componi_corpo;
use outlook_ai_lib::store::{Header, Store};
use tempfile::tempdir;

fn header(account: &str, uid: &str) -> Header {
    Header {
        account: account.to_string(),
        folder: "INBOX".to_string(),
        uid: uid.to_string(),
        message_id: Some(format!("<{uid}@esempiohost.it>")),
        subject: Some("Newsletter".to_string()),
        sender: Some("Luca Bianchi <luca@esempiohost.it>".to_string()),
        recipients: Some("mario.rossi@esempiogroup.it".to_string()),
        date: 1_700_000_000,
        seen: false,
        has_attachments: false,
        thread_key: None,
        in_reply_to: None,
        references: None,
    }
}

#[test]
fn senza_consenso_le_immagini_non_sono_consentite() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.upsert_header(&header("lavoro", "1")).unwrap();
    assert!(!store.immagini_consentite("lavoro", "INBOX", "1").unwrap());
}

#[test]
fn il_consenso_resta_e_sopravvive_alla_sincronizzazione() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.upsert_header(&header("lavoro", "1")).unwrap();
    store.consenti_immagini("lavoro", "INBOX", "1").unwrap();
    assert!(store.immagini_consentite("lavoro", "INBOX", "1").unwrap());
    // La sincronizzazione riscrive l'intestazione: il consenso non si perde.
    store.upsert_header(&header("lavoro", "1")).unwrap();
    assert!(store.immagini_consentite("lavoro", "INBOX", "1").unwrap());
}

#[test]
fn il_consenso_vale_solo_per_quel_messaggio_di_quella_casella() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.upsert_header(&header("lavoro", "1")).unwrap();
    store.upsert_header(&header("lavoro", "2")).unwrap();
    store.upsert_header(&header("casa", "1")).unwrap();
    store.consenti_immagini("lavoro", "INBOX", "1").unwrap();
    assert!(!store.immagini_consentite("lavoro", "INBOX", "2").unwrap());
    assert!(!store.immagini_consentite("casa", "INBOX", "1").unwrap());
}

#[test]
fn un_messaggio_assente_dalla_cache_non_e_consentito_e_non_da_errore() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.consenti_immagini("lavoro", "INBOX", "99").unwrap();
    assert!(!store.immagini_consentite("lavoro", "INBOX", "99").unwrap());
}

const CON_IMMAGINE: &[u8] = b"Content-Type: text/html; charset=utf-8\r\n\r\n\
<p>Ciao</p><img src=\"https://esempiohost.it/logo.png\">";
const SENZA_IMMAGINI: &[u8] = b"Content-Type: text/html; charset=utf-8\r\n\r\n<p>Ciao</p>";

#[test]
fn un_corpo_con_immagini_remote_bloccate_lo_dichiara() {
    let corpo = componi_corpo(CON_IMMAGINE, false);
    assert!(corpo.immagini_bloccate);
    assert!(!corpo.html.contains("https://esempiohost.it/logo.png"));
}

#[test]
fn con_le_immagini_consentite_non_c_e_nulla_di_bloccato() {
    let corpo = componi_corpo(CON_IMMAGINE, true);
    assert!(!corpo.immagini_bloccate);
    assert!(corpo.html.contains("https://esempiohost.it/logo.png"));
}

#[test]
fn un_corpo_senza_immagini_remote_non_ha_nulla_da_mostrare() {
    assert!(!componi_corpo(SENZA_IMMAGINI, false).immagini_bloccate);
}

#[test]
fn l_indicatore_viaggia_in_camel_case() {
    let json = serde_json::to_value(componi_corpo(CON_IMMAGINE, false)).unwrap();
    assert_eq!(json["immaginiBloccate"], serde_json::json!(true));
}
