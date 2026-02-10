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
const activeTrips = {}; 
let tripHistory = Storage.loadHistory();
let appConfig = Storage.loadConfig();
let COSTO_AL_SECONDO = appConfig.costPerSecond;
let CURRENT_ROUTE_ID = appConfig.currentRouteId || null;

// Helpers
function getCurrentRouteName() {
    const routes = Storage.loadRoutes();
    const route = routes.find(r => r.id === CURRENT_ROUTE_ID);
    return route ? route.name : "Tariffa Manuale";
}

// INIT
async function init() {
    const iotaStatus = await IotaService.init();
    
    console.clear();
    const width = 60;
    const b = `${C.cyan}║${C.reset}`;
    const top = `${C.cyan}╔${"═".repeat(width)}╗${C.reset}`;
    const bot = `${C.cyan}╚${"═".repeat(width)}╝${C.reset}`;
    const line = `${C.cyan}╠${"═".repeat(width)}╣${C.reset}`;
    const row = (lbl, val, col = C.white) => {
        const txt = `   ${lbl}`;
        const valTxt = `${col}${val}${C.reset}`;
        const padding = width - lbl.length - val.toString().length - 6; 
        return `${b}${txt}${" ".repeat(Math.max(0, padding))}${valTxt}   ${b}`;
    };

    console.log(top);
    console.log(`${b}   ✨ ${C.bright}SYNAP BUS SERVER${C.reset}${" ".repeat(width - 36)}v2.3.0 | ONLINE ${C.green}🟢${C.reset}   ${b}`);
    console.log(line);
    console.log(row("📍 ACTIVE ROUTE", getCurrentRouteName(), C.yellow));
    console.log(row("💰 CURRENT RATE", `${COSTO_AL_SECONDO} IOTA/s`, C.green));
    
    if (iotaStatus.connected) {
        console.log(row("🚌 BUS WALLET", iotaStatus.address.substring(0,10)+"...", C.magenta));
    } else {
        console.log(row("⚠️ IOTA", "DISCONNECTED", C.red));
    }
    console.log(row("🌍 API", `http://localhost:${PORT}`, C.blue));
    console.log(bot);
    console.log("");
    
    log("Server initialized complete.", "system");
}
init();

// --- API ADMIN ---

app.get('/api/admin/dashboard', (req, res) => {
    const routes = Storage.loadRoutes();
    
    // Calcoliamo il totale reale delle persone a bordo (somma dei passeggeri di ogni viaggio)
    const totalPeopleOnBoard = Object.values(activeTrips).reduce((acc, trip) => {
        return acc + (trip.passengers || 1);
    }, 0);

    const activeList = Object.values(activeTrips).map(trip => {
        const duration = Math.floor((Date.now() - trip.startTime) / 1000);
        const tripRate = trip.rate || COSTO_AL_SECONDO;
        return {
            ...trip,
            duration,
            currentCost: (duration * tripRate * trip.passengers).toFixed(2)
        };
    });

    res.json({
        activeTrips: activeList,
        totalPassengers: totalPeopleOnBoard, // Nuovo dato per la statistica
        history: tripHistory.slice().reverse(),
        routes: routes,
        config: {
            costPerSecond: COSTO_AL_SECONDO,
            currentRouteId: CURRENT_ROUTE_ID,
            currentRouteName: getCurrentRouteName()
        }
    });
});

// !!! QUESTA E' LA ROTTA CHE MANCAVA !!!
app.get('/api/admin/config', (req, res) => {
    res.json(Storage.loadConfig());
});

app.post('/api/admin/config', (req, res) => {
    const { costPerSecond, routeId } = req.body;
    if (costPerSecond > 0) {
        COSTO_AL_SECONDO = parseFloat(costPerSecond);
        CURRENT_ROUTE_ID = routeId || null; 
        
        Storage.saveConfig({ 
            costPerSecond: COSTO_AL_SECONDO,
            currentRouteId: CURRENT_ROUTE_ID
        });

        const routeName = getCurrentRouteName();
        log(`Rate updated: ${routeName} -> ${COSTO_AL_SECONDO} IOTA/s`, "warn");
        res.json({ ok: true });
    } else {
        res.status(400).json({ error: "Invalid value" });
    }
});

app.post('/api/admin/routes', (req, res) => {
    const { name, cost } = req.body;
    if(!name || !cost) return res.status(400).json({error: "Dati mancanti"});
    
    const routes = Storage.loadRoutes();
    const newRoute = { id: "route-" + Date.now(), name, costPerSecond: parseFloat(cost) };
    routes.push(newRoute);
    Storage.saveRoutes(routes);
    log(`Nuova Rotta creata: ${name}`, "system");
    res.json({ ok: true, route: newRoute });
});

app.delete('/api/admin/routes/:id', (req, res) => {
    const routes = Storage.loadRoutes();
    const newRoutes = routes.filter(r => r.id !== req.params.id);
    Storage.saveRoutes(newRoutes);
    log(`Rotta eliminata`, "warn");
    res.json({ ok: true });
});

app.get('/api/admin/logs', (req, res) => res.json({ logs: getLogs() }));


// --- API USER ---

app.post('/api/auth/register', (req, res) => {
    try {
        const { name, email, password } = req.body;
        const users = Storage.loadUsers();
        if (users.find(u => u.email === email)) return res.status(400).json({ error: "Email già presente" });

        const wallet = IotaService.createWallet();
        users.push({ 
            email, password, name, 
            mnemonic: wallet.mnemonic, 
            address: wallet.address,
            debt: 0 
        });
        Storage.saveUsers(users);
        
        log(`User Registered: ${name}`, "system");
        res.json({ ok: true, address: wallet.address });
    } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const users = Storage.loadUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        res.json({ token: "ok", user: user.name, email: user.email });
    } else res.status(401).json({ error: "Credenziali errate" });
});

app.post('/api/user/balance', async (req, res) => {
    const users = Storage.loadUsers();
    const user = users.find(u => u.email === req.body.email);
    if (!user) return res.status(404).json({ error: "Utente non trovato" });

    const bal = await IotaService.getBalance(user.mnemonic);
    res.json({ balance: bal.iota, debt: (user.debt || 0).toFixed(2) });
});

app.post('/api/user/pay-debt', async (req, res) => {
    const { email } = req.body;
    const users = Storage.loadUsers();
    const idx = users.findIndex(u => u.email === email);
    const user = users[idx];

    if (!user || user.debt <= 0) return res.status(400).json({error: "Nessun debito."});

    const bal = await IotaService.getBalance(user.mnemonic);
    const available = parseFloat(bal.iota);
    const maxPayable = available - 0.01;

    if (maxPayable <= 0) return res.status(400).json({error: "Saldo insufficiente."});

    const toPay = Math.min(maxPayable, user.debt);
    const tx = await IotaService.payToBus(user.mnemonic, toPay);

    if (tx.success) {
        user.debt = parseFloat((user.debt - toPay).toFixed(2));
        if (user.debt < 0.01) user.debt = 0;
        Storage.saveUsers(users);
        log(`Debito Saldato: ${user.name} (-${toPay})`, "money");
        res.json({ ok: true, remainingDebt: user.debt });
    } else {
        res.status(500).json({ error: "Errore TX: " + tx.error });
    }
});

// --- TRIP FLOW ---

app.post('/api/trip/start', async (req, res) => {
    const { email, passengers } = req.body;
    const users = Storage.loadUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) return res.status(404).json({ error: "User unknown" });

    // 1. BLOCCO SE HA DEBITI PREGRESSI
    if (user.debt && user.debt > 0.01) {
        log(`Check-in BLOCCATO per ${user.name}: Debito ${user.debt}`, "error");
        return res.status(403).json({ 
            error: "PENDING_DEBT", 
            message: `Devi saldare un debito di ${user.debt} IOTA prima di viaggiare.` 
        });
    }

    // 2. BLOCCO SE NON HA ABBASTANZA SOLDI (NUOVO!)
    // Chiediamo alla Blockchain il saldo in tempo reale
    const balData = await IotaService.getBalance(user.mnemonic);
    const currentBalance = parseFloat(balData.iota);

    // Soglia minima: 0.01 IOTA
    if (currentBalance < 0.01) {
        log(`Check-in BLOCCATO per ${user.name}: Saldo ${currentBalance} insufficiente`, "warn");
        return res.status(403).json({ 
            error: "LOW_FUNDS", 
            message: `Saldo insufficiente (${currentBalance} IOTA).<br>Ricarica il wallet per viaggiare.` 
        });
    }

    // 3. SE TUTTO OK, CREA IL VIAGGIO
    const tripId = "TRIP-" + Date.now();
    activeTrips[tripId] = {
        startTime: Date.now(),
        passengers: passengers || 1,
        email, userName: user.name,
        rate: COSTO_AL_SECONDO,
        routeName: getCurrentRouteName()
    };
    
    log(`ENTRY: ${user.name} | Saldo: ${currentBalance}`, "trip");
    res.json({ tripId, status: "STARTED", routeName: getCurrentRouteName() });
});

app.post('/api/trip/end', async (req, res) => {
    const { email, tripId } = req.body; 
    const trip = activeTrips[tripId];
    if (!trip) return res.status(404).json({error: "Viaggio non trovato"});

    const duration = Math.floor((Date.now() - trip.startTime) / 1000);
    let totalCost = parseFloat((duration * trip.rate * trip.passengers).toFixed(2));
    if (totalCost < 0.01) totalCost = 0.01;

    const users = Storage.loadUsers();
    const idx = users.findIndex(u => u.email === email);
    const user = users[idx];
    
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
        if (tx.success) {
            txHash = tx.digest;
        } else {
            paidAmount = 0;
            newDebt = totalCost;
            status = "FAILED/DEBT";
            log(`TX Failed: ${tx.error}`, "error");
        }
    } else {
        newDebt = totalCost;
        status = "DEBT_ONLY";
    }

    user.debt = (user.debt || 0) + newDebt;
    Storage.saveUsers(users);

    tripHistory.push({
        user: user.name,
        route: trip.routeName,
        cost: totalCost.toFixed(2),
        paid: paidAmount.toFixed(2),
        status: status,
        tx: txHash || "N/A",
        startTime: new Date(trip.startTime).toLocaleTimeString(),
        endTime: new Date().toLocaleTimeString(),
        date: new Date().toISOString()
    });
    Storage.saveHistory(tripHistory);
    
    log(`EXIT: ${user.name} | Paid: ${paidAmount} | Debt: ${newDebt}`, status.includes("DEBT") ? "warn" : "money");
    delete activeTrips[tripId];

    res.json({ 
        ok: true, cost: totalCost.toFixed(2), 
        paid: paidAmount.toFixed(2), debt: user.debt.toFixed(2),
        explorerUrl: txHash ? `https://explorer.rebased.iota.org/txblock/${txHash}?network=testnet` : null
    });
});
// Aggiungi questo in server.js sotto le altre API Admin
app.get('/api/admin/users', (req, res) => {
    const users = Storage.loadUsers();
    // Creiamo una lista sicura (senza password/mnemonic) da mandare al frontend
    const safeUsers = users.map(u => ({
        name: u.name,
        email: u.email,
        address: u.address,
        debt: u.debt || 0
    }));
    res.json(safeUsers);
});

app.listen(PORT, () => {});