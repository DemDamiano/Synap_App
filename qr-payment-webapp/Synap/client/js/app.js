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

// --- POPUP MANAGEMENT ---
function showPopup(title, msg, type = 'info') {
    const modal = document.getElementById('custom-modal');
    const mTitle = document.getElementById('modal-title');
    const mMsg = document.getElementById('modal-msg');
    const mIcon = document.getElementById('modal-icon');

    mTitle.innerText = title;
    mMsg.innerHTML = msg; 
    
    if (type === 'error') {
        mIcon.innerText = '❌';
    } else if (type === 'success') {
        mIcon.innerText = '✅';
    } else {
        mIcon.innerText = 'ℹ️';
    }

    modal.classList.add('open');
}

function closeModal() {
    document.getElementById('custom-modal').classList.remove('open');
}

// NAVIGATION
function showView(viewName) {
    Object.values(views).forEach(el => el.classList.remove('active'));
    if (views[viewName]) views[viewName].classList.add('active');
}

// SYNC PRICE
async function syncPrice() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/config`);
        const data = await response.json();
        if (data.costPerSecond) pricePerSecond = data.costPerSecond;
    } catch (e) {}
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

    try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (res.ok) {
            localStorage.setItem('synap_token', data.token);
            localStorage.setItem('synap_user', data.user);
            localStorage.setItem('synap_email', data.email);
            currentUser = data.user;
            updateUIProfile();
            showView('home');
            refreshBalance();
            syncPrice();
        } else {
            showPopup("Login Error", data.error, 'error');
        }
    } catch (e) {
        showPopup("Error", "Cannot connect to server", 'error');
    } finally { 
        btn.innerText = oldText; btn.disabled = false; 
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const btn = document.querySelector('#register-form button');
    btn.innerText = "..."; btn.disabled = true;
    
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    
    try {
        const res = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (res.ok) {
            showPopup("Registered!", "Account created successfully. Please login.", 'success');
            showView('login'); 
            document.getElementById('register-form').reset();
        } else {
            showPopup("Registration Error", data.error, 'error');
        }
    } catch (e) {
        showPopup("Error", "Cannot connect to server", 'error');
    } finally { 
        btn.innerText = "Sign Up"; btn.disabled = false; 
    }
}

function handleLogout() { stopTripTimer(); localStorage.clear(); location.reload(); }
function updateUIProfile() { 
    const el = document.querySelector('.user-name'); 
    if(el) el.innerText = currentUser || 'Guest'; 
}

// SCANNER (UPDATED: Hides passenger selection on checkout)
function startScanner(mode) {
    scanMode = mode || 'START';
    const manualInput = document.getElementById('manual-code-input');
    const passengerBox = document.getElementById('passenger-selection-box');
    
    if (scanMode === 'END') {
        if(manualInput) manualInput.placeholder = "Eg. OUT-BUS-01";
        // HIDE passenger selector on exit
        if(passengerBox) passengerBox.style.display = 'none';
    } else {
        if(manualInput) manualInput.placeholder = "Eg. IN-BUS-01";
        // SHOW passenger selector on entry
        if(passengerBox) passengerBox.style.display = 'block';
    }

    showView('scan');
    const passDisplay = document.getElementById('passenger-count-display');
    if(passDisplay) passDisplay.innerText = selectedPassengers;

    if (html5QrCode) return;
    setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, ()=>{})
        .catch(err => showPopup("Camera Error", "Cannot start camera", 'error'));
    }, 300);
}

function stopScanner() { if (html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); html5QrCode = null; }).catch(()=>{}); }

function onScanSuccess(t) {
    if (scanMode === 'START' && !t.startsWith('IN-')) return showPopup("Wrong Code", "You must scan an <b>ENTRY (IN)</b> code", 'error');
    if (scanMode === 'END' && !t.startsWith('OUT-')) return showPopup("Wrong Code", "You must scan an <b>EXIT (OUT)</b> code", 'error');
    stopScanner();
    (scanMode === 'START') ? startTrip(t) : endTrip(t);
}

function handleManualEntry() { const v = document.getElementById('manual-code-input').value.toUpperCase(); if(v) onScanSuccess(v); }

// TRIP & TIMER
function startTripTimer() {
    tripStartTime = Date.now();
    const timerEl = document.getElementById('trip-timer');
    const costEl = document.getElementById('trip-cost');
    if(!timerEl || !costEl) return;
    
    timerEl.innerText = "00:00"; costEl.innerText = "0.00";
    
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
    try {
        const email = localStorage.getItem('synap_email');
        if(!email) throw new Error("User not logged in");
        await syncPrice();
        
        const res = await fetch(`${API_BASE_URL}/trip/start`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ qrData, email, passengers: selectedPassengers }) 
        });
        const data = await res.json();

        if (res.status === 403 && data.error === "PENDING_DEBT") {
            showPopup("⛔ Stop!", data.message, 'error');
            showView('home'); 
            return;
        }

        if (data.status === 'STARTED') {
            currentTripId = data.tripId; 
            showView('trip'); 
            
            const idDisp = document.getElementById('trip-id-display');
            if(idDisp) idDisp.innerText = qrData;
            
            const routeDisp = document.getElementById('trip-route-display');
            if(routeDisp) routeDisp.innerText = data.routeName || "Standard"; 
            
            const passDisp = document.getElementById('trip-passengers-display');
            if(passDisp) passDisp.innerText = selectedPassengers;

            const rateDisp = document.getElementById('trip-rate-display');
            if(rateDisp) rateDisp.innerText = pricePerSecond;

            startTripTimer();
        } else throw new Error(data.error);
    } catch (e) { 
        showPopup("Start Error", e.message, 'error'); 
        showView('home'); 
    }
}

async function endTrip(qrData) {
    stopTripTimer();
    showView('result');
    const box = document.querySelector('.ticket');
    box.innerHTML = `<div class="loader" style="color:#636e72; text-align:center; padding:20px;">Calculating Payment...</div>`;

    try {
        const email = localStorage.getItem('synap_email');
        const res = await fetch(`${API_BASE_URL}/trip/end`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ tripId: currentTripId, qrData, email })
        });
        const data = await res.json();

        if (data.ok) {
            let icon = "✅"; 
            let color = "#a18cd1"; 
            let title = "PAID!"; 
            let note = "";

            if (parseFloat(data.debt) > 0) {
                icon = "⚠️"; 
                color = "#ff7675"; 
                title = "PARTIAL";
                note = `<p style="color:#d63031; font-weight:600; margin-top:15px; background:#ffecec; padding:10px; border-radius:10px;">Insufficient balance.<br>New Debt: ${data.debt}</p>`;
            } 

            box.innerHTML = `
                <div style="font-size: 60px; margin-bottom:10px;">${icon}</div>
                <h2 style="color:${color}; font-weight:700; letter-spacing:1px; margin-bottom:15px;">${title}</h2>
                <div style="background:#f1f2f6; padding:25px; border-radius:20px; margin-bottom:10px;">
                    <p class="balance" style="font-size:3rem; margin:0; color:#2d3436; font-weight:700;">-${data.paid}</p>
                    <p style="color:#b2bec3; margin-top:0;">IOTA</p>
                    <div style="border-top:1px solid #dfe6e9; margin-top:15px; padding-top:15px; font-size:0.9rem; color:#636e72;">
                        Total Cost: <strong>${data.cost}</strong>
                    </div>
                </div>
                ${note}
                ${data.explorerUrl ? `<a href="${data.explorerUrl}" target="_blank" class="btn secondary" style="margin-top:20px; display:inline-block; text-decoration:none; font-size:0.8rem;">🔗 View on Blockchain</a>` : ''}
                <button onclick="resetAppAndHome()" class="btn primary" style="margin-top:20px">HOME</button>
            `;
            refreshBalance();
        } else throw new Error(data.error);
    } catch (e) {
        box.innerHTML = `<h3 style="color:#ff7675">Error</h3><p>${e.message}</p><button onclick="showView('home')" class="btn secondary">Home</button>`;
    }
}

// Aggiorna il saldo e controlla i debiti
async function refreshBalance() {
    const email = localStorage.getItem('synap_email');
    if (!email) return;

    // Chiamata al server
    const res = await apiCall('/user/balance', 'POST', { email });
    
    if (res.ok) {
        // 1. Aggiorna il saldo a video
        const balEl = document.getElementById('balance-amount');
        if(balEl) balEl.innerText = res.data.balance;
        
        // 2. Gestione Debito
        const debtBox = document.getElementById('debt-warning');
        const scanBtn = document.getElementById('btn-scan-start');
        const debtAmount = parseFloat(res.data.debt);

        if (debtAmount > 0.00) {
            // HA DEBITI: Mostra box rosso, disabilita Scan
            if(debtBox) {
                debtBox.style.display = 'block';
                document.getElementById('debt-amount').innerText = res.data.debt;
            }
            if(scanBtn) {
                scanBtn.disabled = true;
                scanBtn.style.opacity = "0.5";
                scanBtn.innerText = "BLOCCATO (DEBITO)";
            }
        } else {
            // TUTTO OK: Nascondi box rosso, abilita Scan
            if(debtBox) debtBox.style.display = 'none';
            if(scanBtn) {
                scanBtn.disabled = false;
                scanBtn.style.opacity = "1";
                scanBtn.innerText = "SCAN QR (CHECK-IN)";
            }
        }
    }
}

// Gestisce il click sul pulsante "SALDA DEBITO ORA"
async function handlePayDebt() {
    const debtAmount = document.getElementById('debt-amount').innerText;
    
    if(!confirm(`Confermi di voler pagare ${debtAmount} IOTA per saldare il debito?`)) return;

    const btn = document.getElementById('btn-pay-debt');
    const originalText = btn.innerText;
    btn.innerText = "Pagamento in corso...";
    btn.disabled = true;

    const email = localStorage.getItem('synap_email');
    const res = await apiCall('/user/pay-debt', 'POST', { email });

    if (res.ok) {
        showPopup("Debito Saldato! 🎉", `Hai pagato ${res.data.paid} IOTA. Ora puoi viaggiare.`, 'success');
        refreshBalance(); // Aggiorna la UI
    } else {
        // Gestione errori specifici (es. Fondi insufficienti)
        let msg = res.data.error;
        if (msg.includes("Saldo insufficiente")) {
            msg = "Non hai abbastanza IOTA nel wallet per pagare il debito.<br><br><b>Ricarica il tuo wallet tramite Faucet!</b>";
        }
        showPopup("Errore Pagamento", msg, 'error');
    }

    btn.innerText = originalText;
    btn.disabled = false;
}

function resetAppAndHome() {
    showView('home'); refreshBalance(); currentTripId = null; scanMode = 'START';
    selectedPassengers = 1;
    if(document.getElementById('passenger-count-display')) document.getElementById('passenger-count-display').innerText = "1";
}

document.addEventListener('DOMContentLoaded', () => {
    const user = localStorage.getItem('synap_user');
    if (user) { 
        currentUser = user; updateUIProfile(); showView('home'); refreshBalance(); syncPrice();
    } else showView('login');
    const l = document.getElementById('login-form'); if(l) l.addEventListener('submit', handleLogin);
    const r = document.getElementById('register-form'); if(r) r.addEventListener('submit', handleRegister);
});