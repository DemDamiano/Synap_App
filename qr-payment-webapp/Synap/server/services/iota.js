import { IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { Transaction } from '@iota/iota-sdk/transactions';
import 'dotenv/config';

// Configurazioni IOTA
const NODE_URL = process.env.NODE_URL || 'https://api.testnet.iota.cafe'; 
const EXPLORER_URL = 'https://explorer.rebased.iota.org/txblock/';

// Mnemonic del BUS (Azienda)
// Se non c'è nel .env, usa questa di default per la demo
const MNEMONIC_BUS = process.env.MNEMONIC_BUS || "eternal clutch lock tunnel carpet dial repair popular exist monkey turkey bubble";

let client = null;
let busKeypair = null;
let busAddress = null;

// --- FUNZIONE GENERAZIONE MNEMONIC INTERNA (FIX PER L'ERRORE UTILS) ---
function generateRandomMnemonic() {
    const words = [
        "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", 
        "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa", 
        "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey", "xray", 
        "yankee", "zulu", "apple", "banana", "cherry", "date", "elderberry", "fig"
    ];
    // Ne prendiamo 12 a caso
    const mnemonic = [];
    for(let i=0; i<12; i++) { 
        mnemonic.push(words[Math.floor(Math.random() * words.length)]); 
    }
    return mnemonic.join(" ");
}

export const IotaService = {
    // 1. Inizializzazione
    async init() {
        try {
            client = new IotaClient({ url: NODE_URL });
            busKeypair = Ed25519Keypair.deriveKeypair(MNEMONIC_BUS);
            busAddress = busKeypair.getPublicKey().toIotaAddress();
            return { connected: true, address: busAddress };
        } catch (e) {
            // Se fallisce (es. niente internet), non crashiamo tutto
            console.error("⚠️ IOTA Connection Warning:", e.message);
            return { connected: false, error: e.message };
        }
    },

    // 2. Genera un nuovo Wallet (Mnemonic + Address)
    createWallet() {
        // Usiamo la nostra funzione interna invece di quella che dava errore
        const mnemonic = generateRandomMnemonic(); 
        const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
        const address = keypair.getPublicKey().toIotaAddress();
        return { mnemonic, address };
    },

    // 3. Ottieni Saldo Utente (in IOTA)
    async getBalance(mnemonic) {
        if (!client) return { iota: "0.00", nano: 0 };
        try {
            const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
            const address = keypair.getPublicKey().toIotaAddress();
            
            const balances = await client.getAllBalances({ owner: address });
            const totalNano = balances.reduce((acc, b) => acc + parseInt(b.totalBalance), 0);
            
            return {
                iota: (totalNano / 1_000_000_000).toFixed(2), 
                nano: totalNano,
                raw: totalNano
            };
        } catch (e) {
            return { iota: "0.00", nano: 0 };
        }
    },

    // 4. Esegui Pagamento (Utente -> Bus)
    async payToBus(userMnemonic, amountIota) {
        if (!client) return { success: false, error: "IOTA offline" };
        try {
            const userKeypair = Ed25519Keypair.deriveKeypair(userMnemonic);
            const amountNano = Math.floor(amountIota * 1_000_000_000);
            
            const tx = new Transaction();
            const [coin] = tx.splitCoins(tx.gas, [amountNano]);
            
            tx.transferObjects([coin], busAddress);
            
            const result = await client.signAndExecuteTransaction({ 
                signer: userKeypair, 
                transaction: tx 
            });
            
            return { 
                success: true, 
                digest: result.digest, 
                explorerLink: `${EXPLORER_URL}${result.digest}?network=testnet`
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    // Utilities
    getBusAddress: () => busAddress,
    isConnected: () => client !== null
};