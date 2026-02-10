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

// --- GLOBAL STATE ---
const activeTrips = {}; 
let tripHistory = [];   
const serverLogs = [];  

let client = null;
let busKeypair = null;

// ==========================================
//        FILE MANAGEMENT (JSON DB)
// ==========================================

const CONFIG_FILE = path.join(__dirname, 'config.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const ROUTES_FILE = path.join(__dirname, 'routes.json'); 

// CONFIGURATION
function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } 
    catch (e) { return { costPerSecond: 0.01, currentRouteId: null }; }
}
function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// USERS
function loadUsers() {
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) { return []; }
}
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// HISTORY
function loadTripHistory() {
    try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch (e) { return []; }
}
function saveTripHistory(history) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ROUTES
function loadRoutes() {
    try { return JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')); } catch (e) { return []; }
}
function saveRoutes(routes) {
    fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2));
}

// --- INITIAL LOAD ---
let appConfig = loadConfig();
let COSTO_AL_SECONDO = appConfig.costPerSecond;
let CURRENT_ROUTE_ID = appConfig.currentRouteId || null;
tripHistory = loadTripHistory();

// Helper to get route name
function getCurrentRouteName() {
    const routes = loadRoutes();
    const route = routes.find(r => r.id === CURRENT_ROUTE_ID);
    return route ? route.name : "Manual Rate";
}

// --- LOGGING ---
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMsg = `[${timestamp}] ${message}`;
    console.log(formattedMsg);
    serverLogs.push(formattedMsg);
    if (serverLogs.length > 50) serverLogs.shift();
}

function generateMockMnemonic() {
    const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa", "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey", "xray"];
    let mnemonic = [];
    for(let i=0; i<12; i++) { mnemonic.push(words[Math.floor(Math.random() * words.length)]); }
    return mnemonic.join(" ");
}

async function init() {
    log("-----------------------------------------");
    log("🚌 BUS SERVER");
    log(`✅  Active Route: ${getCurrentRouteName()} (${COSTO_AL_SECONDO} IOTA/s)`);
    log("-----------------------------------------");
    client = new IotaClient({ url: NODE_URL });
    busKeypair = Ed25519Keypair.deriveKeypair(MNEMONIC_BUS);
    log(`👮 COMPANY ACCOUNT: ${busKeypair.getPublicKey().toIotaAddress()}`);
}
init();

// ==========================================
//               ADMIN API
// ==========================================

app.get('/api/admin/dashboard', (req, res) => {
    const activeList = Object.keys(activeTrips).map(id => {
        const trip = activeTrips[id];
        const duration = Math.floor((Date.now() - trip.startTime) / 1000);
        const tripRate = trip.rate || COSTO_AL_SECONDO;
        const currentCost = (duration * tripRate * trip.passengers).toFixed(2);
        
        return {
            id,
            user: trip.userName,
            email: trip.userEmail,
            passengers: trip.passengers,
            startTime: trip.startTime,
            duration: duration,
            currentCost: currentCost,
            routeName: trip.routeName
        };
    });

    res.json({
        config: { 
            costPerSecond: COSTO_AL_SECONDO,
            currentRouteId: CURRENT_ROUTE_ID,
            currentRouteName: getCurrentRouteName()
        },
        activeTrips: activeList,
        history: tripHistory.slice().reverse(),
        logs: serverLogs,
        routes: loadRoutes()
    });
});

app.post('/api/admin/config', (req, res) => {
    const { costPerSecond, routeId } = req.body;
    
    if (costPerSecond && costPerSecond > 0) {
        COSTO_AL_SECONDO = costPerSecond;
        CURRENT_ROUTE_ID = routeId || null; 
        
        saveConfig({ 
            costPerSecond: COSTO_AL_SECONDO,
            currentRouteId: CURRENT_ROUTE_ID
        });

        const routeName = getCurrentRouteName();
        log(`⚙️ CONFIG CHANGE: ${routeName} -> ${COSTO_AL_SECONDO} IOTA/sec`);
        res.json({ ok: true });
    } else res.status(400).json({ error: "Invalid value" });
});

app.post('/api/admin/routes', (req, res) => {
    const { name, cost } = req.body;
    if(!name || !cost) return res.status(400).json({error: "Missing data"});
    
    const routes = loadRoutes();
    const newRoute = {
        id: "route-" + Date.now(),
        name,
        costPerSecond: parseFloat(cost)
    };
    
    routes.push(newRoute);
    saveRoutes(routes);
    log(`🛣️ New Route Created: ${name}`);
    res.json({ ok: true, route: newRoute });
});

app.delete('/api/admin/routes/:id', (req, res) => {
    const routes = loadRoutes();
    const newRoutes = routes.filter(r => r.id !== req.params.id);
    saveRoutes(newRoutes);
    log(`🗑️ Route Deleted`);
    res.json({ ok: true });
});

app.get('/api/admin/logs', (req, res) => res.json({ logs: serverLogs }));


// ==========================================
//               USER API
// ==========================================

app.post('/api/auth/register', (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: "Missing data" });
        const users = loadUsers();
        if (users.find(u => u.email === email)) return res.status(400).json({ error: "Email already in use" });

        const newMnemonic = generateMockMnemonic();
        const userKeypair = Ed25519Keypair.deriveKeypair(newMnemonic);
        const userAddress = userKeypair.getPublicKey().toIotaAddress();

        users.push({ email, password, name, mnemonic: newMnemonic, address: userAddress, debt: 0 });
        saveUsers(users);
        log(`🆕 New User: ${name}`);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        log(`🔑 Login: ${user.name}`);
        res.json({ token: "token-" + Date.now(), user: user.name, email: user.email });
    } else res.status(401).json({ error: "Invalid credentials" });
});

app.post('/api/trip/start', (req, res) => {
    const { qrData, email, passengers } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.email === email);

    if (!user) return res.status(404).json({ error: "User unknown" });

    if (user.debt && user.debt > 0.001) { 
        log(`⛔ Check-in blocked for ${user.name}: Debt ${user.debt}`);
        return res.status(403).json({ 
            error: "PENDING_DEBT", 
            message: `You have a debt of ${user.debt} IOTA. Please settle it to travel.` 
        });
    }

    const tripId = "TRIP-" + Date.now();
    const currentRouteName = getCurrentRouteName(); 

    activeTrips[tripId] = {
        startTime: Date.now(),
        passengers: passengers || 1,
        userName: user.name,
        userEmail: user.email,
        rate: COSTO_AL_SECONDO,
        routeName: currentRouteName
    };
    
    log(`➡️ ENTRY: ${user.name} | Route: ${currentRouteName} | Pax: ${passengers || 1}`);
    
    res.json({ 
        tripId: tripId, 
        status: "STARTED",
        routeName: currentRouteName 
    });
});

app.post('/api/trip/end', async (req, res) => {
    try {
        const { email, tripId } = req.body; 
        
        const tripData = activeTrips[tripId];
        let durationSeconds = 0;
        let passengerCount = 1;
        let tripRate = COSTO_AL_SECONDO;
        let routeName = "Unknown";
        let startTime = Date.now();

        if (tripData) {
            startTime = tripData.startTime;
            durationSeconds = Math.floor((Date.now() - startTime) / 1000);
            passengerCount = tripData.passengers || 1;
            tripRate = tripData.rate || COSTO_AL_SECONDO;
            routeName = tripData.routeName || getCurrentRouteName();
        }

        let tripCost = (durationSeconds * tripRate) * passengerCount;
        tripCost = Math.round(tripCost * 100) / 100;
        if (tripCost < 0.01) tripCost = 0.01;

        const users = loadUsers();
        const userIndex = users.findIndex(u => u.email === email);
        if (userIndex === -1) throw new Error("User not found");
        const user = users[userIndex];
        const previousDebt = user.debt || 0;
        const totalAmountDue = tripCost + previousDebt;

        const userKeypair = Ed25519Keypair.deriveKeypair(user.mnemonic);
        const balances = await client.getAllBalances({ owner: userKeypair.getPublicKey().toIotaAddress() });
        const walletBalanceNano = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
        const totalDueNano = Math.floor(totalAmountDue * 1_000_000_000);
        
        let amountToPayNano = 0;
        let newDebtAmount = 0;
        let paymentStatus = "FULL";

        if (walletBalanceNano >= totalDueNano) {
            amountToPayNano = totalDueNano;
        } else {
            amountToPayNano = walletBalanceNano;
            const paidIota = amountToPayNano / 1_000_000_000;
            newDebtAmount = totalAmountDue - paidIota;
            newDebtAmount = Math.round(newDebtAmount * 100) / 100;
            paymentStatus = "PARTIAL/DEBT";
        }

        let txDigest = null;
        if (amountToPayNano > 0) {
            const tx = new Transaction();
            const [coin] = tx.splitCoins(tx.gas, [amountToPayNano]); 
            tx.transferObjects([coin], busKeypair.getPublicKey().toIotaAddress());
            const result = await client.signAndExecuteTransaction({ signer: userKeypair, transaction: tx });
            txDigest = result.digest;
        }

        users[userIndex].debt = newDebtAmount;
        saveUsers(users);

        log(`⬅️ EXIT: ${user.name}. Route: ${routeName}. Total: ${tripCost}`);

        if (tripData) {
            const newHistoryEntry = {
                user: user.name,
                route: routeName, 
                startTime: new Date(startTime).toLocaleTimeString(),
                endTime: new Date().toLocaleTimeString(),
                duration: durationSeconds,
                passengers: passengerCount,
                cost: tripCost.toFixed(2),
                status: paymentStatus,
                tx: txDigest ? txDigest.substring(0, 8) + '...' : 'N/A'
            };
            tripHistory.push(newHistoryEntry);
            if (tripHistory.length > 500) tripHistory.shift();
            saveTripHistory(tripHistory);
            delete activeTrips[tripId];
        }

        res.json({ 
            ok: true, 
            cost: tripCost.toFixed(2), 
            paid: (amountToPayNano / 1_000_000_000).toFixed(2),
            debt: newDebtAmount.toFixed(2),
            explorerUrl: txDigest ? `${EXPLORER_URL}${txDigest}?network=testnet` : null
        });

    } catch (e) {
        log(`❌ ERROR: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/user/balance', async (req, res) => {
    try {
        const { email } = req.body;
        const users = loadUsers();
        const user = users.find(u => u.email === email);
        if (!user) return res.status(404).json({ error: "No user" });
        const userKeypair = Ed25519Keypair.deriveKeypair(user.mnemonic);
        const balances = await client.getAllBalances({ owner: userKeypair.getPublicKey().toIotaAddress() });
        const totalBalance = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
        res.json({ balance: (totalBalance / 1e9).toFixed(2), debt: (user.debt || 0).toFixed(2) });
    } catch (e) { res.status(500).json({ error: "Balance error" }); }
});

app.post('/api/user/pay-debt', async (req, res) => {
   try {
        const { email } = req.body;
        const users = loadUsers();
        const userIndex = users.findIndex(u => u.email === email);
        if (userIndex === -1) return res.status(404).json({ error: "User not found" });
        const user = users[userIndex];
        if (!user.debt || user.debt <= 0) return res.status(400).json({ error: "No debt!" });
        const userKeypair = Ed25519Keypair.deriveKeypair(user.mnemonic);
        const balances = await client.getAllBalances({ owner: userKeypair.getPublicKey().toIotaAddress() });
        const walletBalanceNano = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
        const walletBalance = walletBalanceNano / 1e9;
        if (walletBalance <= 0) return res.status(400).json({ error: "Empty Wallet!" });
        let amountToPay = Math.min(walletBalance, user.debt);
        amountToPay = Math.floor(amountToPay * 100) / 100; 
        if (amountToPay < 0.01) return res.status(400).json({ error: "Balance too low." });
        log(`💸 Manual Debt Payment: ${user.name} paying ${amountToPay}`);
        const amountNano = Math.floor(amountToPay * 1e9);
        const tx = new Transaction();
        const [coin] = tx.splitCoins(tx.gas, [amountNano]);
        tx.transferObjects([coin], busKeypair.getPublicKey().toIotaAddress());
        await client.signAndExecuteTransaction({ signer: userKeypair, transaction: tx });
        user.debt -= amountToPay;
        if (user.debt < 0.01) user.debt = 0;
        user.debt = Math.round(user.debt * 100) / 100;
        saveUsers(users);
        res.json({ ok: true, paid: amountToPay.toFixed(2), remainingDebt: user.debt.toFixed(2), message: `Paid ${amountToPay} IOTA.` });
    } catch (e) {
        log(`❌ Debt Pay Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    log(`🌍 SERVER READY: http://localhost:${PORT}`);
    log(`⚙️  ADMIN DASHBOARD: http://localhost:${PORT}/admin.html`);
});