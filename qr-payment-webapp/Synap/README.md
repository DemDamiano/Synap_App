
# QR Payments Web App (Demo)

Web app dimostrativa con **login**, **scanner QR** e **monitoraggio pagamenti**.

## Stack
- **Backend**: Node.js + Express + JWT (in-memory store per semplicità)
- **Frontend**: HTML/CSS/JS vanilla + [html5-qrcode](https://github.com/mebjas/html5-qrcode) via CDN

## Avvio rapido

### 1) Prerequisiti
- Node.js >= 18

### 2) Installazione dipendenze backend
```bash
cd server
npm install
```

### 3) Sviluppo / Esecuzione
```bash
# dalla cartella server
npm start
# server su http://localhost:3000 (serve anche il frontend statico)
```

### 4) Login demo
- Email: qualsiasi (formato valido)
- Password: qualsiasi non vuota

### 5) Flusso
1. Effettua il **login**
2. Vai alla **schermata di scansione** e inquadra un **QR code**
3. Alla lettura apre il **monitoraggio** con km e costo che avanzano in tempo reale
4. Premi **Termina corsa** per chiudere la sessione

> Nota: questo è un prototipo. L'autenticazione e lo stato corsa sono **in memoria**.
> In produzione sposta le segreti in variabili d'ambiente e usa un database.
