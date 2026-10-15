//! Test di integrazione del blocco G (versione **inviti**).
//!
//! Esercitano il percorso completo `store` → funzioni pubbliche della libreria
//! su una cartella temporanea: l'aggiornamento per `SEQUENCE`, l'annullamento
//! con `METHOD:CANCEL`, l'ordinamento e il filtro dell'elenco, e la lettura di
//! un invito da un messaggio MIME reale con la sua risposta `METHOD:REPLY`.
//!
//! Le funzioni pure (parsing con folding/escape/date, ricorrenze, costruzione
//! dell'invito) hanno i loro test in `src/inviti.rs`.

use outlook_ai_lib::inviti::{self, Invitato};
use outlook_ai_lib::store::{InvitoRiga, Store};
use outlook_ai_lib::{inviti_elenco_da, send};
use tempfile::tempdir;

/// Una riga di invito con i soli campi d'interesse valorizzati.
fn riga(uid: &str, sequenza: i64, oggetto: &str, inizio: i64, stato: &str) -> InvitoRiga {
    InvitoRiga {
        id: 0,
        uid: uid.to_string(),
        sequenza,
        oggetto: oggetto.to_string(),
        organizzatore: "luca@example.it".to_string(),
        organizzatore_nome: "Luca Bianchi".to_string(),
        inizio,
        fine: Some(inizio + 3600),
        luogo: "Capannone 3".to_string(),
        giornata_intera: false,
        stato: stato.to_string(),
        metodo: "REQUEST".to_string(),
        rrule: None,
        descrizione: "Punto settimanale".to_string(),
        invitati: serde_json::to_string(&[Invitato {
            indirizzo: "mario@example.it".to_string(),
            nome: "Mario Rossi".to_string(),
            partstat: "NEEDS-ACTION".to_string(),
        }])
        .unwrap(),
        cartella: "INBOX".to_string(),
        uid_messaggio: "101".to_string(),
        uscita: false,
    }
}

/// Lo stesso UID con una SEQUENCE più alta aggiorna la riga, non ne crea una
/// seconda; una SEQUENCE uguale o più bassa non riscrive (lo stato dell'utente
/// resta).
#[test]
fn la_sequenza_piu_alta_aggiorna_la_stessa_riga() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();

    let mut r = riga("uid-1@example.it", 0, "Riunione Q4", 1_700_000_000, "in_attesa");
    let id1 = store.salva_invito(&r).unwrap();

    r.sequenza = 1;
    r.oggetto = "Riunione Q4 (spostata)".to_string();
    r.inizio = 1_700_003_600;
    let id2 = store.salva_invito(&r).unwrap();
    assert_eq!(id1, id2, "stesso UID ⇒ stessa riga");
    assert_eq!(store.inviti(None).unwrap().len(), 1);

    let letta = store.invito_per_id(id1).unwrap().unwrap();
    assert_eq!(letta.oggetto, "Riunione Q4 (spostata)");
    assert_eq!(letta.sequenza, 1);
    assert_eq!(letta.inizio, 1_700_003_600);

    // L'utente risponde, poi arriva una rilettura con la STESSA sequenza: la
    // riga non viene riscritta e lo stato scelto resta.
    store.imposta_stato_invito("uid-1@example.it", "accettato").unwrap();
    let mut uguale = r.clone();
    uguale.oggetto = "Riunione Q4 (titolo vecchio)".to_string();
    store.salva_invito(&uguale).unwrap();
    let dopo = store.invito_per_uid("uid-1@example.it").unwrap().unwrap();
    assert_eq!(dopo.stato, "accettato");
    assert_eq!(dopo.oggetto, "Riunione Q4 (spostata)");
}

/// Un `METHOD:CANCEL` porta l'invito ad `annullato`, anche con SEQUENCE uguale.
#[test]
fn un_cancel_porta_l_invito_ad_annullato() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store
        .salva_invito(&riga("uid-2@example.it", 1, "Riunione annullata", 1_700_000_000, "in_attesa"))
        .unwrap();

    let mut cancel = riga("uid-2@example.it", 1, "Riunione annullata", 1_700_000_000, "in_attesa");
    cancel.metodo = "CANCEL".to_string();
    store.salva_invito(&cancel).unwrap();

    let letta = store.invito_per_uid("uid-2@example.it").unwrap().unwrap();
    assert_eq!(letta.stato, "annullato");
    assert_eq!(letta.metodo, "CANCEL");
    assert_eq!(store.inviti(None).unwrap().len(), 1);
}

/// L'elenco si ordina per data di inizio e si filtra per stato; la variante
/// `inviti_elenco_da` restituisce le righe pronte per l'interfaccia.
#[test]
fn l_elenco_si_ordina_per_data_e_si_filtra_per_stato() {
    let dir = tempdir().unwrap();
    let percorso = dir.path().join("cache.db");
    let store = Store::open(&percorso).unwrap();
    // Inseriti in ordine sparso: l'elenco deve uscire per data crescente.
    store
        .salva_invito(&riga("c@example.it", 0, "Terza", 1_700_300_000, "in_attesa"))
        .unwrap();
    store
        .salva_invito(&riga("a@example.it", 0, "Prima", 1_700_100_000, "accettato"))
        .unwrap();
    store
        .salva_invito(&riga("b@example.it", 0, "Seconda", 1_700_200_000, "rifiutato"))
        .unwrap();

    let tutte = store.inviti(None).unwrap();
    let titoli: Vec<&str> = tutte.iter().map(|i| i.oggetto.as_str()).collect();
    assert_eq!(titoli, vec!["Prima", "Seconda", "Terza"]);

    let in_attesa = store.inviti(Some("in_attesa")).unwrap();
    assert_eq!(in_attesa.len(), 1);
    assert_eq!(in_attesa[0].oggetto, "Terza");
    // `tutti` equivale a nessun filtro.
    assert_eq!(store.inviti(Some("tutti")).unwrap().len(), 3);

    let ipc = inviti_elenco_da(&percorso, Some("accettato")).unwrap();
    assert_eq!(ipc.len(), 1);
    assert_eq!(ipc[0].oggetto, "Prima");
    assert_eq!(ipc[0].stato, "accettato");
    assert_eq!(ipc[0].invitati.len(), 1);
    assert_eq!(ipc[0].invitati[0].indirizzo, "mario@example.it");
}

/// Un messaggio MIME con allegato `text/calendar`: `testo_calendario` lo estrae,
/// `inviti::analizza` lo legge e la risposta generata porta lo stesso UID con il
/// `PARTSTAT` chiesto.
#[test]
fn da_un_messaggio_con_allegato_calendario_si_legge_e_si_risponde() {
    let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\n\
UID:riunione-42@example.it\r\nSEQUENCE:1\r\nDTSTAMP:20261010T080000Z\r\n\
DTSTART:20261015T130000Z\r\nDTEND:20261015T143000Z\r\n\
SUMMARY:Verifica impianti\r\nLOCATION:Sala 2\r\n\
ORGANIZER;CN=Luca Bianchi:mailto:luca@example.it\r\n\
ATTENDEE;PARTSTAT=NEEDS-ACTION;CN=Mario:mailto:mario@example.it\r\n\
END:VEVENT\r\nEND:VCALENDAR\r\n";
    let mime = format!(
        "From: luca@example.it\r\nTo: mario@example.it\r\nSubject: Invito\r\n\
MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"B\"\r\n\r\n\
--B\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nTi invito alla verifica.\r\n\
--B\r\nContent-Type: text/calendar; method=REQUEST; name=\"invito.ics\"\r\n\
Content-Transfer-Encoding: base64\r\n\r\n{}\r\n--B--\r\n",
        send::codifica_base64(ics.as_bytes())
    );

    let testo = inviti::testo_calendario(mime.as_bytes()).expect("allegato calendario trovato");
    assert!(testo.contains("BEGIN:VCALENDAR"));
    let elenco = inviti::analizza(&testo);
    assert_eq!(elenco.len(), 1);
    let inv = &elenco[0];
    assert_eq!(inv.uid, "riunione-42@example.it");
    assert_eq!(inv.oggetto, "Verifica impianti");
    assert_eq!(inv.organizzatore, "luca@example.it");
    assert_eq!(inv.luogo, "Sala 2");

    // Lo salvo in cache e genero la risposta «accettato».
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    let mut r = riga("riunione-42@example.it", 1, "Verifica impianti", inv.inizio, "in_attesa");
    r.organizzatore = inv.organizzatore.clone();
    store.salva_invito(&r).unwrap();

    let ics_risposta = inviti::genera_risposta(
        inv,
        inviti::partstat_da_risposta("accettato").unwrap(),
        "mario@example.it",
        "Mario Rossi",
        1_700_000_000,
    );
    assert!(ics_risposta.contains("METHOD:REPLY"));
    assert!(ics_risposta.contains("UID:riunione-42@example.it"));
    assert!(ics_risposta.contains("PARTSTAT=ACCEPTED"));
    let rilette = inviti::analizza(&ics_risposta);
    assert_eq!(rilette[0].metodo, "REPLY");
    assert_eq!(rilette[0].uid, "riunione-42@example.it");

    // Una richiesta con ricorrenza complessa dichiara la prima occorrenza.
    let con_rrule = "BEGIN:VEVENT\r\nUID:rec@example.it\r\nDTSTART:20261015T130000Z\r\n\
RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1\r\nSUMMARY:Periodica\r\nEND:VEVENT\r\n";
    let ric = &inviti::analizza(con_rrule)[0];
    assert!(ric
        .nota_ricorrenza
        .as_deref()
        .unwrap()
        .contains("solo la prima occorrenza"));
}

/// L'invito in uscita: UID nuovo e non ripetuto, `ORGANIZER` corretto e una riga
/// per ogni invitato.
#[test]
fn l_invito_in_uscita_ha_uid_nuovo_e_organizzatore_corretto() {
    let dati = inviti::DatiRiunione {
        oggetto: "Riunione sicurezza".to_string(),
        inizio: 1_700_400_000,
        fine: Some(1_700_401_800),
        luogo: "Sala riunioni".to_string(),
        descrizione: "Ordine del giorno in allegato".to_string(),
        giornata_intera: false,
    };
    let uid_a = inviti::uid_nuovo();
    let uid_b = inviti::uid_nuovo();
    assert_ne!(uid_a, uid_b, "due inviti non condividono l'UID");

    let ics = inviti::genera_invito(
        &dati,
        &uid_a,
        "mario@example.it",
        "Mario Rossi",
        &[
            ("luca@example.it".to_string(), "Luca Bianchi".to_string()),
            ("anna@example.it".to_string(), String::new()),
        ],
        1_700_000_000,
    );
    let inv = &inviti::analizza(&ics)[0];
    assert_eq!(inv.uid, uid_a);
    assert_eq!(inv.metodo, "REQUEST");
    assert_eq!(inv.oggetto, "Riunione sicurezza");
    assert_eq!(inv.organizzatore, "mario@example.it");
    assert_eq!(inv.organizzatore_nome, "Mario Rossi");
    assert_eq!(inv.invitati.len(), 2);
    assert_eq!(inv.invitati[0].indirizzo, "luca@example.it");
    assert_eq!(inv.invitati[0].partstat, "NEEDS-ACTION");
    assert_eq!(inv.inizio, dati.inizio);
    assert_eq!(inv.fine, dati.fine);
}
