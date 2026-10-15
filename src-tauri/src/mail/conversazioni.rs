//! Raggruppamento dei messaggi in conversazioni (blocco H).
//!
//! Due strade, nell'ordine di priorità dichiarato nel riferimento:
//!
//! 1. **References / In-Reply-To**: i messaggi che si citano a vicenda stanno
//!    nella stessa conversazione, **anche se l'oggetto è cambiato**;
//! 2. in mancanza di riferimenti, **l'oggetto normalizzato**: si tolgono i
//!    prefissi di risposta/inoltro (`Re:`, `R:`, `I:`, `Rif:`, `Fwd:`, `Fw:`) e
//!    i marcatori come `[externa]`, poi spazi e maiuscole. Oggetti diversi non
//!    si uniscono.
//!
//! Tutto è **puro**: prende le intestazioni dalla cache e restituisce una chiave
//! per riga. La scrittura della chiave nella cache la fa `sync::aggiorna_thread`.

use std::collections::HashMap;

use crate::store::ThreadInputRow;

/// Prefissi di risposta/inoltro tolti dall'oggetto (confronto senza maiuscole).
pub const PREFISSI: &[&str] = &["re", "r", "i", "rif", "fwd", "fw"];

/// Marcatori fra parentesi quadre tolti dall'inizio dell'oggetto.
pub const MARCATORI: &[&str] = &["externa", "external"];

/// Normalizza l'oggetto per il raggruppamento: toglie i prefissi di
/// risposta/inoltro e i marcatori `[externa]` (ripetutamente, in qualunque
/// combinazione), poi riduce gli spazi e passa a minuscole.
pub fn normalizza_oggetto(oggetto: &str) -> String {
    let mut s = oggetto.trim().to_string();
    loop {
        let prima = s.clone();
        s = togli_marcatore(&s);
        s = togli_prefisso(&s);
        if s == prima {
            break;
        }
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Toglie un marcatore `[externa]` (o `[external]`) all'inizio, se c'è.
fn togli_marcatore(testo: &str) -> String {
    let t = testo.trim_start();
    if let Some(resto) = t.strip_prefix('[') {
        if let Some(pos) = resto.find(']') {
            let dentro = resto[..pos].trim().to_lowercase();
            if MARCATORI.contains(&dentro.as_str()) {
                return resto[pos + 1..].trim_start().to_string();
            }
        }
    }
    testo.to_string()
}

/// Toglie un prefisso `Re:` / `R:` / `I:` / `Rif:` / `Fwd:` / `Fw:` all'inizio.
fn togli_prefisso(testo: &str) -> String {
    let t = testo.trim_start();
    if let Some(pos) = t.find(':') {
        let prefisso = t[..pos].trim();
        if !prefisso.is_empty()
            && !prefisso.contains(char::is_whitespace)
            && PREFISSI.contains(&prefisso.to_lowercase().as_str())
        {
            return t[pos + 1..].trim_start().to_string();
        }
    }
    testo.to_string()
}

/// Normalizza un identificatore di messaggio: via `<` e `>`, spazi e maiuscole.
pub fn normalizza_id(id: &str) -> String {
    id.trim()
        .trim_start_matches('<')
        .trim_end_matches('>')
        .trim()
        .to_lowercase()
}

/// Gli identificatori citati da un messaggio: tutto `References` più
/// `In-Reply-To`, normalizzati e senza duplicati.
pub fn riferimenti(r: &ThreadInputRow) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Some(refs) = &r.references {
        for pezzo in refs.split_whitespace() {
            let id = normalizza_id(pezzo);
            if !id.is_empty() && !out.contains(&id) {
                out.push(id);
            }
        }
    }
    if let Some(ir) = &r.in_reply_to {
        let id = normalizza_id(ir);
        if !id.is_empty() && !out.contains(&id) {
            out.push(id);
        }
    }
    out
}

/// Ritrova la radice di un indice (union-find con compressione del cammino).
fn trova(parent: &mut [usize], x: usize) -> usize {
    if parent[x] != x {
        parent[x] = trova(parent, parent[x]);
    }
    parent[x]
}

/// Unisce due insiemi (union-find).
fn unisci(parent: &mut [usize], a: usize, b: usize) {
    let (ra, rb) = (trova(parent, a), trova(parent, b));
    if ra != rb {
        parent[ra] = rb;
    }
}

/// La chiave di conversazione di ogni riga, nello stesso ordine dell'input.
///
/// I messaggi che condividono un riferimento formano una conversazione (chiave
/// `t:<radice>`); quelli senza riferimenti si raggruppano per oggetto
/// normalizzato (chiave `s:<oggetto>` o `t:<message-id>`); una riga senza nulla
/// resta da sola (`uid:<uid>`).
pub fn chiavi_conversazione(righe: &[ThreadInputRow]) -> Vec<String> {
    let n = righe.len();
    let mut parent: Vec<usize> = (0..n).collect();

    // Indice: message-id normalizzato → prima riga che lo porta.
    let mut per_id: HashMap<String, usize> = HashMap::new();
    for (i, r) in righe.iter().enumerate() {
        if let Some(mid) = &r.message_id {
            let id = normalizza_id(mid);
            if !id.is_empty() {
                per_id.entry(id).or_insert(i);
            }
        }
    }

    // 1) Unione per References / In-Reply-To.
    for (i, r) in righe.iter().enumerate() {
        for rif in riferimenti(r) {
            if let Some(&j) = per_id.get(&rif) {
                if j != i {
                    unisci(&mut parent, i, j);
                }
            }
        }
    }

    // 2) Unione per oggetto normalizzato fra i messaggi SENZA riferimenti.
    let mut per_oggetto: HashMap<String, usize> = HashMap::new();
    for (i, r) in righe.iter().enumerate() {
        if !riferimenti(r).is_empty() {
            continue;
        }
        let oggetto = normalizza_oggetto(r.subject.as_deref().unwrap_or(""));
        if oggetto.is_empty() {
            continue;
        }
        match per_oggetto.get(&oggetto) {
            Some(&j) => unisci(&mut parent, i, j),
            None => {
                per_oggetto.insert(oggetto, i);
            }
        }
    }

    // 3) Chiave per componente.
    let mut componenti: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n {
        let radice = trova(&mut parent, i);
        componenti.entry(radice).or_default().push(i);
    }

    let mut out = vec![String::new(); n];
    for membri in componenti.values() {
        let mut associati: Vec<String> = Vec::new();
        let mut citati: Vec<String> = Vec::new();
        for &i in membri {
            if let Some(mid) = &righe[i].message_id {
                let id = normalizza_id(mid);
                if !id.is_empty() && !associati.contains(&id) {
                    associati.push(id);
                }
            }
            for rif in riferimenti(&righe[i]) {
                if !citati.contains(&rif) {
                    citati.push(rif);
                }
            }
        }
        for c in &citati {
            if !associati.contains(c) {
                associati.push(c.clone());
            }
        }

        let chiave = if associati.is_empty() {
            let oggetto = normalizza_oggetto(righe[membri[0]].subject.as_deref().unwrap_or(""));
            if oggetto.is_empty() {
                format!("uid:{}", righe[membri[0]].uid)
            } else {
                format!("s:{oggetto}")
            }
        } else {
            // La radice è un identificatore che nessun membro cita; se il
            // componente è un ciclo, il minimo. Deterministica → stabile.
            let radici: Vec<&String> = associati.iter().filter(|id| !citati.contains(id)).collect();
            let radice = match radici.iter().min() {
                Some(r) => (*r).clone(),
                None => associati.iter().min().cloned().unwrap_or_default(),
            };
            format!("t:{radice}")
        };
        for &i in membri {
            out[i] = chiave.clone();
        }
    }
    out
}

/// Riepilogo di una conversazione: quanti messaggi e quanti non letti.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RiepilogoConversazione {
    pub numero: usize,
    pub non_letti: usize,
}

/// Conta messaggi e non letti di una conversazione (funzione pura: prende i
/// soli stati di lettura).
pub fn riepilogo_conversazione(letti: &[bool]) -> RiepilogoConversazione {
    RiepilogoConversazione {
        numero: letti.len(),
        non_letti: letti.iter().filter(|l| !**l).count(),
    }
}
