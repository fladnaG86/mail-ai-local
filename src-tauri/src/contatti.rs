//! Rubrica dei contatti e completamento dei destinatari (blocco F).
//!
//! Il modulo raccoglie la logica **pura** del blocco: la lettura e la scrittura
//! di **vCard** (`.vcf`) e l'unione/ordinamento dei suggerimenti per la
//! composizione. Non tocca il database: la persistenza vive in `store.rs` e i
//! comandi IPC sottili in `lib.rs`. Così si collauda tutto senza file né rete.
//!
//! ## vCard: cosa è supportato e cosa viene dichiarato
//!
//! Esportazione e importazione coprono le proprietà che la rubrica possiede
//! davvero: `N` (cognome, nome), `FN` (nome formattato), `EMAIL`, `TEL`, `ORG`,
//! `NOTE`. Il file esportato è leggibile da **Contatti di macOS** (vCard 3.0).
//!
//! Le proprietà che il modello non ha (es. `BDAY`, `ADR`, `URL`, `PHOTO`,
//! `X-*`) **non vengono inventate né perse in silenzio**: all'importazione i
//! loro nomi sono raccolti in `ignorati` e restituiti all'interfaccia, che li
//! dichiara all'utente. `N` e `EMAIL` di una scheda senza indirizzo non possono
//! dar luogo a un contatto (l'email è la chiave logica): la scheda è contata in
//! `senza_email`.

use serde::{Deserialize, Serialize};

use crate::mail::ops::estrai_indirizzo;

/// Un contatto nella forma scambiata con l'interfaccia (camelCase).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contatto {
    /// Identificatore della riga; `None` per un contatto nuovo.
    #[serde(default)]
    pub id: Option<i64>,
    #[serde(default)]
    pub nome: String,
    #[serde(default)]
    pub cognome: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub telefono: String,
    #[serde(default)]
    pub azienda: String,
    #[serde(default)]
    pub note: String,
    /// Secondi dall'epoca Unix (solo lettura).
    #[serde(default)]
    pub creato: i64,
    #[serde(default)]
    pub modificato: i64,
}

impl Contatto {
    /// Nome visualizzato: "Nome Cognome" oppure l'indirizzo, se non c'è un nome.
    pub fn nome_visualizzato(&self) -> String {
        let n = format!("{} {}", self.nome.trim(), self.cognome.trim());
        let n = n.trim();
        if n.is_empty() {
            self.email.trim().to_string()
        } else {
            n.to_string()
        }
    }
}

impl From<crate::store::ContattoRow> for Contatto {
    fn from(r: crate::store::ContattoRow) -> Self {
        Contatto {
            id: Some(r.id),
            nome: r.nome,
            cognome: r.cognome,
            email: r.email,
            telefono: r.telefono,
            azienda: r.azienda,
            note: r.note,
            creato: r.creato,
            modificato: r.modificato,
        }
    }
}

impl From<&Contatto> for crate::store::ContattoInput {
    fn from(c: &Contatto) -> Self {
        crate::store::ContattoInput {
            id: c.id,
            nome: c.nome.clone(),
            cognome: c.cognome.clone(),
            email: c.email.clone(),
            telefono: c.telefono.clone(),
            azienda: c.azienda.clone(),
            note: c.note.clone(),
        }
    }
}

/// Esito del salvataggio di un contatto (per l'interfaccia).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsitoSalvataggio {
    pub id: i64,
    /// Vero quando un contatto con la stessa email esisteva già ed è stato
    /// **aggiornato** invece di essere duplicato.
    pub aggiornato: bool,
}

/// Esito dell'importazione di un file vCard.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsitoImport {
    pub schede: usize,
    pub importati: usize,
    pub aggiornati: usize,
    /// Schede senza indirizzo email: non possono diventare un contatto.
    pub senza_email: usize,
    /// Proprietà vCard incontrate ma non lette (dichiarate, mai inventate).
    pub ignorati: Vec<String>,
}

/// Un contatto suggerito per il completamento dei destinatari.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggerimento {
    pub nome: String,
    pub email: String,
    /// Provenienza: "rubrica" oppure "messaggi".
    pub origine: String,
}

// ---------------------------------------------------------------------------
// vCard: sfuggitura dei valori (RFC 6350 §3.4)
// ---------------------------------------------------------------------------

/// Sfugge un valore vCard: `\`, a capo, `,` e `;`.
fn sfuggi(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    for c in v.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => {}
            ',' => out.push_str("\\,"),
            ';' => out.push_str("\\;"),
            altro => out.push(altro),
        }
    }
    out
}

/// Toglie la sfuggitura di un valore vCard. Una sequenza sconosciuta resta
/// com'è (non si perde informazione).
fn desfuggi(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    let mut chars = v.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n') | Some('N') => out.push('\n'),
            Some('\\') => out.push('\\'),
            Some(',') => out.push(','),
            Some(';') => out.push(';'),
            Some(altro) => {
                out.push('\\');
                out.push(altro);
            }
            None => out.push('\\'),
        }
    }
    out
}

/// Divide un valore vCard sui `;` non sfuggiti (per il campo `N`).
fn dividi_valore(v: &str) -> Vec<String> {
    let mut pezzi = Vec::new();
    let mut corrente = String::new();
    let mut chars = v.chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                corrente.push(c);
                if let Some(n) = chars.next() {
                    corrente.push(n);
                }
            }
            ';' => {
                pezzi.push(std::mem::take(&mut corrente));
            }
            altro => corrente.push(altro),
        }
    }
    pezzi.push(corrente);
    pezzi.into_iter().map(|p| desfuggi(&p)).collect()
}

// ---------------------------------------------------------------------------
// Esportazione
// ---------------------------------------------------------------------------

/// Esporta l'elenco dei contatti come file vCard 3.0 (uno o più `VCARD`).
///
/// Il formato è quello letto da **Contatti di macOS**: `N` porta cognome e nome,
/// `FN` il nome formattato, più `EMAIL`/`TEL`/`ORG`/`NOTE` quando valorizzati.
pub fn esporta_vcard(contatti: &[Contatto]) -> String {
    let mut out = String::new();
    for c in contatti {
        out.push_str("BEGIN:VCARD\r\n");
        out.push_str("VERSION:3.0\r\n");
        out.push_str(&format!(
            "N:{};{};;;\r\n",
            sfuggi(c.cognome.trim()),
            sfuggi(c.nome.trim())
        ));
        out.push_str(&format!("FN:{}\r\n", sfuggi(&c.nome_visualizzato())));
        out.push_str(&format!(
            "EMAIL;TYPE=INTERNET:{}\r\n",
            sfuggi(c.email.trim())
        ));
        if !c.telefono.trim().is_empty() {
            out.push_str(&format!("TEL;TYPE=CELL:{}\r\n", sfuggi(c.telefono.trim())));
        }
        if !c.azienda.trim().is_empty() {
            out.push_str(&format!("ORG:{}\r\n", sfuggi(c.azienda.trim())));
        }
        if !c.note.trim().is_empty() {
            out.push_str(&format!("NOTE:{}\r\n", sfuggi(c.note.trim())));
        }
        out.push_str("END:VCARD\r\n");
    }
    out
}

// ---------------------------------------------------------------------------
// Importazione
// ---------------------------------------------------------------------------

/// Una scheda vCard letta, con il contatto e le proprietà ignorate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchedaVcard {
    pub contatto: Contatto,
    pub ignorati: Vec<String>,
}

/// Esito della lettura di un testo vCard (una o più schede).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EsitoParse {
    pub schede: Vec<SchedaVcard>,
    /// Schede senza indirizzo email (scartate: l'email è la chiave logica).
    pub senza_email: usize,
    /// Proprietà non lette, in ordine alfabetico e senza ripetizioni.
    pub ignorati: Vec<String>,
}

/// Riporta ogni riga logica su una sola riga, sciogliendo le continuazioni
/// (riga successiva che inizia con spazio o tab: RFC 6350 §3.2).
fn srotola(testo: &str) -> Vec<String> {
    let normalizzato = testo.replace("\r\n", "\n").replace('\r', "\n");
    let mut righe: Vec<String> = Vec::new();
    for riga in normalizzato.split('\n') {
        if riga.starts_with(' ') || riga.starts_with('\t') {
            if let Some(ultima) = righe.last_mut() {
                ultima.push_str(&riga[1..]);
            }
        } else {
            righe.push(riga.to_string());
        }
    }
    righe
}

/// Nome della proprietà e valore di una riga `NOME;parametri:valore`.
/// Il prefisso di gruppo (`item1.EMAIL`) è tolto; i parametri (`;TYPE=…`) pure.
fn proprieta(riga: &str) -> Option<(String, String)> {
    let (nome_con_param, valore) = riga.split_once(':')?;
    let senza_gruppo = nome_con_param.rsplit('.').next().unwrap_or("");
    let nome = senza_gruppo
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_uppercase();
    if nome.is_empty() {
        return None;
    }
    Some((nome, valore.to_string()))
}

/// Legge un testo vCard (una o più schede). Le schede senza email sono contate
/// in `senza_email`; le proprietà non riconosciute finiscono in `ignorati`.
pub fn importa_vcard(testo: &str) -> EsitoParse {
    let righe = srotola(testo);
    let mut schede: Vec<SchedaVcard> = Vec::new();
    let mut corrente: Vec<(String, String)> = Vec::new();
    let mut dentro = false;

    for riga in &righe {
        let (nome, valore) = match proprieta(riga) {
            Some(p) => p,
            None => continue,
        };
        match nome.as_str() {
            "BEGIN" => {
                if valore.trim().eq_ignore_ascii_case("VCARD") {
                    dentro = true;
                    corrente.clear();
                }
            }
            "END" => {
                if valore.trim().eq_ignore_ascii_case("VCARD") && dentro {
                    schede.push(scheda_da(&corrente));
                    dentro = false;
                    corrente.clear();
                }
            }
            "_" => {}
            _ if dentro => corrente.push((nome, valore)),
            _ => {}
        }
    }

    let senza_email = schede.iter().filter(|s| s.contatto.email.trim().is_empty()).count();
    // Tipo esplicito: senza annotazione `collect()` resta ambiguo e l'inferenza
    // di tipo va in overflow (E0275) fra i trait delle dipendenze.
    let valide: Vec<SchedaVcard> = schede
        .into_iter()
        .filter(|s| !s.contatto.email.trim().is_empty())
        .collect();

    let mut ignorati: Vec<String> = Vec::new();
    for s in &valide {
        for p in &s.ignorati {
            if !ignorati.contains(p) {
                ignorati.push(p.clone());
            }
        }
    }
    ignorati.sort();

    EsitoParse {
        schede: valide,
        senza_email,
        ignorati,
    }
}

/// Costruisce una scheda dalle proprietà raccolte fra `BEGIN` e `END`.
fn scheda_da(prop: &[(String, String)]) -> SchedaVcard {
    let mut c = Contatto {
        id: None,
        nome: String::new(),
        cognome: String::new(),
        email: String::new(),
        telefono: String::new(),
        azienda: String::new(),
        note: String::new(),
        creato: 0,
        modificato: 0,
    };
    let mut fn_ = String::new();
    let mut ignorati: Vec<String> = Vec::new();

    for (nome, valore) in prop {
        match nome.as_str() {
            "N" => {
                let pezzi = dividi_valore(valore);
                c.cognome = pezzi.first().cloned().unwrap_or_default().trim().to_string();
                c.nome = pezzi.get(1).cloned().unwrap_or_default().trim().to_string();
            }
            "FN" => fn_ = desfuggi(valore).trim().to_string(),
            "EMAIL" if c.email.is_empty() => c.email = desfuggi(valore).trim().to_string(),
            "EMAIL" => {}
            "TEL" if c.telefono.is_empty() => c.telefono = desfuggi(valore).trim().to_string(),
            "TEL" => {}
            "ORG" if c.azienda.is_empty() => {
                // ORG può essere un elenco separato da `;`: si prende il primo.
                c.azienda = dividi_valore(valore)
                    .first()
                    .cloned()
                    .unwrap_or_default()
                    .trim()
                    .to_string();
            }
            "ORG" => {}
            "NOTE" if c.note.is_empty() => c.note = desfuggi(valore).trim().to_string(),
            "NOTE" => {}
            "VERSION" | "BEGIN" | "END" => {}
            altro => {
                if !ignorati.iter().any(|x| x == altro) {
                    ignorati.push(altro.to_string());
                }
            }
        }
    }

    // `N` è vuoto (nessun nome) e `FN` porta qualcosa di diverso dall'indirizzo:
    // si usa `FN` come nome. Se `FN` è solo l'indirizzo, non lo si copia (non è
    // un nome) — così il giro esporta/reimporta resta identico.
    if c.nome.is_empty() && c.cognome.is_empty() && !fn_.is_empty() {
        if !fn_.eq_ignore_ascii_case(&c.email) {
            c.nome = fn_;
        }
    }

    SchedaVcard {
        contatto: c,
        ignorati,
    }
}

// ---------------------------------------------------------------------------
// Suggerimenti per la composizione
// ---------------------------------------------------------------------------

/// Il nome visualizzato dentro un indirizzo "Nome <utente@host>" (vuoto se non
/// c'è un nome).
fn nome_da_indirizzo(grezzo: &str) -> String {
    match grezzo.find('<') {
        Some(i) => grezzo[..i].trim().trim_matches('"').trim().to_string(),
        None => String::new(),
    }
}

/// Unisce i contatti della rubrica e gli indirizzi già visti nella cache dei
/// messaggi, deduplicati per email (la rubrica ha la precedenza), e li ordina
/// per pertinenza: la corrispondenza **all'inizio** dell'indirizzo o del nome
/// precede quella interna.
///
/// Un testo vuoto restituisce i primi `limite` in ordine di nome.
pub fn suggerisci_da(
    rubrica: &[Contatto],
    cache: &[String],
    testo: &str,
    limite: usize,
) -> Vec<Suggerimento> {
    let limite = if limite == 0 { 10 } else { limite };
    let q = testo.trim().to_ascii_lowercase();

    // Deduplicazione per email (minuscola): la rubrica entra per prima.
    let mut per_email: Vec<(String, Suggerimento)> = Vec::new();
    for c in rubrica {
        let email = c.email.trim().to_ascii_lowercase();
        if email.is_empty() {
            continue;
        }
        if per_email.iter().any(|(e, _)| *e == email) {
            continue;
        }
        per_email.push((
            email,
            Suggerimento {
                nome: c.nome_visualizzato(),
                email: c.email.trim().to_string(),
                origine: "rubrica".to_string(),
            },
        ));
    }
    for grezzo in cache {
        let indirizzo = match estrai_indirizzo(grezzo) {
            Some(a) => a,
            None => continue,
        };
        if indirizzo.is_empty() || per_email.iter().any(|(e, _)| *e == indirizzo) {
            continue;
        }
        let nome = nome_da_indirizzo(grezzo);
        let nome = if nome.is_empty() {
            indirizzo.clone()
        } else {
            nome
        };
        per_email.push((
            indirizzo.clone(),
            Suggerimento {
                nome,
                email: indirizzo,
                origine: "messaggi".to_string(),
            },
        ));
    }

    let mut con_punteggio: Vec<(u8, Suggerimento)> = per_email
        .into_iter()
        .filter_map(|(email_lc, s)| {
            let nome_lc = s.nome.to_ascii_lowercase();
            let punteggio = if q.is_empty() {
                Some(0u8)
            } else if email_lc.starts_with(&q) {
                Some(0)
            } else if nome_lc.starts_with(&q) {
                Some(1)
            } else if email_lc.contains(&q) {
                Some(2)
            } else if nome_lc.contains(&q) {
                Some(3)
            } else {
                None
            };
            punteggio.map(|p| (p, s))
        })
        .collect();

    con_punteggio.sort_by(|a, b| {
        a.0.cmp(&b.0)
            .then_with(|| a.1.nome.to_lowercase().cmp(&b.1.nome.to_lowercase()))
            .then_with(|| a.1.email.to_lowercase().cmp(&b.1.email.to_lowercase()))
    });
    con_punteggio
        .into_iter()
        .take(limite)
        .map(|(_, s)| s)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

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
        }
    }

    #[test]
    fn il_giro_esporta_reimporta_non_cambia_i_dati() {
        let contatti = vec![
            Contatto {
                telefono: "+39 011 1234567".to_string(),
                azienda: "Azienda Esempio S.r.l.".to_string(),
                note: "Referente manutenzione, con virgola".to_string(),
                ..contatto("Mario", "Rossi", "mario@esempio.it")
            },
            contatto("", "", "solo.indirizzo@example.com"),
        ];
        let vcf = esporta_vcard(&contatti);
        let esito = importa_vcard(&vcf);
        assert_eq!(esito.schede.len(), 2);
        assert_eq!(esito.schede[0].contatto, contatti[0]);
        // Senza nome: resta senza nome (FN è l'indirizzo, non un nome).
        assert_eq!(esito.schede[1].contatto, contatti[1]);
    }

    #[test]
    fn le_virgolette_e_i_a_capo_nei_valori_si_sfuggono_e_riemergono() {
        let c = Contatto {
            note: "prima riga\nseconda riga; con punto e virgola, e virgola".to_string(),
            ..contatto("Anna", "Bianchi", "anna@example.it")
        };
        let esito = importa_vcard(&esporta_vcard(&[c.clone()]));
        assert_eq!(esito.schede[0].contatto.note, c.note);
    }

    #[test]
    fn i_campi_sconosciuti_non_perdono_i_noti_e_si_dichiarano() {
        let vcf = "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Mario Rossi\r\n\
                   N:Rossi;Mario;;;\r\nEMAIL:mario@example.it\r\nBDAY:1980-05-06\r\n\
                   ADR;TYPE=HOME:;;Via Roma 1;Torino;;10100;Italia\r\nX-CUSTOM:xyz\r\n\
                   END:VCARD\r\n";
        let esito = importa_vcard(vcf);
        assert_eq!(esito.schede.len(), 1);
        let c = &esito.schede[0].contatto;
        assert_eq!(c.nome, "Mario");
        assert_eq!(c.cognome, "Rossi");
        assert_eq!(c.email, "mario@example.it");
        assert!(esito.ignorati.contains(&"BDAY".to_string()));
        assert!(esito.ignorati.contains(&"ADR".to_string()));
        assert!(esito.ignorati.contains(&"X-CUSTOM".to_string()));
        // VERSION non è "ignorato": è noto ma non mappato su un campo.
        assert!(!esito.ignorati.contains(&"VERSION".to_string()));
    }

    #[test]
    fn una_scheda_senza_email_si_dichiara_e_non_diventa_un_contatto() {
        let vcf = "BEGIN:VCARD\r\nFN:Senza Posta\r\nN:Senza;Posta;;;\r\nTEL:123\r\nEND:VCARD\r\n";
        let esito = importa_vcard(vcf);
        assert_eq!(esito.schede.len(), 0);
        assert_eq!(esito.senza_email, 1);
    }

    #[test]
    fn i_suggerimenti_unisono_rubrica_e_cache_senza_doppioni() {
        let rubrica = vec![contatto("Luca", "Bianchi", "luca.bianchi@esempiogroup.it")];
        let cache = vec![
            "Luca Bianchi <luca.bianchi@esempiogroup.it>".to_string(), // doppione: rubrica vince
            "BETA Assistenza <assistenza@beta.it>".to_string(),
        ];
        // Testo vuoto: tutti, la rubrica per prima (ordine per nome).
        let tutti = suggerisci_da(&rubrica, &cache, "", 10);
        assert_eq!(tutti.len(), 2);
        let email: Vec<&str> = tutti.iter().map(|s| s.email.as_str()).collect();
        assert!(email.contains(&"luca.bianchi@esempiogroup.it"));
        assert!(email.contains(&"assistenza@beta.it"));
        // Il doppione è della rubrica, non dei messaggi.
        let alb = tutti.iter().find(|s| s.email.contains("luca")).unwrap();
        assert_eq!(alb.origine, "rubrica");
    }

    #[test]
    fn il_filtro_distingue_inizio_da_parte_interna() {
        let rubrica = vec![
            contatto("Marco", "Rossi", "info@rossi.it"),      // "rossi" interno all'email
            contatto("Rossana", "Verdi", "rossana@example.it"), // nome inizia per "ross"
        ];
        let cache = vec!["Studio <studio@example.it>".to_string()];
        let esito = suggerisci_da(&rubrica, &cache, "ross", 10);
        // "rossana@example.it" (inizio indirizzo) e "Rossana" (inizio nome)
        // precedono "info@rossi.it" (corrispondenza interna).
        assert_eq!(esito.len(), 2);
        assert_eq!(esito[0].email, "rossana@example.it");
        assert_eq!(esito[1].email, "info@rossi.it");
        // "studio@example.it" non contiene "ross": escluso.
        assert!(!esito.iter().any(|s| s.email.contains("studio")));
    }

    #[test]
    fn inizio_di_indirizzo_precede_inizio_di_nome() {
        let rubrica = vec![
            // Il nome comincia con "ann", ma l'indirizzo no.
            contatto("Ann", "Rossi", "a.rossi@example.it"),
            // L'indirizzo comincia con "ann".
            contatto("Bianca", "Neri", "annunci@example.it"),
        ];
        let esito = suggerisci_da(&rubrica, &[], "ann", 10);
        assert_eq!(esito[0].email, "annunci@example.it");
    }
}
