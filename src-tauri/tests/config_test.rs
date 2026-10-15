//! Test del modulo configurazione: tema di default, persistenza tema,
//! round-trip degli account, assenza della password dal file su disco,
//! round-trip delle preferenze dell'assistente (Milestone 8) e compatibilità
//! con un `config.json` scritto prima di questa milestone.

use outlook_ai_lib::config::{self, Account, Preferenze, Sostituzione};

#[test]
fn tema_di_default_system_quando_il_file_manca() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = config::load_from(dir.path()).unwrap();
    assert_eq!(cfg.theme, "system", "il tema di default deve essere \"system\"");
}

#[test]
fn tema_persistito_e_riletto() {
    let dir = tempfile::tempdir().unwrap();
    config::set_theme(dir.path(), "dark").unwrap();
    let cfg = config::load_from(dir.path()).unwrap();
    assert_eq!(cfg.theme, "dark");
}

#[test]
fn roundtrip_account_senza_password() {
    let dir = tempfile::tempdir().unwrap();
    let account = Account {
        id: "mario".to_string(),
        description: "Posta lavorativa".to_string(),
        full_name: "Mario Rossi".to_string(),
        email: "mario.rossi@esempiogroup.it".to_string(),
        username: "mario.rossi@esempiogroup.it".to_string(),
        imap_host: "imaps.esempiohost.it".to_string(),
        imap_port: 993,
        imap_ssl: true,
        smtp_host: "smtps.esempiohost.it".to_string(),
        smtp_port: 465,
        smtp_ssl: true,
    };
    config::save_account(dir.path(), &account).unwrap();
    let caricati = config::load_accounts(dir.path());
    assert_eq!(caricati.len(), 1, "un solo account salvato");
    let a = &caricati[0];
    assert_eq!(a.id, "mario");
    assert_eq!(a.imap_host, "imaps.esempiohost.it");
    assert_eq!(a.imap_port, 993);
    assert!(a.imap_ssl);
    assert_eq!(a.smtp_host, "smtps.esempiohost.it");
    assert_eq!(a.smtp_port, 465);
    assert!(a.smtp_ssl);
    assert_eq!(a.username, "mario.rossi@esempiogroup.it");
}

#[test]
fn file_di_configurazione_non_contiene_password() {
    let dir = tempfile::tempdir().unwrap();
    let account = Account {
        id: "mario".to_string(),
        description: String::new(),
        full_name: "Mario Rossi".to_string(),
        email: "mario.rossi@esempiogroup.it".to_string(),
        username: "mario.rossi@esempiogroup.it".to_string(),
        imap_host: "imaps.esempiohost.it".to_string(),
        imap_port: 993,
        imap_ssl: true,
        smtp_host: "smtps.esempiohost.it".to_string(),
        smtp_port: 465,
        smtp_ssl: true,
    };
    // La password va SOLO nel Keychain; il file di configurazione non la vede mai.
    config::save_account(dir.path(), &account).unwrap();
    // Anche le preferenze non devono trascinare password nel file.
    config::save_preferenze(dir.path(), &Preferenze::default()).unwrap();
    let raw = std::fs::read_to_string(dir.path().join("config.json")).unwrap();
    assert!(
        !raw.to_lowercase().contains("password"),
        "il file config.json non deve contenere alcun campo password"
    );
}

#[test]
fn preferenze_di_default_quando_il_file_manca() {
    let dir = tempfile::tempdir().unwrap();
    let p = config::load_preferenze(dir.path());
    assert_eq!(p, Preferenze::default(), "senza file valgono i default");
    // I default richiesti dal pannello Assistente IA.
    assert_eq!(p.provider_ia, "locale");
    assert_eq!(p.endpoint_locale, "http://127.0.0.1:8000/v1");
    assert_eq!(p.modello_locale, "thinkingcap-27b");
    assert!(p.consenso_richiesto, "il consenso cloud è attivo di default");
    assert!(p.registro_attivo, "il registro è attivo di default");
    assert!(!p.controllo_tono_attivo, "il tono è spento di default");
    assert_eq!(p.lingua_risposte, "italiano");
    assert_eq!(p.lingua_traduzione, "inglese");
    assert!(!p.avvia_modello_all_apertura);
    assert_eq!(p.firma_del_mittente, "");
}

#[test]
fn roundtrip_delle_nuove_preferenze() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.firma_del_mittente = "Mario Rossi\nResponsabile sistemi".to_string();
    p.provider_ia = "cloud".to_string();
    p.endpoint_locale = "http://127.0.0.1:9000/v1".to_string();
    p.modello_locale = "qwen2.5-14b".to_string();
    p.modello_cloud = "anthropic/claude-3.5-sonnet".to_string();
    p.consenso_richiesto = false;
    p.registro_attivo = false;
    p.controllo_tono_attivo = true;
    p.tono_bozze = "formale".to_string();
    p.lingua_risposte = "inglese".to_string();
    p.lingua_traduzione = "tedesco".to_string();
    p.avvia_modello_all_apertura = true;

    config::save_preferenze(dir.path(), &p).unwrap();
    let lette = config::load_preferenze(dir.path());
    assert_eq!(lette, p, "le preferenze salvate tornano identiche");
    // Il tema convive con le preferenze nello stesso file.
    config::set_theme(dir.path(), "dark").unwrap();
    assert_eq!(config::load_from(dir.path()).unwrap().theme, "dark");
    assert_eq!(config::load_preferenze(dir.path()), p, "il tema non cancella le preferenze");
}

#[test]
fn config_vecchio_senza_preferenze_produce_i_default() {
    // Un config.json scritto prima della Milestone 8: solo tema e account.
    let dir = tempfile::tempdir().unwrap();
    let vecchio = r#"{
        "theme": "dark",
        "accounts": [
            {
                "id": "mario",
                "description": "Posta lavorativa",
                "fullName": "Mario Rossi",
                "email": "mario.rossi@esempiogroup.it",
                "username": "mario.rossi@esempiogroup.it",
                "imapHost": "imaps.esempiohost.it",
                "imapPort": 993,
                "imapSsl": true,
                "smtpHost": "smtps.esempiohost.it",
                "smtpPort": 465,
                "smtpSsl": true
            }
        ]
    }"#;
    std::fs::write(dir.path().join("config.json"), vecchio).unwrap();

    // Si carica senza errori e con i default al posto dei campi nuovi assenti.
    let cfg = config::load_from(dir.path()).expect("un file vecchio deve restare valido");
    assert_eq!(cfg.theme, "dark");
    assert_eq!(cfg.preferenze, Preferenze::default());
    assert_eq!(config::load_accounts(dir.path()).len(), 1, "l'account resta leggibile");

    // E una scrittura (tema) non perde le preferenze né l'account.
    config::set_theme(dir.path(), "light").unwrap();
    assert_eq!(config::load_from(dir.path()).unwrap().theme, "light");
    assert_eq!(config::load_preferenze(dir.path()), Preferenze::default());
    assert_eq!(config::load_accounts(dir.path()).len(), 1);
}

#[test]
fn valori_enumerativi_sconosciuti_tornano_al_default() {
    let dir = tempfile::tempdir().unwrap();
    // Config modificato a mano con provider e tono inventati.
    let grezzo = r#"{
        "preferenze": { "providerIa": "boh", "tonoBozze": "urlato", "modelloCloud": "" }
    }"#;
    std::fs::write(dir.path().join("config.json"), grezzo).unwrap();
    let p = config::load_preferenze(dir.path());
    assert_eq!(p.provider_ia, "locale");
    assert_eq!(p.tono_bozze, "diretto");
    assert_eq!(p.modello_cloud, Preferenze::default().modello_cloud);
}

#[test]
fn salvataggio_rifiuta_valori_non_ammessi() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.provider_ia = "chissà".to_string();
    let esito = config::save_preferenze(dir.path(), &p);
    assert!(esito.is_err(), "un provider sconosciuto non va salvato");
    assert!(
        !dir.path().join("config.json").exists(),
        "un valore non ammesso non deve scrivere il file"
    );
}

// ---------------------------------------------------------------------------
// Blocco D — Lettura, Composizione, Tipi di carattere, Correzione automatica,
// Ortografia: round-trip, migrazione e normalizzazione dei valori fuori scala.
// ---------------------------------------------------------------------------

#[test]
fn preferenze_blocco_d_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.lettura_pannello = "destra".to_string();
    p.lettura_segna_letto_dopo = 5;
    p.lettura_immagini = "sempre".to_string();
    p.lettura_anteprima = true;
    p.composizione_formato = "testo".to_string();
    p.composizione_a_capo = false;
    p.composizione_includi_originale = false;
    p.composizione_nuova_finestra = true;
    p.carattere_famiglia = "Georgia".to_string();
    p.carattere_dimensione = 18;
    p.correzione_automatica_attiva = false;
    p.correzione_sostituzioni = vec![Sostituzione {
        da: "cmq".to_string(),
        a: "comunque".to_string(),
    }];
    p.ortografia_attiva = true;
    p.ortografia_lingua = "en-US".to_string();

    config::save_preferenze(dir.path(), &p).unwrap();
    let lette = config::load_preferenze(dir.path());
    assert_eq!(lette, p, "le preferenze del blocco D tornano identiche");
    assert_eq!(lette.carattere_dimensione, 18);
    assert_eq!(lette.lettura_pannello, "destra");
    assert_eq!(lette.correzione_sostituzioni.len(), 1);
}

#[test]
fn elenco_sostituzioni_predefinite_ha_almeno_tre_voci() {
    let p = Preferenze::default();
    assert!(
        p.correzione_sostituzioni.len() >= 3,
        "servono almeno tre sostituzioni predefinite"
    );
    let nn = p
        .correzione_sostituzioni
        .iter()
        .find(|s| s.da == "nn")
        .expect("la sostituzione \"nn\" è fra le predefinite");
    assert_eq!(nn.a, "non");
}

#[test]
fn config_vecchio_con_preferenze_parziali_conserva_cio_che_c_e() {
    // Un config.json della Milestone 8 (preferenze senza i campi del blocco D) e
    // un tema e un account: nulla va perso, i campi nuovi prendono il default.
    let dir = tempfile::tempdir().unwrap();
    let vecchio = r#"{
        "theme": "light",
        "accounts": [
            {
                "id": "mario", "description": "Lavoro", "fullName": "Mario Rossi",
                "email": "m@example.it", "username": "m@example.it",
                "imapHost": "imaps.example.it", "imapPort": 993, "imapSsl": true,
                "smtpHost": "smtps.example.it", "smtpPort": 465, "smtpSsl": true
            }
        ],
        "preferenze": { "firmaDelMittente": "Mario", "providerIa": "cloud" }
    }"#;
    std::fs::write(dir.path().join("config.json"), vecchio).unwrap();

    let cfg = config::load_from(dir.path()).expect("il file vecchio resta valido");
    assert_eq!(cfg.theme, "light");
    assert_eq!(cfg.preferenze.firma_del_mittente, "Mario");
    assert_eq!(cfg.preferenze.provider_ia, "cloud");
    // I campi nuovi arrivano dai default, non azzerano quanto c'era.
    let d = Preferenze::default();
    assert_eq!(cfg.preferenze.lettura_pannello, d.lettura_pannello);
    assert_eq!(cfg.preferenze.lettura_immagini, d.lettura_immagini);
    assert_eq!(cfg.preferenze.composizione_formato, d.composizione_formato);
    assert_eq!(cfg.preferenze.carattere_famiglia, d.carattere_famiglia);
    assert_eq!(cfg.preferenze.carattere_dimensione, d.carattere_dimensione);
    assert_eq!(cfg.preferenze.ortografia_lingua, d.ortografia_lingua);
    assert!(cfg.preferenze.composizione_a_capo);
    assert!(cfg.preferenze.composizione_includi_originale);
    assert_eq!(config::load_accounts(dir.path()).len(), 1);
}

#[test]
fn valori_fuori_intervallo_del_blocco_d_vengono_normalizzati() {
    let dir = tempfile::tempdir().unwrap();
    // Config modificato a mano con valori fuori scala: secondi negativi, famiglia
    // vuota, dimensione oltre il massimo, enumerativi inventati, una sostituzione
    // vuota e un duplicato.
    let grezzo = r#"{
        "preferenze": {
            "letturaPannello": "ovunque",
            "letturaSegnaLettoDopo": -30,
            "letturaImmagini": "forse",
            "composizioneFormato": "rtf",
            "carattereFamiglia": "   ",
            "carattereDimensione": 999,
            "ortografiaLingua": "  ",
            "correzioneSostituzioni": [
                { "da": "nn", "a": "non" },
                { "da": "  ", "a": "x" },
                { "da": "nn", "a": "dup" }
            ]
        }
    }"#;
    std::fs::write(dir.path().join("config.json"), grezzo).unwrap();

    let p = config::load_preferenze(dir.path());
    assert_eq!(p.lettura_pannello, "sotto", "un pannello sconosciuto torna al default");
    assert_eq!(p.lettura_segna_letto_dopo, 0, "secondi negativi → 0 (mai)");
    assert_eq!(p.lettura_immagini, "chiedi");
    assert_eq!(p.composizione_formato, "html");
    assert_eq!(p.carattere_famiglia, "Aptos", "famiglia vuota → default");
    assert_eq!(p.carattere_dimensione, 12, "dimensione fuori scala → default");
    assert_eq!(p.ortografia_lingua, "it-IT");
    // La sostituzione vuota è scartata, il duplicato pure.
    assert_eq!(p.correzione_sostituzioni.len(), 1);
    assert_eq!(p.correzione_sostituzioni[0].a, "non");
}

#[test]
fn i_secondi_oltre_il_massimo_vengono_troncati() {
    let dir = tempfile::tempdir().unwrap();
    let grezzo = r#"{ "preferenze": { "letturaSegnaLettoDopo": 99999 } }"#;
    std::fs::write(dir.path().join("config.json"), grezzo).unwrap();
    let p = config::load_preferenze(dir.path());
    assert_eq!(
        p.lettura_segna_letto_dopo,
        config::SEGNA_LETTO_SECONDI_MAX,
        "un valore enorme viene riportato al massimo"
    );
}

#[test]
fn salvataggio_rifiuta_un_pannello_di_lettura_sconosciuto() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.lettura_pannello = "in orbita".to_string();
    let esito = config::save_preferenze(dir.path(), &p);
    assert!(esito.is_err(), "un pannello sconosciuto non va salvato");
    assert!(!dir.path().join("config.json").exists());
}

// ---------------------------------------------------------------------------
// Blocco E — notifiche e suoni.
// ---------------------------------------------------------------------------

#[test]
fn preferenze_notifiche_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.notifiche_attive = false;
    p.notifiche_anteprima = false;
    p.notifiche_suono = "Ping".to_string();
    p.non_disturbare_attivo = true;
    p.non_disturbare_inizio = "21:30".to_string();
    p.non_disturbare_fine = "06:15".to_string();
    config::save_preferenze(dir.path(), &p).unwrap();
    assert_eq!(config::load_preferenze(dir.path()), p, "le preferenze tornano identiche");
}

#[test]
fn notifiche_di_default_sono_attive_con_anteprima() {
    let dir = tempfile::tempdir().unwrap();
    let p = config::load_preferenze(dir.path());
    assert!(p.notifiche_attive);
    assert!(p.notifiche_anteprima);
    assert_eq!(p.notifiche_suono, config::SUONO_NOTIFICA_DEFAULT);
    assert!(!p.non_disturbare_attivo);
    assert_eq!(p.non_disturbare_inizio, "22:00");
    assert_eq!(p.non_disturbare_fine, "07:00");
}

#[test]
fn suono_e_orari_storti_tornano_al_default_in_lettura() {
    let dir = tempfile::tempdir().unwrap();
    let grezzo = r#"{ "preferenze": { "notificheSuono": "boato", "nonDisturbareInizio": "25:00", "nonDisturbareFine": "" } }"#;
    std::fs::write(dir.path().join("config.json"), grezzo).unwrap();
    let p = config::load_preferenze(dir.path());
    assert_eq!(p.notifiche_suono, config::SUONO_NOTIFICA_DEFAULT);
    assert_eq!(p.non_disturbare_inizio, config::NON_DISTURBARE_INIZIO_DEFAULT);
    assert_eq!(p.non_disturbare_fine, config::NON_DISTURBARE_FINE_DEFAULT);
}

#[test]
fn salvataggio_rifiuta_un_suono_sconosciuto_e_un_orario_storto() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.notifiche_suono = "boato".to_string();
    assert!(config::save_preferenze(dir.path(), &p).is_err());
    let mut p2 = Preferenze::default();
    p2.non_disturbare_inizio = "25:00".to_string();
    assert!(config::save_preferenze(dir.path(), &p2).is_err());
    assert!(!dir.path().join("config.json").exists());
}

#[test]
fn orario_valido_accetta_solo_ore_e_minuti_sensati() {
    assert!(config::orario_valido("22:00"));
    assert!(config::orario_valido("7:05"));
    assert!(!config::orario_valido("24:00"));
    assert!(!config::orario_valido("22:60"));
    assert!(!config::orario_valido("22"));
    assert!(!config::orario_valido(""));
}

// --- Blocco R: la scala di lettura -------------------------------------------

#[test]
fn lettura_zoom_fuori_scala_torna_al_default() {
    let mut p = Preferenze::default();
    p.lettura_zoom = 9999;
    let n = p.normalizzata();
    assert_eq!(n.lettura_zoom, config::LETTURA_ZOOM_DEFAULT);
    let mut p2 = Preferenze::default();
    p2.lettura_zoom = 10;
    let n2 = p2.normalizzata();
    // Come lo zoom della composizione: fuori scala, in entrambe le direzioni,
    // si torna al default (non ai bordi dell'intervallo).
    assert_eq!(n2.lettura_zoom, config::LETTURA_ZOOM_DEFAULT);
}

#[test]
fn lettura_zoom_valido_resta() {
    let mut p = Preferenze::default();
    p.lettura_zoom = 150;
    let n = p.normalizzata();
    assert_eq!(n.lettura_zoom, 150);
}

#[test]
fn lettura_zoom_fuori_intervallo_e_rifiutato_al_salvataggio() {
    let mut p = Preferenze::default();
    p.lettura_zoom = 10_000;
    assert!(config::valida(&p).is_err());
}

#[test]
fn lettura_zoom_ai_bordi_resta() {
    // I bordi dell'intervallo sono valori validi: non vanno normalizzati.
    let mut p = Preferenze::default();
    p.lettura_zoom = config::LETTURA_ZOOM_MIN;
    let n = p.normalizzata();
    assert_eq!(n.lettura_zoom, config::LETTURA_ZOOM_MIN);
    let mut p2 = Preferenze::default();
    p2.lettura_zoom = config::LETTURA_ZOOM_MAX;
    let n2 = p2.normalizzata();
    assert_eq!(n2.lettura_zoom, config::LETTURA_ZOOM_MAX);
}
