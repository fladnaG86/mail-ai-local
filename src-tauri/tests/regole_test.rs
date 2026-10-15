//! Test del motore locale delle regole (blocco H).
//!
//! Coprono: condizioni combinate in AND, azioni applicate nell'ordine, una regola
//! disattivata che non agisce, i messaggi già valutati che non vengono rielaborati
//! (nessun doppio spostamento), una regola che fallisce senza bloccare le altre, e
//! il salvataggio/rilettura delle regole.

use outlook_ai_lib::config::{self, AzioneRegola, CondizioniRegola, Preferenze, Regola};
use outlook_ai_lib::mail::regole as motore;
use outlook_ai_lib::mail::regole::{Azione, EsitoRegole, Messaggio};
use outlook_ai_lib::mail::{FakeSource, MessageHeader};
use outlook_ai_lib::store::{Header, Store};

/// Una regola con id/nome, stato, ordine, condizioni e azioni.
fn regola(
    id: &str,
    nome: &str,
    attiva: bool,
    ordine: i64,
    condizioni: CondizioniRegola,
    azioni: Vec<AzioneRegola>,
) -> Regola {
    Regola {
        id: id.to_string(),
        nome: nome.to_string(),
        attiva,
        ordine,
        condizioni,
        azioni,
        esecuzioni: 0,
        ultima_esecuzione: 0,
    }
}

/// Un'azione di configurazione.
fn az(tipo: &str, valore: &str) -> AzioneRegola {
    AzioneRegola {
        tipo: tipo.to_string(),
        valore: valore.to_string(),
    }
}

/// Un messaggio per il motore.
fn messaggio(uid: &str, mittente: &str, oggetto: &str, corpo: &str, ha_allegati: bool) -> Messaggio {
    Messaggio {
        uid: uid.to_string(),
        mittente: mittente.to_string(),
        oggetto: oggetto.to_string(),
        corpo: corpo.to_string(),
        destinatario: "mario@example.it".to_string(),
        ha_allegati,
    }
}

/// Una riga di cache in INBOX.
fn header(uid: &str, mittente: &str, oggetto: &str, ha_allegati: bool) -> Header {
    Header {
        account: "acct".to_string(),
        folder: "INBOX".to_string(),
        uid: uid.to_string(),
        message_id: Some(format!("<{uid}@example.it>")),
        subject: Some(oggetto.to_string()),
        sender: Some(mittente.to_string()),
        recipients: Some("mario@example.it".to_string()),
        date: 1_700_000_000 + uid.parse::<i64>().unwrap_or(0),
        seen: false,
        has_attachments: ha_allegati,
        thread_key: None,
        in_reply_to: None,
        references: None,
    }
}

/// Esegue il motore su una cartella (pianifica → rete → cache), come fa il
/// comando `mail_sync`. Nei test la cache può restare aperta attraverso l'`await`.
async fn esegui(store: &Store, src: &FakeSource, folder: &str, regole: &[Regola]) -> EsitoRegole {
    let righe = store.messaggi_da_regole("acct", folder).unwrap();
    let messaggi: Vec<Messaggio> = righe.iter().map(Into::into).collect();
    let passi = motore::pianifica(regole, &messaggi);
    let risposte = motore::esegui_rete(src, folder, &passi).await;
    let valutati: Vec<String> = righe.iter().map(|r| r.uid.clone()).collect();
    motore::applica_cache(store, "acct", folder, &passi, &risposte, &valutati).unwrap()
}

#[test]
fn una_regola_con_piu_condizioni_le_applica_in_and() {
    let cond = CondizioniRegola {
        mittente_contiene: "luca".to_string(),
        oggetto_contiene: "piano".to_string(),
        allegato: "indifferente".to_string(),
        ..CondizioniRegola::default()
    };
    let completo = messaggio("1", "Luca <luca@example.it>", "Piano Q4", "", false);
    let senza_oggetto = messaggio("2", "Luca <luca@example.it>", "Fattura", "", false);
    let altro_mittente = messaggio("3", "Beta <info@beta.it>", "Piano Q4", "", false);

    assert!(motore::condizioni_soddisfatte(&cond, &completo));
    assert!(!motore::condizioni_soddisfatte(&cond, &senza_oggetto));
    assert!(!motore::condizioni_soddisfatte(&cond, &altro_mittente));
}

#[test]
fn la_condizione_con_allegato_si_rispetta() {
    let con = CondizioniRegola {
        allegato: "con".to_string(),
        ..CondizioniRegola::default()
    };
    let senza = CondizioniRegola {
        allegato: "senza".to_string(),
        ..CondizioniRegola::default()
    };
    let allegato = messaggio("1", "a@x", "oggetto", "", true);
    let nudo = messaggio("2", "a@x", "oggetto", "", false);

    assert!(motore::condizioni_soddisfatte(&con, &allegato));
    assert!(!motore::condizioni_soddisfatte(&con, &nudo));
    assert!(motore::condizioni_soddisfatte(&senza, &nudo));
    assert!(!motore::condizioni_soddisfatte(&senza, &allegato));
}

#[test]
fn le_azioni_si_applicano_nell_ordine() {
    let r = regola(
        "r1",
        "Ordine",
        true,
        0,
        CondizioniRegola {
            oggetto_contiene: "piano".to_string(),
            ..CondizioniRegola::default()
        },
        vec![az("sposta", "Archivio"), az("categorizza", "Lavoro")],
    );
    let passi = motore::pianifica(&[r], &[messaggio("1", "a@x", "Piano Q4", "", false)]);
    assert_eq!(passi.len(), 2);
    assert_eq!(passi[0].azione, Azione::Sposta("Archivio".to_string()));
    assert_eq!(passi[1].azione, Azione::Categorizza("Lavoro".to_string()));
}

#[tokio::test]
async fn le_categorizzate_si_accumulano_nell_ordine_dichiarato() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.upsert_header(&header("1", "Luca <a@x>", "Piano", false)).unwrap();
    let src = FakeSource::new();
    let r = regola(
        "r1",
        "Categorie",
        true,
        0,
        CondizioniRegola {
            oggetto_contiene: "piano".to_string(),
            ..CondizioniRegola::default()
        },
        vec![az("categorizza", "A"), az("categorizza", "B")],
    );
    let esito = esegui(&store, &src, "INBOX", &[r]).await;
    assert_eq!(esito.per_regola.get("r1"), Some(&2));
    assert_eq!(
        store.categorie("acct", "INBOX", "1").unwrap(),
        vec!["A".to_string(), "B".to_string()],
        "l'ordine delle azioni è quello dichiarato"
    );
}

#[tokio::test]
async fn una_regola_disattivata_non_agisce() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.upsert_header(&header("1", "Luca <a@x>", "Piano", false)).unwrap();
    let src = FakeSource::new();
    let r = regola(
        "r1",
        "Spenta",
        false, // disattivata
        0,
        CondizioniRegola {
            oggetto_contiene: "piano".to_string(),
            ..CondizioniRegola::default()
        },
        vec![az("categorizza", "NonDeve")],
    );
    let esito = esegui(&store, &src, "INBOX", &[r]).await;
    assert_eq!(esito.per_regola.get("r1"), None, "la regola spenta non ha agito");
    assert!(store.categorie("acct", "INBOX", "1").unwrap().is_empty());
}

#[tokio::test]
async fn i_messaggi_gia_rielaborati_non_vengono_toccati_due_volte() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.upsert_header(&header("1", "Luca <a@x>", "Piano", false)).unwrap();
    let src = FakeSource::new().con_cartelle(&["Archivio"]);
    // Il messaggio deve stare anche sul server, altrimenti lo spostamento fallisce.
    src.push_header(
        "INBOX",
        MessageHeader {
            uid: "1".to_string(),
            message_id: Some("<1@example.it>".to_string()),
            subject: Some("Piano".to_string()),
            from: Some("Luca <a@x>".to_string()),
            to: Some("mario@example.it".to_string()),
            date: 1_700_000_001,
            seen: false,
            has_attachments: false,
            in_reply_to: None,
            references: None,
        },
    );
    let r = regola(
        "r1",
        "Archivia",
        true,
        0,
        CondizioniRegola {
            oggetto_contiene: "piano".to_string(),
            ..CondizioniRegola::default()
        },
        vec![az("sposta", "Archivio")],
    );

    let primo = esegui(&store, &src, "INBOX", std::slice::from_ref(&r)).await;
    assert_eq!(primo.elaborati, 1);
    assert_eq!(primo.per_regola.get("r1"), Some(&1));
    assert!(store.list("INBOX", 0, 10).unwrap().is_empty(), "il messaggio è stato spostato");
    assert_eq!(store.list("Archivio", 0, 10).unwrap().len(), 1);

    // Secondo giro: non c'è più nulla da valutare, nessun doppio spostamento.
    let secondo = esegui(&store, &src, "INBOX", std::slice::from_ref(&r)).await;
    assert_eq!(secondo.elaborati, 0);
    assert_eq!(secondo.per_regola.get("r1"), None);
    assert!(store.messaggi_da_regole("acct", "INBOX").unwrap().is_empty());
}

#[tokio::test]
async fn una_regola_che_fallisce_non_blocca_le_altre() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.upsert_header(&header("1", "Luca <a@x>", "Piano", false)).unwrap();
    let src = FakeSource::new();
    // La prima regola sposta in una cartella che non esiste: il server rifiuta.
    let r1 = regola(
        "r1",
        "Sposta impossibile",
        true,
        0,
        CondizioniRegola {
            oggetto_contiene: "piano".to_string(),
            ..CondizioniRegola::default()
        },
        vec![az("sposta", "NonEsiste")],
    );
    // La seconda categorizza: deve agire comunque.
    let r2 = regola(
        "r2",
        "Categorizza",
        true,
        1,
        CondizioniRegola {
            oggetto_contiene: "piano".to_string(),
            ..CondizioniRegola::default()
        },
        vec![az("categorizza", "Fornitori")],
    );
    let esito = esegui(&store, &src, "INBOX", &[r1, r2]).await;

    assert_eq!(esito.fallimenti.len(), 1, "il rifiuto è stato registrato, una volta");
    assert!(esito.per_regola.get("r1").is_none(), "la regola fallita non risulta applicata");
    assert_eq!(esito.per_regola.get("r2"), Some(&1), "la seconda regola ha agito lo stesso");
    assert_eq!(store.categorie("acct", "INBOX", "1").unwrap(), vec!["Fornitori".to_string()]);
    // Il messaggio non è stato spostato: è ancora in INBOX.
    assert_eq!(store.list("INBOX", 0, 10).unwrap().len(), 1);
}

#[test]
fn le_regole_si_salvano_e_si_rileggono() {
    let dir = tempfile::tempdir().unwrap();
    let r = regola(
        "r1",
        "Clienti",
        true,
        0,
        CondizioniRegola {
            mittente_contiene: "cliente".to_string(),
            allegato: "con".to_string(),
            ..CondizioniRegola::default()
        },
        vec![az("sposta", "Clienti"), az("contrassegna", "")],
    );
    let pref = Preferenze {
        regole: vec![r.clone()],
        ..Preferenze::default()
    };
    config::save_preferenze(dir.path(), &pref).unwrap();

    let rilette = config::load_preferenze(dir.path());
    assert_eq!(rilette.regole.len(), 1);
    assert_eq!(rilette.regole[0], r, "la regola torna identica");
    assert!(rilette.raggruppa_conversazioni, "il raggruppamento resta attivo di default");

    // La preferenza «raggruppa per conversazione» si salva e si rilegge.
    let spento = Preferenze {
        raggruppa_conversazioni: false,
        regole: vec![r],
        ..Preferenze::default()
    };
    config::save_preferenze(dir.path(), &spento).unwrap();
    assert!(!config::load_preferenze(dir.path()).raggruppa_conversazioni);
}

#[test]
fn le_regole_si_normalizzano_in_lettura() {
    // Id duplicato scartato (vince la prima), azioni fuori elenco tolte, nome
    // vuoto generato, ordine rispettato.
    let duplicata = regola("r1", "Prima", true, 1, CondizioniRegola::default(), vec![az("boh", "x")]);
    let scartata = regola("r1", "Duplicata", true, 5, CondizioniRegola::default(), vec![]);
    let senza_nome = regola(
        "",
        "",
        true,
        0,
        CondizioniRegola::default(),
        vec![az("categorizza", "Lavoro")],
    );
    let norm = config::normalizza_regole(&[duplicata, scartata, senza_nome]);

    assert_eq!(norm.len(), 2, "l'id duplicato è scartato");
    // Ordinato per `ordine`: prima quella con ordine 0.
    assert_eq!(norm[0].ordine, 0);
    assert_eq!(norm[0].nome, "Regola 3", "il nome vuoto viene generato");
    assert_eq!(norm[0].azioni[0].tipo, "categorizza");
    assert_eq!(norm[1].nome, "Prima");
    assert!(norm[1].azioni.is_empty(), "l'azione «boh» è fuori elenco e viene tolta");
    assert!(!norm[0].id.is_empty(), "anche l'id mancante viene generato");
}
