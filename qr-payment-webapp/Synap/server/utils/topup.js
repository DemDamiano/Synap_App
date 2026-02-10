// server/topup.js

import { IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { Transaction } from '@iota/iota-sdk/transactions';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURAZIONE ---
const NODE_URL = 'https://api.testnet.iota.cafe';
const EXPLORER_URL = 'https://explorer.rebased.iota.org/txblock/';

// LA FRASE SEGRETA DEL BUS (Colui che paga)
const MNEMONIC_BUS = "eternal clutch lock tunnel carpet dial repair popular exist monkey turkey bubble";

// IMPORTO DA INVIARE (es. 100 IOTA)
const AMOUNT_IOTA = 10; 

// --- SETUP INIZIALE ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new IotaClient({ url: NODE_URL });

// Funzione per caricare gli utenti
function loadUsers() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("❌ Errore: Impossibile leggere users.json");
        process.exit(1);
    }
}

async function run() {
    // 1. Legge l'email passata come argomento da terminale
    const targetEmail = process.argv[2];

    if (!targetEmail) {
        console.log("\n⚠️  USO: node topup.js <email_utente>");
        console.log("   Esempio: node topup.js damiano@demo.com\n");
        process.exit(0);
    }

    // 2. Cerca l'utente
    const users = loadUsers();
    const user = users.find(u => u.email === targetEmail);

    if (!user) {
        console.error(`❌ Errore: Nessun utente trovato con email "${targetEmail}"`);
        process.exit(1);
    }

    console.log(`\n🔄 Avvio ricarica per: ${user.name} (${user.email})...`);

    try {
        // 3. Prepara il Wallet del BUS (Mittente)
        const busKeypair = Ed25519Keypair.deriveKeypair(MNEMONIC_BUS);
        const busAddress = busKeypair.getPublicKey().toIotaAddress();
        
        // Controlla se il Bus ha soldi
        const balances = await client.getAllBalances({ owner: busAddress });
        const totalBusBalance = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
        const amountNano = AMOUNT_IOTA * 1_000_000_000;

        console.log(`🏦 Saldo Azienda (Bus): ${(totalBusBalance / 1_000_000_000).toFixed(2)} IOTA`);

        if (totalBusBalance < amountNano) {
            console.error("❌ ERRORE: Il conto del Bus è vuoto! Ricaricalo dal Faucet IOTA.");
            console.log(`👉 Indirizzo Bus: ${busAddress}`);
            process.exit(1);
        }

        // 4. Prepara l'indirizzo dell'Utente (Destinatario)
        const userKeypair = Ed25519Keypair.deriveKeypair(user.mnemonic);
        const userAddress = userKeypair.getPublicKey().toIotaAddress();

        // 5. Esegui la transazione
        console.log(`💸 Invio ${AMOUNT_IOTA} IOTA a ${userAddress}...`);

        const tx = new Transaction();
        const [coin] = tx.splitCoins(tx.gas, [amountNano]);
        tx.transferObjects([coin], userAddress);

        const result = await client.signAndExecuteTransaction({
            signer: busKeypair,
            transaction: tx,
        });

        console.log(`✅ SUCCESSO! Transazione completata.`);
        console.log(`🔗 Explorer: ${EXPLORER_URL}${result.digest}?network=testnet\n`);

    } catch (e) {
        console.error("❌ Errore durante la transazione:", e.message);
    }
}

run();