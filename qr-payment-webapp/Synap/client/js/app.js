// ==========================================
//           CONFIGURATION
// ==========================================
const API_BASE_URL = 'http://localhost:3000/api';

let currentUser = null;
let currentTripId = null;
let html5QrCode = null;
let scanMode = 'START'; 

let tripInterval = null;
let tripStartTime = null;
let pricePerSecond = 0.01;
let selectedPassengers = 1;

const views = {
    login: document.getElementById('view-login'),
    register: document.getElementById('view-register'),
    home: document.getElementById('view-home'),
    scan: document.getElementById('view-scan'),
    trip: document.getElementById('view-trip'),
    result: document.getElementById('view-result')
};

// --- HELPER FUNZIONI (ESSENZIALE!) ---
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, config);
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
    } catch (e) {
        return { ok: false, data: { error: "Errore di connessione al server" } };
    }
}

// --- POPUP MANAGEMENT ---
function showPopup(title, msg, type = 'info') {
    const modal = document.getElementById('custom-modal');
    const mTitle = document.getElementById('modal-title');
    const mMsg = document.getElementById('modal-msg');
    const mIcon = document.getElementById('modal-icon');

    if(mTitle) mTitle.innerText = title;
    if(mMsg) mMsg.innerHTML = msg; 
    
    if(mIcon) {
        if (type === 'error') mIcon.innerText = '❌';
        else if (type === 'success') mIcon.innerText = '✅';
        else mIcon.innerText = 'ℹ️';
    }

    if(modal) modal.classList.add('open');
}

function closeModal() {
    const modal = document.getElementById('custom-modal');
    if(modal) modal.classList.remove('open');
}

// NAVIGATION
function showView(viewName) {
    Object.values(views).forEach(el => { if(el) el.classList.remove('active'); });
    if (views[viewName]) views[viewName].classList.add('active');
}

// SYNC PRICE
async function syncPrice() {
    // Usa dashboard per prendere la config perché contiene tutto
    const res = await apiCall('/admin/config'); 
    if (res.ok && res.data.costPerSecond) {
        pricePerSecond = res.data.costPerSecond;
    }
}

// PASSENGERS
function changePassenger(delta) {
    selectedPassengers += delta;
    if (selectedPassengers < 1) selectedPassengers = 1;
    if (selectedPassengers > 10) selectedPassengers = 10;
    const display = document.getElementById('passenger-count-display');
    if (display) display.innerText = selectedPassengers;
}

// AUTH
async function handleLogin(event) {
    event.preventDefault();
    const btn = document.querySelector('#login-form button');
    const oldText = btn.innerText;
    btn.innerText = "..."; btn.disabled = true;
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const res = await apiCall('/auth/login', 'POST', { email, password });
        
    if (res.ok) {
        localStorage.setItem('synap_token', res.data.token);
        localStorage.setItem('synap_user', res.data.user);
        localStorage.setItem('synap_email', res.data.email);
        currentUser = res.data.user;
        updateUIProfile();
        showView('home');
        refreshBalance();
        syncPrice();
    } else {
        showPopup("Errore Login", res.data.error, 'error');
    }
    btn.innerText = oldText; btn.disabled = false; 
}

async function handleRegister(event) {
    event.preventDefault();
    const btn = document.querySelector('#register-form button');
    btn.innerText = "..."; btn.disabled = true;
    
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    
    const res = await apiCall('/auth/register', 'POST', { name, email, password });

    if (res.ok) {
        showPopup("Registrato!", "Account creato. Ora fai il login.", 'success');
        showView('login'); 
        document.getElementById('register-form').reset();
    } else {
        showPopup("Errore Registrazione", res.data.error, 'error');
    }
    btn.innerText = "Sign Up"; btn.disabled = false; 
}

function handleLogout() { stopTripTimer(); localStorage.clear(); location.reload(); }

function updateUIProfile() { 
    const el = document.querySelector('.user-name'); 
    if(el) el.innerText = localStorage.getItem('synap_user') || 'Guest'; 
}

// Gestisce quale bottone mostrare nella Home
function updateHomeButtons() {
    const isTraveling = localStorage.getItem('synap_is_traveling') === 'true';
    const btnStart = document.getElementById('btn-scan-start');
    const btnEnd = document.getElementById('btn-scan-end');
    const textOr = document.getElementById('text-or-scan');

    if (isTraveling) {
        // SEI IN VIAGGIO: Nascondi Start, Mostra End
        if(btnStart) btnStart.style.display = 'none';
        if(textOr) textOr.style.display = 'none'; // Nascondo anche il testo inutile
        if(btnEnd) btnEnd.style.display = 'block';
    } else {
        // SEI FERMO: Mostra Start, Nascondi End
        if(btnStart) btnStart.style.display = 'block';
        if(textOr) textOr.style.display = 'none'; // Nascondo testo per pulizia
        if(btnEnd) btnEnd.style.display = 'none';
    }
}

// --- BALANCE & DEBT ---
async function refreshBalance() {
    const email = localStorage.getItem('synap_email');
    if (!email) return;

    const res = await apiCall('/user/balance', 'POST', { email });
    
    if (res.ok) {
        const balEl = document.getElementById('balance-amount');
        if(balEl) balEl.innerText = res.data.balance;
        
        const debtBox = document.getElementById('debt-warning');
        const scanBtn = document.getElementById('btn-scan-start');
        const debtAmountVal = parseFloat(res.data.debt);

        if (debtAmountVal > 0.00) {
            // MOSTRA DEBITO
            if(debtBox) {
                debtBox.style.display = 'block';
                const dAmount = document.getElementById('debt-amount');
                if(dAmount) dAmount.innerText = res.data.debt;
            }
            // DISABILITA SCAN
            if(scanBtn) {
                scanBtn.disabled = true;
                scanBtn.style.opacity = "0.5";
                scanBtn.innerText = "BLOCCATO (DEBITO)";
            }
        } else {
            // NASCONDI DEBITO
            if(debtBox) debtBox.style.display = 'none';
            // ABILITA SCAN
            if(scanBtn) {
                scanBtn.disabled = false;
                scanBtn.style.opacity = "1";
                scanBtn.innerText = "SCAN QR (CHECK-IN)";
            }
        }
    }
}

async function handlePayDebt() {
    const debtAmount = document.getElementById('debt-amount') ? document.getElementById('debt-amount').innerText : "0";
    if(!confirm(`Confermi di voler pagare ${debtAmount} IOTA per saldare il debito?`)) return;

    const email = localStorage.getItem('synap_email');
    const res = await apiCall('/user/pay-debt', 'POST', { email });

    if (res.ok) {
        showPopup("Debito Saldato!", `Hai pagato ${res.data.paid} IOTA.`, 'success');
        refreshBalance();
    } else {
        showPopup("Errore", res.data.error, 'error');
    }
}

// SCANNER
function startScanner(mode) {
    scanMode = mode || 'START';
    const manualInput = document.getElementById('manual-code-input');
    const passengerBox = document.getElementById('passenger-selection-box');
    
    // LOGICA VISIVA INTELLIGENTE
    if (scanMode === 'END') {
        // MODALITÀ USCITA (CHECK-OUT)
        if(manualInput) manualInput.placeholder = "Manual checkout";
        // Nascondiamo la selezione passeggeri (escono tutti di default)
        if(passengerBox) passengerBox.style.display = 'none';
    } else {
        // MODALITÀ ENTRATA (CHECK-IN)
        if(manualInput) manualInput.placeholder = "Manual checkin";
        // Mostriamo la selezione passeggeri
        if(passengerBox) passengerBox.style.display = 'block';
    }

    showView('scan');
    
    // Resettiamo visualizzazione a quanto selezionato
    const passDisplay = document.getElementById('passenger-count-display');
    if(passDisplay) passDisplay.innerText = selectedPassengers;

    if (html5QrCode) return;
    
    setTimeout(() => {
        if(document.getElementById("reader")) {
            html5QrCode = new Html5Qrcode("reader");
            html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, ()=>{})
            .catch(err => {
                console.log("Camera error (possibile su desktop):", err);
            });
        }
    }, 300);
}

function stopScanner() { if (html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); html5QrCode = null; }).catch(()=>{}); }

function onScanSuccess(t) {
    stopScanner();
    (scanMode === 'START') ? startTrip(t) : endTrip(t);
}

function handleManualEntry() { const v = document.getElementById('manual-code-input').value; if(v) onScanSuccess(v); }

// TRIP & TIMER
function startTripTimer() {
    tripStartTime = Date.now();
    const timerEl = document.getElementById('trip-timer');
    const costEl = document.getElementById('trip-cost');
    if(!timerEl || !costEl) return;
    
    document.getElementById('trip-timer').style.display = 'block';
    
    tripInterval = setInterval(() => {
        const diff = Math.floor((Date.now() - tripStartTime) / 1000);
        const min = Math.floor(diff / 60).toString().padStart(2, '0');
        const sec = (diff % 60).toString().padStart(2, '0');
        timerEl.innerText = `${min}:${sec}`;
        const currentCost = (diff * pricePerSecond * selectedPassengers);
        costEl.innerText = currentCost.toFixed(2);
    }, 1000);
}
function stopTripTimer() { if (tripInterval) { clearInterval(tripInterval); tripInterval = null; } }

async function startTrip(qrData) {
    const email = localStorage.getItem('synap_email');
    await syncPrice();
    
    const res = await apiCall('/trip/start', 'POST', { qrData, email, passengers: selectedPassengers });

    if (res.ok) {
        currentTripId = res.data.tripId; 
        
        // --- SALVO STATO VIAGGIO ---
        localStorage.setItem('synap_trip_id', currentTripId);
        localStorage.setItem('synap_is_traveling', 'true');
        updateHomeButtons(); // Aggiorna UI
        // ---------------------------

        showView('trip'); 
        
        // ... (resto del codice uguale per display dati) ...
        document.getElementById('trip-id-display').innerText = qrData;
        document.getElementById('trip-route-display').innerText = res.data.routeName || "Standard"; 
        document.getElementById('trip-passengers-display').innerText = selectedPassengers;
        document.getElementById('trip-rate-display').innerText = pricePerSecond;

        startTripTimer();
    } else {
        showPopup("Stop!", res.data.message || res.data.error, 'error');
        showView('home');
    }
}

async function endTrip(qrData) {
    stopTripTimer();
    showView('result');
    const box = document.querySelector('.ticket');
    box.innerHTML = `<div class="loader" style="text-align:center; padding:20px;">🔄 Calcolo e Pagamento Blockchain...</div>`;

    // Recupera ID dal server o dal local storage se manca
    const tripId = currentTripId || localStorage.getItem('synap_trip_id');
    const email = localStorage.getItem('synap_email');
    
    const res = await apiCall('/trip/end', 'POST', { tripId: tripId, qrData, email });

    if (res.ok) {
        // --- RESETTO STATO VIAGGIO ---
        localStorage.removeItem('synap_trip_id');
        localStorage.setItem('synap_is_traveling', 'false');
        currentTripId = null;
        // -----------------------------

        // ... (Codice visualizzazione ticket uguale a prima) ...
        const d = res.data;
        // ... (Generazione HTML ticket) ...
        // Assicurati che l'HTML del ticket sia lo stesso di prima
        
        // Esempio breve del ticket (usa il tuo completo):
        let title = parseFloat(d.debt) > 0 ? "PARZIALE" : "PAGATO";
        box.innerHTML = `
            <h2 style="color:#a18cd1; text-align:center">${title}</h2>
            <div style="text-align:center; font-size:2rem; font-weight:bold;">-${d.paid} IOTA</div>
            <div style="text-align:center; margin-top:10px">Costo: ${d.cost}</div>
            <button onclick="resetAppAndHome()" class="btn primary" style="margin-top:20px">TORNA ALLA HOME</button>
        `;

        refreshBalance();
    } else {
        box.innerHTML = `<h3 style="color:#ff7675">Errore</h3><p>${res.data.error}</p><button onclick="showView('home')" class="btn secondary">Home</button>`;
    }
}

function resetAppAndHome() {
    showView('home'); 
    refreshBalance(); 
    currentTripId = null; 
    scanMode = 'START';
    selectedPassengers = 1;
    if(document.getElementById('passenger-count-display')) document.getElementById('passenger-count-display').innerText = "1";
    
    // Aggiorna bottoni quando torni alla home
    updateHomeButtons();
}

document.addEventListener('DOMContentLoaded', () => {
    const user = localStorage.getItem('synap_user');
    if (user) { 
        currentUser = user; 
        updateUIProfile(); 
        
        // Recupera ID viaggio se c'era un refresh pagina mentre viaggiavi
        const savedTripId = localStorage.getItem('synap_trip_id');
        if(savedTripId) {
            currentTripId = savedTripId;
            // Opzionale: potresti voler rimandare direttamente alla vista 'trip' se stava viaggiando
        }

        showView('home'); 
        refreshBalance(); 
        syncPrice();
        updateHomeButtons(); // <--- IMPORTANTE: Chiama al caricamento
    } else {
        showView('login');
    }
    
    const l = document.getElementById('login-form'); if(l) l.addEventListener('submit', handleLogin);
    const r = document.getElementById('register-form'); if(r) r.addEventListener('submit', handleRegister);
});

document.addEventListener('DOMContentLoaded', () => {
    const user = localStorage.getItem('synap_user');
    if (user) { 
        currentUser = user; 
        updateUIProfile(); 
        showView('home'); 
        refreshBalance(); 
        syncPrice();
    } else {
        showView('login');
    }
    
    const l = document.getElementById('login-form'); if(l) l.addEventListener('submit', handleLogin);
    const r = document.getElementById('register-form'); if(r) r.addEventListener('submit', handleRegister);
});