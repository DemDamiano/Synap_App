import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Moduli interni
import { log, getLogs, Colors as C } from './utils/logger.js';
import { IotaService } from './services/iota.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURAZIONE ---
const PORT = 3000;
const DEPOSITO_CAUZIONALE = 3.00; 
const TRUSTED_PROVIDER_DID = "did:iota:test:synap_trust_provider_8f7d2a"; 

// --- PERSISTENZA ---
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DB_FILES = {
    users: path.join(DATA_DIR, 'users.json'),
    activeTrips: path.join(DATA_DIR, 'active_trips.json'),
    history: path.join(DATA_DIR, 'history.json'),
    config: path.join(DATA_DIR, 'config.json'),
    routes: path.join(DATA_DIR, 'routes.json'),
    government: path.join(DATA_DIR, 'government_registry.json')
};

const DB = {
    read: (file, defaultVal) => {
        try {
            if (!fs.existsSync(file)) {
                fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2));
                return defaultVal;
            }
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) { return defaultVal; }
    },
    write: (file, data) => {
        try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) { console.error("DB Write Error:", e); }
    }
};

const DEFAULT_CITIZENS = {};
// Carichiamo la config iniziale
let appConfig = DB.read(DB_FILES.config, { costPerSecond: 0.01, currentRouteId: null });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// --- INIT ---
async function init() {
    await IotaService.init();
    DB.read(DB_FILES.routes, []);
    DB.read(DB_FILES.users, []);
    if (!fs.existsSync(DB_FILES.government)) {
        DB.write(DB_FILES.government, DEFAULT_CITIZENS);
    }
    console.clear();
    log("SYNAP SERVER STARTED", "system");
}
init();

function getCurrentRouteName() {
    // Rilegge sempre dal file per essere sicuro
    const config = DB.read(DB_FILES.config, {});
    const routes = DB.read(DB_FILES.routes, []);
    const found = routes.find(r => r.id === config.currentRouteId);
    return found ? found.name : "Standard Urban Route";
}

// ==========================================
//          API ENDPOINTS
// ==========================================

// --- CONFIG ROLES (VISUALE) ---
app.get('/api/config/roles', (req, res) => {
    const rolesPath = path.join(DATA_DIR, 'roles.json');
    if (!fs.existsSync(rolesPath)) {
        return res.json({ 'Standard': { label: "0%", discount: 0.0, color: "#636e72", bg: "#f1f2f6" } });
    }
    try {
        const data = fs.readFileSync(rolesPath, 'utf8');
        res.json(JSON.parse(data));
    } catch (e) {
        res.status(500).json({ error: "Config Error" });
    }
});

// --- ISSUER ---
app.post('/api/issuer/issue-credential', (req, res) => {
    const { walletAddress, email } = req.body;
    if (!walletAddress) return res.status(400).json({ error: "Wallet Address required" });

    const registry = DB.read(DB_FILES.government, {});
    const govData = registry[walletAddress]; 
    
    const roleName = govData ? govData.role : "Standard Citizen";
    const attributes = govData ? govData.attributes : { isStudent: false, isResident: false, isOver65: false, isWorkingEmployee: false };

    const verifiableCredential = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        "type": ["VerifiableCredential", "SynapDigitalID"],
        "issuer": TRUSTED_PROVIDER_DID,
        "issuanceDate": new Date().toISOString(),
        "credentialSubject": {
            "id": `did:iota:${walletAddress}`,
            "email": email,
            "role": roleName,
            "attributes": attributes
        },
        "proof": { type: "Ed25519Signature2018", verificationMethod: `${TRUSTED_PROVIDER_DID}#key-1` }
    };
    res.json({ ok: true, credential: verifiableCredential });
});

// --- VERIFIER ---
app.post('/api/trip/verify-eligibility', (req, res) => {
    const { verifiableCredential } = req.body;
    if (!verifiableCredential || verifiableCredential.issuer !== TRUSTED_PROVIDER_DID) {
        return res.json({ valid: false, error: "Issuer not trusted" });
    }

    const attrs = verifiableCredential.credentialSubject.attributes || {};
    let discount = 0;
    let roleMessage = "Standard User";

    if (attrs.isOver65) { 
        discount = 1.00; roleMessage = "Senior Citizen (Free)"; 
    } else if (attrs.isStudent) { 
        discount = 0.50; roleMessage = "Verified Student"; 
    } else if (attrs.isResident) { 
        discount = 0.25; roleMessage = "Local Resident"; 
    } else if (attrs.isResidentStudent) {
        discount = 0.65; roleMessage = "Resident Student";
    } else if (attrs.isWorkingEmployee) {
        discount = 0.75; roleMessage = "Working Employee";
    }

    res.json({ valid: true, discount, message: roleMessage });
});

// --- TRIP START ---
app.post('/api/trip/start', async (req, res) => {
    const { email, passengers, appliedRate } = req.body;
    const users = DB.read(DB_FILES.users, []);
    const user = users.find(u => u.email === email);
    
    if (!user) return res.status(404).json({ error: "User unknown" });
    if (user.debt > 0.01) return res.status(403).json({ error: "DEBT", message: "Pay debt first" });

    const bal = await IotaService.getBalance(user.mnemonic);
    if (parseFloat(bal.iota) < DEPOSITO_CAUZIONALE) {
        return res.status(403).json({ error: "FUNDS", message: `Need ${DEPOSITO_CAUZIONALE} IOTA` });
    }

    user.lockedBalance = DEPOSITO_CAUZIONALE;
    DB.write(DB_FILES.users, users);

    const tripId = "TRIP-" + Date.now();
    const activeTrips = DB.read(DB_FILES.activeTrips, {});
    const routeName = getCurrentRouteName(); 

    activeTrips[tripId] = {
        id: tripId,
        startTime: Date.now(),
        passengers: parseInt(passengers) || 1,
        email: user.email,
        userName: user.name,
        rate: appliedRate ? parseFloat(appliedRate) : appConfig.costPerSecond,
        routeName: routeName,
        lockedAmount: DEPOSITO_CAUZIONALE
    };
    
    DB.write(DB_FILES.activeTrips, activeTrips);
    res.json({ tripId, status: "STARTED", routeName });
});

// --- TRIP END ---
app.post('/api/trip/end', async (req, res) => {
    const { tripId } = req.body;
    const activeTrips = DB.read(DB_FILES.activeTrips, {});
    
    if (!activeTrips[tripId]) return res.status(404).json({ error: "Trip not found" });
    
    const trip = activeTrips[tripId];
    const duration = Math.max(1, Math.ceil((Date.now() - trip.startTime)/1000));
    const cost = Math.max(0.01, parseFloat((duration * trip.rate * trip.passengers).toFixed(2)));

    const users = DB.read(DB_FILES.users, []);
    const user = users.find(u => u.email === trip.email);
    
    user.lockedBalance = 0;
    
    const bal = await IotaService.getBalance(user.mnemonic);
    const avail = parseFloat(bal.iota);
    let paid = 0;
    let status = "FULL";

    if (avail >= cost) {
        paid = cost;
        status = "FULL";
        await IotaService.payToBus(user.mnemonic, paid);
    } else {
        paid = Math.max(0, avail - 0.01);
        user.debt += (cost - paid);
        status = paid > 0 ? "PARTIAL" : "DEBT_ONLY";
        if(paid > 0) await IotaService.payToBus(user.mnemonic, paid);
    }
    
    DB.write(DB_FILES.users, users);

    const history = DB.read(DB_FILES.history, []);
    history.push({
        id: tripId,
        user: user.name,
        route: trip.routeName,
        cost: cost.toFixed(2),
        paid: paid.toFixed(2),
        status: status, // <--- SALVIAMO LO STATO CORRETTO
        duration: duration,
        date: new Date().toISOString(),
        tx: "iota_tx_" + Date.now()
    });
    DB.write(DB_FILES.history, history);

    delete activeTrips[tripId];
    DB.write(DB_FILES.activeTrips, activeTrips);

    res.json({ 
        ok: true, 
        cost: cost.toFixed(2), 
        paid: paid.toFixed(2), 
        debt: user.debt.toFixed(2),
        routeName: trip.routeName,
        passengers: trip.passengers,
        rate: trip.rate,
        durationSeconds: duration,
        explorerUrl: "https://explorer.rebased.iota.org/" 
    });
});

// --- AUTH ---
app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;
    const users = DB.read(DB_FILES.users, []);
    if (users.find(u => u.email === email)) return res.status(400).json({ error: "Email exists" });
    
    const wallet = IotaService.createWallet();
    const newUser = { 
        email, password, name, 
        mnemonic: wallet.mnemonic, 
        address: wallet.address, 
        debt: 0, lockedBalance: 0 
    };
    
    users.push(newUser);
    DB.write(DB_FILES.users, users);
    
    const gov = DB.read(DB_FILES.government, {});
    gov[wallet.address] = { role: "Standard", attributes: { isStudent: false } };
    DB.write(DB_FILES.government, gov);

    res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const users = DB.read(DB_FILES.users, []);
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        res.json({ token: "ok", user: user.name, email: user.email, address: user.address });
    } else {
        res.status(401).json({ error: "Invalid credentials" });
    }
});

// --- USER & ADMIN ---
app.post('/api/user/balance', async (req, res) => {
    const users = DB.read(DB_FILES.users, []);
    const user = users.find(u => u.email === req.body.email);
    if (!user) return res.status(404).json({ error: "User not found" });
    
    try {
        const balData = await IotaService.getBalance(user.mnemonic);
        const total = parseFloat(balData.iota);
        res.json({ 
            balance: (total - (user.lockedBalance || 0)).toFixed(2), 
            totalBalance: total.toFixed(2), 
            locked: (user.lockedBalance || 0).toFixed(2), 
            debt: (user.debt || 0).toFixed(2) 
        });
    } catch(e) { res.status(500).json({error: "Balance error"}); }
});

app.post('/api/user/pay-debt', async (req, res) => {
    const users = DB.read(DB_FILES.users, []);
    const idx = users.findIndex(u => u.email === req.body.email);
    const user = users[idx];
    if (user.debt <= 0) return res.status(400).json({error: "No debt"});
    
    const bal = await IotaService.getBalance(user.mnemonic);
    const avail = parseFloat(bal.iota) - (user.lockedBalance || 0);
    const toPay = Math.min(avail - 0.01, user.debt);
    
    if(toPay <= 0) return res.status(400).json({error: "Insufficient funds"});

    const tx = await IotaService.payToBus(user.mnemonic, toPay);
    if (tx.success) {
        user.debt = parseFloat((user.debt - toPay).toFixed(2));
        if(user.debt < 0.01) user.debt = 0;
        DB.write(DB_FILES.users, users);
        res.json({ ok: true });
    } else { res.status(500).json({ error: "Payment Failed" }); }
});

// --- ADMIN DASHBOARD ---
app.get('/api/admin/dashboard', (req, res) => {
    const activeTrips = DB.read(DB_FILES.activeTrips, {});
    const history = DB.read(DB_FILES.history, []);
    const routes = DB.read(DB_FILES.routes, []);
    
    // Rileggiamo la config dal DISK per essere sicuri
    const currentConfig = DB.read(DB_FILES.config, appConfig);
    
    const activeList = Object.values(activeTrips).map(trip => ({ ...trip, currentCost: "Live" }));
    res.json({ 
        activeTrips: activeList, 
        totalPassengers: 0, 
        history: history.slice().reverse(), 
        routes, 
        config: { 
            costPerSecond: currentConfig.costPerSecond, 
            currentRouteId: currentConfig.currentRouteId,
            currentRouteName: getCurrentRouteName() 
        } 
    });
});

// --- AGGIUNTA ROTTA ---
app.post('/api/admin/routes', (req, res) => {
    const routes = DB.read(DB_FILES.routes, []);
    routes.push({ id: "route-"+Date.now(), name: req.body.name, costPerSecond: parseFloat(req.body.cost) });
    DB.write(DB_FILES.routes, routes);
    res.json({ ok: true });
});

// --- CANCELLAZIONE ROTTA ---
app.delete('/api/admin/routes/:id', (req, res) => {
    let routes = DB.read(DB_FILES.routes, []);
    routes = routes.filter(r => r.id !== req.params.id);
    DB.write(DB_FILES.routes, routes);
    res.json({ ok: true });
});

// --- ATTIVAZIONE ROTTA (CONFIG UPDATE) ---
app.post('/api/admin/config', (req, res) => {
    console.log("[ADMIN] Activating Route:", req.body); // <--- LOG DI DEBUG

    appConfig.costPerSecond = parseFloat(req.body.costPerSecond);
    appConfig.currentRouteId = req.body.routeId;
    
    // Scrittura sincrona per essere certi
    DB.write(DB_FILES.config, appConfig);
    
    console.log("[ADMIN] Config Saved:", appConfig); // <--- LOG DI CONFERMA
    res.json({ ok: true });
});

app.get('/api/admin/users', (req, res) => {
    const users = DB.read(DB_FILES.users, []);
    res.json(users.map(u => ({ name: u.name, email: u.email, address: u.address, debt: u.debt })));
});

// --- AVVIO SERVER (UNICA VOLTA ALLA FINE) ---
app.listen(PORT, () => {
    log(`Server running at http://localhost:${PORT}`, "system");
});