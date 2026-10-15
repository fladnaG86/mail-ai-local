//! Test della ricerca (blocco B): consultazione dell'indice FTS5 della cache,
//! tolleranza delle query scritte male (ripiego per sottostringa dichiarato),
//! rispetto del limite, anteprima con il termine evidenziato e prefissi in
//! stile Outlook.
//!
//! Il comportamento sotto esame è quello di `Store::cerca`, la stessa strada che
//! percorre il comando IPC `mail_cerca`.

use outlook_ai_lib::store::{Header, Store};
use tempfile::tempdir;

/// Costruisce una intestazione di prova per la cartella INBOX.
fn header(uid: &str, subject: &str, sender: &str, date: i64) -> Header {
    Header {
        account: "acct".to_string(),
        folder: "INBOX".to_string(),
        uid: uid.to_string(),
        message_id: Some(format!("<{uid}@example.it>")),
        subject: Some(subject.to_string()),
        sender: Some(sender.to_string()),
        recipients: Some("mario@example.it".to_string()),
        date,
        seen: true,
        has_attachments: false,
        thread_key: None,
        in_reply_to: None,
        references: None,
    }
}

/// Cache con tre messaggi: parole diverse in oggetto, mittente e corpo.
fn cache_seminata() -> (tempfile::TempDir, Store) {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();

    // 1: la parola cercata è nell'oggetto; letto, senza allegati.
    let id1 = store
        .upsert_header(&header(
            "1",
            "Preventivo per il capannone",
            "Luca Bianchi <luca@example.it>",
            1_700_000_100,
        ))
        .unwrap();
    store
        .set_body(
            id1,
            "Preventivo per l'impianto del capannone: manutenzione ordinaria.",
            None,
        )
        .unwrap();
    // 2: la parola cercata è solo nel corpo; non letto, con allegato.
    let mut h2 = header(
        "2",
        "Riunione impianto",
        "Beta <info@beta.example.it>",
        1_700_000_200,
    );
    h2.seen = false;
    h2.has_attachments = true;
    let id2 = store.upsert_header(&h2).unwrap();
    store
        .set_body(id2, "Lavori nel sottotetto dell'impianto da completare", None)
        .unwrap();
    // 3: non letto, senza allegati; corpo con tre parole comuni ("impianto").
    let mut h3 = header(
        "3",
        "Piano impianto Q4",
        "luca.bianchi@esempiogroup.it",
        1_700_000_300,
    );
    h3.seen = false;
    let id3 = store.upsert_header(&h3).unwrap();
    store
        .set_body(
            id3,
            "Per l'impianto servirebbero la lista degli interventi e i costi entro il 20/11.",
            None,
        )
        .unwrap();

    (dir, store)
}

#[test]
fn trova_una_parola_presente_solo_nel_corpo() {
    let (_dir, store) = cache_seminata();
    let esito = store.cerca("sottotetto", 50).unwrap();
    assert_eq!(esito.righe.len(), 1, "una sola riga contiene 'sottotetto'");
    assert_eq!(esito.righe[0].uid, "2");
    assert!(
        esito.righe[0].anteprima.contains("«sottotetto»"),
        "anteprima: {}",
        esito.righe[0].anteprima
    );
}

#[test]
fn trova_una_parola_presente_solo_nell_oggetto() {
    let (_dir, store) = cache_seminata();
    let esito = store.cerca("capannone", 50).unwrap();
    assert_eq!(esito.righe.len(), 1);
    assert_eq!(esito.righe[0].uid, "1");
    // Il termine è nell'oggetto: l'anteprima lo evidenzia (maiuscola originale).
    assert!(
        esito.righe[0].anteprima.contains("«capannone»"),
        "anteprima: {}",
        esito.righe[0].anteprima
    );
}

#[test]
fn una_parola_assente_da_una_lista_vuota_senza_errore() {
    let (_dir, store) = cache_seminata();
    let esito = store.cerca("inesistentezzz", 50).unwrap();
    assert!(esito.righe.is_empty(), "nessun risultato, non un errore");
    assert!(esito.nota.is_none(), "l'indice non ha rifiutato nulla");
}

/// La ricerca attraversa le caselle: due account con lo stesso oggetto devono
/// restare distinguibili. Senza l'account nella riga, ogni azione su un
/// risultato in vista aggregata non sa da quale casella pescare e si ferma.
#[test]
fn ogni_riga_porta_l_account_di_provenienza() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();

    let mut primo = header("1", "Piano impianto Q4", "Luca <luca@example.it>", 1_700_000_100);
    primo.account = "prima@example.it".to_string();
    store.upsert_header(&primo).unwrap();

    // Stesso uid, stesso oggetto, **casella diversa**: la chiave è (account,
    // folder, uid), quindi senza l'account le due righe sarebbero indistinguibili.
    let mut secondo = header("1", "Piano impianto Q4", "Luca <luca@example.it>", 1_700_000_200);
    secondo.account = "seconda@example.it".to_string();
    store.upsert_header(&secondo).unwrap();

    let esito = store.cerca("impianto", 50).unwrap();
    assert_eq!(esito.righe.len(), 2, "due caselle, due risultati");

    let mut caselle: Vec<(&str, &str)> = esito
        .righe
        .iter()
        .map(|r| (r.account.as_str(), r.folder.as_str()))
        .collect();
    caselle.sort_unstable();
    // Anche la cartella è verificata: senza, una SELECT che leggesse la colonna
    // sbagliata al posto di `account` passerebbe lo stesso.
    assert_eq!(
        caselle,
        vec![
            ("prima@example.it", "INBOX"),
            ("seconda@example.it", "INBOX"),
        ],
    );
}

#[test]
fn una_query_che_fts5_rifiuta_non_e_un_errore_e_lo_dichiara() {
    let (_dir, store) = cache_seminata();
    // La virgoletta non chiusa è sintassi FTS5 non valida: `MATCH` la rifiuta.
    let esito = store.cerca("preventivo \"", 50).unwrap();
    assert!(
        esito.nota.is_some(),
        "il ripiego per sottostringa deve essere dichiarato"
    );
    // Il ripiego trova comunque la riga cercata.
    assert_eq!(esito.righe.len(), 1, "il ripiego per sottostringa trova la riga");
    assert_eq!(esito.righe[0].uid, "1");
}

#[test]
fn il_limite_viene_rispettato() {
    let (_dir, store) = cache_seminata();
    // "impianto" compare in tutte e tre le righe (oggetto o corpo).
    assert_eq!(store.cerca("impianto", 50).unwrap().righe.len(), 3);
    assert_eq!(store.cerca("impianto", 2).unwrap().righe.len(), 2);
    assert_eq!(store.cerca("impianto", 1).unwrap().righe.len(), 1);
}

#[test]
fn i_prefissi_stile_outlook_filtrano_i_risultati() {
    let (_dir, store) = cache_seminata();

    // `da:` limita al mittente che contiene la parola.
    let da = store.cerca("da:beta", 50).unwrap();
    assert_eq!(da.righe.len(), 1);
    assert_eq!(da.righe[0].uid, "2");

    // `oggetto:` limita all'oggetto.
    let ogg = store.cerca("oggetto:capannone", 50).unwrap();
    assert_eq!(ogg.righe.len(), 1);
    assert_eq!(ogg.righe[0].uid, "1");

    // `con:allegato` tiene solo i messaggi con allegati.
    let allegati = store.cerca("con:allegato", 50).unwrap();
    assert_eq!(allegati.righe.len(), 1);
    assert_eq!(allegati.righe[0].uid, "2");

    // `non:letto` tiene solo i non letti (2 e 3).
    let non_letti = store.cerca("non:letto", 50).unwrap();
    assert_eq!(non_letti.righe.len(), 2);

    // Prefisso + testo libero insieme: il mittente del dominio esempiogroup.
    let combinata = store.cerca("da:esempiogroup impianto", 50).unwrap();
    assert_eq!(combinata.righe.len(), 1);
    assert_eq!(combinata.righe[0].uid, "3");
}

#[test]
fn il_risultato_ipc_ha_i_nomi_camel_case_e_la_data_iso() {
    // La forma serializzata è il contratto con l'interfaccia: verificala qui.
    let riga = outlook_ai_lib::store::RigaRicerca {
        account: "mario.rossi@esempiogroup.it".to_string(),
        folder: "INBOX".to_string(),
        uid: "7".to_string(),
        subject: Some("Piano Q4".to_string()),
        sender: Some("Luca <a@b.it>".to_string()),
        date: 1_760_000_000,
        seen: false,
        has_attachments: true,
        flagged: true,
        completato: false,
        categorie: Some("[\"Lavoro\"]".to_string()),
        anteprima: "il «piano» di manutenzione".to_string(),
    };
    let ipc = outlook_ai_lib::riga_ricerca_ipc(riga);
    let json = serde_json::to_value(&ipc).unwrap();
    for chiave in [
        "account",
        "folder",
        "uid",
        "oggetto",
        "mittente",
        "data",
        "anteprima",
        "nonLetto",
        "allegati",
        "contrassegnato",
        "completato",
        "categorie",
        "timestamp",
    ] {
        assert!(json.get(chiave).is_some(), "manca il campo {chiave}");
    }
    // L'account è la casella di provenienza: senza, un risultato di ricerca non
    // sa da dove pescare il messaggio (la ricerca attraversa le caselle).
    assert_eq!(json["account"], "mario.rossi@esempiogroup.it");
    assert_eq!(json["data"], "2025-10-09T08:53:20Z");
    assert_eq!(json["nonLetto"], true);
    assert_eq!(json["categorie"][0], "Lavoro");
}
