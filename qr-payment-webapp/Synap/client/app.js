// ==========================================
//           CONFIGURAZIONE
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

function showView(viewName) {
    Object.values(views).forEach(el => el.classList.remove('active'));
    if (views[viewName]) views[viewName].classList.add('active');
}

// SINCRONIZZA PREZZO
async function syncPrice() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/config`);
        const data = await response.json();
        if (data.costPerSecond) pricePerSecond = data.costPerSecond;
    } catch (e) {}
}

// GESTIONE PASSEGGERI
function changePassenger(delta) {
    selectedPassengers += delta;
    if (selectedPassengers < 1) selectedPassengers = 1;
    if (selectedPassengers > 10) selectedPassengers = 10;
    
    const display = document.getElementById('passenger-count-display');
    if (display) {
        display.innerText = selectedPassengers;
    }
}

// AUTH
async function handleLogin(event) {
    event.preventDefault();
    const btn = document.querySelector('#login-form button');
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
        } else alert(data.error);
    } catch (e) {} finally { btn.innerText = "Accedi"; btn.disabled = false; }
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
            alert("Registrato!"); showView('login'); document.getElementById('register-form').reset();
        } else alert(data.error);
    } catch (e) {} finally { btn.innerText = "Registrati"; btn.disabled = false; }
}

function handleLogout() { stopTripTimer(); localStorage.clear(); location.reload(); }
function updateUIProfile() { 
    const el = document.querySelector('.user-name'); 
    if(el) el.innerText = currentUser || 'Ospite'; 
}

// SCANNER
function startScanner(mode) {
    scanMode = mode || 'START';
    const title = document.querySelector('#view-scan h2');
    const manualInput = document.getElementById('manual-code-input');
    const passengerSelector = document.getElementById('passenger-selector-container');

    if (scanMode === 'END') {
        title.innerText = "🛑 SCANSIONA USCITA (OUT)"; 
        title.style.color = "red";
        if(manualInput) manualInput.placeholder = "Es. OUT-BUS-01";
        if(passengerSelector) passengerSelector.style.display = 'none';

    } else {
        title.innerText = "🟢 SCANSIONA ENTRATA (IN)"; 
        title.style.color = "var(--primary)";
        if(manualInput) manualInput.placeholder = "Es. IN-BUS-01";
        if(passengerSelector) passengerSelector.style.display = 'block';
    }

    showView('scan');
    
    const passDisplay = document.getElementById('passenger-count-display');
    if(passDisplay) passDisplay.innerText = selectedPassengers;

    if (html5QrCode) return;
    setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, ()=>{})
        .catch(err => alert("Errore fotocamera"));
    }, 300);
}
function stopScanner() { if (html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); html5QrCode = null; }).catch(()=>{}); }
function onScanSuccess(t) {
    if (scanMode === 'START' && !t.startsWith('IN-')) return alert("Usa codice IN");
    if (scanMode === 'END' && !t.startsWith('OUT-')) return alert("Usa codice OUT");
    stopScanner();
    (scanMode === 'START') ? startTrip(t) : endTrip(t);
}
function handleManualEntry() { const v = document.getElementById('manual-code-input').value.toUpperCase(); if(v) onScanSuccess(v); }

// VIAGGIO E TIMER
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
        if(!email) throw new Error("Utente non loggato");
        await syncPrice();
        
        const res = await fetch(`${API_BASE_URL}/trip/start`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ qrData, email, passengers: selectedPassengers }) 
        });
        const data = await res.json();

        if (res.status === 403 && data.error === "DEBITO_PENDENTE") {
            alert("⛔ " + data.message); showView('home'); return;
        }

        if (data.status === 'STARTED') {
            currentTripId = data.tripId; 
            showView('trip'); 
            
            // AGGIORNAMENTO UI
            const idDisp = document.getElementById('trip-id-display');
            if(idDisp) idDisp.innerText = qrData;
            
            // <--- QUI AGGIORNIAMO IL TESTO DELLA TRATTA --->
            const routeDisp = document.getElementById('trip-route-display');
            if(routeDisp) {
                // Se la rotta è definita la mostra, altrimenti mette un default
                routeDisp.innerText = data.routeName || "Tariffa Standard"; 
            }
            
            const passDisp = document.getElementById('trip-passengers-display');
            if(passDisp) passDisp.innerText = selectedPassengers;

            const rateDisp = document.getElementById('trip-rate-display');
            if(rateDisp) rateDisp.innerText = pricePerSecond;

            startTripTimer();
        } else throw new Error(data.error);
    } catch (e) { alert("Errore: " + e.message); showView('home'); }
}

async function endTrip(qrData) {
    stopTripTimer();
    showView('result');
    const box = document.querySelector('.ticket');
    box.innerHTML = `<div class="loader"></div><h3>Calcolo Pagamento...</h3>`;

    try {
        const email = localStorage.getItem('synap_email');
        const res = await fetch(`${API_BASE_URL}/trip/end`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ tripId: currentTripId, qrData, email })
        });
        const data = await res.json();

        if (data.ok) {
            let icon = "✅"; let color = "var(--primary)"; let title = "Pagato!"; let note = "";
            if (parseFloat(data.debt) > 0) {
                icon = "⚠️"; color = "#FF3B30"; title = "Pagamento Parziale";
                note = `<p style="color:red; font-weight:bold; margin-top:10px;">Saldo insufficiente.<br>Nuovo Debito: ${data.debt}</p>`;
            } 

            box.innerHTML = `
                <div style="font-size: 60px;">${icon}</div>
                <h2 style="color:${color}">${title}</h2>
                <p class="balance">-${data.paid} <small>IOTA</small></p>
                <p>Costo Totale: ${data.cost}</p>
                ${note}
                ${data.explorerUrl ? `<a href="${data.explorerUrl}" target="_blank" class="btn secondary">Vedi su Blockchain</a>` : ''}
                <button onclick="resetAppAndHome()" class="btn primary" style="margin-top:10px">Ok, ho capito</button>
            `;
            refreshBalance();
        } else throw new Error(data.error);
    } catch (e) {
        box.innerHTML = `<h3 style="color:red">Errore</h3><p>${e.message}</p><button onclick="showView('home')" class="btn secondary">Home</button>`;
    }
}

async function refreshBalance() {
    const email = localStorage.getItem('synap_email');
    if (!email) return;
    const balanceEl = document.getElementById('balance-amount');
    const debtBox = document.getElementById('debt-warning');
    const debtAmount = document.getElementById('debt-amount');
    if (balanceEl) balanceEl.style.opacity = "0.5";

    try {
        const res = await fetch(`${API_BASE_URL}/user/balance`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.balance) {
            if(balanceEl) balanceEl.innerText = data.balance;
            if (parseFloat(data.debt) > 0) {
                debtBox.style.display = "block"; debtAmount.innerText = data.debt;
            } else { debtBox.style.display = "none"; }
        }
    } catch (e) {} finally { if(balanceEl) balanceEl.style.opacity = "1"; }
}

async function handlePayDebt() {
    const email = localStorage.getItem('synap_email');
    if(!confirm("Vuoi usare il saldo per pagare il debito?")) return;
    
    const btn = document.querySelector('#debt-warning button');
    const oldText = btn.innerText;
    btn.innerText = "..."; btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE_URL}/user/pay-debt`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ email })
        });
        const data = await res.json();
        if(res.ok) { alert("✅ " + data.message); refreshBalance(); }
        else alert("❌ " + data.error);
    } catch(e) { alert("Errore rete"); } 
    finally { btn.innerText = oldText; btn.disabled = false; }
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