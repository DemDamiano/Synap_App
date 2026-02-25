// ==========================================
//          CONFIGURATION
// ==========================================
const API_BASE_URL = 'http://localhost:3000/api';

// Configurazione dinamica (verrà popolata dal server)
let ROLE_CONFIG = {}; 

// Fallback di sicurezza nel caso il server sia offline
const DEFAULT_ROLES = {
    'Standard': { label: "0%", discount: 0.0, color: "#636e72", bg: "#f1f2f6" }
};

let html5QrCode = null;
let scanMode = 'START'; 
let tripInterval = null;
let tripStartTime = null;
let pricePerSecond = 0.01;
let selectedPassengers = 1;
let userSynapID = null;
let currentTripId = null;

const views = {
    login: document.getElementById('view-login'),
    register: document.getElementById('view-register'),
    home: document.getElementById('view-home'),
    scan: document.getElementById('view-scan'),
    trip: document.getElementById('view-trip'),
    result: document.getElementById('view-result')
};

// --- HELPER FUNCTIONS ---
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, config);
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
    } catch (e) {
        return { ok: false, data: { error: "Server connection error" } };
    }
}

function showPopup(title, msg, type = 'info') {
    const modal = document.getElementById('custom-modal');
    if(modal) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-msg').innerHTML = msg;
        const icon = document.getElementById('modal-icon');
        if (type === 'error') icon.innerText = '❌';
        else if (type === 'success') icon.innerText = '✅';
        else icon.innerText = 'ℹ️';
        modal.style.display = 'flex';
    } else {
        alert(title + ": " + msg);
    }
}

function closeModal() {
    const modal = document.getElementById('custom-modal');
    if(modal) modal.style.display = 'none';
}

function showView(viewName) {
    Object.values(views).forEach(el => {
        if(el) el.classList.remove('active');
    });
    if(views[viewName]) views[viewName].classList.add('active');
}

// --- CORE LOGIC ---

// 1. Scarica la configurazione dei ruoli dal DB
async function fetchRoleConfig() {
    const res = await apiCall('/config/roles');
    if (res.ok && res.data) {
        ROLE_CONFIG = res.data;
        console.log("✅ Role Configuration Loaded from DB:", ROLE_CONFIG);
    } else {
        console.warn("⚠️ Using default roles (Server Config Failed)");
        ROLE_CONFIG = DEFAULT_ROLES;
    }
}

// --- SCANNER LOGIC (FORCE STOP FIX) ---

function startScanner(mode) {
    scanMode = mode || 'START';
    showView('scan');
    
    // Gestione UI passeggeri
    const pBox = document.getElementById('passenger-selection-box');
    if(pBox) pBox.style.display = (scanMode === 'START') ? 'flex' : 'none';
    
    // Uccidi istanza precedente se esiste
    if (html5QrCode) {
        try { html5QrCode.stop().then(() => html5QrCode.clear()); } catch(e){}
        html5QrCode = null;
    }

    // Ritardo per permettere al DOM di renderizzarsi
    setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, 
            (decodedText) => stopScannerAndProceed(decodedText)
        ).catch(err => console.log("Camera Error", err));
    }, 200);
}

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
        }).catch(err => {
            console.warn("Scanner stop error ignored", err);
            html5QrCode = null; // Forza null anche se errore
        });
    }
}

// Funzione ponte che ferma lo scanner e poi esegue l'azione
function stopScannerAndProceed(qrData) {
    // 1. Forza lo stop dello scanner
    try {
        if(html5QrCode) {
            html5QrCode.stop().then(() => html5QrCode.clear());
            html5QrCode = null;
        }
    } catch(e) {
        console.log("Force stop error ignored");
    }

    // 2. Esegui logica
    console.log("Scanned:", qrData);
    if(scanMode === 'START') {
        startTrip(qrData);
    } else {
        endTrip(qrData);
    }
}

function handleManualEntry() {
    const code = document.getElementById('manual-code-input').value || "BUS-01";
    stopScannerAndProceed(code);
}

// --- APP LOGIC ---

function changePassenger(delta) {
    selectedPassengers += delta;
    if (selectedPassengers < 1) selectedPassengers = 1;
    if (selectedPassengers > 10) selectedPassengers = 10;
    const disp = document.getElementById('passenger-count-display');
    if(disp) disp.innerText = selectedPassengers;
}

async function syncPrice() {
    const res = await apiCall('/admin/dashboard'); 
    if (res.ok && res.data.config && !userSynapID) {
        pricePerSecond = parseFloat(res.data.config.costPerSecond);
    }
}

async function loadSynapID() {
    const email = localStorage.getItem('synap_email');
    const address = localStorage.getItem('synap_wallet_address');
    if(!email) return showPopup("Error", "Login required", "error");

    const btn = document.getElementById('btn-load-id');
    if(btn) { btn.innerText = "Verifying..."; btn.disabled = true; }

    const res = await apiCall('/issuer/issue-credential', 'POST', { email, walletAddress: address });

    if (res.ok && res.data.credential) {
        userSynapID = res.data.credential;
        const role = userSynapID.credentialSubject.role || "Standard";
        
        // Cerca nella configurazione SCARICATA DAL DB
        let matchedConfig = ROLE_CONFIG['Standard'] || DEFAULT_ROLES['Standard'];
        
        // Logica flessibile: cerca se il ruolo utente corrisponde a una delle chiavi del DB
        if (ROLE_CONFIG[role]) {
             matchedConfig = ROLE_CONFIG[role];
        }

        if(btn) btn.style.display = 'none';
        document.getElementById('identity-info-box').style.display = 'block';
        document.getElementById('display-role').innerText = role;
        
        const dDisp = document.getElementById('display-discount');
        dDisp.innerText = matchedConfig.label;
        dDisp.style.background = matchedConfig.bg;
        dDisp.style.color = matchedConfig.color;

        showPopup("Verified", `Role: <b>${role}</b>`, "success");
    } else {
        showPopup("Error", "Role not found", "error");
        if(btn) { btn.innerText = "+ Load Synap Trust ID"; btn.disabled = false; }
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const res = await apiCall('/auth/login', 'POST', { email, password });
    if (res.ok) {
        localStorage.setItem('synap_user', res.data.user);
        localStorage.setItem('synap_email', res.data.email);
        localStorage.setItem('synap_wallet_address', res.data.address);
        updateUI();
        showView('home');
        syncPrice();
    } else { showPopup("Error", "Invalid credentials", 'error'); }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const res = await apiCall('/auth/register', 'POST', { name, email, password });
    if (res.ok) {
        showPopup("Success", "Account created", "success");
        showView('login');
    } else { showPopup("Error", "Registration failed", 'error'); }
}

function handleLogout() { localStorage.clear(); location.reload(); }

function updateUI() { 
    document.querySelector('.user-name').innerText = localStorage.getItem('synap_user') || 'Guest'; 
    refreshBalance();
    
    const isTraveling = localStorage.getItem('synap_is_traveling') === 'true';
    document.getElementById('btn-scan-start').style.display = isTraveling ? 'none' : 'block';
    document.getElementById('btn-scan-end').style.display = isTraveling ? 'block' : 'none';
}

async function refreshBalance() {
    const email = localStorage.getItem('synap_email');
    if (!email) return;
    const res = await apiCall('/user/balance', 'POST', { email });
    if (res.ok) {
        document.getElementById('balance-amount').innerText = res.data.balance;
        
        const locked = parseFloat(res.data.locked);
        const lBox = document.getElementById('locked-balance-info');
        if(lBox) {
            lBox.style.display = locked > 0 ? 'block' : 'none';
            lBox.innerText = `🔒 ${locked} Reserved`;
        }

        const debt = parseFloat(res.data.debt);
        const dBox = document.getElementById('debt-warning');
        if(dBox) {
            dBox.style.display = debt > 0 ? 'block' : 'none';
            document.getElementById('debt-amount').innerText = debt.toFixed(2);
        }
    }
}

function startTimer() {
    if(tripInterval) clearInterval(tripInterval);
    tripStartTime = Date.now();
    tripInterval = setInterval(() => {
        const diff = Math.floor((Date.now() - tripStartTime) / 1000);
        const min = Math.floor(diff / 60).toString().padStart(2,'0');
        const sec = (diff % 60).toString().padStart(2,'0');
        document.getElementById('trip-timer').innerText = `${min}:${sec}`;
        document.getElementById('trip-cost').innerText = (diff * pricePerSecond * selectedPassengers).toFixed(2);
    }, 1000);
}
// --- DEBT MANAGEMENT ---
async function payDebt() {
    const email = localStorage.getItem('synap_email');
    if (!email) return;

    if(!confirm("Do you want to pay your debt using your available balance?")) return;

    // Mostra loading
    const btn = document.querySelector('#debt-warning button');
    if(btn) { btn.innerText = "Processed"; btn.disabled = true; }

    const res = await apiCall('/user/pay-debt', 'POST', { email });

    if (res.ok) {
        showPopup("Success", "Debt paid successfully!", "success");
        refreshBalance(); // Aggiorna la UI
    } else {
        showPopup("Payment Failed", res.data.error || "Insufficient funds", "error");
        if(btn) { btn.innerText = "PAY NOW"; btn.disabled = false; }
    }
}
async function startTrip(qrData) {
    console.log("🚀 STARTING TRIP...");
    console.log("🆔 Current Synap ID in memory:", userSynapID);

    const email = localStorage.getItem('synap_email');
    await syncPrice();
    
    let appliedRate = pricePerSecond;
    
    if(userSynapID) {
        console.log("📡 Calling Server for Verification...");
        const vRes = await apiCall('/trip/verify-eligibility', 'POST', { verifiableCredential: userSynapID });
        
        console.log("📩 Server Response:", vRes);
        
        if(vRes.ok) {
            // Usa lo sconto restituito dal server
            appliedRate = pricePerSecond * (1 - vRes.data.discount);
            console.log(`🤑 Discount Applied! New Rate: ${appliedRate}`);
        }
    } else {
        console.warn("⚠️ NO ID LOADED! Skipping eligibility check. Rate will be full price.");
    }

    const res = await apiCall('/trip/start', 'POST', { email, passengers: selectedPassengers, appliedRate });

    if (res.ok) {
        currentTripId = res.data.tripId;
        localStorage.setItem('synap_trip_id', currentTripId);
        localStorage.setItem('synap_is_traveling', 'true');
        localStorage.setItem('synap_current_route', res.data.routeName);
        localStorage.setItem('synap_current_rate', appliedRate);
        localStorage.setItem('synap_current_pax', selectedPassengers);
        
        showView('trip');
        document.getElementById('trip-id-display').innerText = qrData;
        document.getElementById('trip-route-display').innerText = res.data.routeName;
        document.getElementById('trip-rate-display').innerText = appliedRate.toFixed(4);
        document.getElementById('trip-passengers-display').innerText = selectedPassengers;
        
        startTimer();
        refreshBalance();
    } else { 
        showPopup("Error", res.data.message || "Failed to start", 'error'); 
        showView('home'); 
    }
}

async function endTrip(qrData) {
    clearInterval(tripInterval);
    const tripId = currentTripId || localStorage.getItem('synap_trip_id');
    const email = localStorage.getItem('synap_email');
    
    // RECUPERIAMO L'INDIRIZZO DEL WALLET DIRETTAMENTE DALL'APP
    const walletAddress = localStorage.getItem('synap_wallet_address'); 

    showView('result');
    const target = document.getElementById('invoice-target');
    target.innerHTML = `<div style="padding:60px; text-align:center;"><div class="loader"></div><p style="color:#a18cd1; font-weight:600; margin-top:20px;">Processing Payment on IOTA Tangle...</p></div>`;

    const res = await apiCall('/trip/end', 'POST', { tripId, email });

    if (res.ok) {
        localStorage.removeItem('synap_trip_id');
        localStorage.setItem('synap_is_traveling', 'false');
        
        const d = res.data || {};
        const cost = d.cost || "0.00";
        const route = d.routeName || "Standard Route";
        const durationSec = d.durationSeconds || 0;
        const m = Math.floor(durationSec/60).toString().padStart(2,'0');
        const s = (durationSec%60).toString().padStart(2,'0');
        
        const txHash = d.tx || "Processing...";
        const shortHash = txHash.length > 20 ? txHash.substring(0, 10) + "..." + txHash.substring(txHash.length - 5) : txHash;

        // --- IL NUOVO LINK ALL'EXPLORER PUNTATO SULL'INDIRIZZO DEL WALLET ---
        const explorerLink = `https://explorer.rebased.iota.org/address/${walletAddress}?network=testnet`;

        target.innerHTML = `
            <div id="invoice-content" style="padding:40px 30px; background:#fff; font-family:'Poppins', sans-serif; color:#2d3436;">
                
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f1f2f6; padding-bottom:20px; margin-bottom:20px;">
                    <div>
                        <h1 style="margin:0; font-size:1.5rem; color:#6c5ce7;">❖ Synap</h1>
                        <p style="margin:5px 0 0 0; font-size:0.8rem; color:#b2bec3;">Smart Mobility Receipt</p>
                    </div>
                    <div style="text-align:right;">
                        <div style="background:#e3f2fd; color:#0984e3; padding:5px 12px; border-radius:20px; font-size:0.7rem; font-weight:700;">PAID</div>
                        <p style="margin:5px 0 0 0; font-size:0.7rem; color:#b2bec3;">${new Date().toLocaleString()}</p>
                    </div>
                </div>

                <div style="margin-bottom:30px;">
                    <p style="font-size:0.8rem; color:#b2bec3; text-transform:uppercase; font-weight:700; letter-spacing:1px; margin-bottom:10px;">Trip Details</p>
                    
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.9rem;">
                        <span style="color:#636e72;">Passenger</span>
                        <span style="font-weight:600;">${localStorage.getItem('synap_user')}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.9rem;">
                        <span style="color:#636e72;">Route</span>
                        <span style="font-weight:600;">${route}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.9rem;">
                        <span style="color:#636e72;">Duration</span>
                        <span style="font-weight:600;">${m}m ${s}s</span>
                    </div>
                </div>

                <div style="background:#f8f9fa; border-radius:15px; padding:25px; text-align:center; margin-bottom:30px;">
                    <p style="margin:0 0 5px 0; font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#b2bec3;">Total Paid</p>
                    <h2 style="margin:0; font-size:2.5rem; color:#2d3436;">${cost} <span style="font-size:1rem; color:#636e72;">IOTA</span></h2>
                </div>

                <div style="border-top:1px dashed #dfe6e9; padding-top:20px;">
                    <p style="font-size:0.7rem; color:#b2bec3; margin-bottom:5px;">BLOCKCHAIN PROOF (IOTA TANGLE)</p>
                    <div style="background:#f1f2f6; padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                        <code style="font-size:0.7rem; color:#636e72;">${shortHash}</code>
                        <a href="${explorerLink}" target="_blank" style="font-size:0.7rem; color:#6c5ce7; text-decoration:none; font-weight:700;">VIEW ON WALLET ↗</a>
                    </div>
                    <div style="margin-top:10px; text-align:center;">
                        <p style="font-size:0.65rem; color:#b2bec3;">Check your wallet address on the IOTA Explorer to verify this transaction.</p>
                    </div>
                </div>
            </div>

            <div style="padding:20px;">
                <button onclick="downloadPdf()" class="btn secondary" style="width:100%; margin-bottom:10px; background:#dfe6e9; color:#2d3436;">📄 Download PDF Receipt</button>
                <button onclick="location.reload()" class="btn primary" style="width:100%;">Back to Home</button>
            </div>
        `;
        refreshBalance();
    } else {
        showPopup("Error", res.data.error || "End Trip Failed", 'error');
        showView('home');
    }
}

function downloadPdf() {
    const el = document.getElementById('invoice-content');
    html2pdf().from(el).save();
}

// --- INIT ---
window.onload = async () => {
    // 1. SCARICA CONFIGURAZIONE PRIMA DI TUTTO
    await fetchRoleConfig();

    if (localStorage.getItem('synap_user')) {
        updateUI();
        showView('home');
        syncPrice();
        if(localStorage.getItem('synap_is_traveling') === 'true') {
            currentTripId = localStorage.getItem('synap_trip_id');
            showView('trip');
            startTimer();
            // Restore visual
            document.getElementById('trip-route-display').innerText = localStorage.getItem('synap_current_route');
            document.getElementById('trip-rate-display').innerText = parseFloat(localStorage.getItem('synap_current_rate')).toFixed(4);
            document.getElementById('trip-passengers-display').innerText = localStorage.getItem('synap_current_pax');
        }
    } else {
        showView('login');
    }
    
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('register-form')?.addEventListener('submit', handleRegister);
};