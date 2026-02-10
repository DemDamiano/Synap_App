import express from 'express';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import * as db from '../services/dbService.js';
import * as iota from '../services/iotaService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

router.post('/register', (req, res) => {
    try {
        const { name, email, password } = req.body;
        const users = db.getUsers();
        if (users.find(u => u.email === email)) return res.status(400).json({ error: "Email exists" });

        const mnemonic = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima"; // Mock
        const kp = Ed25519Keypair.deriveKeypair(mnemonic);
        
        users.push({ email, password, name, mnemonic, address: kp.getPublicKey().toIotaAddress(), debt: 0 });
        db.saveUsers(users);
        
        log(`New User: ${name}`, 'system');
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.getUsers().find(u => u.email === email && u.password === password);
    if (user) {
        log(`Login: ${user.name}`, 'system');
        res.json({ token: "tok-" + Date.now(), user: user.name, email: user.email });
    } else res.status(401).json({ error: "Invalid credentials" });
});

export default router;