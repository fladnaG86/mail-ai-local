//! Blocco V — aperture dall'esterno.
//!
//! macOS consegna all'app i link `mailto:` (schema dichiarato in `Info.plist`)
//! con `RunEvent::Opened`, e lo fa anche all'avvio a freddo, **prima** che
//! l'interfaccia abbia collegato i suoi ascoltatori. Per non perderli il kernel
//! li mette in una [`Coda`] e manda l'evento `aperture-esterne` come semplice
//! avviso: l'interfaccia ritira sempre dalla coda (comando `aperture_in_attesa`),
//! sia all'avvio sia a ogni avviso, così nessuna apertura va persa né si ripete.
//!
//! Blocco V3: anche i file aperti dal Finder (`.eml`, `.ics`, `.vcf`, dichiarati
//! in `tauri.conf.json` → `fileAssociations`) arrivano come URL `file://`. Il
//! kernel li **legge e interpreta subito** e in coda mette il contenuto: non
//! esiste un comando che legga un percorso scelto dall'interfaccia.

use crate::contatti;
use crate::inviti::{self, Invito};
use crate::MailBody;
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

/// Nome dell'evento di avviso verso l'interfaccia.
pub const EVENTO_APERTURE: &str = "aperture-esterne";

/// Oltre questa dimensione un file aperto dal Finder non si legge (25 MB, come
/// il limite tipico degli allegati): meglio dirlo che bloccare l'app.
pub const DIMENSIONE_MASSIMA: u64 = 25 * 1024 * 1024;

/// Un contatto di un file `.vcf`, quanto basta per chiedere conferma.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ContattoBreve {
    pub nome: String,
    pub email: String,
}

/// Un'apertura richiesta dall'esterno, nella forma che legge l'interfaccia.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "tipo", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum Apertura {
    /// Link `mailto:` intero: lo analizza l'interfaccia (`analizzaMailto`).
    Mailto { url: String },
    /// Messaggio `.eml`: intestazioni e corpo già sanificato (immagini remote bloccate).
    Messaggio {
        nome_file: String,
        oggetto: String,
        da: String,
        a: String,
        cc: String,
        data: Option<i64>,
        corpo: MailBody,
    },
    /// Calendario `.ics`: gli eventi letti, da mostrare (non c'è un messaggio a cui rispondere).
    Calendario { nome_file: String, inviti: Vec<Invito> },
    /// Schede `.vcf`: si importano solo dopo la conferma, col testo intero.
    Contatti {
        nome_file: String,
        testo: String,
        schede: Vec<ContattoBreve>,
        senza_email: usize,
    },
    /// File di un tipo gestito che non si è potuto leggere: si dice perché.
    Illeggibile { nome_file: String, motivo: String },
}

/// Classifica un URL ricevuto dal sistema; `None` per ciò che l'app non apre.
pub fn classifica(url: &str) -> Option<Apertura> {
    let schema = url.split(':').next().unwrap_or("");
    if !url.contains(':') {
        return None;
    }
    if schema.eq_ignore_ascii_case("mailto") {
        return Some(Apertura::Mailto { url: url.to_string() });
    }
    if schema.eq_ignore_ascii_case("file") {
        let percorso = tauri::Url::parse(url).ok()?.to_file_path().ok()?;
        return apri_file(&percorso);
    }
    None
}

/// I formati di file che l'app apre, dall'estensione (senza distinzione di maiuscole).
#[derive(Clone, Copy)]
enum Formato {
    Eml,
    Ics,
    Vcf,
}

fn formato(percorso: &Path) -> Option<Formato> {
    let est = percorso.extension()?.to_str()?.to_ascii_lowercase();
    match est.as_str() {
        "eml" => Some(Formato::Eml),
        "ics" => Some(Formato::Ics),
        "vcf" | "vcard" => Some(Formato::Vcf),
        _ => None,
    }
}

/// Legge e interpreta un file aperto dal Finder; `None` se il tipo non è gestito.
pub fn apri_file(percorso: &Path) -> Option<Apertura> {
    let formato = formato(percorso)?;
    let nome_file = percorso
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let illeggibile = |motivo: String| Apertura::Illeggibile { nome_file: nome_file.clone(), motivo };

    let dimensione = match std::fs::metadata(percorso) {
        Ok(m) => m.len(),
        Err(e) => return Some(illeggibile(format!("il file non si può aprire: {e}"))),
    };
    if dimensione > DIMENSIONE_MASSIMA {
        return Some(illeggibile(format!(
            "il file è troppo grande ({} MB, massimo {} MB)",
            dimensione / (1024 * 1024),
            DIMENSIONE_MASSIMA / (1024 * 1024)
        )));
    }
    let grezzo = match std::fs::read(percorso) {
        Ok(b) => b,
        Err(e) => return Some(illeggibile(format!("il file non si può leggere: {e}"))),
    };

    Some(match formato {
        Formato::Eml => messaggio(nome_file, &grezzo),
        Formato::Ics => Apertura::Calendario {
            inviti: inviti::analizza(&String::from_utf8_lossy(&grezzo)),
            nome_file,
        },
        Formato::Vcf => {
            let testo = String::from_utf8_lossy(&grezzo).into_owned();
            let esito = contatti::importa_vcard(&testo);
            let schede = esito
                .schede
                .iter()
                .map(|s| {
                    let c = &s.contatto;
                    let nome = format!("{} {}", c.nome.trim(), c.cognome.trim()).trim().to_string();
                    ContattoBreve { nome, email: c.email.clone() }
                })
                .collect();
            Apertura::Contatti { nome_file, testo, schede, senza_email: esito.senza_email }
        }
    })
}

/// Un `.eml`: intestazioni con `mail-parser`, corpo con lo stesso percorso della
/// lettura (`componi_corpo`, sanificato, immagini remote bloccate).
fn messaggio(nome_file: String, grezzo: &[u8]) -> Apertura {
    let Some(m) = mail_parser::MessageParser::default().parse(grezzo) else {
        return Apertura::Illeggibile { nome_file, motivo: "non è un messaggio di posta leggibile".into() };
    };
    Apertura::Messaggio {
        oggetto: m.subject().unwrap_or("").to_string(),
        da: crate::send::formatta_indirizzi(m.from()),
        a: crate::send::formatta_indirizzi(m.to()),
        cc: crate::send::formatta_indirizzi(m.cc()),
        data: m.date().map(|d| d.to_timestamp()),
        corpo: crate::componi_corpo(grezzo, false),
        nome_file,
    }
}

/// Coda delle aperture in attesa che l'interfaccia le ritiri.
#[derive(Default)]
pub struct Coda(Mutex<Vec<Apertura>>);

impl Coda {
    /// Aggiunge un'apertura in fondo alla coda.
    pub fn metti(&self, apertura: Apertura) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).push(apertura);
    }

    /// Ritira tutte le aperture in attesa, nell'ordine d'arrivo.
    pub fn svuota(&self) -> Vec<Apertura> {
        std::mem::take(&mut *self.0.lock().unwrap_or_else(|e| e.into_inner()))
    }
}
