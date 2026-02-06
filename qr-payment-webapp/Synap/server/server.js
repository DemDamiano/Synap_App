import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { Transaction } from '@iota/iota-sdk/transactions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
// Serviamo il Client (Il Passeggero)
app.use(express.static(path.join(__dirname, '../client')));

const PORT = 3000;
const NODE_URL = 'https://api.testnet.iota.cafe'; 
const EXPLORER_URL = 'https://explorer.rebased.iota.org/txblock/';

// --- I DUE ATTORI ---

// 1. IL BUS (IL SERVER - RICEVE I SOLDI)
// Usa la tua frase originale (quella che ha già i fondi per il gas)
const MNEMONIC_BUS = "eternal clutch lock tunnel carpet dial repair popular exist monkey turkey bubble";

// 2. IL PASSEGGERO (IL CLIENT - PAGA IL BIGLIETTO)
// Questa è la frase del passeggero. Deve avere fondi per pagare!
const MNEMONIC_PASSENGER = "organ screen story car during scavenge rigid box confirm old huge wealth";

let client = null;
let busKeypair = null;      // Il Wallet del Bus
let passengerKeypair = null; // Il Wallet del Passeggero

async function init() {
    console.log("-----------------------------------------");
    console.log("🚌 AVVIO SERVER (IL BUS)");
    console.log("-----------------------------------------");

    try {
        client = new IotaClient({ url: NODE_URL });

        // Carichiamo i due attori
        busKeypair = Ed25519Keypair.deriveKeypair(MNEMONIC_BUS);
        passengerKeypair = Ed25519Keypair.deriveKeypair(MNEMONIC_PASSENGER);

        const busAddress = busKeypair.getPublicKey().toIotaAddress();
        const passengerAddress = passengerKeypair.getPublicKey().toIotaAddress();

        console.log(`👮 AUTISTA (IO):      ${busAddress}`); // Il Server
        console.log(`🧍 PASSEGGERO (LUI):  ${passengerAddress}`); // Il Client

        // Controlliamo se il Passeggero ha i soldi per pagare
        const balances = await client.getAllBalances({ owner: passengerAddress });
        const totalBalance = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
        
        console.log(`💰 Saldo Passeggero:  ${totalBalance / 1_000_000_000} IOTA`);

        if (totalBalance < 1000000000) {
            console.warn("⚠️  ATTENZIONE: Il passeggero è povero! Esegui il comando faucet qui sotto:");
            console.log(`iota client faucet --address ${passengerAddress}`);
        } else {
            console.log("✅ Il Passeggero ha i fondi. Pronto a incassare.");
        }

    } catch (e) {
        console.error("❌ ERRORE AVVIO:", e);
    }
}

init();

// --- API ---

// Login fittizio
app.post('/api/auth/login', (req, res) => {
    res.json({ token: "token-passeggero", user: "Mario Rossi" });
});

// Inizio corsa
app.post('/api/trip/start', (req, res) => {
    res.json({ tripId: "TRIP-" + Date.now(), status: "STARTED" });
});

// FINE CORSA = IL PASSEGGERO PAGA IL BUS
app.post('/api/trip/end', async (req, res) => {
    try {
        console.log(`\n💸 RICHIESTA DI PAGAMENTO RICEVUTA...`);

        // 1. Creiamo la transazione
        const tx = new Transaction();
        
        // 2. STABILIAMO IL PREZZO (1 IOTA)
        const prezzoBiglietto = 1000000000; // 1.00 IOTA
        
        // 3. PRENDIAMO I SOLDI DAL PASSEGGERO
        // tx.gas contiene i soldi del firmatario (Passeggero). Ne stacchiamo un pezzo.
        const [moneta] = tx.splitCoins(tx.gas, [prezzoBiglietto]);

        // 4. DIAMO QUEL PEZZO AL BUS
        const busAddress = busKeypair.getPublicKey().toIotaAddress();
        tx.transferObjects([moneta], busAddress);

        // 5. IL PASSEGGERO FIRMA (Simuliamo che abbia firmato dal telefono)
        const result = await client.signAndExecuteTransaction({
            signer: passengerKeypair, // <-- PAGA IL PASSEGGERO
            transaction: tx,
        });

        const txDigest = result.digest;
        console.log(`✅ INCASSO AVVENUTO CON SUCCESSO!`);
        console.log(`🔗 Ricevuta: ${txDigest}`);
        
        res.json({ 
            ok: true, 
            cost: "1.00",
            message: "Pagamento Ricevuto",
            explorerUrl: `${EXPLORER_URL}${txDigest}?network=testnet`
        });

    } catch (e) {
        console.error("❌ ERRORE PAGAMENTO:", e);
        res.status(500).json({ error: "Fondi insufficienti o errore rete" });
    }
});

app.listen(PORT, () => {
    console.log(`\n🌍 BUS IN SERVIZIO: http://localhost:${PORT}`);
});