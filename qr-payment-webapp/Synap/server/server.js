import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Moduli
import { log, getLogs, Colors as C } from './utils/logger.js';
import { Storage } from './services/storage.js';
import { IotaService } from './services/iota.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
// Serve il frontend dalla cartella client
app.use(express.static(path.join(__dirname, '../client')));

const PORT = 3000;

// STATE
// N.B. Se riavvii il server, questa memoria si pulisce. 
// I viaggi in corso perderanno i dettagli ma potranno essere chiusi grazie ai fallback.
const activeTrips = {}; 
let tripHistory = Storage.loadHistory();
let appConfig = Storage.loadConfig();

// CONFIGURAZIONE GLOBALE
let COSTO_AL_SECONDO = parseFloat(appConfig.costPerSecond) || 0.01;
let CURRENT_ROUTE_ID = appConfig.currentRouteId || null;
const DEPOSITO_CAUZIONALE = 3.00; 

// Helpers
function getCurrentRouteName() {
    const routes = Storage.loadRoutes();
    const route = routes.find(r => r.id === CURRENT_ROUTE_ID);
    return route ? route.name : "Standard Route";
}

// INIT
async function init() {
    const iotaStatus = await IotaService.init();
    console.clear();
    const b = `${C.cyan}║${C.reset}`;
    console.log(`${b}   ✨ SYNAP BUS SERVER ONLINE ${C.green}🟢${C.reset}   ${b}`);
    console.log(`🌍 API: http://localhost:${PORT}`);
    log("Server initialized complete.", "system");
}
init();

// --- API ADMIN ---
app.get('/api/admin/dashboard', (req, res) => {
    const routes = Storage.loadRoutes();
    const totalPeopleOnBoard = Object.values(activeTrips).reduce((acc, trip) => acc + (trip.passengers || 1), 0);

    const activeList = Object.values(activeTrips).map(trip => {
        // Calcolo durata sicura
        const duration = Math.max(1, Math.ceil((Date.now() - trip.startTime) / 1000));
        const tripRate = trip.rate || COSTO_AL_SECONDO;
        return {
            ...trip,
            duration,
            currentCost: (duration * tripRate * (trip.passengers || 1)).toFixed(2)
        };
    });

    res.json({
        activeTrips: activeList,
        totalPassengers: totalPeopleOnBoard, 
        history: tripHistory.slice().reverse(),
        routes: routes,
        config: { costPerSecond: COSTO_AL_SECONDO, currentRouteId: CURRENT_ROUTE_ID, currentRouteName: getCurrentRouteName() }
    });
});

app.get('/api/admin/config', (req, res) => res.json(Storage.loadConfig()));

app.post('/api/admin/config', (req, res) => {
    const { costPerSecond, routeId } = req.body;
    if (costPerSecond > 0) {
        COSTO_AL_SECONDO = parseFloat(costPerSecond);
        CURRENT_ROUTE_ID = routeId || null; 
        Storage.saveConfig({ costPerSecond: COSTO_AL_SECONDO, currentRouteId: CURRENT_ROUTE_ID });
        res.json({ ok: true });
    } else { res.status(400).json({ error: "Invalid value" }); }
});

app.post('/api/admin/routes', (req, res) => {
    const { name, cost } = req.body;
    if(!name || !cost) return res.status(400).json({error: "Missing data"});
    const routes = Storage.loadRoutes();
    const newRoute = { id: "route-" + Date.now(), name, costPerSecond: parseFloat(cost) };
    routes.push(newRoute);
    Storage.saveRoutes(routes);
    res.json({ ok: true, route: newRoute });
});

app.delete('/api/admin/routes/:id', (req, res) => {
    const routes = Storage.loadRoutes();
    const newRoutes = routes.filter(r => r.id !== req.params.id);
    Storage.saveRoutes(newRoutes);
    res.json({ ok: true });
});

app.get('/api/admin/users', (req, res) => {
    const users = Storage.loadUsers();
    const safeUsers = users.map(u => ({
        name: u.name, email: u.email, address: u.address, debt: u.debt || 0, lockedBalance: u.lockedBalance || 0 
    }));
    res.json(safeUsers);
});

app.get('/api/admin/logs', (req, res) => res.json({ logs: getLogs() }));

// --- API USER & AUTH ---
app.post('/api/auth/register', (req, res) => {
    try {
        const { name, email, password } = req.body;
        const users = Storage.loadUsers();
        if (users.find(u => u.email === email)) return res.status(400).json({ error: "Email already exists" });
        const wallet = IotaService.createWallet();
        users.push({ email, password, name, mnemonic: wallet.mnemonic, address: wallet.address, debt: 0, lockedBalance: 0 });
        Storage.saveUsers(users);
        res.json({ ok: true, address: wallet.address });
    } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const users = Storage.loadUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) res.json({ token: "ok", user: user.name, email: user.email });
    else res.status(401).json({ error: "Invalid credentials" });
});

app.post('/api/user/balance', async (req, res) => {
    const users = Storage.loadUsers();
    const user = users.find(u => u.email === req.body.email);
    if (!user) return res.status(404).json({ error: "User not found" });
    const balData = await IotaService.getBalance(user.mnemonic);
    const totalBalance = parseFloat(balData.iota);
    const locked = user.lockedBalance || 0;
    const available = Math.max(0, totalBalance - locked);
    res.json({ balance: available.toFixed(2), totalBalance: totalBalance.toFixed(2), locked: locked.toFixed(2), debt: (user.debt || 0).toFixed(2) });
});

app.post('/api/user/pay-debt', async (req, res) => {
    const { email } = req.body;
    const users = Storage.loadUsers();
    const idx = users.findIndex(u => u.email === email);
    const user = users[idx];
    if (!user || user.debt <= 0) return res.status(400).json({error: "No debt."});
    const bal = await IotaService.getBalance(user.mnemonic);
    const totalAvailable = parseFloat(bal.iota);
    const effectiveAvailable = totalAvailable - (user.lockedBalance || 0);
    const maxPayable = effectiveAvailable - 0.01; 
    if (maxPayable <= 0) return res.status(400).json({error: "Not enough IOTA."});
    const toPay = Math.min(maxPayable, user.debt);
    const tx = await IotaService.payToBus(user.mnemonic, toPay);
    if (tx.success) {
        user.debt = parseFloat((user.debt - toPay).toFixed(2));
        if (user.debt < 0.01) user.debt = 0;
        Storage.saveUsers(users);
        res.json({ ok: true, remainingDebt: user.debt });
    } else { res.status(500).json({ error: "TX Error: " + tx.error }); }
});

// --- TRIP FLOW (FIXED) ---

app.post('/api/trip/start', async (req, res) => {
    const { email, passengers } = req.body;
    const users = Storage.loadUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) return res.status(404).json({ error: "User unknown" });

    // FIX: Parsing sicuro dei passeggeri
    const paxCount = parseInt(passengers); 
    const validPax = (!isNaN(paxCount) && paxCount > 0) ? paxCount : 1;

    if (user.debt && user.debt > 0.01) return res.status(403).json({ error: "PENDING_DEBT", message: `Settle debt first.` });

    const balData = await IotaService.getBalance(user.mnemonic);
    const currentBalance = parseFloat(balData.iota);
    if (currentBalance < DEPOSITO_CAUZIONALE) return res.status(403).json({ error: "LOW_FUNDS", message: `Deposit of ${DEPOSITO_CAUZIONALE} IOTA required.` });

    user.lockedBalance = DEPOSITO_CAUZIONALE;
    Storage.saveUsers(users);

    const tripId = "TRIP-" + Date.now();
    const routeNameStr = getCurrentRouteName();
    const rateNum = Number(COSTO_AL_SECONDO);

    // FIX: Salviamo i dati in modo esplicito
    activeTrips[tripId] = {
        startTime: Date.now(),
        passengers: validPax,  // Qui forziamo il valore corretto
        email, 
        userName: user.name,
        rate: rateNum || 0.01,
        routeName: routeNameStr || "Standard Route",
        lockedAmount: DEPOSITO_CAUZIONALE 
    };
    
    log(`TRIP START: ${user.name} | Pax: ${validPax} | Route: ${routeNameStr}`, "trip");
    res.json({ tripId, status: "STARTED", routeName: activeTrips[tripId].routeName });
});

app.post('/api/trip/end', async (req, res) => {
    const { tripId } = req.body; 
    const trip = activeTrips[tripId];
    
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    // FIX: Fallback sicuri per evitare undefined/NaN se il server si riavvia
    const tripPax = parseInt(trip.passengers) || 1;
    const tripRate = parseFloat(trip.rate) || 0.01;
    const tripRoute = trip.routeName || "Standard Route";
    
    // FIX DURATA: Mai 0 (minimo 1 secondo)
    const endTime = Date.now();
    const durationSeconds = Math.max(1, Math.ceil((endTime - trip.startTime) / 1000));

    // Calcolo Costo
    let totalCost = parseFloat((durationSeconds * tripRate * tripPax).toFixed(2));
    if (totalCost < 0.01) totalCost = 0.01; 

    const users = Storage.loadUsers();
    const user = users.find(u => u.email === trip.email);
    user.lockedBalance = 0; 
    Storage.saveUsers(users); 

    const balData = await IotaService.getBalance(user.mnemonic);
    const realBalance = parseFloat(balData.iota);
    const maxPayable = Math.max(0, realBalance - 0.01); 

    let paidAmount = 0;
    let newDebt = 0;
    let txHash = null;
    let status = "FULL";

    if (maxPayable >= totalCost) { 
        paidAmount = totalCost; 
    } else {
        paidAmount = maxPayable;
        newDebt = parseFloat((totalCost - paidAmount).toFixed(2));
        status = "PARTIAL/DEBT";
    }

    if (paidAmount > 0.001) {
        const tx = await IotaService.payToBus(user.mnemonic, paidAmount);
        if (tx.success) txHash = tx.digest;
        else { paidAmount = 0; newDebt = totalCost; status = "FAILED/DEBT"; }
    } else { newDebt = totalCost; status = "DEBT_ONLY"; }

    user.debt = (user.debt || 0) + newDebt;
    Storage.saveUsers(users);

    log(`TRIP END: ${user.name} | Pax: ${tripPax} | Dur: ${durationSeconds}s | Cost: ${totalCost}`, "money");

    tripHistory.push({
        user: user.name, route: tripRoute, cost: totalCost.toFixed(2), paid: paidAmount.toFixed(2),
        status: status, tx: txHash || "N/A", startTime: new Date(trip.startTime).toLocaleTimeString(),
        endTime: new Date(endTime).toLocaleTimeString(), date: new Date().toISOString()
    });
    Storage.saveHistory(tripHistory);
    
    // FIX: Costruzione oggetto fattura pulito
    const invoiceData = {
        routeName: tripRoute,
        rate: tripRate,
        passengers: tripPax, // Valore sicuro
        durationSeconds: durationSeconds,
        startTime: trip.startTime,
        endTime: endTime,
        cost: totalCost.toFixed(2),
        paid: paidAmount.toFixed(2),
        debt: user.debt.toFixed(2),
        explorerUrl: txHash ? `https://explorer.rebased.iota.org/txblock/${txHash}?network=testnet` : null
    };

    delete activeTrips[tripId];
    res.json({ ok: true, ...invoiceData });
});

app.listen(PORT, () => {});