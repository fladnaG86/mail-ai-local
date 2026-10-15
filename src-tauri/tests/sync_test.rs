//! Test della sincronizzazione incrementale (task 3.4, Milestone 3).
//! Usano `FakeSource` (nessuna rete) e una cache SQLite in una cartella temporanea.
//! Coprono: primo sync che inserisce le intestazioni, idempotenza del secondo sync,
//! arrivo di un solo nuovo messaggio in coda, e conteggio dei nuovi per cartella.

use outlook_ai_lib::mail::sync::{sync_account, sync_folder};
use outlook_ai_lib::mail::{FakeSource, MessageHeader};
use outlook_ai_lib::store::Store;
use tempfile::tempdir;

/// Prepara una cache temporanea e una sorgente finta (INBOX con 3 messaggi).
fn setup() -> (tempfile::TempDir, Store, FakeSource) {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let source = FakeSource::new();
    (dir, store, source)
}

#[tokio::test]
async fn primo_sync_inserisce_tutte_le_intestazioni() {
    let (_dir, store, source) = setup();
    let esito = sync_folder(&source, &store, "acct", "INBOX", 100).await.unwrap();
    assert_eq!(esito.new_messages, 3, "la sorgente finta ha 3 messaggi in INBOX");
    assert_eq!(store.count("INBOX").unwrap(), 3);
}

#[tokio::test]
async fn secondo_sync_non_duplica_nulla() {
    let (_dir, store, source) = setup();
    sync_folder(&source, &store, "acct", "INBOX", 100).await.unwrap();
    let esito = sync_folder(&source, &store, "acct", "INBOX", 100).await.unwrap();
    assert_eq!(esito.new_messages, 0, "nessun nuovo messaggio al secondo giro");
    assert_eq!(
        store.count("INBOX").unwrap(),
        3,
        "l unicita (account, folder, uid) impedisce i duplicati"
    );
}

#[tokio::test]
async fn un_nuovo_messaggio_in_coda_ne_aggiunge_esattamente_uno() {
    let (_dir, store, source) = setup();
    sync_folder(&source, &store, "acct", "INBOX", 100).await.unwrap();

    // Arriva un messaggio nuovo, con UID piu alto di quelli gia in cache.
    source.push_header("INBOX", MessageHeader {
        uid: "104".to_string(),
        message_id: Some("<104@example.it>".to_string()),
        subject: Some("Nuovo arrivo".to_string()),
        from: Some("Nuovo Mittente <nuovo@example.it>".to_string()),
        to: Some("mario@example.it".to_string()),
        date: 1_700_000_500,
        seen: false,
        has_attachments: false,
        in_reply_to: None,
        references: None,
    });

    let esito = sync_folder(&source, &store, "acct", "INBOX", 100).await.unwrap();
    assert_eq!(esito.new_messages, 1, "solo il messaggio in coda e nuovo");
    assert_eq!(store.count("INBOX").unwrap(), 4);
}

#[tokio::test]
async fn il_riepilogo_conta_i_nuovi_per_cartella() {
    let (_dir, store, source) = setup();
    let riepilogo = sync_account(&source, &store, "acct", 100).await.unwrap();

    let inbox = riepilogo.folders.iter().find(|f| f.folder == "INBOX").unwrap();
    assert_eq!(inbox.new_messages, 3);

    let inviate = riepilogo
        .folders
        .iter()
        .find(|f| f.folder == "Posta inviata")
        .unwrap();
    assert_eq!(inviate.new_messages, 0);

    // Un secondo giro non trova nulla di nuovo in nessuna cartella.
    let secondo = sync_account(&source, &store, "acct", 100).await.unwrap();
    assert_eq!(secondo.new_messages(), 0);
}
