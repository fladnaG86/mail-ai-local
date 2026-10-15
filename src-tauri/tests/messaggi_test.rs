//! Test delle operazioni sui messaggi (blocco A): letto, contrassegnato,
//! completato, categorie, sposta, elimina, archivia, indesiderato ed elenco
//! cartelle. Usano `FakeSource` (nessuna rete) e una cache SQLite temporanea.
//!
//! La regola sotto esame è una sola: prima il server, poi la cache. Un server
//! che rifiuta deve produrre un errore leggibile **e** lasciare la cache com'era;
//! le operazioni locali (completato, categorie) devono valere anche offline.

use outlook_ai_lib::mail::ops::{self, EsitoEliminazione};
use outlook_ai_lib::mail::{FakeSource, FlagOp, MailSource, MessageHeader};
use outlook_ai_lib::store::{Header, Store};
use tempfile::tempdir;

/// Cache temporanea (vive finché vive il `TempDir` restituito).
fn cache_temp() -> (tempfile::TempDir, Store) {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    (dir, store)
}

/// Riga di cache per INBOX, coerente con i messaggi di `FakeSource::new`.
fn riga_inbox(uid: &str, from: &str) -> Header {
    Header {
        account: "acct".to_string(),
        folder: "INBOX".to_string(),
        uid: uid.to_string(),
        message_id: Some(format!("<{uid}@example.it>")),
        subject: Some(format!("Messaggio {uid}")),
        sender: Some(from.to_string()),
        recipients: Some("mario@example.it".to_string()),
        date: 1_700_000_000,
        seen: false,
        has_attachments: false,
        thread_key: None,
        in_reply_to: None,
        references: None,
    }
}

/// Semina la cache con gli stessi messaggi che `FakeSource::new` espone in INBOX.
fn semina_inbox(store: &Store) {
    for (uid, from) in [
        ("101", "Luca Bianchi <luca@example.it>"),
        ("102", "Beta <info@beta.example.it>"),
        ("103", "marco.ferrari@esempiogroup.it"),
    ] {
        store.upsert_header(&riga_inbox(uid, from)).unwrap();
    }
}

/// Trova una riga per UID in una cartella della cache.
fn riga(store: &Store, folder: &str, uid: &str) -> Option<outlook_ai_lib::store::MessageRow> {
    store
        .list(folder, 0, 1000)
        .unwrap()
        .into_iter()
        .find(|r| r.uid == uid)
}

#[tokio::test]
async fn letto_e_non_letto_aggiornano_la_cache_ed_essendo_idempotenti() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new();
    semina_inbox(&store);

    // Letto: vera la cache e ripetuto non cambia nulla.
    ops::imposta_flag(&src, &store, "acct", "INBOX", "101", FlagOp::Seen, true)
        .await
        .unwrap();
    assert!(riga(&store, "INBOX", "101").unwrap().seen);
    ops::imposta_flag(&src, &store, "acct", "INBOX", "101", FlagOp::Seen, true)
        .await
        .unwrap();
    assert!(riga(&store, "INBOX", "101").unwrap().seen);

    // Da leggere: torna falso e resta falso.
    ops::imposta_flag(&src, &store, "acct", "INBOX", "101", FlagOp::Seen, false)
        .await
        .unwrap();
    assert!(!riga(&store, "INBOX", "101").unwrap().seen);
    ops::imposta_flag(&src, &store, "acct", "INBOX", "101", FlagOp::Seen, false)
        .await
        .unwrap();
    assert!(!riga(&store, "INBOX", "101").unwrap().seen);
}

#[tokio::test]
async fn contrassegnato_aggiorna_la_cache_ed_e_idempotente() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new();
    semina_inbox(&store);

    ops::imposta_flag(&src, &store, "acct", "INBOX", "102", FlagOp::Flagged, true)
        .await
        .unwrap();
    ops::imposta_flag(&src, &store, "acct", "INBOX", "102", FlagOp::Flagged, true)
        .await
        .unwrap();
    assert!(store.flagged("acct", "INBOX", "102").unwrap());

    ops::imposta_flag(&src, &store, "acct", "INBOX", "102", FlagOp::Flagged, false)
        .await
        .unwrap();
    assert!(!store.flagged("acct", "INBOX", "102").unwrap());
}

#[test]
fn completato_e_locale_e_idempotente() {
    // Nessuna sorgente: "completato" è uno stato locale che vale anche offline.
    let (_dir, store) = cache_temp();
    semina_inbox(&store);

    ops::set_completato(&store, "acct", "INBOX", "103", true).unwrap();
    ops::set_completato(&store, "acct", "INBOX", "103", true).unwrap();
    assert!(store.completato("acct", "INBOX", "103").unwrap());

    ops::set_completato(&store, "acct", "INBOX", "103", false).unwrap();
    assert!(!store.completato("acct", "INBOX", "103").unwrap());
}

#[tokio::test]
async fn sposta_cambia_cartella_e_sparisce_da_quella_di_partenza() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new();
    semina_inbox(&store);

    ops::sposta(&src, &store, "acct", "INBOX", "101", "Posta inviata")
        .await
        .unwrap();

    assert!(
        riga(&store, "INBOX", "101").is_none(),
        "non deve restare in INBOX"
    );
    assert!(
        riga(&store, "Posta inviata", "101").is_some(),
        "deve comparire nella destinazione"
    );
    assert_eq!(store.count("INBOX").unwrap(), 2);

    // Anche la sorgente (il "server") ha spostato il messaggio.
    let inbox = src.headers("INBOX", 0).await.unwrap();
    assert!(!inbox.iter().any(|h| h.uid == "101"));
    let inviate = src.headers("Posta inviata", 0).await.unwrap();
    assert!(inviate.iter().any(|h| h.uid == "101"));
}

#[tokio::test]
async fn un_server_che_rifiuta_produce_err_leggibile_e_lascia_la_cache_invariata() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new().che_rifiuta("cartella in sola lettura: operazione rifiutata");
    semina_inbox(&store);

    // Flag: il server rifiuta, la cache resta "da leggere".
    let esito = ops::imposta_flag(&src, &store, "acct", "INBOX", "101", FlagOp::Seen, true).await;
    assert!(esito.is_err());
    assert!(
        esito.unwrap_err().contains("rifiutata"),
        "l'errore deve riportare il motivo del server in modo leggibile"
    );
    assert!(!riga(&store, "INBOX", "101").unwrap().seen);

    // Spostamento: il server rifiuta, la riga resta in INBOX.
    let esito = ops::sposta(&src, &store, "acct", "INBOX", "101", "Posta inviata").await;
    assert!(esito.is_err());
    assert!(riga(&store, "INBOX", "101").is_some());
    assert!(riga(&store, "Posta inviata", "101").is_none());
    assert_eq!(store.count("INBOX").unwrap(), 3);
}

#[tokio::test]
async fn elimina_usa_la_cartella_eliminata_quando_esiste() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new().con_cartelle(&["Posta eliminata"]);
    semina_inbox(&store);

    let esito = ops::elimina(&src, &store, "acct", "INBOX", "101").await.unwrap();
    assert_eq!(
        esito,
        EsitoEliminazione::Spostato("Posta eliminata".to_string())
    );

    assert!(riga(&store, "INBOX", "101").is_none());
    assert!(
        riga(&store, "Posta eliminata", "101").is_some(),
        "il messaggio va nella cartella della posta eliminata, non rimosso"
    );
    // Il "server" ha fatto lo stesso.
    let eliminate = src.headers("Posta eliminata", 0).await.unwrap();
    assert!(eliminate.iter().any(|h| h.uid == "101"));
}

#[tokio::test]
async fn elimina_ripiega_sulla_rimozione_definitiva_senza_cartella_eliminata() {
    let (_dir, store) = cache_temp();
    // FakeSource::new non ha alcuna cartella della posta eliminata.
    let src = FakeSource::new();
    semina_inbox(&store);

    let esito = ops::elimina(&src, &store, "acct", "INBOX", "101").await.unwrap();
    assert_eq!(esito, EsitoEliminazione::Rimosso { ripiego_ampio: false });

    assert!(riga(&store, "INBOX", "101").is_none());
    assert_eq!(store.count("INBOX").unwrap(), 2);
    let inbox = src.headers("INBOX", 0).await.unwrap();
    assert!(!inbox.iter().any(|h| h.uid == "101"));
}

#[tokio::test]
async fn archivia_sposta_in_archivio_quando_esiste() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new().con_cartelle(&["Archivio"]);
    semina_inbox(&store);

    ops::archivia(&src, &store, "acct", "INBOX", "102").await.unwrap();
    assert!(riga(&store, "INBOX", "102").is_none());
    assert!(riga(&store, "Archivio", "102").is_some());
}

#[tokio::test]
async fn archivia_senza_cartella_archivio_da_un_errore_leggibile() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new();
    semina_inbox(&store);

    let esito = ops::archivia(&src, &store, "acct", "INBOX", "102").await;
    assert!(esito.is_err());
    assert!(esito.unwrap_err().contains("Archivio"));
    // La cache non si muove.
    assert!(riga(&store, "INBOX", "102").is_some());
}

#[tokio::test]
async fn indesiderato_sposta_e_blocca_il_mittente_senza_duplicarlo() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new().con_cartelle(&["Posta indesiderata"]);
    semina_inbox(&store);

    // Secondo messaggio dallo stesso mittente di 101: serve a provare il dedup.
    src.push_header(
        "INBOX",
        MessageHeader {
            uid: "104".to_string(),
            message_id: Some("<104@example.it>".to_string()),
            subject: Some("Ancora Luca".to_string()),
            from: Some("Luca Bianchi <luca@example.it>".to_string()),
            to: Some("mario@example.it".to_string()),
            date: 1_700_000_400,
            seen: false,
            has_attachments: false,
            in_reply_to: None,
            references: None,
        },
    );
    store
        .upsert_header(&riga_inbox("104", "Luca Bianchi <luca@example.it>"))
        .unwrap();

    ops::indesiderato(&src, &store, "acct", "INBOX", "101")
        .await
        .unwrap();
    ops::indesiderato(&src, &store, "acct", "INBOX", "104")
        .await
        .unwrap();

    assert!(riga(&store, "INBOX", "101").is_none());
    assert!(riga(&store, "Posta indesiderata", "101").is_some());
    assert!(riga(&store, "Posta indesiderata", "104").is_some());

    // Il mittente è bloccato una sola volta, nonostante due segnalazioni.
    assert_eq!(
        store.mittenti_bloccati().unwrap(),
        vec!["luca@example.it".to_string()]
    );
}

#[tokio::test]
async fn categorie_si_salvano_si_rileggono_e_un_elenco_vuoto_le_rimuove() {
    let (_dir, store) = cache_temp();
    // Server che NON supporta le keyword: le categorie restano comunque locali.
    let src = FakeSource::new();
    semina_inbox(&store);

    ops::set_categorie(
        &src,
        &store,
        "acct",
        "INBOX",
        "101",
        vec!["Lavoro".to_string(), "Luca".to_string()],
    )
    .await
    .unwrap();
    assert_eq!(
        store.categorie("acct", "INBOX", "101").unwrap(),
        vec!["Lavoro".to_string(), "Luca".to_string()]
    );

    // Elenco vuoto: le categorie si rimuovono.
    ops::set_categorie(&src, &store, "acct", "INBOX", "101", Vec::new())
        .await
        .unwrap();
    assert!(store.categorie("acct", "INBOX", "101").unwrap().is_empty());
}

#[tokio::test]
async fn le_categorie_funzionano_anche_col_server_che_supporta_le_keyword() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new().con_keyword();
    semina_inbox(&store);

    ops::set_categorie(&src, &store, "acct", "INBOX", "101", vec!["Lavoro".to_string()])
        .await
        .unwrap();
    assert_eq!(
        store.categorie("acct", "INBOX", "101").unwrap(),
        vec!["Lavoro".to_string()]
    );
}

#[tokio::test]
async fn cartelle_restituisce_i_nomi_del_server() {
    let src = FakeSource::new();
    let nomi = ops::cartelle(&src).await.unwrap();
    assert_eq!(nomi, vec!["INBOX".to_string(), "Posta inviata".to_string()]);
}

#[tokio::test]
async fn indesiderato_senza_cartella_da_un_errore_leggibile() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new();
    semina_inbox(&store);

    let esito = ops::indesiderato(&src, &store, "acct", "INBOX", "101").await;
    assert!(esito.is_err());
    assert!(esito.unwrap_err().contains("indesiderata"));
    // Non spostato e nessun mittente bloccato.
    assert!(riga(&store, "INBOX", "101").is_some());
    assert!(store.mittenti_bloccati().unwrap().is_empty());
}

// ---------------------------------------------------------------------------
// Blocco D — l'anteprima di lista: dal corpo in cache alla riga dell'interfaccia.
// ---------------------------------------------------------------------------

#[test]
fn la_lista_riporta_il_corpo_in_cache_per_l_anteprima() {
    let (_dir, store) = cache_temp();
    let id = store.upsert_header(&riga_inbox("1", "luca@example.it")).unwrap();
    store
        .set_body(id, "Buongiorno, confermo la riunione di giovedì.", None)
        .unwrap();

    let righe = store.list("INBOX", 0, 10).unwrap();
    let r = righe.iter().find(|r| r.uid == "1").unwrap();
    assert_eq!(
        r.body_text.as_deref(),
        Some("Buongiorno, confermo la riunione di giovedì."),
        "il testo del corpo torna con la riga di lista"
    );
}

#[test]
fn anteprima_prende_il_corpo_e_normalizza_gli_spazi() {
    let corta = outlook_ai_lib::anteprima_lista(Some("ciao   mondo\nnuova riga"));
    assert_eq!(corta.as_deref(), Some("ciao mondo nuova riga"));
}

#[test]
fn anteprima_tronca_i_testi_lunghi_e_ignora_il_vuoto() {
    let lungo = "parola ".repeat(60);
    let a = outlook_ai_lib::anteprima_lista(Some(&lungo)).unwrap();
    assert!(
        a.chars().count() <= outlook_ai_lib::ANTEPRIMA_LISTA_MAX + 1,
        "anteprima troppo lunga: {} caratteri",
        a.chars().count()
    );
    assert!(a.ends_with('…'), "un testo troncato finisce con l'ellissi");
    assert_eq!(outlook_ai_lib::anteprima_lista(Some("   \n  ")), None);
    assert_eq!(outlook_ai_lib::anteprima_lista(None), None);
}
