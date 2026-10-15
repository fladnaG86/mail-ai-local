//! Test del blocco E — notifiche di sistema e suoni.
//!
//! La decisione «si notifica?» è una funzione pura: si collauda qui senza
//! mostrare nulla. Si coprono messaggio nuovo/già letto, mittente bloccato,
//! Posta indesiderata, dentro/fuori l'orario di «non disturbare», interruttore
//! spento, finestra in primo piano e il limite di conteggio; il testo della
//! notifica per 1 e per N messaggi; il percorso dei suoni e la messa in sicurezza
//! della stringa AppleScript del ripiego.

use outlook_ai_lib::config::Preferenze;
use outlook_ai_lib::notifiche::{
    self, Candidato, Motivo, OpzioniNotifica, MAX_CONTEGGIO_MOSTRATO,
};

/// Un candidato nuovo, non letto, mittente normale, in una cartella normale.
fn nuovo(da: &str, oggetto: &str, quando: i64) -> Candidato {
    Candidato {
        mittente: da.to_string(),
        oggetto: oggetto.to_string(),
        quando,
        letto: false,
        mittente_bloccato: false,
        cartella_indesiderata: false,
    }
}

/// Opzioni neutre: interruttore acceso, fuori «non disturbare», finestra non attiva.
fn opzioni() -> OpzioniNotifica {
    OpzioniNotifica {
        attivo: true,
        finestra_attiva: false,
        non_disturbare_attivo: false,
        non_disturbare_inizio: 22 * 60,
        non_disturbare_fine: 7 * 60,
        adesso_minuti: 12 * 60,
        anteprima: true,
    }
}

#[test]
fn un_messaggio_nuovo_produce_una_notifica() {
    let d = notifiche::decidi(&[nuovo("Mario <mario@example.it>", "Riunione", 100)], &opzioni());
    assert!(d.mostrare, "un messaggio nuovo non letto va notificato");
    assert_eq!(d.motivo, Motivo::Inviata);
    assert_eq!(d.conteggio, 1);
    assert_eq!(d.piu_recente.unwrap().oggetto, "Riunione");
}

#[test]
fn un_messaggio_gia_letto_non_si_notifica() {
    let mut c = nuovo("mario@example.it", "Letta", 100);
    c.letto = true;
    let d = notifiche::decidi(&[c], &opzioni());
    assert!(!d.mostrare);
    assert_eq!(d.motivo, Motivo::NessunMessaggioAmmissibile);
    assert_eq!(d.conteggio, 0);
}

#[test]
fn un_mittente_bloccato_non_si_notifica() {
    let mut c = nuovo("spam@example.com", "Offerta", 100);
    c.mittente_bloccato = true;
    let d = notifiche::decidi(&[c], &opzioni());
    assert!(!d.mostrare);
    assert_eq!(d.motivo, Motivo::NessunMessaggioAmmissibile);
}

#[test]
fn un_messaggio_in_posta_indesiderata_non_si_notifica() {
    let mut c = nuovo("x@y.it", "Junk", 100);
    c.cartella_indesiderata = true;
    let d = notifiche::decidi(&[c], &opzioni());
    assert!(!d.mostrare);
    assert_eq!(d.motivo, Motivo::NessunMessaggioAmmissibile);
}

#[test]
fn l_interruttore_spento_ferma_la_notifica() {
    let mut o = opzioni();
    o.attivo = false;
    let d = notifiche::decidi(&[nuovo("a@b.it", "Ciao", 1)], &o);
    assert!(!d.mostrare);
    assert_eq!(d.motivo, Motivo::InterruttoreSpento);
    // Il conteggio resta leggibile anche quando non si notifica.
    assert_eq!(d.conteggio, 1);
}

#[test]
fn dentro_l_orario_di_non_disturbare_non_si_notifica() {
    let mut o = opzioni();
    o.non_disturbare_attivo = true;
    o.adesso_minuti = 23 * 60; // 23:00, dentro 22:00–07:00
    let d = notifiche::decidi(&[nuovo("a@b.it", "Ciao", 1)], &o);
    assert!(!d.mostrare);
    assert_eq!(d.motivo, Motivo::NonDisturbare);
}

#[test]
fn fuori_dall_orario_di_non_disturbare_si_notifica() {
    let mut o = opzioni();
    o.non_disturbare_attivo = true;
    o.adesso_minuti = 12 * 60; // 12:00, fuori 22:00–07:00
    let d = notifiche::decidi(&[nuovo("a@b.it", "Ciao", 1)], &o);
    assert!(d.mostrare);
    assert_eq!(d.motivo, Motivo::Inviata);
}

#[test]
fn l_intervallo_di_non_disturbare_scavalca_la_mezzanotte() {
    // 22:00–07:00: dentro la sera tardi e la notte, fuori il pomeriggio.
    assert!(notifiche::dentro_non_disturbare(23 * 60, 22 * 60, 7 * 60));
    assert!(notifiche::dentro_non_disturbare(2 * 60, 22 * 60, 7 * 60));
    assert!(notifiche::dentro_non_disturbare(6 * 60 + 59, 22 * 60, 7 * 60));
    assert!(!notifiche::dentro_non_disturbare(7 * 60, 22 * 60, 7 * 60));
    assert!(!notifiche::dentro_non_disturbare(12 * 60, 22 * 60, 7 * 60));
    // Intervallo nella stessa giornata e intervallo vuoto.
    assert!(notifiche::dentro_non_disturbare(13 * 60, 12 * 60, 14 * 60));
    assert!(!notifiche::dentro_non_disturbare(11 * 60, 12 * 60, 14 * 60));
    assert!(!notifiche::dentro_non_disturbare(13 * 60, 13 * 60, 13 * 60));
}

#[test]
fn la_finestra_in_primo_piano_ferma_la_notifica() {
    let mut o = opzioni();
    o.finestra_attiva = true;
    let d = notifiche::decidi(&[nuovo("a@b.it", "Ciao", 1)], &o);
    assert!(!d.mostrare, "con la finestra in primo piano non si notifica");
    assert_eq!(d.motivo, Motivo::FinestraInPrimoPiano);
}

#[test]
fn il_piu_recente_e_il_messaggio_con_la_data_maggiore() {
    let d = notifiche::decidi(
        &[
            nuovo("vecchio@b.it", "Vecchio", 100),
            nuovo("nuovo@b.it", "Nuovo", 300),
            nuovo("medio@b.it", "Medio", 200),
        ],
        &opzioni(),
    );
    assert_eq!(d.conteggio, 3);
    assert_eq!(d.piu_recente.unwrap().oggetto, "Nuovo");
}

#[test]
fn il_conteggio_ignora_i_messaggi_non_ammissibili() {
    let mut letto = nuovo("a@b.it", "Letto", 5);
    letto.letto = true;
    let mut bloccato = nuovo("spam@b.it", "Spam", 6);
    bloccato.mittente_bloccato = true;
    let d = notifiche::decidi(&[letto, bloccato, nuovo("ok@b.it", "Valido", 7)], &opzioni());
    assert!(d.mostrare);
    assert_eq!(d.conteggio, 1, "solo il messaggio ammissibile conta");
}

#[test]
fn testo_per_un_solo_messaggio_mostra_mittente_e_oggetto() {
    let (t, c) = notifiche::testo_notifica(1, "Mario Rossi", "Riunione di lunedì", true);
    assert_eq!(t, "Mario Rossi");
    assert_eq!(c, "Riunione di lunedì");
    // Senza anteprima non rivela il contenuto.
    let (t2, c2) = notifiche::testo_notifica(1, "Mario Rossi", "Riunione di lunedì", false);
    assert_eq!(t2, "Nuovo messaggio");
    assert!(!c2.contains("Riunione"), "senza anteprima l'oggetto non compare");
}

#[test]
fn testo_per_piu_messaggi_dice_quanti_sono() {
    let (t, c) = notifiche::testo_notifica(3, "Mario Rossi", "Riunione", true);
    assert_eq!(t, "3 nuovi messaggi");
    assert!(c.contains("Mario Rossi") && c.contains("Riunione"));
    let (t2, c2) = notifiche::testo_notifica(3, "Mario Rossi", "Riunione", false);
    assert_eq!(t2, "3 nuovi messaggi");
    assert!(!c2.contains("Mario"), "senza anteprima niente mittente");
}

#[test]
fn il_conteggio_mostrato_ha_un_limite_dichiarato() {
    assert_eq!(notifiche::titolo_conteggio(2), "2 nuovi messaggi");
    assert_eq!(
        notifiche::titolo_conteggio(MAX_CONTEGGIO_MOSTRATO),
        format!("{MAX_CONTEGGIO_MOSTRATO} nuovi messaggi")
    );
    assert_eq!(
        notifiche::titolo_conteggio(MAX_CONTEGGIO_MOSTRATO + 1),
        format!("{MAX_CONTEGGIO_MOSTRATO}+ nuovi messaggi")
    );
    // Anche il testo della decisione applica il limite.
    let candidati: Vec<Candidato> = (0..150)
        .map(|i| nuovo("a@b.it", &format!("msg {i}"), i))
        .collect();
    let d = notifiche::decidi(&candidati, &opzioni());
    let (titolo, _) = notifiche::testo_da_decisione(&d, true).unwrap();
    assert_eq!(titolo, "99+ nuovi messaggi");
}

#[test]
fn testo_generico_se_mittente_o_oggetto_mancano() {
    let (t, c) = notifiche::testo_notifica(1, "", "", true);
    assert_eq!(t, "Mittente sconosciuto");
    assert_eq!(c, "(nessun oggetto)");
}

#[test]
fn minuti_da_orario_valida_e_converte() {
    assert_eq!(notifiche::minuti_da_orario("22:00"), Some(1320));
    assert_eq!(notifiche::minuti_da_orario("07:00"), Some(420));
    assert_eq!(notifiche::minuti_da_orario("7:05"), Some(425));
    assert_eq!(notifiche::minuti_da_orario("25:00"), None);
    assert_eq!(notifiche::minuti_da_orario("abc"), None);
    assert_eq!(notifiche::minuti_da_orario(""), None);
}

#[test]
fn opzioni_da_preferenze_legge_i_campi() {
    let mut p = Preferenze::default();
    p.notifiche_attive = true;
    p.notifiche_anteprima = false;
    p.non_disturbare_attivo = true;
    p.non_disturbare_inizio = "21:30".to_string();
    p.non_disturbare_fine = "06:15".to_string();
    let o = notifiche::opzioni_da_preferenze(&p, true, 23 * 60);
    assert!(o.attivo);
    assert!(!o.anteprima);
    assert!(o.non_disturbare_attivo);
    assert_eq!(o.non_disturbare_inizio, 21 * 60 + 30);
    assert_eq!(o.non_disturbare_fine, 6 * 60 + 15);
    assert!(o.finestra_attiva);
}

#[test]
fn percorso_suono_solo_per_i_suoni_veri() {
    assert_eq!(
        notifiche::percorso_suono("Glass"),
        Some("/System/Library/Sounds/Glass.aiff".to_string())
    );
    assert_eq!(notifiche::percorso_suono("nessuno"), None);
    assert_eq!(notifiche::percorso_suono(""), None);
    assert_eq!(notifiche::percorso_suono("inesistente"), None);
}

#[test]
fn la_stringa_applescript_e_messa_in_sicurezza() {
    assert_eq!(notifiche::stringa_applescript("Ciao"), "\"Ciao\"");
    assert_eq!(
        notifiche::stringa_applescript("dice \"ciao\""),
        "\"dice \\\"ciao\\\"\""
    );
    assert_eq!(notifiche::stringa_applescript("a\\b"), "\"a\\\\b\"");
    assert_eq!(notifiche::stringa_applescript("riga1\nriga2"), "\"riga1 riga2\"");
}
