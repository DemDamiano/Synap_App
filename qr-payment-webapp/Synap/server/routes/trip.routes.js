import express from 'express';
import * as db from '../services/dbService.js';
import * as iota from '../services/iotaService.js';
import { log } from '../utils/logger.js';

const router = express.Router();
const activeTrips = {}; // Memoria temporanea viaggi

router.post('/start', (req, res) => {
    const { qrData, email, passengers } = req.body;
    const user = db.getUsers().find(u => u.email === email);
    
    if (!user) return res.status(404).json({ error: "Unknown User" });
    if (user.debt > 0.01) return res.status(403).json({ error: "PENDING_DEBT", message: "Pay debt first" });

    const config = db.getConfig();
    const routes = db.getRoutes();
    const routeName = routes.find(r => r.id === config.currentRouteId)?.name || "Manual Route";

    const tripId = "TRIP-" + Date.now();
    activeTrips[tripId] = {
        startTime: Date.now(),
        passengers: passengers || 1,
        user,
        rate: config.costPerSecond,
        routeName
    };
    
    log(`ENTRY: ${user.name} | Route: ${routeName}`, 'trip');
    res.json({ tripId, status: "STARTED", routeName });
});

router.post('/end', async (req, res) => {
    try {
        const { tripId } = req.body;
        const trip = activeTrips[tripId];
        if(!trip) throw new Error("Trip not found");

        const duration = Math.floor((Date.now() - trip.startTime) / 1000);
        let cost = (duration * trip.rate * trip.passengers);
        cost = Math.max(0.01, Math.round(cost * 100) / 100);
        
        log(`PAYMENT: ${cost} IOTA transferred (L1 Value Tx)`, 'money');

        // IOTA TOKENIZATION (L1)
        const tokenId = await iota.mintL1Ticket({ 
            route: trip.routeName, 
            cost: cost, 
            time: duration 
        });

        log(`CONFIRMED: Digital Ticket delivered via L1 Tokenization`, 'success');
        
        delete activeTrips[tripId];
        
        const history = db.getHistory();
        history.push({
            user: trip.user.name,
            route: trip.routeName,
            cost: cost.toFixed(2),
            tx: tokenId,
            status: "PAID",
            startTime: new Date(trip.startTime).toLocaleTimeString(),
            endTime: new Date().toLocaleTimeString()
        });
        db.saveHistory(history);

        res.json({ ok: true, cost: cost.toFixed(2), paid: cost.toFixed(2), debt: 0 });

    } catch (e) {
        log(`Checkout Error: ${e.message}`, 'error');
        res.status(500).json({ error: e.message });
    }
});

// Helper per dashboard admin
export const getActiveTrips = () => Object.values(activeTrips);

export default router;