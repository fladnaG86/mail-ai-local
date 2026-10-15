// Test del contesto del thread con budget di token (task 6.1, Milestone 6).
// Coprono: il rispetto del budget su un thread lungo, la presenza dei messaggi
// più recenti, l'esattezza del conteggio degli esclusi e l'assenza di esclusioni
// su un thread corto. Nessuna rete, tutto in memoria.
use outlook_ai_lib::ai::context::{costruisci, stima_token, MessaggioThread};

/// Thread di `n` messaggi in ordine cronologico (il più vecchio per primo), con
/// oggetti marcati a tre cifre (niente sottostringhe ambigue) e corpi lunghi.
fn thread_lungo(n: usize) -> Vec<MessaggioThread> {
    (0..n)
        .map(|i| MessaggioThread {
            da: format!("Collega {i} <c{i}@example.it>"),
            data: 1_700_000_000 + (i as i64) * 3_600,
            oggetto: Some(format!("Oggetto {i:03}")),
            testo: format!("{} messaggio numero {i}", "x".repeat(600)),
        })
        .collect()
}

#[test]
fn thread_lungo_resta_sotto_il_budget() {
    let msgs = thread_lungo(50);
    let ctx = costruisci(&msgs, 8000);
    assert!(
        stima_token(&ctx.testo) <= 8000,
        "il contesto deve restare sotto il budget di token (era {})",
        stima_token(&ctx.testo)
    );
    assert!(ctx.messaggi_inclusi < 50, "non può entrare tutto un thread lungo");
    assert!(ctx.esclusi > 0, "un thread lungo deve dichiarare delle esclusioni");
    assert_eq!(ctx.esclusi, 50 - ctx.messaggi_inclusi);
}

#[test]
fn i_messaggi_piu_recenti_sono_presenti_e_gli_esclusi_sono_esatti() {
    let msgs = thread_lungo(50);
    let ctx = costruisci(&msgs, 8000);

    // Il più recente c'è sempre.
    assert!(ctx.testo.contains("Oggetto 049"), "il messaggio più recente deve esserci");

    // Gli esclusi sono esattamente i più vecchi: il più vecchio incluso è il
    // messaggio numero `esclusi`, e il precedente non deve comparire.
    assert!(
        ctx.testo.contains(&format!("Oggetto {:03}", ctx.esclusi)),
        "il più vecchio incluso deve essere il messaggio {}",
        ctx.esclusi
    );
    if ctx.esclusi > 0 {
        assert!(
            !ctx.testo.contains(&format!("Oggetto {:03}", ctx.esclusi - 1)),
            "il messaggio {} doveva essere escluso",
            ctx.esclusi - 1
        );
    }
}

#[test]
fn thread_corto_non_esclude_nulla() {
    let msgs = thread_lungo(3);
    let ctx = costruisci(&msgs, 8000);
    assert_eq!(ctx.esclusi, 0, "un thread corto non deve escludere nulla");
    assert_eq!(ctx.messaggi_inclusi, 3);
    assert!(ctx.testo.contains("Oggetto 000"));
    assert!(ctx.testo.contains("Oggetto 002"));
}

#[test]
fn indici_numerati_dal_piu_vecchio_al_piu_recente() {
    let msgs = thread_lungo(3);
    let ctx = costruisci(&msgs, 8000);
    let p1 = ctx.testo.find("[1]").expect("indice 1");
    let p2 = ctx.testo.find("[2]").expect("indice 2");
    let p3 = ctx.testo.find("[3]").expect("indice 3");
    assert!(p1 < p2 && p2 < p3, "il thread va presentato dal più vecchio al più recente");
}

#[test]
fn thread_vuoto_produce_contesto_vuoto() {
    let ctx = costruisci(&[], 8000);
    assert_eq!(ctx.messaggi_inclusi, 0);
    assert_eq!(ctx.esclusi, 0);
    assert!(ctx.testo.is_empty());
}
