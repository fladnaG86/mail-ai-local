//! Test di integrazione del blocco F (rubrica e completamento destinatari):
//! CRUD con deduplicazione per email, importazione/esportazione vCard e
//! suggerimenti che uniscono rubrica e cache dei messaggi.
//!
//! Le funzioni pure (parsing vCard, ordinamento dei suggerimenti) hanno i loro
//! test in `src/contatti.rs`; qui si esercita la persistenza e il percorso
//! completo `store` → funzioni pubbliche della libreria, su cartella temporanea.

use outlook_ai_lib::contatti::{esporta_vcard, importa_vcard, Contatto};
use outlook_ai_lib::store::{Header, Store};
use outlook_ai_lib::{
    contatti_elenco_da, contatti_esporta_vcard_in, contatti_importa_vcard_in,
    contatti_suggerisci_da, contatto_salva_in,
};
use tempfile::tempdir;

fn contatto(nome: &str, cognome: &str, email: &str) -> Contatto {
    Contatto {
        id: None,
        nome: nome.to_string(),
        cognome: cognome.to_string(),
        email: email.to_string(),
        telefono: String::new(),
        azienda: String::new(),
        note: String::new(),
        creato: 0,
        modificato: 0,
        ..Default::default()
    }
}

fn messaggio(uid: &str, sender: &str, recipients: &str) -> Header {
    Header {
        account: "acct".to_string(),
        folder: "INBOX".to_string(),
        uid: uid.to_string(),
        message_id: None,
        subject: Some("Prova".to_string()),
        sender: Some(sender.to_string()),
        recipients: Some(recipients.to_string()),
        date: 1_700_000_000,
        seen: false,
        has_attachments: false,
        thread_key: None,
        in_reply_to: None,
        references: None,
    }
}

#[test]
fn il_crud_dei_contatti_non_duplica_la_stessa_email() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");

    // Inserimento.
    let esito = contatto_salva_in(&db, &contatto("Luca", "Bianchi", "Luca.Bianchi@Esempio.It")).unwrap();
    assert!(!esito.aggiornato, "il primo salvataggio è un inserimento");

    // Lo stesso indirizzo (qui in minuscolo) NON crea un doppione: lo aggiorna.
    let esito2 = contatto_salva_in(&db, &contatto("Luca", "Bianco", "luca.bianchi@esempio.it")).unwrap();
    assert!(esito2.aggiornato, "il secondo salvataggio aggiorna la riga esistente");
    assert_eq!(esito.id, esito2.id, "è la stessa riga");

    let elenco = contatti_elenco_da(&db, None).unwrap();
    assert_eq!(elenco.len(), 1, "un solo contatto in rubrica");
    assert_eq!(elenco[0].email, "luca.bianchi@esempio.it", "email normalizzata in minuscolo");
    assert_eq!(elenco[0].cognome, "Bianco", "i campi non vuoti aggiornano");

    // Modifica esplicita dal modulo (id presente): sostituisce i campi.
    let mut mod_ = contatto("Luca", "Bianco", "luca.bianchi@esempio.it");
    mod_.id = Some(esito.id);
    mod_.azienda = "Azienda Esempio".to_string();
    let esito3 = contatto_salva_in(&db, &mod_).unwrap();
    assert!(esito3.aggiornato);
    let elenco = contatti_elenco_da(&db, None).unwrap();
    assert_eq!(elenco[0].azienda, "Azienda Esempio");

    // Eliminazione.
    let store = Store::open(&db).unwrap();
    assert_eq!(store.contatto_elimina(esito.id).unwrap(), 1);
    assert!(contatti_elenco_da(&db, None).unwrap().is_empty());
    // Eliminare di nuovo un id assente non è un errore.
    assert_eq!(store.contatto_elimina(esito.id).unwrap(), 0);
}

#[test]
fn un_indirizzo_solo_aggiorna_senza_cancellare_il_nome() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    contatto_salva_in(&db, &contatto("Mario", "Rossi", "mario@example.it")).unwrap();

    // "Aggiungi ai contatti" da un messaggio che porta solo l'indirizzo.
    contatto_salva_in(&db, &contatto("", "", "mario@example.it")).unwrap();

    let elenco = contatti_elenco_da(&db, None).unwrap();
    assert_eq!(elenco.len(), 1);
    assert_eq!(elenco[0].nome, "Mario", "il nome buono non si perde");
    assert_eq!(elenco[0].cognome, "Rossi");
}

#[test]
fn il_filtro_della_rubrica_trova_per_parte_del_nome_o_dell_azienda() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    contatto_salva_in(&db, &contatto("Mario", "Rossi", "mario@example.it")).unwrap();
    let mut c2 = contatto("Anna", "Verdi", "anna@beta.it");
    c2.azienda = "Beta Industrial".to_string();
    contatto_salva_in(&db, &c2).unwrap();

    assert_eq!(contatti_elenco_da(&db, Some("rossi")).unwrap().len(), 1);
    assert_eq!(contatti_elenco_da(&db, Some("beta")).unwrap().len(), 1);
    assert_eq!(contatti_elenco_da(&db, Some("nessuno")).unwrap().len(), 0);
}

#[test]
fn l_import_di_un_vcf_con_piu_contatti_li_aggiunge_tutti() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    let vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Luca Bianchi\r\nN:Bianchi;Luca;;;\r\n\
               EMAIL:luca@example.it\r\nEND:VCARD\r\n\
               BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Beta\r\nN:;Beta;;;\r\nEMAIL:info@beta.it\r\n\
               TEL:+39 011 000\r\nEND:VCARD\r\n";
    let esito = contatti_importa_vcard_in(&db, vcf).unwrap();
    assert_eq!(esito.schede, 2);
    assert_eq!(esito.importati, 2);
    assert_eq!(esito.aggiornati, 0);
    let elenco = contatti_elenco_da(&db, None).unwrap();
    assert_eq!(elenco.len(), 2);
    // Reimportando lo stesso testo non si duplica: si aggiorna.
    let esito2 = contatti_importa_vcard_in(&db, vcf).unwrap();
    assert_eq!(esito2.aggiornati, 2);
    assert_eq!(contatti_elenco_da(&db, None).unwrap().len(), 2);
}

#[test]
fn il_giro_esporta_reimporta_conserva_i_dati() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    let mut c = contatto("Mario", "Rossi", "mario@esempiogroup.it");
    c.telefono = "+39 011 1234567".to_string();
    c.azienda = "Azienda Esempio S.r.l.".to_string();
    c.note = "Referente manutenzione".to_string();
    contatto_salva_in(&db, &c).unwrap();
    contatto_salva_in(&db, &contatto("", "", "solo.indirizzo@example.com")).unwrap();

    let prima = contatti_elenco_da(&db, None).unwrap();
    let percorso = dir.path().join("rubrica.vcf");
    let scritti = contatti_esporta_vcard_in(&db, &percorso).unwrap();
    assert_eq!(scritti, prima.len());

    // Un database nuovo importa il file esportato: i dati restano identici.
    let db2 = dir.path().join("cache2.db");
    contatti_importa_vcard_in(&db2, &std::fs::read_to_string(&percorso).unwrap()).unwrap();
    let dopo = contatti_elenco_da(&db2, None).unwrap();
    let normalizza = |v: &[Contatto]| -> Vec<(String, String, String, String, String, String)> {
        v.iter()
            .map(|c| {
                (
                    c.nome.clone(),
                    c.cognome.clone(),
                    c.email.clone(),
                    c.telefono.clone(),
                    c.azienda.clone(),
                    c.note.clone(),
                )
            })
            .collect()
    };
    assert_eq!(normalizza(&prima), normalizza(&dopo));
}

#[test]
fn le_proprieta_vcard_sconosciute_non_perdono_i_dati_noti_e_si_dichiarano() {
    let testo = "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Mario Rossi\r\nN:Rossi;Mario;;;\r\n\
                 EMAIL:mario@example.it\r\nTEL:123\r\nORG:Acme\r\nNOTE:ciao\r\n\
                 BDAY:1980-05-06\r\nADR:;;Via Roma 1;Torino;;10100;Italia\r\nX-CUSTOM:xyz\r\n\
                 END:VCARD\r\n";
    let parse = importa_vcard(testo);
    assert_eq!(parse.schede.len(), 1);
    let c = &parse.schede[0].contatto;
    assert_eq!(c.nome, "Mario");
    assert_eq!(c.cognome, "Rossi");
    assert_eq!(c.email, "mario@example.it");
    assert_eq!(c.telefono, "123");
    assert_eq!(c.azienda, "Acme");
    assert_eq!(c.note, "ciao");
    assert!(parse.ignorati.contains(&"BDAY".to_string()));
    // Blocco U: ADR non è più ignorato, diventa l'indirizzo.
    assert!(!parse.ignorati.contains(&"ADR".to_string()));
    assert_eq!(c.indirizzo, "Via Roma 1, Torino, 10100, Italia");
    assert!(parse.ignorati.contains(&"X-CUSTOM".to_string()));
}

#[test]
fn i_suggerimenti_unisono_rubrica_e_cache_senza_duplicare() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    {
        let store = Store::open(&db).unwrap();
        store
            .upsert_header(&messaggio(
                "1",
                "Luca Bianchi <luca.bianchi@esempio.it>",
                "Mario <mario@esempio.it>",
            ))
            .unwrap();
        store
            .upsert_header(&messaggio("2", "Beta <info@beta.it>", "mario@esempio.it"))
            .unwrap();
    }
    // La rubrica conosce Luca e un altro contatto; Beta invece è solo in cache.
    contatto_salva_in(&db, &contatto("Luca", "Bianchi", "luca.bianchi@esempio.it")).unwrap();
    contatto_salva_in(&db, &contatto("Anna", "Verdi", "anna@example.com")).unwrap();

    let tutti = contatti_suggerisci_da(&db, "", 20).unwrap();
    let email: Vec<&str> = tutti.iter().map(|s| s.email.as_str()).collect();
    assert!(email.contains(&"luca.bianchi@esempio.it"));
    assert!(email.contains(&"info@beta.it"));
    assert!(email.contains(&"anna@example.com"));
    assert!(email.contains(&"mario@esempio.it"));
    // Nessun duplicato: luca una sola volta.
    assert_eq!(
        email.iter().filter(|e| **e == "luca.bianchi@esempio.it").count(),
        1
    );
    // L'email presente in entrambe le sorgenti viene dalla rubrica.
    let alb = tutti.iter().find(|s| s.email == "luca.bianchi@esempio.it").unwrap();
    assert_eq!(alb.origine, "rubrica");
    let beta = tutti.iter().find(|s| s.email == "info@beta.it").unwrap();
    assert_eq!(beta.origine, "messaggi");
}

#[test]
fn i_suggerimenti_premiano_la_corrispondenza_all_inizio() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    contatto_salva_in(&db, &contatto("Anna", "Bianchi", "ann.bianchi@example.it")).unwrap();
    contatto_salva_in(&db, &contatto("Giovanni", "Annunziata", "gio@example.it")).unwrap();

    // "anni" è all'inizio dell'indirizzo del primo e dentro il cognome del secondo.
    let esito = contatti_suggerisci_da(&db, "ann", 10).unwrap();
    assert_eq!(esito.len(), 2);
    assert_eq!(
        esito[0].email, "ann.bianchi@example.it",
        "la corrispondenza all'inizio dell'indirizzo viene prima"
    );
}

#[test]
fn esportare_senza_contatti_produce_un_file_vuoto() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    let percorso = dir.path().join("vuoto.vcf");
    assert_eq!(contatti_esporta_vcard_in(&db, &percorso).unwrap(), 0);
    assert!(std::fs::read_to_string(&percorso).unwrap().is_empty());
    // Anche il giro puro su un elenco vuoto non inventa schede.
    assert_eq!(importa_vcard("").schede.len(), 0);
    assert!(esporta_vcard(&[]).is_empty());
}
