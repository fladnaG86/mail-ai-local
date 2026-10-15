// Test della cache locale SQLite con ricerca full-text (task 3.3).
// Coprono: ricerca nel soggetto, idempotenza dell'upsert, indicizzazione del
// corpo dopo il fetch, conteggio e paginazione per cartella.
use outlook_ai_lib::store::{Header, Store};
use tempfile::tempdir;

/// Costruisce un'intestazione di prova per la cartella INBOX.
fn header(uid: &str, subject: &str) -> Header {
    Header {
        account: "acct".to_string(),
        folder: "INBOX".to_string(),
        uid: uid.to_string(),
        message_id: Some(format!("<{uid}@example.it>")),
        subject: Some(subject.to_string()),
        sender: Some("Mario Rossi <mario@example.it>".to_string()),
        recipients: Some("mario@example.it".to_string()),
        date: 1_700_000_000,
        seen: false,
        has_attachments: false,
        thread_key: None,
        in_reply_to: None,
        references: None,
    }
}

#[test]
fn search_finds_word_present_only_in_subject_of_first() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();

    store
        .upsert_header(&header("1", "Preventivo per il capannone"))
        .unwrap();
    store
        .upsert_header(&header("2", "Riunione di lunedi"))
        .unwrap();

    let hits = store.search("preventivo").unwrap();
    assert_eq!(hits.len(), 1, "una sola riga deve contenere 'preventivo'");
    assert_eq!(
        hits[0].subject.as_deref(),
        Some("Preventivo per il capannone")
    );
}

#[test]
fn repeated_upsert_of_same_key_does_not_duplicate() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();

    let h = header("7", "Fattura 12");
    store.upsert_header(&h).unwrap();
    store.upsert_header(&h).unwrap();
    store.upsert_header(&h).unwrap();

    assert_eq!(
        store.count("INBOX").unwrap(),
        1,
        "lo stesso (account, folder, uid) non deve duplicare la riga"
    );
}

#[test]
fn body_enters_index_after_set_body() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();

    let id = store
        .upsert_header(&header("3", "Nota generica"))
        .unwrap();
    // Prima del fetch del corpo la parola non deve essere trovata.
    assert!(store.search("sottotetto").unwrap().is_empty());

    store
        .set_body(id, "Lavori nel sottotetto da completare", None)
        .unwrap();

    let hits = store.search("sottotetto").unwrap();
    assert_eq!(hits.len(), 1, "dopo set_body la parola e' indicizzata");
    assert_eq!(hits[0].id, id);
}

#[test]
fn count_and_list_respect_folder_and_pagination() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();

    // Tre messaggi in INBOX con date crescenti (10, 11, 12).
    for (i, uid) in ["10", "11", "12"].iter().enumerate() {
        let mut h = header(uid, &format!("INBOX {uid}"));
        h.date = 1_700_000_000 + i as i64;
        store.upsert_header(&h).unwrap();
    }
    // Due messaggi in un'altra cartella.
    for (i, uid) in ["20", "21"].iter().enumerate() {
        let mut h = header(uid, &format!("Archivio {uid}"));
        h.folder = "Archivio".to_string();
        h.date = 1_700_000_000 + i as i64;
        store.upsert_header(&h).unwrap();
    }

    assert_eq!(store.count("INBOX").unwrap(), 3);
    assert_eq!(store.count("Archivio").unwrap(), 2);

    // Prima pagina: i due messaggi piu' recenti, ordine per data discendente.
    let page1 = store.list("INBOX", 0, 2).unwrap();
    assert_eq!(page1.len(), 2);
    assert_eq!(page1[0].uid, "12");
    assert_eq!(page1[1].uid, "11");

    // Seconda pagina: resta il piu' vecchio.
    let page2 = store.list("INBOX", 2, 2).unwrap();
    assert_eq!(page2.len(), 1);
    assert_eq!(page2[0].uid, "10");
}
