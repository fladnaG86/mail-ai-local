//! Test del blocco I2: ordinamento e densità della lista, ricerca avanzata,
//! invio programmato, conferme di lettura/recapito, zoom e formattazione.
//!
//! Le funzioni pure si collaudano con un «orologio iniettato» e senza rete; la
//! cache e il file della coda usano una cartella temporanea.

use outlook_ai_lib::composizione;
use outlook_ai_lib::conferme;
use outlook_ai_lib::config::{self, Preferenze, DENSITA};
use outlook_ai_lib::ricerca::{self, CampiAvanzati};
use outlook_ai_lib::send;
use outlook_ai_lib::sendlater::{self, InvioProgrammato};
use outlook_ai_lib::store::{Header, Store};
use tempfile::tempdir;

// --- Ordinamento della lista (Ordina per) -----------------------------------

fn header(uid: &str, sender: &str, subject: &str, date: i64) -> Header {
    Header {
        account: "acct".to_string(),
        folder: "INBOX".to_string(),
        uid: uid.to_string(),
        message_id: Some(format!("<{uid}@example.it>")),
        subject: Some(subject.to_string()),
        sender: Some(sender.to_string()),
        recipients: Some("mario@example.it".to_string()),
        date,
        seen: false,
        has_attachments: false,
        thread_key: None,
        in_reply_to: None,
        references: None,
    }
}

fn store_con_tre() -> (tempfile::TempDir, Store) {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store
        .upsert_header(&header("1", "Zeta <zeta@example.it>", "Alfa", 300))
        .unwrap();
    store
        .upsert_header(&header("2", "Alfa <alfa@example.it>", "Zeta", 100))
        .unwrap();
    store
        .upsert_header(&header("3", "Mu <mu@example.it>", "Mu", 200))
        .unwrap();
    (dir, store)
}

#[test]
fn ordina_per_data_in_entrambi_i_versi() {
    let (_d, store) = store_con_tre();
    let dec = store
        .list_ordinato("INBOX", 0, 50, "data", "discendente")
        .unwrap();
    assert_eq!(
        dec.iter().map(|r| r.date).collect::<Vec<_>>(),
        vec![300, 200, 100]
    );
    let cre = store
        .list_ordinato("INBOX", 0, 50, "data", "crescente")
        .unwrap();
    assert_eq!(
        cre.iter().map(|r| r.date).collect::<Vec<_>>(),
        vec![100, 200, 300]
    );
}

#[test]
fn ordina_per_mittente_e_oggetto() {
    let (_d, store) = store_con_tre();
    let mitt = store
        .list_ordinato("INBOX", 0, 50, "mittente", "crescente")
        .unwrap();
    assert_eq!(
        mitt.iter()
            .map(|r| r.sender.clone().unwrap())
            .collect::<Vec<_>>(),
        vec![
            "Alfa <alfa@example.it>".to_string(),
            "Mu <mu@example.it>".to_string(),
            "Zeta <zeta@example.it>".to_string()
        ]
    );
    let ogg = store
        .list_ordinato("INBOX", 0, 50, "oggetto", "discendente")
        .unwrap();
    assert_eq!(
        ogg.iter()
            .map(|r| r.subject.clone().unwrap())
            .collect::<Vec<_>>(),
        vec!["Zeta".to_string(), "Mu".to_string(), "Alfa".to_string()]
    );
}

#[test]
fn ordina_per_dimensione_approfondita() {
    let (_d, store) = store_con_tre();
    // Un corpo lungo cambia la dimensione approssimata: la riga con l'uid 1 sale.
    let id1 = store
        .list_ordinato("INBOX", 0, 50, "data", "discendente")
        .unwrap()
        .iter()
        .find(|r| r.uid == "1")
        .map(|r| r.id)
        .unwrap();
    store.set_body(id1, &"x".repeat(500), None).unwrap();
    let per_dim = store
        .list_ordinato("INBOX", 0, 50, "dimensione", "discendente")
        .unwrap();
    assert_eq!(per_dim[0].uid, "1", "il corpo più lungo viene per primo");
}

#[test]
fn un_campo_sconosciuto_ricade_su_data() {
    // Campo e verso non riconosciuti non rompono: default data discendente.
    let sql = overlook_ordinamento("boh", "strano");
    assert!(sql.contains("m.date"));
    assert!(sql.contains("DESC"));
}

/// Piccolo alias per non ripetere il percorso completo nel test sopra.
fn overlook_ordinamento(campo: &str, verso: &str) -> String {
    outlook_ai_lib::store::ordinamento_sql(campo, verso)
}

// --- Densità persistita ------------------------------------------------------

#[test]
fn densita_e_ordinamento_si_persistono() {
    let dir = tempdir().unwrap();
    let mut p = Preferenze::default();
    p.densita_visualizzazione = "compatta".to_string();
    p.ordina_per = "mittente".to_string();
    p.ordina_verso = "crescente".to_string();
    p.zoom_composizione = 150;
    config::save_preferenze(dir.path(), &p).unwrap();
    let riletto = config::load_preferenze(dir.path());
    assert_eq!(riletto.densita_visualizzazione, "compatta");
    assert_eq!(riletto.ordina_per, "mittente");
    assert_eq!(riletto.ordina_verso, "crescente");
    assert_eq!(riletto.zoom_composizione, 150);
}

#[test]
fn una_densita_sconosciuta_torna_al_default() {
    let mut p = Preferenze::default();
    p.densita_visualizzazione = "enorme".to_string();
    p.zoom_composizione = 9999;
    let n = p.normalizzata();
    assert_eq!(n.densita_visualizzazione, config::DENSITA_DEFAULT);
    assert!(DENSITA.contains(&n.densita_visualizzazione.as_str()));
    assert_eq!(n.zoom_composizione, config::ZOOM_COMPOSIZIONE_DEFAULT);
}

// --- Ricerca avanzata (funzione pura) ---------------------------------------

#[test]
fn la_query_avanzata_si_costruisce_per_ogni_campo() {
    let q = ricerca::costruisci_query_avanzata(&CampiAvanzati {
        da: "luca".to_string(),
        oggetto: "piano".to_string(),
        a: "mario".to_string(),
        con_allegato: Some(true),
        non_letti: true,
        periodo_da: "2026-01-01".to_string(),
        periodo_a: "2026-12-31".to_string(),
    });
    assert!(q.contains("da:luca"));
    assert!(q.contains("oggetto:piano"));
    assert!(q.contains("a:mario"));
    assert!(q.contains("con:allegato"));
    assert!(q.contains("non:letto"));
    assert!(q.contains("dopo:2026-01-01"));
    assert!(q.contains("prima:2026-12-31"));
    // La query prodotta è riletta dallo stesso analizzatore del motore FTS5.
    let analizzata = ricerca::analizza_query(&q);
    assert_eq!(analizzata.da.as_deref(), Some("luca"));
    assert_eq!(analizzata.oggetto.as_deref(), Some("piano"));
    assert_eq!(analizzata.a.as_deref(), Some("mario"));
    assert!(analizzata.con_allegato);
    assert!(analizzata.non_letto);
    assert!(analizzata.dopo.is_some());
    assert!(analizzata.prima.is_some());
}

#[test]
fn campi_vuoti_producono_una_query_vuota() {
    let q = ricerca::costruisci_query_avanzata(&CampiAvanzati::default());
    assert_eq!(q, "");
}

#[test]
fn senza_allegato_esclude_i_messaggi_con_allegati() {
    let q = ricerca::costruisci_query_avanzata(&CampiAvanzati {
        con_allegato: Some(false),
        ..Default::default()
    });
    assert_eq!(q, "senza:allegato");
    let a = ricerca::analizza_query(&q);
    assert!(a.senza_allegato);
    assert!(!a.con_allegato);
}

#[test]
fn le_date_non_valide_vengono_omesse() {
    let q = ricerca::costruisci_query_avanzata(&CampiAvanzati {
        periodo_da: "non-una-data".to_string(),
        ..Default::default()
    });
    assert_eq!(q, "", "una data non valida non entra nella query");
}

// --- Invio programmato -------------------------------------------------------

fn inv(id: &str, quando: i64) -> InvioProgrammato {
    InvioProgrammato {
        id: id.to_string(),
        quando,
        account_id: "a".to_string(),
        a: "dest@example.it".to_string(),
        cc: String::new(),
        ccn: String::new(),
        oggetto: "Prova".to_string(),
        corpo_testo: "corpo".to_string(),
        corpo_html: String::new(),
        allegati: Vec::new(),
        conferma_lettura: false,
        conferma_recapito: false,
        creato: 0,
    }
}

#[test]
fn l_invio_non_parte_prima_dell_ora_e_parte_dopo() {
    let coda = vec![inv("1", 1_000_000)];
    assert!(sendlater::dovuti(&coda, 999_999).is_empty());
    assert_eq!(sendlater::dovuti(&coda, 1_000_000).len(), 1);
    assert_eq!(sendlater::dovuti(&coda, 1_000_001).len(), 1);
}

#[test]
fn l_invio_programmato_e_annullabile() {
    let mut coda = vec![inv("1", 1_000_000), inv("2", 2_000_000)];
    assert!(sendlater::annulla(&mut coda, "1"));
    assert_eq!(coda.len(), 1);
    assert_eq!(coda[0].id, "2");
    assert!(!sendlater::annulla(&mut coda, "assente"));
}

#[test]
fn la_coda_si_salva_e_rilegge_da_disco() {
    let dir = tempdir().unwrap();
    let coda = vec![inv("1", 5_000), inv("2", 3_000)];
    outlook_ai_lib::invii_salva_in(dir.path(), &coda).unwrap();
    let riletta = outlook_ai_lib::invii_leggi_da(dir.path());
    assert_eq!(riletta.len(), 2);
    // L'ordine salvato è quello di aggiunta; `in_coda` li ordina per ora.
    let in_coda = sendlater::in_coda(&riletta, 0);
    assert_eq!(in_coda[0].quando, 3_000);
}

// --- Conferme di lettura e recapito -----------------------------------------

#[test]
fn le_intestazioni_delle_conferme_ci_sono_solo_se_richieste() {
    // Nulla richiesto → nessuna intestazione di conferma.
    let nessuna = send::intestazioni_extra(&send::IntestazioniExtra::default());
    assert!(nessuna.is_empty());

    // Solo lettura → solo Disposition-Notification-To, nel formato <indirizzo>.
    let lettura = send::intestazioni_extra(&send::IntestazioniExtra {
        reply_to: None,
        tracciamento: send::Tracciamento {
            conferma_lettura: true,
            conferma_recapito: false,
            indirizzo: "mario@esempiogroup.it".to_string(),
        },
    });
    assert_eq!(lettura.len(), 1);
    assert_eq!(lettura[0].0, "Disposition-Notification-To");
    assert_eq!(lettura[0].1, "<mario@esempiogroup.it>");

    // Lettura + recapito → anche Return-Receipt-To.
    let entrambe = send::intestazioni_extra(&send::IntestazioniExtra {
        reply_to: None,
        tracciamento: send::Tracciamento {
            conferma_lettura: true,
            conferma_recapito: true,
            indirizzo: "mario@esempiogroup.it".to_string(),
        },
    });
    let nomi: Vec<&str> = entrambe.iter().map(|(n, _)| n.as_str()).collect();
    assert!(nomi.contains(&"Disposition-Notification-To"));
    assert!(nomi.contains(&"Return-Receipt-To"));
}

#[test]
fn le_intestazioni_finiscono_nel_messaggio_grezzo() {
    let extra = send::IntestazioniExtra {
        reply_to: Some("risposta@esempiogroup.it".to_string()),
        tracciamento: send::Tracciamento {
            conferma_lettura: true,
            conferma_recapito: true,
            indirizzo: "mario@esempiogroup.it".to_string(),
        },
    };
    let m = send::build_message_completo_con_extra(
        "Mario <mario@esempiogroup.it>",
        &["luca@esempiogroup.it".to_string()],
        &[],
        &[],
        "Oggetto",
        "corpo",
        None,
        None,
        &[],
        Some(&extra),
    )
    .unwrap();
    let grezzo = String::from_utf8_lossy(&m.formatted()).to_string();
    assert!(grezzo.contains("Disposition-Notification-To: <mario@esempiogroup.it>"));
    assert!(grezzo.contains("Return-Receipt-To: <mario@esempiogroup.it>"));
    assert!(grezzo.contains("Reply-To: risposta@esempiogroup.it"));
}

#[test]
fn senza_richieste_il_messaggio_non_porta_conferme() {
    let m = send::build_message_completo(
        "Mario <mario@esempiogroup.it>",
        &["luca@esempiogroup.it".to_string()],
        &[],
        &[],
        "Oggetto",
        "corpo",
        None,
        None,
        &[],
    )
    .unwrap();
    let grezzo = String::from_utf8_lossy(&m.formatted()).to_lowercase();
    assert!(!grezzo.contains("disposition-notification-to"));
    assert!(!grezzo.contains("return-receipt-to"));
}

#[test]
fn la_richiesta_all_arrivo_viene_riconosciuta() {
    let raw = b"From: Luca <luca@esempiogroup.it>\r\nSubject: Piano Q4\r\n\
                Disposition-Notification-To: <luca@esempiogroup.it>\r\n\
                Return-Receipt-To: <luca@esempiogroup.it>\r\n\r\ncorpo\r\n";
    let intestazioni = conferme::intestazioni_da_grezzo(raw);
    let r = conferme::riconosci_richiesta(&intestazioni);
    assert!(r.lettura && r.recapito);
    assert_eq!(r.indirizzo.as_deref(), Some("luca@esempiogroup.it"));
}

#[test]
fn la_scelta_della_conferma_resta_in_cache() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    assert!(store.conferme_scelte("acct", "INBOX", "5").unwrap().is_empty());
    store
        .conferma_registra("acct", "INBOX", "5", "lettura", false, 1_700_000_000)
        .unwrap();
    let scelte = store.conferme_scelte("acct", "INBOX", "5").unwrap();
    assert_eq!(scelte, vec![("lettura".to_string(), false)]);
    // Una seconda scelta sovrascrive la precedente, senza duplicare.
    store
        .conferma_registra("acct", "INBOX", "5", "lettura", true, 1_700_000_100)
        .unwrap();
    let scelte = store.conferme_scelte("acct", "INBOX", "5").unwrap();
    assert_eq!(scelte, vec![("lettura".to_string(), true)]);
}

// --- Zoom e formattazione ----------------------------------------------------

#[test]
fn lo_zoom_produce_lo_stile_atteso_e_nel_limite() {
    assert_eq!(composizione::stile_zoom(100, 12), "font-size: 12px");
    assert_eq!(composizione::stile_zoom(150, 12), "font-size: 18px");
    assert_eq!(
        composizione::stile_zoom(1, 12),
        composizione::stile_zoom(config::ZOOM_COMPOSIZIONE_MIN, 12)
    );
}

#[test]
fn la_formattazione_produce_il_markup_atteso() {
    assert_eq!(
        composizione::markup_formattazione("barrato", "testo", None).as_deref(),
        Some("<s>testo</s>")
    );
    assert_eq!(
        composizione::markup_formattazione("evidenzia", "x", Some("#ffff00")).as_deref(),
        Some("<span style=\"background-color: #ffff00\">x</span>")
    );
    assert!(composizione::markup_formattazione("sconosciuto", "x", None).is_none());
}

// --- Scelte rapide da tastiera ----------------------------------------------

#[test]
fn le_scelte_rapide_elencano_le_scorciatoie_reali() {
    let s = outlook_ai_lib::scorciatoie_attive();
    assert!(!s.is_empty());
    // Le scorciatoie presenti nei gestori del codice devono comparire.
    let tutti: String = s
        .iter()
        .map(|x| format!("{} {}", x.tasti, x.azione))
        .collect();
    assert!(
        tutti.contains("⌘ S"),
        "il salvataggio bozza è una scorciatoia reale"
    );
    assert!(
        tutti.contains("⌘ ↩"),
        "l'invio dal corpo è una scorciatoia reale"
    );
    assert!(tutti.contains("Esc"));
}
