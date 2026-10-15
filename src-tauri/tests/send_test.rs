//! Test della composizione e dell'invio (task 5.1/5.2, Milestone 5).
//!
//! Nessuna rete: si costruisce il messaggio MIME con `lettre` e si controllano
//! le intestazioni e le parti; la validazione dell'invio è una funzione pura.
//! La citazione del messaggio originale in risposta/inoltro si prova su un
//! messaggio grezzo costruito qui dentro.

use outlook_ai_lib::send::{bozza_inoltro, bozza_risposta, build_message, valida_invio};

/// Un indirizzo di prova valido per il mittente.
const MITTENTE: &str = "Mario Rossi <mario@example.it>";

/// Rende leggibile il messaggio MIME composto, per controllarne le intestazioni.
fn render(messaggio: &lettre::Message) -> String {
    String::from_utf8_lossy(&messaggio.formatted()).into_owned()
}

#[test]
fn build_message_scrive_to_cc_e_oggetto_col_corpo_testo() {
    let msg = build_message(
        MITTENTE,
        &["luca@example.it".to_string()],
        &["copia@example.it".to_string()],
        "Piano manutenzione Q4",
        "Buongiorno, come concordato.",
        None,
        None,
    )
    .expect("il messaggio deve essere costruito con indirizzi validi");

    let testo = render(&msg);
    assert!(testo.contains("To: luca@example.it"), "intestazione To: {testo}");
    assert!(testo.contains("Cc: copia@example.it"), "intestazione Cc: {testo}");
    assert!(
        testo.contains("Subject: Piano manutenzione Q4"),
        "intestazione Subject: {testo}"
    );
    assert!(
        testo.contains("Buongiorno, come concordato."),
        "il corpo testo deve essere presente: {testo}"
    );
    assert!(
        !testo.contains("multipart/alternative"),
        "senza corpo HTML il messaggio non è multipart: {testo}"
    );
}

#[test]
fn build_message_con_corpo_html_produce_multipart_alternative() {
    let msg = build_message(
        MITTENTE,
        &["luca@example.it".to_string()],
        &[],
        "Preventivo",
        "Buongiorno",
        Some("<p>Buongiorno</p>"),
        None,
    )
    .expect("il messaggio multipart deve essere costruito");

    let testo = render(&msg);
    assert!(
        testo.contains("multipart/alternative"),
        "con HTML il messaggio è multipart/alternative: {testo}"
    );
    assert!(testo.contains("text/plain"), "parte testo: {testo}");
    assert!(testo.contains("text/html"), "parte HTML: {testo}");
}

#[test]
fn un_indirizzo_non_valido_viene_rifiutato_con_errore_leggibile() {
    let errore = build_message(
        MITTENTE,
        &["non-un-indirizzo".to_string()],
        &[],
        "Prova",
        "corpo",
        None,
        None,
    )
    .expect_err("un indirizzo senza @ deve essere rifiutato");

    let messaggio = errore.to_string();
    assert!(
        messaggio.contains("non-un-indirizzo"),
        "l'errore deve citare il valore rifiutato: {messaggio}"
    );
}

#[test]
fn l_oggetto_vuoto_e_accettato_nella_costruzione_ma_rifiutato_dall_invio() {
    // La costruzione non si occupa dell'oggetto: accetta anche una stringa vuota.
    let costruito = build_message(
        MITTENTE,
        &["luca@example.it".to_string()],
        &[],
        "",
        "corpo",
        None,
        None,
    );
    assert!(
        costruito.is_ok(),
        "la costruzione accetta l'oggetto vuoto: {:?}",
        costruito.err()
    );

    // La validazione pura, eseguita prima di contattare il server, lo rifiuta.
    let esito = valida_invio(&["luca@example.it".to_string()], "   ");
    assert!(esito.is_err(), "l'invio deve rifiutare l'oggetto vuoto");
    let testo = esito.unwrap_err().to_string();
    assert!(testo.contains("oggetto"), "messaggio chiaro: {testo}");
}

#[test]
fn l_invio_rifiuta_il_destinatario_mancante() {
    let esito = valida_invio(&[], "Oggetto valido");
    assert!(esito.is_err(), "senza destinatari l'invio non deve partire");
    let testo = esito.unwrap_err().to_string();
    assert!(testo.contains("destinatario"), "messaggio chiaro: {testo}");
}

/// Messaggio originale di prova usato per risposta e inoltro.
fn messaggio_originale() -> Vec<u8> {
    let righe = [
        "From: Luca Bianchi <luca@example.it>",
        "To: mario@example.it",
        "Cc: copia@example.it",
        "Subject: Piano manutenzione Q4",
        "Date: Wed, 15 Nov 2023 10:30:00 +0100",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=\"utf-8\"",
        "",
        "Mario,",
        "servono gli interventi su VED e Beta entro il 20/11.",
        "Saluti",
    ];
    righe.join("\r\n").into_bytes()
}

#[test]
fn la_risposta_precompila_destinatario_oggetto_e_cita_il_messaggio() {
    let bozza = bozza_risposta(&messaggio_originale(), "mario@example.it", false);

    assert_eq!(bozza.a, "Luca Bianchi <luca@example.it>");
    assert!(bozza.cc.is_empty(), "senza \"a tutti\" non ci sono copie");
    assert!(
        bozza.oggetto.starts_with("R: "),
        "l'oggetto della risposta è prefissato: {}",
        bozza.oggetto
    );
    let citato = &bozza.corpo_citato;
    assert!(
        citato.contains("ha scritto:"),
        "l'intestazione della citazione deve esserci: {citato}"
    );
    assert!(
        citato.contains("luca@example.it"),
        "la citazione riporta il mittente originale: {citato}"
    );
    assert!(
        citato.contains("15 Nov 2023") || citato.contains("2023"),
        "la citazione riporta la data originale: {citato}"
    );
    assert!(
        citato.lines().any(|r| r.starts_with("> ")),
        "il testo originale è citato con \"> \": {citato}"
    );
    assert!(
        citato.contains("servono gli interventi su VED"),
        "il testo originale non deve andare perso: {citato}"
    );
}

#[test]
fn la_risposta_a_tutti_aggiunge_i_destinatari_in_copia() {
    let bozza = bozza_risposta(&messaggio_originale(), "mario@example.it", true);

    assert_eq!(bozza.a, "Luca Bianchi <luca@example.it>");
    assert!(
        bozza.cc.contains("copia@example.it"),
        "la copia originale entra in Cc: {}",
        bozza.cc
    );
    assert!(
        !bozza.cc.contains("mario@example.it"),
        "il proprio indirizzo non va in copia: {}",
        bozza.cc
    );
}

#[test]
fn l_inoltro_precompila_oggetto_e_cita_il_messaggio_completo() {
    let bozza = bozza_inoltro(&messaggio_originale());

    assert!(
        bozza.oggetto.starts_with("I: "),
        "l'oggetto dell'inoltro è prefissato: {}",
        bozza.oggetto
    );
    let citato = &bozza.corpo_citato;
    assert!(citato.contains("Messaggio originale"), "blocco originale: {citato}");
    assert!(citato.contains("Luca Bianchi <luca@example.it>"), "{citato}");
    assert!(citato.contains("Piano manutenzione Q4"), "{citato}");
    assert!(citato.contains("servono gli interventi su VED"), "{citato}");
}
