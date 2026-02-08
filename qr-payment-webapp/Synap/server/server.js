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

// --- STATO GLOBALE ---
const activeTrips = {}; 
const serverLogs = [];

let client = null;
let busKeypair = null;

// --- CONFIGURAZIONE PERSISTENTE ---
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { costPerSecond: 0.01 };
    }
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

let appConfig = loadConfig();
let COSTO_AL_SECONDO = appConfig.costPerSecond;

// --- LOGGING ---
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMsg = `[${timestamp}] ${message}`;
    console.log(formattedMsg);
    serverLogs.push(formattedMsg);
    if (serverLogs.length > 50) serverLogs.shift();
}

// --- UTILITY DATABASE ---
function loadUsers() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8');
        return JSON.parse(data);
    } catch (e) { return []; }
}

function saveUsers(users) {
    fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2));
}

function generateMockMnemonic() {
    const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa", "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey", "xray"];
    let mnemonic = [];
    for(let i=0; i<12; i++) {
        mnemonic.push(words[Math.floor(Math.random() * words.length)]);
    }
    return mnemonic.join(" ");
}

async function init() {
    log("-----------------------------------------");
    log("🏦 SERVER BANCA AVVIATO (FULL FEATURES)");
    log(`⚙️  Tariffa caricata: ${COSTO_AL_SECONDO} IOTA/sec`);
    log("-----------------------------------------");
    client = new IotaClient({ url: NODE_URL });
    busKeypair = Ed25519Keypair.deriveKeypair(MNEMONIC_BUS);
    log(`👮 CONTO AZIENDA (Bus): ${busKeypair.getPublicKey().toIotaAddress()}`);
}
init();

// --- API ADMIN ---
app.get('/api/admin/config', (req, res) => res.json({ costPerSecond: COSTO_AL_SECONDO }));
app.post('/api/admin/config', (req, res) => {
    const { costPerSecond } = req.body;
    if (costPerSecond && costPerSecond > 0) {
        COSTO_AL_SECONDO = costPerSecond;
        saveConfig({ costPerSecond: COSTO_AL_SECONDO });
        log(`⚙️ TARIFFA AGGIORNATA: ${COSTO_AL_SECONDO} IOTA/sec`);
        res.json({ ok: true });
    } else res.status(400).json({ error: "Valore invalido" });
});
app.get('/api/admin/logs', (req, res) => res.json({ logs: serverLogs }));

// --- API UTENTE ---

// 1. REGISTRAZIONE (Con generazione Wallet reale)
app.post('/api/auth/register', (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: "Dati mancanti" });

        const users = loadUsers();
        if (users.find(u => u.email === email)) return res.status(400).json({ error: "Email già in uso" });

        const newMnemonic = generateMockMnemonic();
        const userKeypair = Ed25519Keypair.deriveKeypair(newMnemonic);
        const userAddress = userKeypair.getPublicKey().toIotaAddress();

        const newUser = {
            email, password, name,
            mnemonic: newMnemonic,
            address: userAddress,
            debt: 0 
        };

        users.push(newUser);
        saveUsers(users);
        log(`🆕 Nuovo Utente: ${name}`);
        log(`👛 Wallet Creato: ${userAddress}`);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: "Errore server" });
    }
});

// 2. LOGIN
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        log(`🔑 Login: ${user.name}`);
        res.json({ token: "token-" + Date.now(), user: user.name, email: user.email });
    } else {
        res.status(401).json({ error: "Credenziali errate" });
    }
});

// 3. START TRIP (Salva Passeggeri + Blocco Debito)
app.post('/api/trip/start', (req, res) => {
    const { qrData, email, passengers } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.email === email);

    if (!user) return res.status(404).json({ error: "Utente sconosciuto" });

    // BLOCCO DEBITO
    if (user.debt && user.debt > 0.001) { 
        log(`⛔ Check-in bloccato per ${user.name}: Debito ${user.debt}`);
        return res.status(403).json({ 
            error: "DEBITO_PENDENTE", 
            message: `Hai un debito di ${user.debt} IOTA. Saldalo per viaggiare.` 
        });
    }

    const tripId = "TRIP-" + Date.now();
    activeTrips[tripId] = {
        startTime: Date.now(),
        passengers: passengers || 1
    };
    
    log(`⏱️ Start Viaggio: ${tripId} | Passeggeri: ${passengers || 1}`);
    res.json({ tripId: tripId, status: "STARTED" });
});

// 4. END TRIP (Calcolo x Passeggeri + Prelievo Totale)
app.post('/api/trip/end', async (req, res) => {
    try {
        const { email, tripId } = req.body; 
        
        // Recupero dati viaggio
        const tripData = activeTrips[tripId];
        let durationSeconds = 10;
        let passengerCount = 1;

        if (tripData) {
            durationSeconds = Math.floor((Date.now() - tripData.startTime) / 1000);
            passengerCount = tripData.passengers || 1;
            delete activeTrips[tripId];
        }

        // Calcolo Costo Totale (Durata * Costo * Passeggeri)
        let tripCost = (durationSeconds * COSTO_AL_SECONDO) * passengerCount;
        tripCost = Math.round(tripCost * 100) / 100;
        if (tripCost < 0.01) tripCost = 0.01;

        const users = loadUsers();
        const userIndex = users.findIndex(u => u.email === email);
        if (userIndex === -1) throw new Error("Utente non trovato");
        
        const user = users[userIndex];
        const previousDebt = user.debt || 0;
        const totalAmountDue = tripCost + previousDebt;

        log(`🧾 Conto: ${tripCost} (Viaggio x${passengerCount}) + ${previousDebt} (Debito) = ${totalAmountDue}`);

        // Controllo Saldo
        const userKeypair = Ed25519Keypair.deriveKeypair(user.mnemonic);
        const balances = await client.getAllBalances({ owner: userKeypair.getPublicKey().toIotaAddress() });
        const walletBalanceNano = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
        const totalDueNano = Math.floor(totalAmountDue * 1_000_000_000);
        
        let amountToPayNano = 0;
        let newDebtAmount = 0;
        let txDigest = null;

        if (walletBalanceNano >= totalDueNano) {
            amountToPayNano = totalDueNano;
            newDebtAmount = 0;
            log(`✅ Saldo sufficiente.`);
        } else {
            amountToPayNano = walletBalanceNano;
            const paidIota = amountToPayNano / 1_000_000_000;
            newDebtAmount = totalAmountDue - paidIota;
            newDebtAmount = Math.round(newDebtAmount * 100) / 100;
            log(`⚠️ SALDO BASSO! Prelevo tutto (${paidIota}). Nuovo Debito: ${newDebtAmount}`);
        }

        if (amountToPayNano > 0) {
            const tx = new Transaction();
            const [coin] = tx.splitCoins(tx.gas, [amountToPayNano]); 
            tx.transferObjects([coin], busKeypair.getPublicKey().toIotaAddress());
            const result = await client.signAndExecuteTransaction({ signer: userKeypair, transaction: tx });
            txDigest = result.digest;
        }

        users[userIndex].debt = newDebtAmount;
        saveUsers(users);

        res.json({ 
            ok: true, 
            cost: tripCost.toFixed(2), 
            paid: (amountToPayNano / 1_000_000_000).toFixed(2),
            debt: newDebtAmount.toFixed(2),
            message: newDebtAmount > 0 ? `Pagamento parziale` : `Pagamento completo`,
            explorerUrl: txDigest ? `${EXPLORER_URL}${txDigest}?network=testnet` : null
        });

    } catch (e) {
        log(`❌ ERRORE: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// 5. GET SALDO
app.post('/api/user/balance', async (req, res) => {
    try {
        const { email } = req.body;
        const users = loadUsers();
        const user = users.find(u => u.email === email);
        if (!user) return res.status(404).json({ error: "No user" });

        const userKeypair = Ed25519Keypair.deriveKeypair(user.mnemonic);
        const balances = await client.getAllBalances({ owner: userKeypair.getPublicKey().toIotaAddress() });
        const totalBalance = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
        
        res.json({ 
            balance: (totalBalance / 1_000_000_000).toFixed(2),
            debt: (user.debt || 0).toFixed(2)
        });
    } catch (e) {
        res.status(500).json({ error: "Errore saldo" });
    }
});

// 6. PAGA DEBITO MANUALE
app.post('/api/user/pay-debt', async (req, res) => {
    try {
        const { email } = req.body;
        const users = loadUsers();
        const userIndex = users.findIndex(u => u.email === email);
        if (userIndex === -1) return res.status(404).json({ error: "Utente non trovato" });
        const user = users[userIndex];

        if (!user.debt || user.debt <= 0) return res.status(400).json({ error: "Nessun debito!" });

        const userKeypair = Ed25519Keypair.deriveKeypair(user.mnemonic);
        const balances = await client.getAllBalances({ owner: userKeypair.getPublicKey().toIotaAddress() });
        const walletBalanceNano = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
        const walletBalance = walletBalanceNano / 1_000_000_000;

        if (walletBalance <= 0) return res.status(400).json({ error: "Wallet vuoto!" });

        let amountToPay = Math.min(walletBalance, user.debt);
        amountToPay = Math.floor(amountToPay * 100) / 100; // Tronca a 2 decimali per sicurezza
        
        if (amountToPay < 0.01) return res.status(400).json({ error: "Saldo troppo basso." });

        log(`💸 Pagamento debito manuale: ${user.name} paga ${amountToPay}`);

        const amountNano = Math.floor(amountToPay * 1_000_000_000);
        const tx = new Transaction();
        const [coin] = tx.splitCoins(tx.gas, [amountNano]);
        tx.transferObjects([coin], busKeypair.getPublicKey().toIotaAddress());

        await client.signAndExecuteTransaction({ signer: userKeypair, transaction: tx });

        user.debt -= amountToPay;
        if (user.debt < 0.01) user.debt = 0;
        user.debt = Math.round(user.debt * 100) / 100;
        
        saveUsers(users);

        res.json({ 
            ok: true, 
            paid: amountToPay.toFixed(2),
            remainingDebt: user.debt.toFixed(2),
            message: `Pagati ${amountToPay} IOTA.`
        });

    } catch (e) {
        log(`❌ Errore Pay Debt: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    log(`🌍 SERVER PRONTO: http://localhost:${PORT}`);
    log(`⚙️  DASHBOARD ADMIN: http://localhost:${PORT}/admin.html`);
});