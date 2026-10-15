//! Test del blocco I1: Rinvia, Inoltra come allegato, Copia nella cartella,
//! Ignora conversazione, gestione delle cartelle, Preferiti, Salva come bozza e
//! contrassegno con scadenza. Usano `FakeSource` (nessuna rete), una cache
//! SQLite temporanea e le funzioni pure di `send`/`scadenza`.
//!
//! La regola sotto esame resta quella del blocco A: **prima il server, poi la
//! cache**. Un rifiuto del server lascia la cache com'era.

use outlook_ai_lib::mail::ops;
use outlook_ai_lib::mail::scadenza::{self, OraLocale, TipoScadenza};
use outlook_ai_lib::mail::{FakeSource, MailSource};
use outlook_ai_lib::send;
use outlook_ai_lib::store::{Header, Store};
use tempfile::tempdir;

fn cache_temp() -> (tempfile::TempDir, Store) {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    (dir, store)
}

fn riga(folder: &str, uid: &str, from: &str) -> Header {
    Header {
        account: "acct".to_string(),
        folder: folder.to_string(),
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

fn semina_inbox(store: &Store) {
    for (uid, from) in [
        ("101", "Luca Bianchi <luca@example.it>"),
        ("102", "Beta <info@beta.example.it>"),
    ] {
        store.upsert_header(&riga("INBOX", uid, from)).unwrap();
    }
}

fn riga_da(store: &Store, folder: &str, uid: &str) -> Option<outlook_ai_lib::store::MessageRow> {
    store
        .list(folder, 0, 1000)
        .unwrap()
        .into_iter()
        .find(|r| r.uid == uid)
}

// ---------------------------------------------------------------------------
// Copia nella cartella…
// ---------------------------------------------------------------------------

#[tokio::test]
async fn copia_lascia_l_originale_e_crea_la_riga_nella_destinazione() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new().con_cartelle(&["Archivio"]);
    semina_inbox(&store);

    ops::copia(&src, &store, "acct", "INBOX", "101", "Archivio")
        .await
        .unwrap();

    assert!(
        riga_da(&store, "INBOX", "101").is_some(),
        "l'originale deve restare in INBOX"
    );
    assert!(
        riga_da(&store, "Archivio", "101").is_some(),
        "la copia deve comparire nella destinazione"
    );
    // Anche il server ha copiato, non spostato.
    let inbox = src.headers("INBOX", 0).await.unwrap();
    assert!(inbox.iter().any(|h| h.uid == "101"));
    let archivio = src.headers("Archivio", 0).await.unwrap();
    assert!(archivio.iter().any(|h| h.uid == "101"));
}

#[tokio::test]
async fn copia_ripetuta_non_crea_doppioni_e_differisce_da_sposta() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new().con_cartelle(&["Archivio"]);
    semina_inbox(&store);

    ops::copia(&src, &store, "acct", "INBOX", "101", "Archivio")
        .await
        .unwrap();
    ops::copia(&src, &store, "acct", "INBOX", "101", "Archivio")
        .await
        .unwrap();
    assert_eq!(store.count("Archivio").unwrap(), 1, "nessun doppione");

    // Sposta invece toglie l'originale.
    ops::sposta(&src, &store, "acct", "INBOX", "102", "Archivio")
        .await
        .unwrap();
    assert!(riga_da(&store, "INBOX", "102").is_none());
    assert!(riga_da(&store, "Archivio", "102").is_some());
}

// ---------------------------------------------------------------------------
// Rinvia
// ---------------------------------------------------------------------------

/// Un messaggio grezzo con oggetto prefissato, testo e un allegato.
fn grezzo_con_allegato() -> Vec<u8> {
    let s = "From: Luca Bianchi <luca@example.it>\n\
             To: mario@example.it\n\
             Subject: R: Piano manutenzione Q4\n\
             Message-ID: <1@example.it>\n\
             MIME-Version: 1.0\n\
             Content-Type: multipart/mixed; boundary=\"B\"\n\
             \n\
             --B\n\
             Content-Type: text/plain; charset=\"utf-8\"\n\
             \n\
             Buongiorno, confermo la riunione.\n\
             \n\
             --B\n\
             Content-Type: application/pdf; name=\"piano.pdf\"\n\
             Content-Disposition: attachment; filename=\"piano.pdf\"\n\
             Content-Transfer-Encoding: base64\n\
             \n\
             SGVsbG8gbW9uZG8=\n\
             \n\
             --B--\n";
    s.as_bytes().to_vec()
}

#[test]
fn rinvia_non_aggiunge_prefissi_e_conserva_gli_allegati() {
    let bozza = send::bozza_rinvia(&grezzo_con_allegato());
    // Nessun prefisso di risposta/inoltro: l'oggetto parte pulito.
    assert_eq!(bozza.oggetto, "Piano manutenzione Q4");
    assert!(!bozza.oggetto.starts_with("R:"));
    assert!(!bozza.oggetto.starts_with("I:"));
    // Il testo originale è conservato.
    assert!(bozza.corpo.contains("confermo la riunione"));
    // Gli allegati originali ci sono.
    assert_eq!(bozza.allegati.len(), 1);
    assert_eq!(bozza.allegati[0].nome, "piano.pdf");
    assert_eq!(bozza.allegati[0].mime, "application/pdf");
    assert!(!bozza.allegati[0].contenuto.is_empty());
}

#[test]
fn togli_prefissi_ripulisce_anche_i_prefissi_accumulati() {
    assert_eq!(send::togli_prefissi("Piano Q4"), "Piano Q4");
    assert_eq!(send::togli_prefissi("R: Piano Q4"), "Piano Q4");
    assert_eq!(send::togli_prefissi("I: R: Piano Q4"), "Piano Q4");
    assert_eq!(send::togli_prefissi("[Esterna] I: Piano Q4"), "Piano Q4");
    assert_eq!(send::togli_prefissi("  RE:   Piano Q4"), "Piano Q4");
}

// ---------------------------------------------------------------------------
// Inoltra come allegato
// ---------------------------------------------------------------------------

#[test]
fn inoltra_come_allegato_produce_una_parte_message_rfc822_con_nome_eml() {
    let grezzo = grezzo_con_allegato();
    let testo = send::testo_inoltro_allegato(&grezzo);
    assert!(testo.contains("come allegato"));
    let messaggio = send::build_inoltro_allegato(
        "Mario <mario@example.it>",
        &["luca@example.it".to_string()],
        &grezzo,
        &testo,
    )
    .unwrap();
    let grezzo_out = String::from_utf8_lossy(&messaggio.formatted()).into_owned();
    assert!(
        grezzo_out.contains("message/rfc822"),
        "il messaggio originale deve essere allegato come message/rfc822"
    );
    assert!(
        grezzo_out.contains(".eml"),
        "il nome dell'allegato deve finire con .eml"
    );
    // Oggetto prefissato come inoltro.
    assert!(grezzo_out.contains("I:"));
}

#[test]
fn nome_eml_ripulisce_i_caratteri_non_leci() {
    assert_eq!(send::nome_eml("Piano manutenzione Q4"), "Piano manutenzione Q4.eml");
    assert_eq!(send::nome_eml("a/b:c*d"), "a_b_c_d.eml");
    assert_eq!(send::nome_eml("   "), "messaggio.eml");
}

// ---------------------------------------------------------------------------
// Cartelle: crea / rinomina / elimina / svuota / segna tutto letto
// ---------------------------------------------------------------------------

#[tokio::test]
async fn crea_rinomina_elimina_aggiornano_la_cache_solo_dopo_l_esito() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new();
    semina_inbox(&store);

    // Crea: il server la espone e la cache la registra.
    ops::crea_cartella(&src, &store, "acct", "Commesse").await.unwrap();
    assert!(src.folders().await.unwrap().iter().any(|f| f.name == "Commesse"));
    assert!(
        store
            .cartelle_registrate("acct")
            .unwrap()
            .iter()
            .any(|(n, _)| n == "Commesse")
    );

    // Rinomina: i messaggi seguono il nuovo nome.
    ops::rinomina_cartella(&src, &store, "acct", "Commesse", "Commesse 2026")
        .await
        .unwrap();
    assert!(
        store
            .cartelle_registrate("acct")
            .unwrap()
            .iter()
            .any(|(n, _)| n == "Commesse 2026")
    );
    assert!(src.folders().await.unwrap().iter().any(|f| f.name == "Commesse 2026"));

    // Elimina: la cartella sparisce dal server e dalla cache.
    ops::elimina_cartella(&src, &store, "acct", "Commesse 2026").await.unwrap();
    assert!(!src.folders().await.unwrap().iter().any(|f| f.name == "Commesse 2026"));
    assert!(
        !store
            .cartelle_registrate("acct")
            .unwrap()
            .iter()
            .any(|(n, _)| n == "Commesse 2026")
    );
}

#[tokio::test]
async fn un_rifiuto_del_server_lascia_le_cartelle_invariate() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new().che_rifiuta("permesso negato dal server");
    semina_inbox(&store);

    let esito = ops::crea_cartella(&src, &store, "acct", "Nuova").await;
    assert!(esito.is_err());
    assert!(esito.unwrap_err().contains("permesso negato"));
    assert!(
        !store
            .cartelle_registrate("acct")
            .unwrap()
            .iter()
            .any(|(n, _)| n == "Nuova"),
        "una creazione rifiutata non deve registrare nulla in cache"
    );

    let esito = ops::rinomina_cartella(&src, &store, "acct", "INBOX", "Posta in arrivo").await;
    assert!(esito.is_err());
    assert!(riga_da(&store, "INBOX", "101").is_some(), "la cache resta invariata");

    let esito = ops::elimina_cartella(&src, &store, "acct", "INBOX").await;
    assert!(esito.is_err());
    assert_eq!(store.count("INBOX").unwrap(), 2);

    let esito = ops::svuota_cartella(&src, &store, "acct", "INBOX").await;
    assert!(esito.is_err());
    assert_eq!(store.count("INBOX").unwrap(), 2);

    let esito = ops::segna_cartella_letta(&src, &store, "acct", "INBOX").await;
    assert!(esito.is_err());
    assert!(riga_da(&store, "INBOX", "101").is_some_and(|r| !r.seen));
}

#[tokio::test]
async fn svuota_cartella_rimuove_i_messaggi_dal_server_e_dalla_cache() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new();
    semina_inbox(&store);

    let n = ops::svuota_cartella(&src, &store, "acct", "INBOX").await.unwrap();
    assert_eq!(n, 2);
    assert_eq!(store.count("INBOX").unwrap(), 0);
    assert!(src.headers("INBOX", 0).await.unwrap().is_empty());
}

#[tokio::test]
async fn segna_tutto_letto_aggiorna_server_e_cache() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new();
    semina_inbox(&store);

    let n = ops::segna_cartella_letta(&src, &store, "acct", "INBOX").await.unwrap();
    assert_eq!(n, 2);
    assert!(riga_da(&store, "INBOX", "101").unwrap().seen);
    assert!(riga_da(&store, "INBOX", "102").unwrap().seen);
    let inbox = src.headers("INBOX", 0).await.unwrap();
    assert!(inbox.iter().all(|h| h.seen));
}

// ---------------------------------------------------------------------------
// Preferiti
// ---------------------------------------------------------------------------

#[test]
fn i_preferiti_restano_in_alto_nell_elenco() {
    let (_dir, store) = cache_temp();
    for nome in ["Posta inviata", "Archivio", "Bozze"] {
        store.registra_cartella("acct", nome).unwrap();
    }
    store.set_cartella_preferita("acct", "Bozze", true).unwrap();

    let elenco = store.cartelle_registrate("acct").unwrap();
    assert_eq!(elenco[0], ("Bozze".to_string(), true), "la preferita sta in alto");
    assert_eq!(store.cartelle_preferite("acct").unwrap(), vec!["Bozze".to_string()]);

    store.set_cartella_preferita("acct", "Bozze", false).unwrap();
    assert!(store.cartelle_preferite("acct").unwrap().is_empty());
}

// ---------------------------------------------------------------------------
// Salva come bozza
// ---------------------------------------------------------------------------

#[tokio::test]
async fn la_bozza_va_in_bozze_con_il_flag_draft() {
    let src = FakeSource::new().con_cartelle(&["Bozze"]);
    let grezzo = b"From: a@b.it\nSubject: Bozza\n\nCorpo.";
    src.salva_bozza("Bozze", grezzo).await.unwrap();

    let bozze = src.bozze_con_flag();
    assert_eq!(bozze.len(), 1);
    assert_eq!(bozze[0].0, "Bozze");
    assert_eq!(bozze[0].1, "\\Draft", "la bozza porta il flag \\Draft");
    assert_eq!(bozze[0].2, grezzo.to_vec());
}

#[test]
fn build_bozza_accetta_una_bozza_senza_destinatari() {
    // Un invio senza destinatari è rifiutato…
    assert!(send::build_message_completo(
        "mario@example.it",
        &[],
        &[],
        &[],
        "Oggetto",
        "corpo",
        None,
        None,
        &[],
    )
    .is_err());
    // …ma una bozza sì.
    assert!(send::build_bozza(
        "mario@example.it",
        &[],
        &[],
        &[],
        "Oggetto",
        "corpo",
        None,
        None,
        &[],
    )
    .is_ok());
}

// ---------------------------------------------------------------------------
// Conversazione ignorata / Non ignorare più
// ---------------------------------------------------------------------------

#[tokio::test]
async fn una_conversazione_ignorata_viene_gestita_e_non_ignorare_la_riattiva() {
    let (_dir, store) = cache_temp();
    let src = FakeSource::new().con_cartelle(&["Posta eliminata"]);
    semina_inbox(&store);
    // 101 e 102 appartengono alla stessa conversazione.
    store.set_thread_key("acct", "INBOX", "101", "thread-chiave").unwrap();
    store.set_thread_key("acct", "INBOX", "102", "thread-chiave").unwrap();

    // Ignora: la scelta è reversibile e finisce in cache.
    store.conversazione_ignora("acct", "thread-chiave", true).unwrap();
    assert!(store.e_conversazione_ignorata("acct", "thread-chiave").unwrap());
    assert_eq!(store.conversazioni_ignorate("acct").unwrap(), vec!["thread-chiave".to_string()]);

    let uids = store
        .messaggi_di_conversazioni_ignorate("acct", "INBOX", &store.conversazioni_ignorate("acct").unwrap())
        .unwrap();
    assert_eq!(uids.len(), 2);

    // Durante la sincronizzazione: segnati letti e spostati in Posta eliminata.
    for uid in &uids {
        ops::gestisci_conversazione_ignorata(
            &src,
            &store,
            "acct",
            "INBOX",
            uid,
            Some("Posta eliminata"),
        )
        .await
        .unwrap();
    }
    assert!(riga_da(&store, "INBOX", "101").is_none());
    assert!(riga_da(&store, "Posta eliminata", "101").is_some());
    assert!(riga_da(&store, "Posta eliminata", "101").unwrap().seen);
    let eliminate = src.headers("Posta eliminata", 0).await.unwrap();
    assert_eq!(eliminate.len(), 2);

    // Non ignorare più: la conversazione è riattivata, nessun messaggio da gestire.
    store.conversazione_ignora("acct", "thread-chiave", false).unwrap();
    assert!(store.conversazioni_ignorate("acct").unwrap().is_empty());
    assert!(!store.e_conversazione_ignorata("acct", "thread-chiave").unwrap());
}

// ---------------------------------------------------------------------------
// Contrassegno con scadenza
// ---------------------------------------------------------------------------

#[test]
fn la_scadenza_si_salva_si_rilegge_e_si_rimuove() {
    let (_dir, store) = cache_temp();
    semina_inbox(&store);

    ops::set_scadenza(&store, "acct", "INBOX", "101", Some("2026-10-13T18:00:00")).unwrap();
    assert_eq!(
        store.scadenza("acct", "INBOX", "101").unwrap(),
        Some("2026-10-13T18:00:00".to_string())
    );
    // Impostare una data contrassegna il messaggio.
    assert!(store.flagged("acct", "INBOX", "101").unwrap());

    // Rimuovere la data toglie anche il contrassegno.
    ops::set_scadenza(&store, "acct", "INBOX", "101", None).unwrap();
    assert_eq!(store.scadenza("acct", "INBOX", "101").unwrap(), None);
    assert!(!store.flagged("acct", "INBOX", "101").unwrap());
}

#[test]
fn le_date_proposte_sono_corrette_anche_a_cavallo_di_mezzanotte_e_weekend() {
    // Martedì 13/10/2026, mattina.
    let martedi = OraLocale::nuova(2026, 10, 13, 10, 0, 0);
    assert_eq!(
        scadenza::proponi(TipoScadenza::PiuTardiOggi, martedi),
        "2026-10-13T13:00:00"
    );
    assert_eq!(
        scadenza::proponi(TipoScadenza::QuestaSera, martedi),
        "2026-10-13T18:00:00"
    );
    assert_eq!(
        scadenza::proponi(TipoScadenza::Domani, martedi),
        "2026-10-14T10:00:00"
    );
    assert_eq!(
        scadenza::proponi(TipoScadenza::ProssimaSettimana, martedi),
        "2026-10-19T09:00:00"
    );

    // A cavallo di mezzanotte: 23:30 di martedì.
    let notte = OraLocale::nuova(2026, 10, 13, 23, 30, 0);
    assert_eq!(
        scadenza::proponi(TipoScadenza::PiuTardiOggi, notte),
        "2026-10-14T02:30:00"
    );
    assert_eq!(
        scadenza::proponi(TipoScadenza::QuestaSera, notte),
        "2026-10-14T18:00:00"
    );

    // Fine settimana: sabato 17/10 e domenica 18/10 vanno al lunedì 19/10.
    for (g, atteso) in [
        (OraLocale::nuova(2026, 10, 17, 9, 0, 0), "2026-10-19T09:00:00"),
        (OraLocale::nuova(2026, 10, 18, 9, 0, 0), "2026-10-19T09:00:00"),
    ] {
        assert_eq!(scadenza::proponi(TipoScadenza::ProssimaSettimana, g), atteso);
    }
}

#[test]
fn le_voci_del_sottomenu_sono_quelle_del_riferimento() {
    let voci = send_voci();
    let etichette: Vec<&str> = voci.iter().map(|v| v.1.as_str()).collect();
    assert_eq!(
        etichette,
        vec![
            "Più tardi oggi",
            "Questa sera",
            "Domani",
            "Prossima settimana",
            "Rimuovi contrassegno"
        ]
    );
}

fn send_voci() -> Vec<(String, String)> {
    scadenza::voci_sottomenu()
        .iter()
        .map(|(id, et)| (id.to_string(), et.to_string()))
        .collect()
}
