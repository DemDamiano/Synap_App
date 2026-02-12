// ==========================================
//          CONFIGURATION
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

function showView(viewName) {
    Object.values(views).forEach(el => { if(el) el.classList.remove('active'); });
    if (views[viewName]) views[viewName].classList.add('active');
}

async function syncPrice() {
    const res = await apiCall('/admin/config'); 
    if (res.ok && res.data.costPerSecond) {
        pricePerSecond = res.data.costPerSecond;
    }
}

function changePassenger(delta) {
    selectedPassengers += delta;
    if (selectedPassengers < 1) selectedPassengers = 1;
    if (selectedPassengers > 10) selectedPassengers = 10;
    const display = document.getElementById('passenger-count-display');
    if (display) display.innerText = selectedPassengers;
}

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
    } else { showPopup("Login Error", res.data.error, 'error'); }
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
        showPopup("Registered!", "Account created.", 'success');
        showView('login'); 
        document.getElementById('register-form').reset();
    } else { showPopup("Error", res.data.error, 'error'); }
    btn.innerText = "Sign Up"; btn.disabled = false; 
}

function handleLogout() { stopTripTimer(); localStorage.clear(); location.reload(); }
function updateUIProfile() { 
    const el = document.querySelector('.user-name'); 
    if(el) el.innerText = localStorage.getItem('synap_user') || 'Guest'; 
}

function updateHomeButtons() {
    const isTraveling = localStorage.getItem('synap_is_traveling') === 'true';
    const btnStart = document.getElementById('btn-scan-start');
    const btnEnd = document.getElementById('btn-scan-end');
    const textOr = document.getElementById('text-or-scan');
    if (isTraveling) {
        if(btnStart) btnStart.style.display = 'none';
        if(textOr) textOr.style.display = 'none'; 
        if(btnEnd) btnEnd.style.display = 'block';
    } else {
        if(btnStart) btnStart.style.display = 'block';
        if(textOr) textOr.style.display = 'none'; 
        if(btnEnd) btnEnd.style.display = 'none';
    }
}

async function refreshBalance() {
    const email = localStorage.getItem('synap_email');
    if (!email) return;
    const res = await apiCall('/user/balance', 'POST', { email });
    if (res.ok) {
        const balEl = document.getElementById('balance-amount');
        if(balEl) balEl.innerText = res.data.balance;
        const lockedVal = parseFloat(res.data.locked || 0);
        const lockedEl = document.getElementById('locked-balance-info');
        if (lockedEl) {
            lockedEl.style.display = lockedVal > 0 ? 'block' : 'none';
            lockedEl.innerText = `🔒 ${lockedVal.toFixed(2)} Reserved`;
        }
        
        const debtBox = document.getElementById('debt-warning');
        const scanBtn = document.getElementById('btn-scan-start');
        const debtAmountVal = parseFloat(res.data.debt);
        if (debtAmountVal > 0.00) {
            if(debtBox) { debtBox.style.display = 'block'; document.getElementById('debt-amount').innerText = res.data.debt; }
            if(scanBtn) { scanBtn.disabled = true; scanBtn.style.opacity = "0.5"; scanBtn.innerText = "LOCKED (DEBT)"; }
        } else {
            if(debtBox) debtBox.style.display = 'none';
            if(scanBtn) { scanBtn.disabled = false; scanBtn.style.opacity = "1"; scanBtn.innerText = "SCAN QR (CHECK-IN)"; }
        }
    }
}

async function handlePayDebt() {
    const debtAmount = document.getElementById('debt-amount') ? document.getElementById('debt-amount').innerText : "0";
    if(!confirm(`Confirm payment?`)) return;
    const email = localStorage.getItem('synap_email');
    const res = await apiCall('/user/pay-debt', 'POST', { email });
    if (res.ok) { showPopup("Paid!", `Settled ${res.data.paid} IOTA.`, 'success'); refreshBalance(); }
    else { showPopup("Error", res.data.error, 'error'); }
}

function startScanner(mode) {
    scanMode = mode || 'START';
    const manualInput = document.getElementById('manual-code-input');
    const passengerBox = document.getElementById('passenger-selection-box');
    if (scanMode === 'END') {
        if(manualInput) manualInput.placeholder = "Manual checkout";
        if(passengerBox) passengerBox.style.display = 'none';
    } else {
        if(manualInput) manualInput.placeholder = "Manual checkin";
        if(passengerBox) passengerBox.style.display = 'block';
    }
    showView('scan');
    const passDisplay = document.getElementById('passenger-count-display');
    if(passDisplay) passDisplay.innerText = selectedPassengers;
    if (html5QrCode) return;
    
    setTimeout(() => {
        if(document.getElementById("reader")) {
            html5QrCode = new Html5Qrcode("reader");
            html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, ()=>{})
            .catch(err => { console.log("Camera error:", err); });
        }
    }, 300);
}

function stopScanner() { if (html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); html5QrCode = null; }).catch(()=>{}); }

function onScanSuccess(t) {
    stopScanner();
    (scanMode === 'START') ? startTrip(t) : endTrip(t);
}

function handleManualEntry() { const v = document.getElementById('manual-code-input').value; if(v) onScanSuccess(v); }

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
    
    // IMPORTANTE: Invio esplicito dei passeggeri selezionati
    const res = await apiCall('/trip/start', 'POST', { qrData, email, passengers: selectedPassengers });

    if (res.ok) {
        currentTripId = res.data.tripId; 
        localStorage.setItem('synap_trip_id', currentTripId);
        localStorage.setItem('synap_is_traveling', 'true');
        updateHomeButtons(); 

        showView('trip'); 
        document.getElementById('trip-id-display').innerText = qrData;
        document.getElementById('trip-route-display').innerText = res.data.routeName || "Standard"; 
        document.getElementById('trip-passengers-display').innerText = selectedPassengers;
        document.getElementById('trip-rate-display').innerText = pricePerSecond;

        startTripTimer();
        refreshBalance(); 
    } else {
        showPopup("Stop!", res.data.message || res.data.error, 'error');
        showView('home');
    }
}

// --- NEW INVOICE & PDF LOGIC ---
async function endTrip(qrData) {
    stopTripTimer();
    showView('result');
    const box = document.querySelector('.ticket');
    box.innerHTML = `<div class="loader" style="text-align:center; padding:20px;">🔄 Blockchain Settlement...</div>`;

    const tripId = currentTripId || localStorage.getItem('synap_trip_id');
    const email = localStorage.getItem('synap_email');
    
    const res = await apiCall('/trip/end', 'POST', { tripId: tripId, qrData, email });

    if (res.ok) {
        localStorage.removeItem('synap_trip_id');
        localStorage.setItem('synap_is_traveling', 'false');
        currentTripId = null;

        const d = res.data;
        let title = parseFloat(d.debt) > 0 ? "PARTIAL PAYMENT" : "PAYMENT SUCCESSFUL";
        let color = parseFloat(d.debt) > 0 ? "#e17055" : "#a18cd1";
        
        // FIX: Conversione sicura durata e passeggeri per evitare NaN/undefined
        const durationSec = Number(d.durationSeconds) || 0;
        const m = Math.floor(durationSec / 60).toString().padStart(2,'0');
        const s = Math.floor(durationSec % 60).toString().padStart(2,'0');
        const pax = d.passengers || 1;
        const rate = d.rate || 0.01;

        const fullTxId = d.explorerUrl ? d.explorerUrl.split('/').pop().split('?')[0] : 'N/A';
        const shortTxId = fullTxId !== 'N/A' ? fullTxId.substring(0,15)+'...' : 'N/A';

        // HTML INVOICE
        box.innerHTML = `
            <div id="invoice-content" style="background:white; padding:10px; border-radius:10px;">
                <div style="text-align:center; padding-bottom:10px; border-bottom:1px dashed #dfe6e9; margin-bottom:15px;">
                    <h2 style="color:${color}; margin:0; font-size:1.4rem;">${title}</h2>
                    <div style="color:#b2bec3; font-size:0.8rem; margin-top:5px;">${new Date().toLocaleString()}</div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; text-align:left; font-size:0.9rem; margin-bottom:15px;">
                    <div style="color:#636e72;">Route</div>
                    <div style="text-align:right; font-weight:600;">${d.routeName || 'Standard'}</div>
                    
                    <div style="color:#636e72;">Duration</div>
                    <div style="text-align:right; font-weight:600;">${m}:${s}</div>

                    <div style="color:#636e72;">Passengers</div>
                    <div style="text-align:right; font-weight:600;">${pax}</div>

                    <div style="color:#636e72;">Rate</div>
                    <div style="text-align:right; font-weight:600;">${rate} IOTA/s</div>
                </div>

                <div style="background:#f1f2f6; border-radius:10px; padding:15px; text-align:center; margin-bottom:15px;">
                    <div style="font-size:0.8rem; color:#636e72; text-transform:uppercase; letter-spacing:1px;">Total Cost</div>
                    <div style="font-size:2rem; font-weight:700; color:#2d3436;">${d.cost} <small style="font-size:1rem;">IOTA</small></div>
                    ${parseFloat(d.debt) > 0 ? `<div style="color:#d63031; font-weight:bold; font-size:0.8rem; margin-top:5px;">Debt Added: ${d.debt}</div>` : ''}
                </div>
                
                <div id="invoice-tx-short" style="text-align:center; color:#b2bec3; font-size:0.7rem; margin-top:10px;">
                    Transaction ID: ${shortTxId}
                </div>
                <div id="invoice-tx-full" style="display:none; text-align:center; color:#2d3436; font-size:0.6rem; word-break:break-all; margin-top:10px; font-family:monospace;">
                    Transaction ID:<br>${fullTxId}
                </div>
            </div>

            <div style="margin-top:10px; margin-bottom:20px; font-size:0.85rem; text-align:center;">
               ${d.explorerUrl 
                   ? `<a href="${d.explorerUrl}" target="_blank" class="btn secondary" style="display:block; width:100%; text-decoration:none; color:#2d3436; margin-bottom:10px;">🔎 View Transaction on Tangle</a>` 
                   : '<span style="color:#b2bec3;">Transaction pending or off-chain</span>'}
               
               <button onclick="downloadInvoice()" class="btn secondary" style="background:#dfe6e9; color:#2d3436; margin-bottom:10px;">📥 Download PDF</button>
            </div>

            <button onclick="resetAppAndHome()" class="btn primary">BACK TO HOME</button>
        `;

        refreshBalance();
    } else {
        box.innerHTML = `<h3 style="color:#ff7675">Error</h3><p>${res.data.error}</p><button onclick="showView('home')" class="btn secondary">Home</button>`;
    }
}

// Function to generate PDF with FULL DETAILS
function downloadInvoice() {
    const element = document.getElementById('invoice-content');
    const shortTx = document.getElementById('invoice-tx-short');
    const fullTx = document.getElementById('invoice-tx-full');

    // 1. Swap visibility: Hide Short, Show Full
    if(shortTx) shortTx.style.display = 'none';
    if(fullTx) fullTx.style.display = 'block';

    const opt = {
      margin:       10,
      filename:     `Synap_Invoice_${Date.now()}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a6', orientation: 'portrait' } 
    };
    
    // 2. Generate PDF
    html2pdf().set(opt).from(element).save().then(() => {
        // 3. Swap back: Show Short, Hide Full
        if(shortTx) shortTx.style.display = 'block';
        if(fullTx) fullTx.style.display = 'none';
    });
}

function resetAppAndHome() {
    showView('home'); 
    refreshBalance(); 
    currentTripId = null; 
    scanMode = 'START';
    selectedPassengers = 1;
    if(document.getElementById('passenger-count-display')) document.getElementById('passenger-count-display').innerText = "1";
    updateHomeButtons();
}

document.addEventListener('DOMContentLoaded', () => {
    const user = localStorage.getItem('synap_user');
    if (user) { 
        currentUser = user; 
        updateUIProfile(); 
        
        const savedTripId = localStorage.getItem('synap_trip_id');
        if(savedTripId) {
            currentTripId = savedTripId;
        }

        showView('home'); 
        refreshBalance(); 
        syncPrice();
        updateHomeButtons();
    } else {
        showView('login');
    }
    
    const l = document.getElementById('login-form'); if(l) l.addEventListener('submit', handleLogin);
    const r = document.getElementById('register-form'); if(r) r.addEventListener('submit', handleRegister);
});