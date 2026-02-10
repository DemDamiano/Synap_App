module Synap ::biglietteria {
    use iota::object::{Self, UID};
    use iota::transfer;
    use iota::tx_context::{Self, TxContext};
    use std::string::{Self, String};

    // L'oggetto Biglietto
    struct BigliettoBus has key, store {
        id: UID,
        prezzo: u64,
        codice_viaggio: String,
        proprietario: address
    }

    // Funzione per comprare il biglietto
    public entry fun compra_biglietto(
        codice: vector<u8>, 
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        let biglietto = BigliettoBus {
            id: object::new(ctx),
            prezzo: 1500000000, // 1.5 IOTA
            codice_viaggio: string::utf8(codice),
            proprietario: sender
        };

        transfer::transfer(biglietto, sender);
    }
}