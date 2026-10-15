//! Test dei comandi delle impostazioni (Milestone 8), esercitati sulle funzioni
//! pure che i comandi IPC richiamano, con una cartella temporanea:
//! lettura/scrittura delle impostazioni e lettura del registro delle richieste
//! cloud (elenco vuoto = nessun errore).

use outlook_ai_lib::config::Preferenze;
use outlook_ai_lib::store::{AuditEntry, Store};
use outlook_ai_lib::{
    dividi_comando, impostazioni_leggi_da, impostazioni_salva_in, registro_ia_da, Impostazioni,
};

#[test]
fn registro_vuoto_restituisce_un_elenco_vuoto_non_un_errore() {
    let dir = tempfile::tempdir().unwrap();
    // Nessun database ancora creato: la prima lettura lo crea e non trova righe.
    let percorso = dir.path().join("cache.db");
    let righe = registro_ia_da(&percorso, 100).expect("un registro vuoto non è un errore");
    assert!(righe.is_empty(), "senza richieste cloud il registro è vuoto");
}

#[test]
fn impostazioni_salvate_e_rilette_sono_le_stesse() {
    let dir = tempfile::tempdir().unwrap();

    // Senza file: i default.
    let iniziali = impostazioni_leggi_da(dir.path()).unwrap();
    assert_eq!(iniziali.theme, "system");
    assert_eq!(iniziali.preferenze, Preferenze::default());

    let mut p = Preferenze::default();
    p.firma_del_mittente = "Mario Rossi — Sistemi".to_string();
    p.provider_ia = "cloud".to_string();
    p.modello_cloud = "openai/gpt-4o".to_string();
    p.consenso_richiesto = false;
    p.controllo_tono_attivo = true;
    p.tono_bozze = "breve".to_string();
    p.lingua_traduzione = "francese".to_string();
    let da_salvare = Impostazioni {
        theme: "dark".to_string(),
        preferenze: p,
    };

    impostazioni_salva_in(dir.path(), &da_salvare).expect("il salvataggio deve riuscire");
    let lette = impostazioni_leggi_da(dir.path()).unwrap();
    assert_eq!(lette, da_salvare, "impostazioni_salva seguito da impostazioni_leggi coincidono");
}

#[test]
fn impostazioni_salva_rifiuta_un_tema_non_ammesso() {
    let dir = tempfile::tempdir().unwrap();
    let imp = Impostazioni {
        theme: "viola".to_string(),
        preferenze: Preferenze::default(),
    };
    let esito = impostazioni_salva_in(dir.path(), &imp);
    assert!(esito.is_err(), "un tema sconosciuto non va salvato");
}

#[test]
fn il_registro_mostra_le_righe_cloud_senza_il_testo() {
    let dir = tempfile::tempdir().unwrap();
    let percorso = dir.path().join("cache.db");
    {
        let store = Store::open(&percorso).unwrap();
        for (i, azione) in ["riassumi", "traduci"].iter().enumerate() {
            store
                .audit_log(&AuditEntry {
                    timestamp: 1_700_000_000 + i as i64,
                    provider: "cloud".to_string(),
                    modello: "openai/gpt-4o-mini".to_string(),
                    azione: azione.to_string(),
                    prompt_version: "v1".to_string(),
                    hash_testo: format!("{:064x}", i + 1),
                })
                .unwrap();
        }
    }

    let righe = registro_ia_da(&percorso, 10).unwrap();
    assert_eq!(righe.len(), 2, "due richieste registrate");
    // Dalla più recente: la seconda inserita viene per prima.
    assert_eq!(righe[0].azione, "traduci");
    assert_eq!(righe[0].provider, "cloud");
    assert_eq!(righe[0].prompt_version, "v1");
    assert!(righe[0].hash.starts_with("000000000000"), "impronta abbreviata leggibile");
    assert!(righe[0].hash.ends_with('…'), "l'impronta a schermo è accorciata");
    assert!(righe[0].hash.chars().count() <= 13, "l'impronta completa non entra nell'elenco");
    // Il limite si applica.
    assert_eq!(registro_ia_da(&percorso, 1).unwrap().len(), 1);
}

#[test]
fn il_comando_di_avvio_si_divide_in_programma_e_argomenti() {
    assert_eq!(dividi_comando("open -a Splash-M1"), vec!["open", "-a", "Splash-M1"]);
    assert_eq!(dividi_comando("  open   -a  Splash-M1 "), vec!["open", "-a", "Splash-M1"]);
    assert!(dividi_comando("   ").is_empty());
}
