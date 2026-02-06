// server/fund_bus.js
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';

// 1. Configurazione
const FAUCET_API = 'https://faucet.testnet.iota.cafe/gas';
const MNEMONIC_BUS = "eternal clutch lock tunnel carpet dial repair popular exist monkey turkey bubble";

async function fundBus() {
    // 2. Ricaviamo l'indirizzo del BUS dalla frase segreta
    const busKeypair = Ed25519Keypair.deriveKeypair(MNEMONIC_BUS);
    const busAddress = busKeypair.getPublicKey().toIotaAddress();

    console.log(`🤖 Chiedo fondi al Faucet per l'indirizzo BUS:`);
    console.log(`👉 ${busAddress}`);
    console.log("⏳ Attendi qualche secondo...");

    try {
        // 3. Chiamata API al Faucet (quello che vedevi nero con scritto OK)
        const response = await fetch(FAUCET_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                FixedAmountRequest: {
                    recipient: busAddress
                }
            })
        });

        if (response.status === 202) {
            console.log("\n✅ RICIESTA ACCETTATA! I fondi stanno arrivando.");
            console.log("   (Potrebbe volerci 1 minuto prima che siano visibili)");
        } else {
            const errorText = await response.text();
            console.log("\n❌ Errore Faucet:", errorText);
        }

    } catch (error) {
        console.error("\n❌ Errore di connessione:", error.message);
    }
}

fundBus();