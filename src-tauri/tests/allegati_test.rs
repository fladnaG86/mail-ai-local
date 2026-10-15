//! Test degli allegati in composizione (blocco C): costruzione MIME con allegati
//! e immagini incorporate, limiti, e copia in "Posta inviata" via IMAP APPEND.
//!
//! Nessuna rete: il MIME si costruisce con `lettre` e si rilegge con
//! `mail-parser` (round-trip); la copia in "Posta inviata" si prova sulla
//! `FakeSource`, che registra gli APPEND e sa rifiutare come un server in sola
//! lettura.

use outlook_ai_lib::mail::{FakeSource, MailSource};
use outlook_ai_lib::send::{
    AllegatoInviato, LIMITE_ALLEGATI_BYTE, SendError, allegati_per_bozza,
    build_message_con_allegati, codifica_base64, invia_e_copia,
};

// `attachment_name` e `content_id` vivono sul trait `MimeHeaders`.
use mail_parser::MimeHeaders;

const MITTENTE: &str = "Mario Rossi <mario@example.it>";

/// Rende leggibile il messaggio MIME composto.
fn render(messaggio: &lettre::Message) -> String {
    String::from_utf8_lossy(&messaggio.formatted()).into_owned()
}

/// Un allegato normale (non incorporato) dai byte indicati.
fn allegato(nome: &str, mime: &str, dati: &[u8]) -> AllegatoInviato {
    AllegatoInviato {
        nome: nome.to_string(),
        mime: mime.to_string(),
        contenuto: codifica_base64(dati),
        content_id: None,
    }
}

#[test]
fn allegato_binario_fa_il_round_trip_nome_e_byte_identici() {
    // Byte non-ASCII su tutto l'intervallo: se il MIME sbagliasse la codifica,
    // il contenuto non tornerebbe identico.
    let dati: Vec<u8> = (0u16..=255).map(|n| n as u8).collect();
    let msg = build_message_con_allegati(
        MITTENTE,
        &["dest@example.it".to_string()],
        &[],
        "Con allegato",
        "In allegato il file binario.",
        Some("<p>In allegato il file binario.</p>"),
        None,
        &[allegato("dati.bin", "application/octet-stream", &dati)],
    )
    .expect("il messaggio con allegato deve essere costruito");

    let raw = msg.formatted();
    let parsed = mail_parser::MessageParser::default()
        .parse(&raw)
        .expect("il messaggio deve essere rileggibile");
    let allegati: Vec<_> = parsed.attachments().collect();
    assert_eq!(
        allegati.len(),
        1,
        "atteso un solo allegato, trovati {}",
        allegati.len()
    );
    let parte = allegati[0];
    assert_eq!(parte.attachment_name(), Some("dati.bin"));
    assert_eq!(
        parte.contents(),
        dati.as_slice(),
        "i byte dell'allegato devono tornare identici"
    );
}

#[test]
fn il_mime_con_allegato_e_multipart_mixed_con_corpo_alternative() {
    // Contenuto binario (byte non-ASCII): lettre sceglie base64, non 7bit.
    let binario: &[u8] = &[0x00, 0x01, 0x02, 0xfa, 0xff];
    let msg = build_message_con_allegati(
        MITTENTE,
        &["dest@example.it".to_string()],
        &[],
        "Struttura",
        "testo",
        Some("<p>testo</p>"),
        None,
        &[allegato("nota.bin", "application/octet-stream", binario)],
    )
    .expect("costruzione");

    let testo = render(&msg);
    assert!(testo.contains("multipart/mixed"), "manca mixed: {testo}");
    assert!(
        testo.contains("multipart/alternative"),
        "il corpo deve essere alternative dentro mixed: {testo}"
    );
    assert!(
        testo.contains("Content-Transfer-Encoding: base64"),
        "l'allegato deve essere in base64: {testo}"
    );
}

#[test]
fn nome_non_ascii_codificato_come_rfc_2231() {
    // Nome con accenti: `lettre` deve emettere il parametro esteso `filename*`.
    let nome = "relazione città 2026.pdf";
    let msg = build_message_con_allegati(
        MITTENTE,
        &["dest@example.it".to_string()],
        &[],
        "Relazione",
        "corpo",
        None,
        None,
        &[allegato(nome, "application/pdf", b"%PDF-1.4 finto")],
    )
    .expect("costruzione");

    let testo = render(&msg);
    // La forma codificata: RFC 2231 (`filename*0*=`/`filename*=`) oppure RFC 2047.
    let rfc2231 = testo.contains("filename*0*=") || testo.contains("filename*=");
    let rfc2047 = testo.contains("=?utf-8?") || testo.contains("=?UTF-8?");
    assert!(
        rfc2231 || rfc2047,
        "il nome non ASCII deve essere codificato (RFC 2231/2047): {testo}"
    );
    assert!(
        !testo.contains("filename=\"relazione città"),
        "il nome grezzo non deve finire tal quale nell'intestazione: {testo}"
    );

    // E il nome deve tornare leggibile rileggendo il messaggio.
    let raw = msg.formatted();
    let parsed = mail_parser::MessageParser::default()
        .parse(&raw)
        .expect("rilettura");
    let parte = parsed
        .attachments()
        .next()
        .expect("un allegato rileggibile");
    assert_eq!(
        parte.attachment_name(),
        Some(nome),
        "il nome non ASCII deve tornare identico dopo la codifica"
    );
}

#[test]
fn immagine_incorporata_ha_content_id_e_multipart_related() {
    let dati = b"\x89PNG\r\n\x1a\n finto".to_vec();
    let immagine = AllegatoInviato {
        nome: "logo.png".to_string(),
        mime: "image/png".to_string(),
        contenuto: codifica_base64(&dati),
        content_id: Some("logo@esempio".to_string()),
    };
    let msg = build_message_con_allegati(
        MITTENTE,
        &["dest@example.it".to_string()],
        &[],
        "Con immagine",
        "vedi immagine",
        Some("<p>vedi immagine <img src=\"cid:logo@esempio\"></p>"),
        None,
        &[
            immagine,
            allegato("contratto.pdf", "application/pdf", b"%PDF"),
        ],
    )
    .expect("costruzione");

    let testo = render(&msg);
    assert!(
        testo.contains("multipart/related"),
        "le immagini incorporate usano multipart/related: {testo}"
    );
    assert!(
        testo.contains("Content-ID: <logo@esempio>"),
        "l'immagine deve portare il Content-ID richiamato dal corpo: {testo}"
    );
    // L'allegato normale resta in mixed, l'immagine in related.
    assert!(testo.contains("multipart/mixed"), "mixed esterno: {testo}");

    let raw = msg.formatted();
    let parsed = mail_parser::MessageParser::default()
        .parse(&raw)
        .expect("rilettura");
    let con_cid = parsed
        .attachments()
        .find(|p| p.content_id() == Some("logo@esempio"))
        .expect("l'immagine deve avere il Content-ID");
    assert_eq!(con_cid.contents(), dati.as_slice());
}

#[test]
fn oltre_il_limite_errore_leggibile_in_italiano() {
    // Un byte oltre il limite: l'invio deve rifiutare con un messaggio chiaro,
    // non andare in errore di sistema.
    let grande = vec![0u8; LIMITE_ALLEGATI_BYTE + 1];
    let esito = build_message_con_allegati(
        MITTENTE,
        &["dest@example.it".to_string()],
        &[],
        "Troppo grande",
        "corpo",
        None,
        None,
        &[allegato("grande.bin", "application/octet-stream", &grande)],
    );

    let errore = esito.expect_err("oltre il limite deve rifiutare");
    assert!(
        matches!(errore, SendError::AllegatiTroppoGrandi { .. }),
        "atteso AllegatiTroppoGrandi, ottenuto {errore:?}"
    );
    let testo = errore.to_string();
    assert!(testo.contains("20 MB"), "l'errore cita il limite: {testo}");
    assert!(
        testo.to_lowercase().contains("allegat"),
        "l'errore parla di allegati: {testo}"
    );
}

#[test]
fn base64_non_valido_da_un_errore_leggibile() {
    let rotto = AllegatoInviato {
        nome: "rotto.bin".to_string(),
        mime: "application/octet-stream".to_string(),
        contenuto: "non è base64!!!".to_string(),
        content_id: None,
    };
    let errore = build_message_con_allegati(
        MITTENTE,
        &["dest@example.it".to_string()],
        &[],
        "Base64 rotto",
        "corpo",
        None,
        None,
        &[rotto],
    )
    .expect_err("il base64 non valido deve essere rifiutato");
    assert!(
        errore.to_string().contains("rotto.bin"),
        "l'errore cita l'allegato: {errore}"
    );
}

#[tokio::test]
async fn append_in_posta_inviata_avviene_dopo_un_invio_riuscito() {
    let sorgente = FakeSource::new();
    let grezzo = b"Raw: messaggio inviato".to_vec();
    let mut inviato = false;

    let esito = invia_e_copia(
        Some(&sorgente as &dyn MailSource),
        || {
            inviato = true;
            Ok(())
        },
        &grezzo,
    )
    .await
    .expect("l'invio finto non fallisce");

    assert!(inviato, "l'invio deve essere avvenuto");
    assert_eq!(
        esito.copia_in.as_deref(),
        Some("Posta inviata"),
        "la copia va nella cartella Posta inviata"
    );
    assert!(
        esito.nota_copia.is_none(),
        "nessuna nota quando la copia riesce"
    );

    let copie = sorgente.copie();
    assert_eq!(copie.len(), 1, "un solo APPEND registrato");
    assert_eq!(copie[0].0, "Posta inviata");
    assert_eq!(copie[0].1, grezzo, "i byte copiati sono quelli inviati");
}

#[tokio::test]
async fn il_fallimento_dell_append_non_e_fatale() {
    // Server che rifiuta le operazioni (cartella in sola lettura, permessi…).
    let sorgente = FakeSource::new().che_rifiuta("cartella in sola lettura");
    let mut inviato = false;

    let esito = invia_e_copia(
        Some(&sorgente as &dyn MailSource),
        || {
            inviato = true;
            Ok(())
        },
        b"Raw",
    )
    .await
    .expect("l'invio resta riuscito anche se la copia fallisce");

    assert!(inviato, "l'invio è comunque avvenuto");
    assert!(esito.copia_in.is_none(), "la copia non è stata salvata");
    let nota = esito.nota_copia.clone().expect("ci deve essere una nota");
    assert!(
        nota.contains("sola lettura"),
        "la nota spiega il motivo: {nota}"
    );

    // L'esito leggibile non fa sembrare la copia fallita un errore totale.
    let account = outlook_ai_lib::config::Account {
        id: "a1".to_string(),
        description: "test".to_string(),
        full_name: "Test".to_string(),
        email: "mario@example.it".to_string(),
        username: "mario@example.it".to_string(),
        imap_host: "imaps.example.it".to_string(),
        imap_port: 993,
        imap_ssl: true,
        smtp_host: "smtps.example.it".to_string(),
        smtp_port: 465,
        smtp_ssl: true,
    };
    let testo = esito.testo(&account);
    assert!(
        testo.contains("L'invio è riuscito"),
        "il testo dichiara l'invio riuscito: {testo}"
    );
}

#[tokio::test]
async fn un_invio_fallito_non_tenta_la_copia() {
    let sorgente = FakeSource::new();
    let esito = invia_e_copia(
        Some(&sorgente as &dyn MailSource),
        || Err(SendError::Smtp("connessione rifiutata".to_string())),
        b"Raw",
    )
    .await;

    assert!(esito.is_err(), "l'invio fallito resta un errore");
    assert!(
        sorgente.copie().is_empty(),
        "senza invio riuscito non si copia nulla"
    );
}

#[tokio::test]
async fn senza_sorgente_la_copia_e_una_nota_non_un_errore() {
    let esito = invia_e_copia(None, || Ok(()), b"Raw")
        .await
        .expect("l'invio riesce anche senza accesso IMAP");

    assert!(esito.copia_in.is_none());
    assert!(
        esito.nota_copia.is_some(),
        "la nota spiega che la copia non c'è"
    );
}

#[test]
fn la_cartella_inviata_si_riconosce_fra_i_nomi_noti() {
    use outlook_ai_lib::mail::ops::{NOMI_INVIATA, trova_cartella};
    assert_eq!(
        trova_cartella(&["INBOX".to_string(), "Sent".to_string()], NOMI_INVIATA).as_deref(),
        Some("Sent")
    );
    assert_eq!(
        trova_cartella(&["Posta inviata".to_string()], NOMI_INVIATA).as_deref(),
        Some("Posta inviata")
    );
    assert!(
        trova_cartella(&["INBOX".to_string()], NOMI_INVIATA).is_none(),
        "senza cartella inviata non si inventa un nome"
    );
}

#[test]
fn risposta_e_inoltro_riportano_gli_allegati_del_messaggio_originale() {
    // Un messaggio originale con un allegato binario: come fa Outlook, la bozza
    // di risposta/inoltro deve riportarlo (nome e byte identici).
    let dati: Vec<u8> = (0u16..=255).map(|n| n as u8).collect();
    let originale = build_message_con_allegati(
        "Luca <luca@example.it>",
        &["mario@example.it".to_string()],
        &[],
        "Preventivo",
        "In allegato il preventivo.",
        None,
        None,
        &[allegato(
            "preventivo.bin",
            "application/octet-stream",
            &dati,
        )],
    )
    .expect("messaggio originale costruito");

    let raccolti = allegati_per_bozza(&originale.formatted());
    assert_eq!(raccolti.len(), 1, "un allegato riportato nella bozza");
    assert_eq!(raccolti[0].nome, "preventivo.bin");
    assert_eq!(
        codifica_base64(&dati),
        raccolti[0].contenuto,
        "il contenuto base64 deve corrispondere ai byte originali"
    );
    assert!(
        raccolti[0].content_id.is_none(),
        "un allegato, non un'immagine del corpo"
    );
}

#[test]
fn un_messaggio_senza_allegati_non_ne_inventa() {
    // Un messaggio non interpretabile o senza allegati dà un elenco vuoto, mai
    // un errore: la bozza si apre comunque.
    assert!(allegati_per_bozza(b"").is_empty());
    assert!(allegati_per_bozza(b"non e' una mail").is_empty());
}
