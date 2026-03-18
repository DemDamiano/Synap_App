# SYNAP: The Real-Time Mobility Ledger 🚌⚡
**Masterz x IOTA Hackathon 2026 Submission**

**Elevator Pitch**
Synap is a Web 2.5 smart ticketing and fleet management platform that leverages IOTA's feeless micro-transactions and Decentralized Identifiers (DIDs) to eliminate fraud, reduce infrastructure costs, and provide a seamless "pay-as-you-go" transit experience. We don't just sell tickets; we enable fair, real-time movement.

---

## 🛑 1. The Problem with Legacy Transit Systems
Current public and private transport networks are broken by design:
* **Static Pricing:** Fixed prices penalize users. Passengers pay for the entire route even if they only travel a fraction of it.
* **Data Silos & Privacy Risks:** Centralized identities are vulnerable to breaches.
* **Banking Friction:** High fixed fees on micro-payments erode transport companies' profit margins.
* **Expensive Hardware:** Maintaining physical validators, NFC readers, and ticketing machines costs millions.

## ✅ 2. The SYNAP Solution: Fairness & Security
Synap replaces physical tickets and legacy hardware with a 100% digital, blockchain-backed protocol:
* **Smart Identity (IOTA DID):** Logins are based on Verifiable Credentials. The system instantly recognizes the user's role (e.g., Student, Working Employee) and applies personalized discounts cryptographically.
* **Zero-Hardware (QR Check-In/Out):** Instant scanning using the user's smartphone. No expensive validators required on the bus.
* **Real-Time Settlement (Pay-per-KM):** Users pay per second/meter of actual travel.
* **Enforced Settlement (Certified Debt):** If a user runs out of funds mid-trip, they are not kicked off. The trip converts into a "Certified Debt" recorded on-chain. The user must clear this debt before starting a new trip, guaranteeing 100% revenue collection for the transport company.

---

## 🏗️ 3. Protocol Architecture (Web 2.5)
Synap is built for speed and security, combining the best of Web2 UX with Web3 trust:
* **Attribute-Based Access Control (ABAC):** Dynamic fare management via IOTA Identity.
* **Web 2.5 Off-Chain Engine:** A lightning-fast Node.js backend calculates real-time costs and manages the active passenger state without network lag.
* **L1 Feeless Settlement:** Powered by the IOTA Rebased Testnet. Transactions incur absolutely ZERO banking fees, making micro-payments economically viable.
* **Immutable Receipts:** Every completed trip generates a cryptographically signed PDF receipt linked directly to the IOTA Tangle block hash.

---

## 🎯 4. Go-To-Market & Business Model
Synap targets closed-loop ecosystems before scaling to national public transport. 
* **Primary Targets (B2B2C):** University campuses, corporate shuttle fleets, and small smart-municipalities.
* **Business Model:** Software-as-a-Service (SaaS). Transport providers pay a monthly subscription to use the Synap Admin Console and API. In return, they save thousands in hardware maintenance, ticketing fraud, and POS/Stripe banking fees.
* **Vision:** From the bus to the Smart City. Synap is a universal protocol designed to regulate any movement and transaction in an interconnected urban environment.

---

## 🧪 5. Live Demo & Testing Guide (For Judges)

To evaluate the platform, please use the following pre-configured test accounts on our live prototype.

### Test Credentials
* **User 1:** `damiano.rovella@hotmail.com` | Password: `123`
* **User 2:** `martina.frazzo@gmail.com` | Password: `123`

### Scenario A: The Flawless Trip (Standard User Flow)
1. **Login:** Open the passenger app and log in with `damiano.rovella@hotmail.com`.
2. **Verify Identity:** Click `+ Load Synap Trust ID`. The system will fetch the IOTA Verifiable Credential, recognizing the user as a "Working Employee" and unlocking a 75% discount.
3. **Check-In:** Click "SCAN QR (CHECK-IN)" to board the bus. A 3.00 IOTA deposit is temporarily locked.
4. **Admin Console (Real-Time Tracking):** Open the `admin.html` dashboard. Notice how Damiano appears in the "Live Passengers on Bus" table. The current cost increments live every 2 seconds based on his specific discounted rate.
5. **Check-Out:** On the passenger app, click "CHECK-OUT".
6. **Blockchain Proof:** A PDF receipt is generated. Click **"VIEW ON WALLET ↗"** to open the official IOTA Rebased Explorer and verify the feeless L1 micro-transaction on the Tangle.

### Scenario B: The "Certified Debt" Mechanism (Edge Case)
1. **Login:** Log in using `martina.frazzo@gmail.com`.
2. **Trip & Debt:** Start a trip and check out. If Martina's balance drops below the trip cost, the system securely flags the remainder as a debt.
3. **Enforced Block:** Attempt to scan the QR code for a new trip. The system will strictly block access, displaying a red `⚠️ DEBT` warning. 
4. **Debt Resolution:** Click the "PAY NOW" button. The app will settle the outstanding debt via the IOTA network, immediately unlocking the user's account for future travel.

---
*Built with ❤️ for the Masterz x IOTA Hackathon 2026.*
