let zxingReader = null;
let zxingActive = false;
let paymentInterval = null;

const PREFIX_IN = "IN-";
const PREFIX_OUT = "OUT-";

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. LOGIN ---
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            
            if (data.token) {
                localStorage.setItem('Synap _token', data.token);
                switchView('view-login', 'view-scan');
                startScanner('qr-video', 'scan-status', beginTrip);
            }
        } catch (err) {
            alert("Errore Login: " + err);
        }
    });

    // --- 2. FALLBACK MANUALE INIZIO ---
    document.getElementById('manual-btn')?.addEventListener('click', () => {
        let code = document.getElementById('manual-code').value.trim();
        if(code && !code.startsWith(PREFIX_IN)) code = PREFIX_IN + code;
        if(code) beginTrip(code);
    });

    // --- 3. PASSA A FINE CORSA ---
    document.getElementById('end-trip')?.addEventListener('click', () => {
        if (paymentInterval) clearInterval(paymentInterval);
        switchView('view-monitor', 'view-finish-scan');
        startScanner('qr-video-finish', 'finish-status', completeTrip);
    });

    // --- 4. FALLBACK MANUALE FINE ---
    document.getElementById('manual-btn-finish')?.addEventListener('click', () => {
        let code = document.getElementById('manual-code-finish').value.trim();
        if(code && !code.startsWith(PREFIX_OUT)) code = PREFIX_OUT + code;
        if(code) completeTrip(code);
    });

    // Tasto ANNULLA (Torna al monitor)
    document.getElementById('cancel-finish')?.addEventListener('click', () => {
        zxingActive = false;
        if (zxingReader) zxingReader.reset();
        switchView('view-finish-scan', 'view-monitor');
        startPaymentLoop(); 
    });
});

// --- UTILITIES ---
function switchView(oldId, newId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(newId).classList.add('active');
}

function startPaymentLoop() {
    let km = parseFloat(document.getElementById('km').textContent) || 0;
    let eur = parseFloat(document.getElementById('eur').textContent) || 0;
    if (paymentInterval) clearInterval(paymentInterval);
    
    paymentInterval = setInterval(() => {
        km += 0.015; eur += 0.005;
        document.getElementById('km').textContent = km.toFixed(3);
        document.getElementById('eur').textContent = eur.toFixed(2);
    }, 1000);
}

// --- SCANNER ENGINE ---
async function startScanner(videoId, statusId, callback) {
    const statusEl = document.getElementById(statusId);
    const videoEl = document.getElementById(videoId);

    if (!navigator.mediaDevices?.getUserMedia) {
        statusEl.innerHTML = "<b style='color:red'>HTTPS richiesto.</b> Usa input manuale.";
        return;
    }

    try {
        if (!zxingReader) zxingReader = new ZXing.BrowserQRCodeReader();
        zxingActive = true;
        const devices = await zxingReader.getVideoInputDevices();
        const cam = devices.find(d => d.label.toLowerCase().includes('back')) || devices[0];

        zxingReader.decodeFromVideoDevice(cam.deviceId, videoEl, (result) => {
            if (result && zxingActive) {
                zxingActive = false;
                zxingReader.reset();
                callback(result.text);
            }
        });
    } catch (e) {
        statusEl.textContent = "Errore Camera. Usa input manuale.";
    }
}

// --- LOGICA BUSINESS ---

async function beginTrip(qrContent) {
    if (!qrContent.toUpperCase().startsWith(PREFIX_IN)) {
        alert(`QR Errato! Serve codice che inizia con ${PREFIX_IN}`);
        startScanner('qr-video', 'scan-status', beginTrip);
        return;
    }

    const token = localStorage.getItem('Synap _token');
    try {
        const res = await fetch('/api/trip/start', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ qrData: qrContent })
        });
        const data = await res.json();
        
        if (data.tripId) {
            localStorage.setItem('Synap _trip_id', data.tripId);
            switchView('view-scan', 'view-monitor');
            startPaymentLoop();
        }
    } catch (e) { alert("Errore connessione server"); }
}

async function completeTrip(qrContent) {
    if (!qrContent.toUpperCase().startsWith(PREFIX_OUT)) {
        alert(`QR Errato! Serve codice che inizia con ${PREFIX_OUT}`);
        startScanner('qr-video-finish', 'finish-status', completeTrip);
        return;
    }

    const token = localStorage.getItem('Synap _token');
    const tripId = localStorage.getItem('Synap _trip_id');
    const btn = document.getElementById('manual-btn-finish');
    
    btn.textContent = "Connessione Blockchain..."; // Feedback utente

    try {
        const res = await fetch('/api/trip/end', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ tripId, qrData: qrContent })
        });
        const data = await res.json();

        if (data.ok) {
            let msg = `✅ PAGAMENTO COMPLETATO\nCosto: ${data.cost} €`;
            
            if (data.explorerUrl) {
                // Link alla blockchain
                if(confirm(msg + "\n\n💎 RICEVUTA IOTA PRONTA!\nClicca OK per vederla.")) {
                    window.open(data.explorerUrl, '_blank');
                }
            } else {
                alert(msg);
            }
            location.reload();
        } else {
            alert("Errore: " + (data.error || "Ignoto"));
        }
    } catch (e) {
        alert("Errore Server: " + e.message);
    } finally {
        btn.textContent = "Paga e Scendi";
    }
}