//! Composizione e invio dei messaggi (task 5.1/5.2, Milestone 5).
//!
//! La costruzione del messaggio MIME è affidata a `lettre`: intestazioni
//! `From`/`To`/`Cc`/`Subject` e corpo testo (eventualmente con la parte HTML in
//! `multipart/alternative`). L'invio usa SMTP su TLS secondo la configurazione
//! dell'account (`smtp_ssl` distingue TLS implicito da STARTTLS); la password
//! arriva **solo** dal Keychain (`secrets::Store`), mai dalla configurazione.
//!
//! Non esiste alcuna opzione che disabiliti la verifica dei certificati: il
//! validatore è quello di sistema (`native-tls`), come per il client IMAP.
//!
//! Le funzioni di costruzione e di validazione sono pure e si collaudano senza
//! rete; le funzioni di bozza (risposta/inoltro) leggono un messaggio grezzo già
//! scaricato e citano il **testo semplice**, senza sanificazione che lo perda.

use base64::Engine as _;
use lettre::message::header::{HeaderName, HeaderValue};
use lettre::message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use std::str::FromStr;

use crate::config::Account;
use crate::mail::{ops::copia_in_inviata, MailSource};
use crate::secrets;

// ---------------------------------------------------------------------------
// Blocco I2 — conferme di lettura e recapito (ChunkOutlookTracking) e indirizzo
// di risposta predefinito. Le intestazioni sono quelle standard:
//   - conferma di **lettura** → `Disposition-Notification-To` (RFC 3798/8098);
//   - conferma di **recapito** → `Return-Receipt-To` (RFC 3798) **e**
//     `Disposition-Notification-To` (RFC 8098).
// La costruzione delle intestazioni è PURA e collaudata senza rete.
// ---------------------------------------------------------------------------

/// Richiesta di conferma da allegare al messaggio in uscita.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Tracciamento {
    pub conferma_lettura: bool,
    pub conferma_recapito: bool,
    /// Indirizzo a cui far tornare la conferma (di norma il mittente).
    pub indirizzo: String,
}

impl Tracciamento {
    /// Vero se una delle due conferme è richiesta.
    pub fn richiesto(&self) -> bool {
        self.conferma_lettura || self.conferma_recapito
    }
}

/// Intestazioni aggiuntive del messaggio in uscita: indirizzo di risposta
/// predefinito e conferme richieste. Le funzioni che la costruiscono sono pure.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IntestazioniExtra {
    /// `Reply-To`, se l'utente ha impostato un indirizzo di risposta predefinito.
    pub reply_to: Option<String>,
    pub tracciamento: Tracciamento,
}

/// Intestazioni grezze `(nome, valore)` da aggiungere al messaggio, nell'ordine
/// standard. Una conferma non richiesta **non compare**; un indirizzo vuoto
/// lascia fuori qualunque intestazione di conferma (non si inventa un mittente).
pub fn intestazioni_extra(e: &IntestazioniExtra) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if let Some(r) = &e.reply_to {
        let r = r.trim();
        if !r.is_empty() {
            out.push(("Reply-To".to_string(), r.to_string()));
        }
    }
    let addr = e.tracciamento.indirizzo.trim();
    if !addr.is_empty() && e.tracciamento.richiesto() {
        // RFC 3798/8098: conferma di lettura e di recapito condividono
        // `Disposition-Notification-To`.
        out.push((
            "Disposition-Notification-To".to_string(),
            format!("<{addr}>"),
        ));
    }
    if !addr.is_empty() && e.tracciamento.conferma_recapito {
        out.push(("Return-Receipt-To".to_string(), format!("<{addr}>")));
    }
    out
}

/// Limite complessivo (byte) degli allegati oltre il quale l'invio è rifiutato
/// con un messaggio leggibile. Db. 2.000.000.000 è il limite teorico del
/// protocollo; qui se ne tiene uno prudente (20 MB) perché un allegato troppo
/// grande verrebbe respinto dal server senza spiegazioni utili all'utente.
pub const LIMITE_ALLEGATI_BYTE: usize = 20 * 1024 * 1024;

/// Motore base64 standard (RFC 4648): usato per decodificare il contenuto degli
/// allegati che l'interfaccia consegna via IPC.
const BASE64: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;

/// Errore comune alla composizione e all'invio.
#[derive(Debug, thiserror::Error)]
pub enum SendError {
    #[error("destinatario mancante: indicare almeno un indirizzo nel campo A:")]
    DestinatarioMancante,
    #[error("oggetto mancante: scrivere un oggetto prima di inviare")]
    OggettoVuoto,
    #[error("indirizzo non valido nel campo {campo}: \"{valore}\"")]
    IndirizzoNonValido { campo: String, valore: String },
    #[error("errore nella costruzione del messaggio: {0}")]
    Costruzione(String),
    #[error("configurazione SMTP non valida: {0}")]
    Configurazione(String),
    #[error("errore di invio SMTP: {0}")]
    Smtp(String),
    #[error("password non trovata nel Keychain per l'account {0}")]
    PasswordAssente(String),
    #[error(
        "gli allegati pesano {totale_mb} MB, oltre il limite di 20 MB: alleggeriscili o \
         condividi un collegamento al file invece di allegarlo"
    )]
    AllegatiTroppoGrandi { totale_mb: String },
    #[error("l'allegato \"{nome}\" ha un contenuto non decodificabile (base64 non valido)")]
    AllegatoBase64 { nome: String },
}

/// Risultato delle operazioni di composizione e invio.
pub type Result<T> = std::result::Result<T, SendError>;

/// Divide una lista di indirizzi scritta a mano (separatori `,` e `;`) in valori
/// ripuliti, scartando i vuoti. Utile sia ai comandi IPC sia alla validazione.
pub fn dividi_indirizzi(campo: &str) -> Vec<String> {
    campo
        .split([',', ';'])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Interpreta un elenco di indirizzi in `Mailbox` di `lettre`, rifiutando con un
/// errore leggibile il primo valore non valido.
fn interpreta(campo: &str, valori: &[String]) -> Result<Vec<Mailbox>> {
    let mut out = Vec::new();
    for valore in valori {
        for pezzo in dividi_indirizzi(valore) {
            let mailbox = Mailbox::from_str(&pezzo).map_err(|_| SendError::IndirizzoNonValido {
                campo: campo.to_string(),
                valore: pezzo.clone(),
            })?;
            out.push(mailbox);
        }
    }
    Ok(out)
}

/// Validazione **pura** eseguita prima di contattare il server: rifiuta il
/// destinatario mancante e l'oggetto vuoto (nessun invio parte se fallisce).
pub fn valida_invio(destinatari: &[String], oggetto: &str) -> Result<()> {
    let a = interpreta("A", destinatari)?;
    if a.is_empty() {
        return Err(SendError::DestinatarioMancante);
    }
    if oggetto.trim().is_empty() {
        return Err(SendError::OggettoVuoto);
    }
    Ok(())
}

/// Un allegato da inviare, come lo consegna l'interfaccia via IPC: nome file,
/// tipo MIME e contenuto codificato in base64 (standard, con newline tollerati).
///
/// `content_id` valorizzato marca un'**immagine incorporata** nel corpo: l'HTML
/// la richiama con `cid:<content_id>` e il MIME usa `multipart/related`.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllegatoInviato {
    /// Nome file mostrato al destinatario (anche non ASCII: si codifica da sé).
    pub nome: String,
    /// Tipo MIME dichiarato (es. `application/pdf`).
    pub mime: String,
    /// Contenuto del file in base64.
    pub contenuto: String,
    /// Content-ID per le immagini incorporate; assente per gli allegati normali.
    #[serde(default)]
    pub content_id: Option<String>,
}

/// Un allegato con i byte già decodificati, pronto per la costruzione MIME.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AllegatoDecodificato {
    pub nome: String,
    pub mime: String,
    pub dati: Vec<u8>,
    pub content_id: Option<String>,
}

/// Decodifica il contenuto base64 degli allegati e **verifica il limite**
/// complessivo ([`LIMITE_ALLEGATI_BYTE`]). Oltre il limite l'errore è leggibile
/// in italiano, mai un guasto di sistema.
pub fn decodifica_allegati(allegati: &[AllegatoInviato]) -> Result<Vec<AllegatoDecodificato>> {
    let mut out = Vec::with_capacity(allegati.len());
    for a in allegati {
        // Newline e spazi nel base64 sono ammessi (capita con i file letti a pezzi).
        let pulito: String = a.contenuto.chars().filter(|c| !c.is_whitespace()).collect();
        let dati = BASE64
            .decode(pulito.as_bytes())
            .map_err(|_| SendError::AllegatoBase64 {
                nome: a.nome.clone(),
            })?;
        out.push(AllegatoDecodificato {
            nome: a.nome.clone(),
            mime: a.mime.clone(),
            dati,
            content_id: a.content_id.clone(),
        });
    }
    let totale: usize = out.iter().map(|a| a.dati.len()).sum();
    if totale > LIMITE_ALLEGATI_BYTE {
        return Err(SendError::AllegatiTroppoGrandi {
            totale_mb: format!("{:.1}", totale as f64 / 1_048_576.0).replace('.', ","),
        });
    }
    Ok(out)
}

/// Codifica un contenuto in base64 standard. Utile a chi costruisce un
/// [`AllegatoInviato`] e ai test.
pub fn codifica_base64(bytes: &[u8]) -> String {
    BASE64.encode(bytes)
}

/// Allegati di un messaggio originale, nella forma degli allegati da inviare
/// (contenuto in base64).
///
/// Serve a **Rispondi** e **Inoltro**: come fa Outlook, la bozza riporta gli
/// allegati del messaggio originale. Il testo semplice citato non li contiene,
/// quindi vanno raccolti qui dal MIME. Un messaggio non interpretabile produce
/// un elenco vuoto (mai un errore): la bozza si apre comunque.
pub fn allegati_per_bozza(grezzo: &[u8]) -> Vec<AllegatoInviato> {
    crate::mail::mime::analizza(grezzo)
        .allegati
        .iter()
        .map(|a| AllegatoInviato {
            nome: a.nome.clone(),
            mime: a.tipo.clone(),
            contenuto: codifica_base64(&a.dati),
            content_id: None,
        })
        .collect()
}

/// Tipo MIME a partire dalla stringa dichiarata, con ricaduta prudente su
/// `application/octet-stream` quando non è interpretabile.
fn content_type(mime: &str) -> ContentType {
    ContentType::parse(mime).unwrap_or_else(|_| {
        ContentType::parse("application/octet-stream").expect("tipo MIME generico valido")
    })
}

/// Parte di un allegato normale (`Content-Disposition: attachment`).
fn parte_allegato(a: &AllegatoDecodificato) -> SinglePart {
    Attachment::new(a.nome.clone()).body(a.dati.clone(), content_type(&a.mime))
}

/// Parte di un'immagine incorporata: porta il `Content-ID` con cui il corpo la
/// richiama (`cid:`).
fn parte_immagine(a: &AllegatoDecodificato) -> SinglePart {
    let cid = a.content_id.clone().unwrap_or_else(|| a.nome.clone());
    Attachment::new_inline_with_name(cid, a.nome.clone())
        .body(a.dati.clone(), content_type(&a.mime))
}

/// Costruisce il messaggio MIME **senza allegati**.
///
/// `corpo_html` è opzionale: con esso il corpo diventa `multipart/alternative`
/// (testo + HTML), altrimenti è una sola parte `text/plain`. `firma`, se
/// presente, viene accodata a entrambe le rappresentazioni.
///
/// L'oggetto **non** viene validato qui: la costruzione accetta anche la stringa
/// vuota, è `valida_invio` a rifiutarla prima dell'invio.
pub fn build_message(
    mittente: &str,
    destinatari: &[String],
    cc: &[String],
    oggetto: &str,
    corpo_testo: &str,
    corpo_html: Option<&str>,
    firma: Option<&str>,
) -> Result<Message> {
    build_message_con_allegati(
        mittente,
        destinatari,
        cc,
        oggetto,
        corpo_testo,
        corpo_html,
        firma,
        &[],
    )
}

/// Costruisce il messaggio MIME **con allegati**, secondo la struttura che usa
/// Outlook:
///
/// - corpo testo/HTML: come in [`build_message`] (una parte `text/plain` oppure
///   `multipart/alternative`);
/// - **immagini incorporate** (`content_id` presente): il corpo e le immagini
///   finiscono in `multipart/related`, ogni immagine con il suo `Content-ID`;
/// - **allegati** (qualsiasi altro file): tutto sopra finisce come prima parte
///   di un `multipart/mixed`, gli allegati come parti `base64`.
///
/// I nomi file non ASCII sono codificati da `lettre` secondo RFC 2231 (parametro
/// esteso `filename*`) nell'`Content-Disposition`.
///
/// Oltre [`LIMITE_ALLEGATI_BYTE`] la costruzione rifiuta con un errore leggibile.
pub fn build_message_con_allegati(
    mittente: &str,
    destinatari: &[String],
    cc: &[String],
    oggetto: &str,
    corpo_testo: &str,
    corpo_html: Option<&str>,
    firma: Option<&str>,
    allegati: &[AllegatoInviato],
) -> Result<Message> {
    build_message_completo(
        mittente,
        destinatari,
        cc,
        &[],
        oggetto,
        corpo_testo,
        corpo_html,
        firma,
        allegati,
    )
}

/// Costruisce il messaggio MIME con **destinatari in copia nascosta** (`Ccn`),
/// oltre a tutto ciò che fa [`build_message_con_allegati`].
///
/// I destinatari di `ccn` entrano nella busta SMTP ma **non** finiscono
/// nell'intestazione `Bcc`: è il comportamento corretto della copia nascosta
/// (RFC 5322 §3.6.3), come fa Outlook. Una `ccn` vuota lascia il messaggio
/// identico a quello senza copia nascosta.
pub fn build_message_completo(
    mittente: &str,
    destinatari: &[String],
    cc: &[String],
    ccn: &[String],
    oggetto: &str,
    corpo_testo: &str,
    corpo_html: Option<&str>,
    firma: Option<&str>,
    allegati: &[AllegatoInviato],
) -> Result<Message> {
    build_message_completo_con_extra(
        mittente,
        destinatari,
        cc,
        ccn,
        oggetto,
        corpo_testo,
        corpo_html,
        firma,
        allegati,
        None,
    )
}

/// Come [`build_message_completo`], ma con **intestazioni extra** (blocco I2):
/// indirizzo di risposta predefinito (`Reply-To`) e conferme di lettura/recapito
/// (`Disposition-Notification-To` / `Return-Receipt-To`). Le intestazioni si
/// aggiungono solo se davvero richieste (vedi [`intestazioni_extra`]).
#[allow(clippy::too_many_arguments)]
pub fn build_message_completo_con_extra(
    mittente: &str,
    destinatari: &[String],
    cc: &[String],
    ccn: &[String],
    oggetto: &str,
    corpo_testo: &str,
    corpo_html: Option<&str>,
    firma: Option<&str>,
    allegati: &[AllegatoInviato],
    extra: Option<&IntestazioniExtra>,
) -> Result<Message> {
    build_message_core(
        mittente,
        destinatari,
        cc,
        ccn,
        oggetto,
        corpo_testo,
        corpo_html,
        firma,
        allegati,
        true,
        extra,
    )
}

/// Costruisce il messaggio MIME di una **bozza**: identico a
/// [`build_message_completo`] ma **senza richiedere un destinatario** (una bozza
/// può essere scritta e salvata prima di scegliere a chi mandarla).
pub fn build_bozza(
    mittente: &str,
    destinatari: &[String],
    cc: &[String],
    ccn: &[String],
    oggetto: &str,
    corpo_testo: &str,
    corpo_html: Option<&str>,
    firma: Option<&str>,
    allegati: &[AllegatoInviato],
) -> Result<Message> {
    build_message_core(
        mittente,
        destinatari,
        cc,
        ccn,
        oggetto,
        corpo_testo,
        corpo_html,
        firma,
        allegati,
        false,
        None,
    )
}

/// Il corpo comune di [`build_message_completo`] e [`build_bozza`]. Con
/// `richiede_destinatario` falso l'invio senza destinatari è ammesso (bozza).
#[allow(clippy::too_many_arguments)]
fn build_message_core(
    mittente: &str,
    destinatari: &[String],
    cc: &[String],
    ccn: &[String],
    oggetto: &str,
    corpo_testo: &str,
    corpo_html: Option<&str>,
    firma: Option<&str>,
    allegati: &[AllegatoInviato],
    richiede_destinatario: bool,
    extra: Option<&IntestazioniExtra>,
) -> Result<Message> {
    let from = Mailbox::from_str(mittente).map_err(|_| SendError::IndirizzoNonValido {
        campo: "Da".to_string(),
        valore: mittente.to_string(),
    })?;
    let a = interpreta("A", destinatari)?;
    let copia = interpreta("Cc", cc)?;
    let mut nascosta = interpreta("Ccn", ccn)?;
    if richiede_destinatario && a.is_empty() {
        return Err(SendError::DestinatarioMancante);
    }
    // Una bozza senza alcun destinatario: il costruttore di `lettre` richiede
    // almeno un destinatario di busta, quindi se ne aggiunge uno nascosto al
    // mittente. Il `Bcc` **non** compare fra le intestazioni visibili, quindi la
    // bozza salvata resta senza destinatari (è una bozza, non parte nulla).
    if !richiede_destinatario && a.is_empty() && copia.is_empty() && nascosta.is_empty() {
        nascosta.push(from.clone());
    }

    // Gli allegati si decodificano e si controllano PRIMA di costruire nulla.
    let decodificati = decodifica_allegati(allegati)?;
    let (immagini, files): (Vec<_>, Vec<_>) = decodificati
        .into_iter()
        .partition(|allegato| allegato.content_id.is_some());

    let firma = firma.map(str::trim).filter(|f| !f.is_empty());
    let testo = con_firma(corpo_testo, firma, "\n\n");
    let html = corpo_html
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .map(|h| con_firma(h, firma, "<br><br>"));

    let mut builder = Message::builder().from(from).subject(oggetto.to_string());
    for mb in a {
        builder = builder.to(mb);
    }
    for mb in copia {
        builder = builder.cc(mb);
    }
    // Copia nascosta: entra nella busta SMTP, non nelle intestazioni visibili.
    for mb in nascosta {
        builder = builder.bcc(mb);
    }
    // Intestazioni extra (blocco I2): Reply-To e conferme richieste. Si aggiungono
    // solo quelle davvero chieste; il valore è già nel formato `<indirizzo>`.
    if let Some(extra) = extra {
        for (nome, valore) in intestazioni_extra(extra) {
            if let Ok(nome_h) = HeaderName::new_from_ascii(nome) {
                builder = builder.raw_header(HeaderValue::new(nome_h, valore));
            }
        }
    }

    // Corpo: parte testo da sola oppure multipart/alternative (testo+HTML).
    let alternative = html.map(|html| {
        MultiPart::alternative()
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(testo.clone()),
            )
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_HTML)
                    .body(html),
            )
    });

    // Il corpo "arricchito": con le immagini incorporate diventa multipart/related.
    let corpo_con_related = if immagini.is_empty() {
        None
    } else {
        let mut related = match &alternative {
            Some(alt) => MultiPart::related().multipart(alt.clone()),
            None => MultiPart::related().singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(testo.clone()),
            ),
        };
        for immagine in &immagini {
            related = related.singlepart(parte_immagine(immagine));
        }
        Some(related)
    };

    let messaggio = if files.is_empty() {
        // Niente allegati: come prima (related con le sole immagini, oppure il corpo).
        match corpo_con_related {
            Some(related) => builder.multipart(related),
            None => match alternative {
                Some(alt) => builder.multipart(alt),
                None => builder.header(ContentType::TEXT_PLAIN).body(testo),
            },
        }
    } else {
        // multipart/mixed: prima parte il corpo (o il related), poi gli allegati.
        let mut mixed = match corpo_con_related {
            Some(related) => MultiPart::mixed().multipart(related),
            None => match alternative {
                Some(alt) => MultiPart::mixed().multipart(alt),
                None => MultiPart::mixed().singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_PLAIN)
                        .body(testo),
                ),
            },
        };
        for file in &files {
            mixed = mixed.singlepart(parte_allegato(file));
        }
        builder.multipart(mixed)
    };

    messaggio.map_err(|e| SendError::Costruzione(e.to_string()))
}

/// Accoda la firma al corpo, se presente.
fn con_firma(corpo: &str, firma: Option<&str>, separatore: &str) -> String {
    match firma {
        Some(f) => format!("{corpo}{separatore}{f}"),
        None => corpo.to_string(),
    }
}

/// Invia un messaggio già costruito con SMTP/TLS.
///
/// Con `smtp_ssl` vero si usa il TLS implicito (porta tipica 465), altrimenti
/// STARTTLS (porta tipica 587): in entrambi i casi la connessione è cifrata e i
/// certificati sono verificati dal validatore di sistema, senza possibilità di
/// disattivarlo.
pub fn invia(account: &Account, password: &str, messaggio: &Message) -> Result<()> {
    let builder = if account.smtp_ssl {
        SmtpTransport::relay(&account.smtp_host)
    } else {
        SmtpTransport::starttls_relay(&account.smtp_host)
    }
    .map_err(|e| SendError::Configurazione(e.to_string()))?;

    let trasporto = builder
        .port(account.smtp_port)
        .credentials(Credentials::new(
            account.username.clone(),
            password.to_string(),
        ))
        .build();

    trasporto
        .send(messaggio)
        .map_err(|e| SendError::Smtp(e.to_string()))?;
    Ok(())
}

/// Prende la password dal Keychain e invia il messaggio; restituisce un esito
/// leggibile per l'interfaccia.
pub fn invia_messaggio(
    account: &Account,
    segreti: &secrets::Store,
    messaggio: &Message,
) -> Result<String> {
    let password = segreti
        .get(&account.id)
        .map_err(|_| SendError::PasswordAssente(account.id.clone()))?;
    invia(account, &password, messaggio)?;
    Ok(format!(
        "Messaggio inviato a {} tramite {}:{}.",
        account.email, account.smtp_host, account.smtp_port
    ))
}

/// Esito di un invio **riuscito**, con l'esito della copia in "Posta inviata".
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EsitoInvio {
    /// Cartella in cui la copia è stata salvata (APPEND riuscito), se è avvenuto.
    pub copia_in: Option<String>,
    /// Motivo per cui la copia NON è stata salvata. L'invio è comunque riuscito:
    /// questo campo diventa una **nota**, mai un errore.
    pub nota_copia: Option<String>,
}

impl EsitoInvio {
    /// Testo leggibile per l'interfaccia. Il fallimento della copia non è
    /// presentato come un errore: l'invio è riuscito, la copia no.
    pub fn testo(&self, account: &Account) -> String {
        let base = format!(
            "Messaggio inviato a {} tramite {}:{}.",
            account.email, account.smtp_host, account.smtp_port
        );
        match &self.copia_in {
            Some(cartella) => format!("{base} Copia salvata in «{cartella}»."),
            None => {
                let motivo = self
                    .nota_copia
                    .as_deref()
                    .filter(|m| !m.is_empty())
                    .unwrap_or("motivo non dichiarato dal server");
                format!(
                    "{base} L'invio è riuscito, ma la copia in «Posta inviata» non è stata \
                     salvata: {motivo}"
                )
            }
        }
    }
}

/// Invia il messaggio con `invia` e, **solo se l'invio riesce**, ne copia i byte
/// grezzi in "Posta inviata" con IMAP APPEND (come fa Outlook).
///
/// `sorgente` è `None` quando la copia non è proprio tentabile (per esempio la
/// password IMAP manca nel Keychain): la nota lo dichiara e l'invio resta valido.
/// Il fallimento dell'APPEND **non** rende l'invio un errore: finisce in
/// `nota_copia`. Una funzione `invia` che fallisce, invece, è un errore e la
/// copia non viene nemmeno tentata.
pub async fn invia_e_copia<F>(
    sorgente: Option<&dyn MailSource>,
    invia: F,
    grezzo: &[u8],
) -> Result<EsitoInvio>
where
    F: FnOnce() -> Result<()>,
{
    invia()?;
    let (copia_in, nota_copia) = match sorgente {
        Some(src) => match copia_in_inviata(src, grezzo).await {
            Ok(cartella) => (Some(cartella), None),
            Err(motivo) => (None, Some(motivo)),
        },
        None => (
            None,
            Some("l'accesso IMAP non è disponibile per salvare la copia".to_string()),
        ),
    };
    Ok(EsitoInvio {
        copia_in,
        nota_copia,
    })
}

/// Bozza di risposta: campi precompilati e messaggio originale citato.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BozzaRisposta {
    /// Destinatario principale (il mittente del messaggio originale).
    pub a: String,
    /// Destinatari in copia (per \"Rispondi a tutti\").
    pub cc: String,
    pub oggetto: String,
    /// Corpo citato, con intestazione e testo originale.
    pub corpo_citato: String,
}

/// Bozza di inoltro: oggetto prefissato e messaggio originale citato.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BozzaInoltro {
    pub oggetto: String,
    pub corpo_citato: String,
}

/// I campi del messaggio originale che servono alla citazione.
struct Originale {
    from: String,
    to: String,
    cc: String,
    subject: String,
    date: String,
    testo: String,
}

/// Legge intestazioni e testo semplice dal messaggio grezzo (RFC 822). Il testo
/// arriva da `mail::mime::analizza`, che ripiega sull'HTML convertito quando la
/// parte `text/plain` manca: così la citazione non perde mai il contenuto.
fn leggi_originale(grezzo: &[u8]) -> Originale {
    let corpo = crate::mail::mime::analizza(grezzo);
    let mut originale = Originale {
        from: String::new(),
        to: String::new(),
        cc: String::new(),
        subject: String::new(),
        date: String::new(),
        testo: corpo.testo.unwrap_or_default(),
    };
    if let Some(m) = mail_parser::MessageParser::default().parse(grezzo) {
        originale.from = formatta_indirizzi(m.from());
        originale.to = formatta_indirizzi(m.to());
        originale.cc = formatta_indirizzi(m.cc());
        originale.subject = m.subject().unwrap_or("(nessun oggetto)").to_string();
        originale.date = m.date().map(|d| d.to_rfc822()).unwrap_or_default();
    }
    originale
}

/// Formatta un elenco di indirizzi come "Nome <utente@host>", separati da virgola.
pub(crate) fn formatta_indirizzi(addr: Option<&mail_parser::Address>) -> String {
    match addr {
        Some(a) => a
            .iter()
            .map(|x| {
                let email = x.address().unwrap_or_default().to_string();
                match x.name() {
                    Some(n) if !n.is_empty() => format!("{n} <{email}>"),
                    _ => email,
                }
            })
            .collect::<Vec<_>>()
            .join(", "),
        None => String::new(),
    }
}

/// Prefissa l'oggetto (\"R: \", \"I: \") evitando di raddoppiare il prefisso.
fn prefisso_oggetto(oggetto: &str, prefisso: &str) -> String {
    let o = oggetto.trim();
    if o.is_empty() {
        return prefisso.trim_end().to_string();
    }
    if o.to_lowercase()
        .starts_with(&prefisso.trim_end().to_lowercase())
    {
        o.to_string()
    } else {
        format!("{prefisso}{o}")
    }
}

/// Cita il messaggio originale: riga "Il <data> <mittente> ha scritto:", testo
/// semplice prefissato con "> " e blocco di intestazione "Messaggio originale".
fn cita(o: &Originale) -> String {
    let mut s = String::new();
    if !o.date.is_empty() || !o.from.is_empty() {
        s.push_str(&format!("Il {} {} ha scritto:\n", o.date, o.from));
    }
    for riga in o.testo.lines() {
        s.push_str("> ");
        s.push_str(riga);
        s.push('\n');
    }
    s.push_str("\n-----Messaggio originale-----\n");
    s.push_str(&format!("Da: {}\n", o.from));
    if !o.date.is_empty() {
        s.push_str(&format!("Data: {}\n", o.date));
    }
    s.push_str(&format!("A: {}\n", o.to));
    if !o.cc.is_empty() {
        s.push_str(&format!("Cc: {}\n", o.cc));
    }
    s.push_str(&format!("Oggetto: {}\n", o.subject));
    s
}

/// Elenco dei destinatari in copia per \"Rispondi a tutti\": i To e Cc originali,
/// meno il destinatario principale e meno il proprio indirizzo.
fn destinatari_in_copia(o: &Originale, mio: &str, principale: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mio_min = mio.to_lowercase();
    for elenco in [&o.to, &o.cc] {
        for pezzo in elenco.split(',') {
            let p = pezzo.trim();
            if p.is_empty() || p == principale {
                continue;
            }
            if !mio_min.is_empty() && p.to_lowercase().contains(&mio_min) {
                continue;
            }
            if !out.iter().any(|x| x == p) {
                out.push(p.to_string());
            }
        }
    }
    out.join("; ")
}

/// Prepara la bozza di risposta dal messaggio grezzo. `mio_indirizzo` è la
/// casella dell'utente (per non mettersi in copia a se stesso).
pub fn bozza_risposta(grezzo: &[u8], mio_indirizzo: &str, a_tutti: bool) -> BozzaRisposta {
    let o = leggi_originale(grezzo);
    let principale = if o.from.trim().is_empty() {
        o.to.clone()
    } else {
        o.from.clone()
    };
    let cc = if a_tutti {
        destinatari_in_copia(&o, mio_indirizzo, &principale)
    } else {
        String::new()
    };
    BozzaRisposta {
        a: principale,
        cc,
        oggetto: prefisso_oggetto(&o.subject, "R: "),
        corpo_citato: cita(&o),
    }
}

/// Prepara la bozza di inoltro dal messaggio grezzo.
pub fn bozza_inoltro(grezzo: &[u8]) -> BozzaInoltro {
    let o = leggi_originale(grezzo);
    BozzaInoltro {
        oggetto: prefisso_oggetto(&o.subject, "I: "),
        corpo_citato: cita(&o),
    }
}

// ---------------------------------------------------------------------------
// Blocco I1 — Rinvia, Inoltra come allegato.
// ---------------------------------------------------------------------------

/// Bozza di **Rinvia**: il messaggio originale ricostruito come nuovo.
/// `oggetto` è **senza** prefissi di risposta/inoltro, `corpo` è il testo
/// originale e `allegati` sono gli allegati originali, pronti per un nuovo invio.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BozzaRinvia {
    pub oggetto: String,
    pub corpo: String,
    pub allegati: Vec<AllegatoInviato>,
}

/// Toglie dall'oggetto i prefissi di risposta e inoltro (`R:`, `Re:`, `I:`,
/// `Fwd:`, `Inoltro:`) e quelli fra parentesi quadre in testa (`[Esterna]`),
/// ripetutamente. «Rinvia» invia il messaggio come **nuovo**: l'oggetto parte
/// pulito, senza i prefissi accumulati.
pub fn togli_prefissi(oggetto: &str) -> String {
    let mut s = oggetto.trim().to_string();
    loop {
        let basso = s.to_lowercase();
        let mut tolto = false;
        for prefisso in ["re:", "r:", "i:", "fw:", "fwd:", "inoltro:"] {
            if basso.starts_with(prefisso) {
                s = s[prefisso.len()..].trim_start().to_string();
                tolto = true;
                break;
            }
        }
        // Prefissi fra parentesi quadre in testa (es. "[Esterna] Oggetto").
        if !tolto && s.starts_with('[') {
            if let Some(fine) = s.find(']') {
                s = s[fine + 1..].trim_start().to_string();
                tolto = true;
            }
        }
        if !tolto {
            break;
        }
    }
    s
}

/// Ricostruisce il messaggio originale per **Rinvia**: oggetto senza prefissi,
/// testo originale e allegati originali.
pub fn bozza_rinvia(grezzo: &[u8]) -> BozzaRinvia {
    let o = leggi_originale(grezzo);
    let oggetto = togli_prefissi(&o.subject);
    BozzaRinvia {
        oggetto: if oggetto.is_empty() {
            "(nessun oggetto)".to_string()
        } else {
            oggetto
        },
        corpo: o.testo,
        allegati: allegati_per_bozza(grezzo),
    }
}

/// Nome file `.eml` per un messaggio inoltrato come allegato: dall'oggetto
/// ripulito dai caratteri non leciti in un nome file. Mai vuoto.
pub fn nome_eml(oggetto: &str) -> String {
    let base: String = togli_prefissi(oggetto)
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let base = base.split_whitespace().collect::<Vec<_>>().join(" ");
    let base = base.trim_matches(|c: char| c == '.' || c == ' ').trim();
    if base.is_empty() {
        "messaggio.eml".to_string()
    } else {
        format!("{base}.eml")
    }
}

/// Testo breve che accompagna un «Inoltra come allegato».
pub fn testo_inoltro_allegato(grezzo: &[u8]) -> String {
    let o = leggi_originale(grezzo);
    let da = if o.from.trim().is_empty() {
        "un mittente sconosciuto".to_string()
    } else {
        o.from.clone()
    };
    let oggetto = if o.subject.trim().is_empty() {
        "(nessun oggetto)".to_string()
    } else {
        o.subject.clone()
    };
    format!(
        "Inoltro come allegato il messaggio «{oggetto}» di {da}. \
         Il messaggio originale è nel file allegato, apribile con qualunque client di posta."
    )
}

/// L'oggetto di un «Inoltra come allegato» per un messaggio grezzo (prefisso `I:`).
pub fn prefisso_oggetto_inoltro(grezzo: &[u8]) -> String {
    prefisso_oggetto(&leggi_originale(grezzo).subject, "I: ")
}

/// Costruisce il messaggio MIME di un **Inoltra come allegato**: il testo
/// esplicativo nel corpo e il messaggio originale come parte `message/rfc822`
/// con nome `<oggetto>.eml`.
///
/// La parte è un allegato a tutti gli effetti (`Content-Disposition:
/// attachment`) col tipo MIME dichiarato: è il formato con cui i client di posta
/// si scambiano un messaggio intero, e la verifica sta nella funzione pura che
/// lo costruisce.
pub fn build_inoltro_allegato(
    mittente: &str,
    destinatari: &[String],
    grezzo: &[u8],
    testo: &str,
) -> Result<Message> {
    let allegato = AllegatoInviato {
        nome: nome_eml(&leggi_originale(grezzo).subject),
        mime: "message/rfc822".to_string(),
        contenuto: codifica_base64(grezzo),
        content_id: None,
    };
    let oggetto = prefisso_oggetto_inoltro(grezzo);
    build_message_completo(
        mittente,
        destinatari,
        &[],
        &[],
        &oggetto,
        testo,
        None,
        None,
        &[allegato],
    )
}
