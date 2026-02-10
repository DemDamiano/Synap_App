import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// --- MODULI NOSTRI ---
import { log, getLogs, Colors as C } from './utils/logger.js';
import { Storage } from './services/storage.js';
import { IotaService } from './services/iota.js'; // <--- NUOVO IMPORT

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

const PORT = 3000;

// --- GLOBAL STATE ---
const activeTrips = {}; 
let tripHistory = Storage.loadHistory();

// --- CONFIG LOADING ---
let appConfig = Storage.loadConfig();
let COSTO_AL_SECONDO = appConfig.costPerSecond;
let CURRENT_ROUTE_ID = appConfig.currentRouteId || null;

// Helpers
function getCurrentRouteName() {
    const routes = Storage.loadRoutes();
    const route = routes.find(r => r.id === CURRENT_ROUTE_ID);
    return route ? route.name : "Manual Rate";
}

function shortAddr(addr) {
    if (!addr) return "Unknown";
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 6)}`;
}

// --- INIT SERVER ---
async function init() {
    // 1. Inizializza IOTA Service
    const iotaStatus = await IotaService.init();
    
    // 2. Grafica Console
    console.clear(); 
    const width = 60;
    const b = `${C.cyan}║${C.reset}`;
    const line = `${C.cyan}╠${"═".repeat(width)}╣${C.reset}`;
    const top = `${C.cyan}╔${"═".repeat(width)}╗${C.reset}`;
    const bot = `${C.cyan}╚${"═".repeat(width)}╝${C.reset}`;
    
    const row = (lbl, val, col = C.white) => {
        const txt = `   ${lbl}`;
        const valTxt = `${col}${val}${C.reset}`;
        const padding = width - lbl.length - val.toString().length - 6; 
        return `${b}${txt}${" ".repeat(Math.max(0, padding))}${valTxt}   ${b}`;
    };

    console.log(top);
    console.log(`${b}   ✨ ${C.bright}SYNAP BUS SERVER${C.reset}${" ".repeat(width - 36)}v2.0.0 | ONLINE ${C.green}🟢${C.reset}   ${b}`);
    console.log(line);
    console.log(row("📍 ACTIVE ROUTE", getCurrentRouteName(), C.yellow));
    console.log(row("💰 CURRENT RATE", `${COSTO_AL_SECONDO} IOTA/s`, C.green));
    
    if (iotaStatus.connected) {
        console.log(row("WB BUS WALLET", shortAddr(iotaStatus.address), C.magenta));
    } else {
        console.log(row("⚠️ IOTA STATUS", "DISCONNECTED", C.red));
    }

    console.log(line);
    console.log(row("🌍 API ENDPOINT", `http://localhost:${PORT}`, C.blue));
    console.log(bot);
    console.log("");
    
    log("Server initialized (Modular Architecture)...", "system");
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
            id, user: trip.userName, email: trip.userEmail, passengers: trip.passengers,
            startTime: trip.startTime, duration, currentCost, routeName: trip.routeName
        };
    });

    res.json({
        config: { costPerSecond: COSTO_AL_SECONDO, currentRouteId: CURRENT_ROUTE_ID, currentRouteName: getCurrentRouteName() },
        activeTrips: activeList,
        history: tripHistory.slice().reverse(),
        logs: getLogs(),
        routes: Storage.loadRoutes()
    });
});

app.post('/api/admin/config', (req, res) => {
    const { costPerSecond, routeId } = req.body;
    if (costPerSecond > 0) {
        COSTO_AL_SECONDO = costPerSecond;
        CURRENT_ROUTE_ID = routeId || null; 
        Storage.saveConfig({ costPerSecond: COSTO_AL_SECONDO, currentRouteId: CURRENT_ROUTE_ID });
        log(`Rate updated: ${getCurrentRouteName()} -> ${COSTO_AL_SECONDO} IOTA/s`, "warn");
        res.json({ ok: true });
    } else res.status(400).json({ error: "Invalid value" });
});

app.post('/api/admin/routes', (req, res) => {
    const { name, cost } = req.body;
    const routes = Storage.loadRoutes();
    const newRoute = { id: "route-" + Date.now(), name, costPerSecond: parseFloat(cost) };
    routes.push(newRoute);
    Storage.saveRoutes(routes);
    log(`New Route: ${name}`, "system");
    res.json({ ok: true, route: newRoute });
});

app.delete('/api/admin/routes/:id', (req, res) => {
    const routes = Storage.loadRoutes();
    const newRoutes = routes.filter(r => r.id !== req.params.id);
    Storage.saveRoutes(newRoutes);
    res.json({ ok: true });
});

app.get('/api/admin/logs', (req, res) => res.json({ logs: getLogs() }));


// ==========================================
//               USER API
// ==========================================

app.post('/api/auth/register', (req, res) => {
    try {
        const { name, email, password } = req.body;
        const users = Storage.loadUsers();
        if (users.find(u => u.email === email)) return res.status(400).json({ error: "Email already in use" });

        // USIAMO IL SERVICE IOTA PER GENERARE IL WALLET
        const wallet = IotaService.createWallet();

        users.push({ 
            email, password, name, 
            mnemonic: wallet.mnemonic, 
            address: wallet.address, 
            debt: 0 
        });
        Storage.saveUsers(users);
        
        log(`New User: ${name} (Wallet Created)`, "system");
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const users = Storage.loadUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        log(`Login: ${user.name}`, "system");
        res.json({ token: "token-" + Date.now(), user: user.name, email: user.email });
    } else res.status(401).json({ error: "Invalid credentials" });
});

app.post('/api/trip/start', (req, res) => {
    const { email, passengers } = req.body;
    const users = Storage.loadUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: "User unknown" });

    if (user.debt > 0.001) { 
        log(`Check-in blocked ${user.name}: Debt ${user.debt}`, "error");
        return res.status(403).json({ error: "PENDING_DEBT", message: `Settle debt of ${user.debt} IOTA first.` });
    }

    const tripId = "TRIP-" + Date.now();
    activeTrips[tripId] = {
        startTime: Date.now(),
        passengers: passengers || 1,
        userName: user.name, userEmail: user.email,
        rate: COSTO_AL_SECONDO, routeName: getCurrentRouteName()
    };
    log(`ENTRY: ${user.name}`, "trip");
    res.json({ tripId, status: "STARTED", routeName: getCurrentRouteName() });
});

app.post('/api/trip/end', async (req, res) => {
    try {
        const { email, tripId } = req.body; 
        const tripData = activeTrips[tripId];
        if (!tripData) return res.status(404).json({error: "Trip not found"});

        // 1. Calcoli
        const duration = Math.floor((Date.now() - tripData.startTime) / 1000);
        let tripCost = parseFloat(((duration * tripData.rate) * tripData.passengers).toFixed(2));
        if (tripCost < 0.01) tripCost = 0.01;

        // 2. Recupero Utente
        const users = Storage.loadUsers();
        const userIndex = users.findIndex(u => u.email === email);
        const user = users[userIndex];
        const totalDue = tripCost + (user.debt || 0);

        // 3. Verifica Saldo Blockchain tramite Service
        const balanceData = await IotaService.getBalance(user.mnemonic);
        const walletBalance = parseFloat(balanceData.iota);

        let amountToPay = 0;
        let newDebt = 0;
        let txInfo = { success: false, digest: null };

        // 4. Logica Pagamento
        if (walletBalance >= totalDue) {
            amountToPay = totalDue;
        } else {
            amountToPay = walletBalance; // Paga tutto quello che ha
            newDebt = parseFloat((totalDue - amountToPay).toFixed(2));
        }

        // 5. Esecuzione Transazione (Se c'è qualcosa da pagare)
        if (amountToPay > 0.001) {
            txInfo = await IotaService.payToBus(user.mnemonic, amountToPay);
        }

        // 6. Aggiornamento DB
        user.debt = newDebt;
        Storage.saveUsers(users);

        // 7. Storico
        const status = (newDebt === 0 && txInfo.success) ? "FULL" : "PARTIAL/DEBT";
        log(`EXIT: ${user.name} | Paid: ${amountToPay} | Debt: ${newDebt}`, status === "FULL" ? "money" : "warn");

        tripHistory.push({
            user: user.name, route: tripData.routeName, 
            startTime: new Date(tripData.startTime).toLocaleTimeString(),
            endTime: new Date().toLocaleTimeString(),
            duration, passengers: tripData.passengers,
            cost: tripCost.toFixed(2), status,
            tx: txInfo.digest ? shortAddr(txInfo.digest) : 'N/A'
        });
        Storage.saveHistory(tripHistory);
        delete activeTrips[tripId];

        res.json({ 
            ok: true, 
            cost: tripCost.toFixed(2), 
            paid: amountToPay.toFixed(2),
            debt: newDebt.toFixed(2),
            explorerUrl: txInfo.explorerLink || null
        });

    } catch (e) {
        log(`End Trip Error: ${e.message}`, "error");
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/user/balance', async (req, res) => {
    const users = Storage.loadUsers();
    const user = users.find(u => u.email === req.body.email);
    if (!user) return res.status(404).json({ error: "No user" });

    // Usa il Service per il saldo
    const bal = await IotaService.getBalance(user.mnemonic);
    res.json({ balance: bal.iota, debt: (user.debt || 0).toFixed(2) });
});

app.post('/api/user/pay-debt', async (req, res) => {
    const { email } = req.body;
    const users = Storage.loadUsers();
    const idx = users.findIndex(u => u.email === email);
    const user = users[idx];
    
    if (!user || user.debt <= 0) return res.status(400).json({error: "No debt"});

    const bal = await IotaService.getBalance(user.mnemonic);
    const available = parseFloat(bal.iota);
    
    if (available < 0.01) return res.status(400).json({error: "Wallet empty"});

    const toPay = Math.min(available, user.debt);
    const result = await IotaService.payToBus(user.mnemonic, toPay);

    if (result.success) {
        user.debt = parseFloat((user.debt - toPay).toFixed(2));
        Storage.saveUsers(users);
        log(`Debt Paid: ${user.name} (-${toPay})`, "money");
        res.json({ ok: true, paid: toPay, remainingDebt: user.debt });
    } else {
        res.status(500).json({ error: "Tx Failed" });
    }
});

app.listen(PORT, () => { /* Log iniziale gestito da init() */ });