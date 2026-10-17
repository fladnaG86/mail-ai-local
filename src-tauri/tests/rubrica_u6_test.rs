//! Blocco U6 — importazione dai Contatti di macOS: si chiede a Contatti la vCard
//! di tutte le schede (AppleScript) e la si passa all'importatore vCard. Qui si
//! provano le parti pure: lo script, la lettura degli errori di osascript e
//! l'importazione marcata «macos».

use outlook_ai_lib::contatti::{errore_contatti_macos, Contatto, SCRIPT_CONTATTI_MACOS};
use outlook_ai_lib::contatti_importa_testo_in;
use outlook_ai_lib::store::Store;
use tempfile::tempdir;

#[test]
fn lo_script_chiede_la_vcard_di_tutte_le_schede_in_un_colpo_solo() {
    let script = SCRIPT_CONTATTI_MACOS.join("\n");
    assert!(script.contains("tell application \"Contacts\""));
    assert!(script.contains("vcard of every person"));
    // Le schede si uniscono senza virgole: AppleScript separerebbe gli elementi
    // della lista con «, », rompendo le vCard.
    assert!(script.contains("text item delimiters"));
}

#[test]
fn senza_permesso_di_automazione_l_errore_dice_dove_darlo() {
    let m = errore_contatti_macos("execution error: Not authorized to send Apple events to Contacts. (-1743)");
    assert!(m.contains("Automazione"), "{m}");
    assert!(m.contains("Privacy e sicurezza"), "{m}");
}

#[test]
fn un_altro_errore_si_riporta_col_testo_di_osascript() {
    let m = errore_contatti_macos("execution error: Contacts got an error: something odd (-10000)");
    assert!(m.contains("something odd"), "{m}");
}

#[test]
fn le_schede_importate_da_macos_si_riconoscono() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("cache.db");
    let vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Bianchi;Luca;;;\r\nEMAIL:luca@esempiohost.it\r\nEND:VCARD\r\n\
               BEGIN:VCARD\r\nVERSION:3.0\r\nN:Senza;Posta;;;\r\nTEL:123\r\nEND:VCARD\r\n";
    let esito = contatti_importa_testo_in(&db, vcf, "macos").unwrap();
    assert_eq!((esito.importati, esito.senza_email), (1, 1));
    let c: Contatto = Store::open(&db).unwrap().contatti(None).unwrap().remove(0).into();
    assert_eq!(c.origine, "macos");
}
