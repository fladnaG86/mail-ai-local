//! Sanificazione dell'HTML in ingresso (task 4.1, Milestone 4).
//!
//! Tutto l'HTML che arriva da una mail passa di qui prima di essere mostrato
//! nell'iframe di lettura. La politica è quella descritta nella spec (§7):
//! niente script, niente iframe/object/embed, niente attributi `on*`, niente
//! URL `javascript:`; i collegamenti portano `rel="noopener noreferrer"` e le
//! immagini con host remoto — cioè i pixel di tracciamento — vengono sostituite
//! da un segnaposto, a meno che l'utente non abbia chiesto di mostrarle.
//!
//! Il motore è il crate `ammonia`: parte già da un set di tag consentiti che
//! esclude `script`, `iframe`, `object`, `embed` e ogni gestore di evento. Qui
//! si aggiunge il blocco delle risorse remote, che ammonia non fa da sé.
//!
//! L'analisi delle immagini è fatta sui byte del testo: `ammonia` normalizza i
//! tag in minuscolo e gli attributi fra virgolette doppie, quindi la ricerca è
//! deterministica e non serve una seconda libreria HTML.

use ammonia::Builder;

/// Frammento HTML inserito al posto di un'immagine remota bloccata. La dicitura
/// è quella richiesta dalla spec: l'utente deve vedere che un'immagine esterna
/// è stata fermata, non un buco silenzioso.
pub const SEGNAPOSTO_IMMAGINE: &str =
    r#"<span class="immagine-esterna-bloccata">immagine esterna bloccata</span>"#;

/// Sanifica l'HTML di una mail.
///
/// Con `consenti_immagini_remote = false` (comportamento predefinito, opposto a
/// Outlook) le immagini con host remoto non vengono caricate: al loro posto
/// compare `SEGNAPOSTO_IMMAGINE`. Con `true` (pulsante "Mostra immagini")
/// l'immagine resta e il browser può richiederla — solo per quel messaggio.
pub fn sanifica(html: &str, consenti_immagini_remote: bool) -> String {
    let pulito = Builder::default()
        // Difensivo: questi tag non sono già nel set consentito, ma li elenchiamo
        // esplicitamente perché il loro *contenuto* venga rimosso, non solo il tag.
        .add_clean_content_tags(&["script", "style", "iframe", "object", "embed", "noscript"])
        .clean(html)
        .to_string();

    if consenti_immagini_remote {
        pulito
    } else {
        blocca_immagini_remote(&pulito)
    }
}

/// Sostituisce ogni `<img>` con `src` remoto (http/https o `//host`) con il
/// segnaposto. Le immagini con sorgente relativa o `data:` restano invariate.
fn blocca_immagini_remote(html: &str) -> String {
    let mut uscita = String::with_capacity(html.len());
    let mut resto = html;
    while let Some(pos) = trova_tag_img(resto) {
        uscita.push_str(&resto[..pos]);
        let (tag, dopo) = estrai_tag(&resto[pos..]);
        if src_remoto(tag) {
            uscita.push_str(SEGNAPOSTO_IMMAGINE);
        } else {
            uscita.push_str(tag);
        }
        resto = dopo;
    }
    uscita.push_str(resto);
    uscita
}

/// Posizione del primo `<img` (confine rispettato: non `<image` né `<imgx`).
fn trova_tag_img(s: &str) -> Option<usize> {
    let b = s.as_bytes();
    if b.len() < 4 {
        return None;
    }
    let mut i = 0;
    while i + 4 <= b.len() {
        if b[i] == b'<'
            && (b[i + 1] | 0x20) == b'i'
            && (b[i + 2] | 0x20) == b'm'
            && (b[i + 3] | 0x20) == b'g'
        {
            // Dopo "img" deve esserci uno spazio, uno slash o la fine del tag.
            let dopo = i + 4;
            let ok = dopo >= b.len() || matches!(b[dopo], b' ' | b'\t' | b'\n' | b'\r' | b'>' | b'/');
            if ok {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

/// Divide `<img ...>` in (tag, resto). `s` deve iniziare con `<`.
fn estrai_tag(s: &str) -> (&str, &str) {
    match s.find('>') {
        Some(pos) => (&s[..=pos], &s[pos + 1..]),
        None => (s, ""),
    }
}

/// Vero se il tag `<img ...>` punta a una risorsa remota.
fn src_remoto(tag: &str) -> bool {
    match valore_attributo(tag, "src") {
        Some(v) => {
            let v = v.trim().to_ascii_lowercase();
            v.starts_with("http://") || v.starts_with("https://") || v.starts_with("//")
        }
        // Senza `src` non parte nessuna richiesta: niente da bloccare.
        None => false,
    }
}

/// Legge il valore di un attributo (con virgolette doppie, singole o senza).
/// L'attributo deve cominciare a un confine (dopo spazio o subito dopo `<`),
/// così `src` non viene confuso con `data-src`.
fn valore_attributo(tag: &str, attributo: &str) -> Option<String> {
    let minuscole = tag.to_ascii_lowercase();
    let mut da = 0;
    while let Some(rel) = minuscole[da..].find(attributo) {
        let i = da + rel;
        let prima_ok = i == 0
            || matches!(minuscole.as_bytes()[i - 1], b' ' | b'\t' | b'\n' | b'\r' | b'<');
        let dopo = i + attributo.len();
        if prima_ok && minuscole.as_bytes().get(dopo) == Some(&b'=') {
            let grezzo = tag[dopo + 1..].trim_start();
            let (apice, resto) = match grezzo.as_bytes().first() {
                Some(b'"') => (Some('"'), &grezzo[1..]),
                Some(b'\'') => (Some('\''), &grezzo[1..]),
                _ => (None, grezzo),
            };
            let fine = match apice {
                Some(q) => resto.find(q).unwrap_or(resto.len()),
                None => resto
                    .find(|c: char| c.is_whitespace() || c == '>')
                    .unwrap_or(resto.len()),
            };
            return Some(resto[..fine].to_string());
        }
        da = i + 1;
    }
    None
}
