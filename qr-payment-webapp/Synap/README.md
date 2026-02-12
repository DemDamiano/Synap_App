
# ❖ Synap

**Next-Generation Pay-Per-Use Mobility on IOTA Layer 1.**

> *"Mobility shouldn't be about tickets. It should be about movement."*

[![IOTA](https://img.shields.io/badge/Powered%20by-IOTA-10D0D0?style=for-the-badge&logo=iota)](https://www.iota.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?style=for-the-badge&logo=nodedotjs)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

**Synap** is a decentralized application (dApp) prototype designed to revolutionize public transport ticketing. By leveraging the **IOTA Rebased** network, it enables a frictionless **Check-in / Check-out** experience with real-time streaming payments, native on-chain verification, and "Proof of Solvency" via Timelocks.

---

## 🚀 The Innovation: Layer 1 Native

Unlike competitors building on heavy EVM chains or centralized servers, Synap is designed to run directly on **IOTA Layer 1**.

1. **Trustless Solvency (Timelocks):** Instead of pre-paying, the protocol cryptographically locks a security deposit (e.g., 3.00 IOTA) in the user's wallet upon Check-in. The user retains custody, but funds are guaranteed for the operator.
2. **Sovereign Identity:** User identity is managed via DID (Decentralized Identifiers), decoupling personal data from trip logs.
3. **Frictionless Flow:** No paper tickets, no barriers. Just scan and go.

---

## ⚡ Key Features

### 📱 User Experience

* **Pay-Per-Use:** Costs are calculated per second based on the specific route.
* **Multi-Passenger:** Seamless support for group travel with a single wallet scan.
* **Smart Invoice (PDF):** Automatic generation of detailed travel receipts.
  * *Privacy Feature:* The UI shows a short Transaction ID for aesthetics, but the downloaded PDF reveals the full on-chain Tangle Hash for verification.
* **Real-Time Dashboard:** Users see live cost updates and trip duration.

### ⚙️ Backend & Architecture

* **Robust State Management:** In-memory tracking (`activeTrips`) prevents data loss during session handling and ensures `NaN` or `undefined` errors are handled gracefully with safe fallbacks.
* **Minimum Duration Logic:** Algorithms ensure trips are never calculated as 0 seconds, handling micro-trips correctly via `Math.ceil`.
* **Debt System:** Prevents users from starting new trips if previous settlements failed or balance was insufficient.

---

## 🛠 Tech Stack

* **Blockchain Network:** IOTA Rebased (Testnet) / Simulated Layer 1 Logic
* **Backend:** Node.js + Express (Gateway to Tangle)
* **Frontend:** Vanilla HTML5 / CSS3 / JavaScript (Mobile First)
* **Libraries:** * `html5-qrcode` (Scanning)
  * `html2pdf.js` (Invoice Generation)
  * `@iota/sdk` (WASM bindings for Tangle interaction)

---

## ⚙️ Installation & Setup

### 1) Prerequisites

* [Node.js](https://nodejs.org/) (v18+)
* npm

### 2) Clone & Install

```bash
# Clone the repository
git clone [https://github.com/DemDamiano/Synap_App.git](https://github.com/DemDamiano/Synap_App.git)

# Navigate to the server directory
cd Synap_App/server

# Install dependencies
npm install
```


## 🏗 Architectural Strategy: From MVP to Rust

We made a conscious engineering choice to separate the **Prototyping Phase** from the **Production Phase**.

### Phase 1: The MVP (Node.js)

For this thesis/hackathon, we utilized **Node.js** to prioritize **iteration speed** and rapid integration with the IOTA SDK bindings. This allowed us to validate the "Pay-Per-Use" and "Timelock" logic quickly.

### Phase 2: The Production Goal (Rust)

We acknowledge that **Rust** is the definitive technology for the industrial deployment of Synap, for three critical reasons:

1. **IOTA Native Ecosystem:** The IOTA Core, Stronghold, and Identity libraries are written in Rust. Using Rust eliminates the overhead of Node.js bindings, ensuring direct and efficient ledger interaction.
2. **Embedded Hardware Constraints:** The validators installed on buses (IoT devices) have limited resources. Rust provides zero-cost abstractions and memory safety without a Garbage Collector, essential for 24/7 operation on low-power hardware.
3. **Mission-Critical Security:** For handling financial transactions and Identity (DID), Rust's type safety prevents entire classes of bugs (like null pointer dereferences) at compile time.

> **Conclusion:** *While Node.js powers our proof-of-concept, the Synap architecture is designed to be ported to Rust for the final release.*
>
