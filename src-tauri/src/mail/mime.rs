//! Lettura del corpo MIME di un messaggio (task 4.2/4.3, Milestone 4).
//!
//! Dal messaggio grezzo (RFC 822) si estraggono il testo, l'HTML e l'elenco
//! degli allegati. Il parsing è affidato al crate `mail-parser`, che ricostruisce
//! l'albero MIME, decodifica il transfer-encoding (base64, quoted-printable) e
//! distingue le parti di corpo dagli allegati.
//!
//! Nota su `mail-parser`: in un `multipart/mixed` le parti di testo entrano sia
//! nell'elenco `text_body` sia in `html_body` (con la conversione automatica
//! testo→HTML per le parti `text/plain`). Per questo non si legge ciecamente la
//! posizione 0: si cerca la parte la cui natura è davvero `Text` o `Html`, e solo
//! in mancanza si ripiega su `body_text(0)`/`body_html(0)`.
//!
//! L'HTML esce *grezzo* da qui: la sanificazione è responsabilità di
//! `crate::sanitize`, così i due compiti restano separati e provabili a parte.

use mail_parser::{Message, MessageParser, MimeHeaders, PartType};

/// Un allegato di un messaggio, con i byte già decodificati.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Allegato {
    /// Nome file indicato dal mittente (Content-Disposition/Content-Type).
    pub nome: String,
    /// Tipo MIME completo, es. `application/pdf`.
    pub tipo: String,
    /// Dimensione in byte del contenuto decodificato.
    pub dimensione: usize,
    /// Contenuto decodificato dell'allegato.
    pub dati: Vec<u8>,
}

/// Corpo di un messaggio: le due rappresentazioni e gli allegati.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CorpoMime {
    /// Parte `text/plain`, se presente.
    pub testo: Option<String>,
    /// Parte `text/html`, se presente (HTML non sanificato).
    pub html: Option<String>,
    /// Allegati, nell'ordine in cui compaiono nel messaggio.
    pub allegati: Vec<Allegato>,
}

impl CorpoMime {
    /// Vero se il messaggio ha almeno un allegato: è il valore da mettere in
    /// `has_attachments` nella lista (`MessageHeader`/`Header`).
    pub fn ha_allegati(&self) -> bool {
        !self.allegati.is_empty()
    }
}

/// Decodifica le «encoded word» RFC 2047 (`=?utf-8?Q?...?=`) di un'intestazione
/// di testo: oggetto, o mittente nella forma «Nome <indirizzo>». L'ENVELOPE IMAP
/// le consegna così come sono nel messaggio. Il testo già in chiaro resta
/// identico, quindi applicarla più volte non cambia nulla.
pub fn decodifica_intestazione(testo: &str) -> String {
    if !testo.contains("=?") {
        return testo.to_string();
    }
    // Si fa leggere il testo a mail-parser come un'intestazione non strutturata:
    // è lui a sapere charset, Q/B e spazi fra encoded word adiacenti.
    let grezzo = format!("Subject: {testo}\r\n\r\n");
    MessageParser::default()
        .parse(grezzo.as_bytes())
        .and_then(|m| m.subject().map(str::to_string))
        .unwrap_or_else(|| testo.to_string())
}

/// Analizza un messaggio grezzo e ne estrae testo, HTML e allegati.
///
/// Un messaggio non interpretabile produce una `CorpoMime` vuota invece di un
/// errore: in lettura è preferibile mostrare un corpo vuoto che interrompere
/// l'apertura. La lista degli allegati vuota tiene comunque `ha_allegati` falso.
pub fn analizza(grezzo: &[u8]) -> CorpoMime {
    let Some(messaggio) = MessageParser::default().parse(grezzo) else {
        return CorpoMime::default();
    };

    let testo = estrai_testo(&messaggio);
    let html = estrai_html(&messaggio);
    let allegati = estrai_allegati(&messaggio);

    CorpoMime {
        testo,
        html,
        allegati,
    }
}

/// Testo del corpo: la prima parte che è davvero `text/plain`, altrimenti la
/// conversione di riserva di `mail-parser`.
fn estrai_testo(messaggio: &Message<'_>) -> Option<String> {
    for i in 0..messaggio.text_body_count() {
        if let Some(parte) = messaggio.text_part(i as u32) {
            if matches!(&parte.body, PartType::Text(_)) {
                return messaggio.body_text(i).map(|c| c.into_owned());
            }
        }
    }
    messaggio.body_text(0).map(|c| c.into_owned())
}

/// HTML del corpo: la prima parte che è davvero `text/html` (non una conversione
/// da testo), altrimenti la conversione di riserva di `mail-parser`.
fn estrai_html(messaggio: &Message<'_>) -> Option<String> {
    for i in 0..messaggio.html_body_count() {
        if let Some(parte) = messaggio.html_part(i as u32) {
            if matches!(&parte.body, PartType::Html(_)) {
                return messaggio.body_html(i).map(|c| c.into_owned());
            }
        }
    }
    messaggio.body_html(0).map(|c| c.into_owned())
}

/// Allegati, con nome, tipo MIME e contenuto decodificato.
fn estrai_allegati(messaggio: &Message<'_>) -> Vec<Allegato> {
    messaggio
        .attachments()
        .map(|parte| {
            let dati = parte.contents().to_vec();
            let nome = parte
                .attachment_name()
                .map(|n| n.to_string())
                .unwrap_or_else(|| "allegato-senza-nome".to_string());
            let tipo = tipo_mime(parte);
            Allegato {
                nome,
                tipo,
                dimensione: dati.len(),
                dati,
            }
        })
        .collect()
}

/// Tipo MIME completo di una parte: `tipo/sottotipo`, con ricaduta sul tipo
/// generico quando il sottotipo manca.
fn tipo_mime(parte: &mail_parser::MessagePart<'_>) -> String {
    match parte.content_type() {
        Some(ct) => match &ct.c_subtype {
            Some(sotto) => format!("{}/{}", ct.c_type, sotto),
            None => ct.c_type.to_string(),
        },
        None => "application/octet-stream".to_string(),
    }
}
