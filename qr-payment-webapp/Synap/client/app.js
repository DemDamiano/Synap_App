// ==========================================
//           CONFIGURAZIONE
// ==========================================
const API_BASE_URL = 'http://localhost:3000/api';

let currentUser = null;
let currentTripId = null;
let html5QrCode = null;
let scanMode = 'START'; 

// Variabili Timer
let tripInterval = null;
let tripStartTime = null;

const views = {
    login: document.getElementById('view-login'),
    home: document.getElementById('view-home'),
    scan: document.getElementById('view-scan'),
    trip: document.getElementById('view-trip'),
    result: document.getElementById('view-result')
};

// ==========================================
//           NAVIGAZIONE
// ==========================================
function showView(viewName) {
    Object.values(views).forEach(el => el.classList.remove('active'));
    if (views[viewName]) views[viewName].classList.add('active');
}

// ==========================================
//           LOGIN
// ==========================================
async function handleLogin(event) {
    event.preventDefault();
    const btn = document.querySelector('#login-form button');
    const originalText = btn.innerText;
    btn.innerText = "Attendere...";
    btn.disabled = true;

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('synap_token', data.token);
            localStorage.setItem('synap_user', data.user);
            localStorage.setItem('synap_email', data.email);
            currentUser = data.user;
            updateUIProfile();
            showView('home');
            refreshBalance(); // Refresh all'avvio
        } else {
            alert(data.error || "Errore Login");
        }
    } catch (e) { alert("Errore connessione server"); }
    finally { btn.innerText = originalText; btn.disabled = false; }
}

function handleLogout() {
    stopTripTimer();
    localStorage.clear();
    location.reload();
}

function updateUIProfile() {
    const el = document.querySelector('.user-name');
    if (el) el.innerText = currentUser || 'Ospite';
}

// ==========================================
//           SCANNER INTELLIGENTE
// ==========================================
function startScanner(mode) {
    scanMode = mode || 'START';
    
    const title = document.querySelector('#view-scan h2');
    const manualInput = document.getElementById('manual-code-input');

    if (scanMode === 'END') {
        title.innerText = "🛑 SCANSIONA USCITA (OUT)";
        title.style.color = "red";
        if(manualInput) manualInput.placeholder = "Es. OUT-BUS-01";
    } else {
        title.innerText = "🟢 SCANSIONA ENTRATA (IN)";
        title.style.color = "var(--primary)";
        if(manualInput) manualInput.placeholder = "Es. IN-BUS-01";
    }

    showView('scan');

    if (html5QrCode) return;

    setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: { width: 250, height: 250 } }, 
            onScanSuccess,
            () => {} 
        ).catch(err => alert("Errore fotocamera: " + err));
    }, 300);
}

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => { html5QrCode.clear(); html5QrCode = null; }).catch(()=>{});
    }
}

function onScanSuccess(decodedText, decodedResult) {
    if (scanMode === 'START') {
        if (!decodedText.startsWith('IN-')) {
            alert("❌ Errore! Scansiona un codice IN.");
            return; 
        }
        stopScanner();
        startTrip(decodedText);
    } 
    else if (scanMode === 'END') {
        if (!decodedText.startsWith('OUT-')) {
            alert("❌ Errore! Scansiona un codice OUT.");
            return; 
        }
        stopScanner();
        endTrip(decodedText);
    }
}

function handleManualEntry() {
    const el = document.getElementById('manual-code-input');
    if(!el) return;
    const code = el.value.trim().toUpperCase();
    if (!code) return;
    onScanSuccess(code, null);
}

// ==========================================
//           LOGICA VIAGGIO & TIMER
// ==========================================

function startTripTimer() {
    tripStartTime = Date.now();
    const timerEl = document.getElementById('trip-timer');
    const costEl = document.getElementById('trip-cost');
    
    // Controllo sicurezza
    if(!timerEl || !costEl) {
        console.error("Elementi timer non trovati nel DOM!");
        return;
    }

    timerEl.innerText = "00:00";
    costEl.innerText = "0.00";

    // Aggiorna ogni secondo
    tripInterval = setInterval(() => {
        const now = Date.now();
        const diffInSeconds = Math.floor((now - tripStartTime) / 1000);
        
        // 1. Tempo
        const minutes = Math.floor(diffInSeconds / 60).toString().padStart(2, '0');
        const seconds = (diffInSeconds % 60).toString().padStart(2, '0');
        timerEl.innerText = `${minutes}:${seconds}`;

        // 2. Costo Visivo (0.01 IOTA al secondo)
        const currentCost = (diffInSeconds * 0.01);
        costEl.innerText = currentCost.toFixed(2);

    }, 1000);
}

function stopTripTimer() {
    if (tripInterval) {
        clearInterval(tripInterval);
        tripInterval = null;
    }
}

async function startTrip(qrData) {
    try {
        const res = await fetch(`${API_BASE_URL}/trip/start`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ qrData })
        });
        const data = await res.json();
        if (data.status === 'STARTED') {
            currentTripId = data.tripId;
            showView('trip');
            document.getElementById('trip-id-display').innerText = qrData;
            
            // AVVIA IL TIMER
            startTripTimer();
        }
    } catch (e) { alert("Errore avvio viaggio"); showView('home'); }
}

async function endTrip(qrData) {
    stopTripTimer(); // Ferma il timer visivo
    
    showView('result');
    const box = document.querySelector('.ticket');
    box.innerHTML = `<div class="loader"></div><h3>Elaborazione...</h3>`;

    try {
        const email = localStorage.getItem('synap_email');
        const res = await fetch(`${API_BASE_URL}/trip/end`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ tripId: currentTripId, qrData, email })
        });
        const data = await res.json();

        if (data.ok) {
            box.innerHTML = `
                <div style="font-size: 60px;">✅</div>
                <h2 style="color:var(--primary)">Pagato!</h2>
                <p class="balance">-${data.cost} <small>IOTA</small></p>
                <a href="${data.explorerUrl}" target="_blank" class="btn secondary">Ricevuta Blockchain</a>
                
                <button onclick="resetAppAndHome()" class="btn primary" style="margin-top:10px">Nuovo Viaggio</button>
            `;
            // Aggiorna subito il saldo nella home (in background)
            refreshBalance();
        } else { throw new Error(data.error); }
    } catch (e) {
        box.innerHTML = `<h3 style="color:var(--danger)">Errore</h3><p>${e.message}</p><button onclick="showView('home')" class="btn secondary">Home</button>`;
    }
}

async function refreshBalance() {
    const email = localStorage.getItem('synap_email');
    if (!email) return;

    const balanceEl = document.getElementById('balance-amount');
    if (!balanceEl) return;

    balanceEl.style.opacity = "0.5"; 

    try {
        const response = await fetch(`${API_BASE_URL}/user/balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (data.balance) {
            balanceEl.innerText = data.balance; 
        }
    } catch (e) {
        console.error("Errore saldo", e);
    } finally {
        if(balanceEl) balanceEl.style.opacity = "1";
    }
}

// NUOVA FUNZIONE DI RESET
function resetAppAndHome() {
    // 1. Torna alla Home
    showView('home');
    
    // 2. Forza l'aggiornamento del saldo
    refreshBalance();
    
    // 3. Resetta variabili di stato
    currentTripId = null;
    scanMode = 'START';
}

// STARTUP
document.addEventListener('DOMContentLoaded', () => {
    const user = localStorage.getItem('synap_user');
    if (user) { 
        currentUser = user; 
        updateUIProfile(); 
        showView('home'); 
        refreshBalance();
    } else {
        showView('login');
    }
    const form = document.getElementById('login-form');
    if(form) form.addEventListener('submit', handleLogin);
});