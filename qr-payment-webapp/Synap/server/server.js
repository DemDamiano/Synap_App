import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs'; 
import { fileURLToPath } from 'url';
import { IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { Transaction } from '@iota/iota-sdk/transactions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

const PORT = 3000;
const NODE_URL = 'https://api.testnet.iota.cafe'; 
const EXPLORER_URL = 'https://explorer.rebased.iota.org/txblock/';

const MNEMONIC_BUS = "eternal clutch lock tunnel carpet dial repair popular exist monkey turkey bubble";

// --- CONFIGURAZIONE COSTI ---
const activeTrips = {}; // Memoria RAM dei viaggi (ID -> Timestamp Inizio)
const COSTO_AL_SECONDO = 0.01; // 1 centesimo di IOTA al secondo

let client = null;
let busKeypair = null;

function loadUsers() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

async function init() {
    console.log("-----------------------------------------");
    console.log("🏦 SERVER BANCA AVVIATO (DYNAMIC PRICING)");
    console.log("-----------------------------------------");

    client = new IotaClient({ url: NODE_URL });
    busKeypair = Ed25519Keypair.deriveKeypair(MNEMONIC_BUS);
    
    console.log(`👮 CONTO AZIENDA (Bus): ${busKeypair.getPublicKey().toIotaAddress()}`);
}

init();

// --- API ---

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const users = loadUsers();
    
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        console.log(`🔑 Login: ${user.name}`);
        res.json({ 
            token: "token-" + Date.now(), 
            user: user.name,
            email: user.email 
        });
    } else {
        res.status(401).json({ error: "Email o password errati" });
    }
});

// 1. INIZIO VIAGGIO (Salviamo l'ora esatta)
app.post('/api/trip/start', (req, res) => {
    const tripId = "TRIP-" + Date.now();
    
    // MEMORIZZIAMO QUANDO È INIZIATO IL VIAGGIO
    activeTrips[tripId] = Date.now();
    
    console.log(`⏱️ Start Viaggio: ${tripId} alle ${new Date().toLocaleTimeString()}`);
    res.json({ tripId: tripId, status: "STARTED" });
});

// 2. FINE VIAGGIO (Calcolo Costo Reale)
app.post('/api/trip/end', async (req, res) => {
    try {
        const { email, tripId } = req.body; 
        
        // RECUPERO TEMPO
        const startTime = activeTrips[tripId];
        let durationSeconds = 0;
        
        if (startTime) {
            const endTime = Date.now();
            durationSeconds = Math.floor((endTime - startTime) / 1000);
            delete activeTrips[tripId]; // Puliamo la memoria
        } else {
            console.log("⚠️ Viaggio non trovato (restart server?), uso durata default.");
            durationSeconds = 10; 
        }

        // CALCOLO COSTO
        let costAmount = durationSeconds * COSTO_AL_SECONDO;
        costAmount = Math.round(costAmount * 100) / 100; // Arrotonda a 2 decimali
        if (costAmount < 0.01) costAmount = 0.01; // Minimo sindacale

        console.log(`\n💸 Pagamento da: ${email}`);
        console.log(`⏱️ Durata: ${durationSeconds}s | Costo: ${costAmount} IOTA`);

        // GESTIONE PAGAMENTO
        const users = loadUsers();
        const payingUser = users.find(u => u.email === email);
        if (!payingUser) throw new Error("Utente non trovato");

        const userKeypair = Ed25519Keypair.deriveKeypair(payingUser.mnemonic);
        const userAddress = userKeypair.getPublicKey().toIotaAddress();

        // Controllo fondi
        const balances = await client.getAllBalances({ owner: userAddress });
        const totalNanoIota = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
        
        // Conversione IOTA -> NanoIOTA
        const costInNano = Math.floor(costAmount * 1_000_000_000);

        if (totalNanoIota < costInNano) {
             console.log("⚠️ Saldo basso, transazione a rischio...");
        }

        // TRANSAZIONE
        const tx = new Transaction();
        // Usiamo l'importo calcolato (costInNano), non più fisso!
        const [moneta] = tx.splitCoins(tx.gas, [costInNano]); 
        tx.transferObjects([moneta], busKeypair.getPublicKey().toIotaAddress());

        const result = await client.signAndExecuteTransaction({
            signer: userKeypair, 
            transaction: tx,
        });

        console.log(`✅ Transazione OK: ${result.digest}`);
        
        res.json({ 
            ok: true, 
            cost: costAmount.toFixed(2), 
            message: `Pagamento riuscito`,
            explorerUrl: `${EXPLORER_URL}${result.digest}?network=testnet`
        });

    } catch (e) {
        console.error("❌ ERRORE:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/user/balance', async (req, res) => {
    try {
        const { email } = req.body;
        const users = loadUsers();
        const user = users.find(u => u.email === email);
        if (!user) return res.status(404).json({ error: "Utente non trovato" });

        const userKeypair = Ed25519Keypair.deriveKeypair(user.mnemonic);
        const userAddress = userKeypair.getPublicKey().toIotaAddress();

        const balances = await client.getAllBalances({ owner: userAddress });
        const totalBalance = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
        const formattedBalance = (totalBalance / 1_000_000_000).toFixed(2);
        
        res.json({ balance: formattedBalance });
    } catch (e) {
        console.error("Errore saldo:", e);
        res.status(500).json({ error: "Errore recupero saldo" });
    }
});

app.listen(PORT, () => {
    console.log(`\n🌍 SERVER PRONTO: http://localhost:${PORT}`);
});