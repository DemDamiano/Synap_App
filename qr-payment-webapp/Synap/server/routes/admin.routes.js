import express from 'express';
import * as db from '../services/dbService.js';
import { getLogs, log } from '../utils/logger.js';
import { getActiveTrips } from './trip.routes.js'; // Importiamo i viaggi attivi dall'altro file

const router = express.Router();

router.get('/dashboard', (req, res) => {
    // Recuperiamo i viaggi attivi dalla memoria del router Trip
    const activeRaw = getActiveTrips();
    
    const activeFormatted = activeRaw.map(t => {
        const dur = Math.floor((Date.now() - t.startTime) / 1000);
        return {
            user: t.user.name,
            email: t.user.email,
            passengers: t.passengers,
            startTime: t.startTime,
            duration: dur,
            currentCost: (dur * t.rate * t.passengers).toFixed(2),
            routeName: t.routeName
        };
    });

    res.json({
        config: db.getConfig(),
        activeTrips: activeFormatted,
        history: db.getHistory().slice().reverse(),
        logs: getLogs(),
        routes: db.getRoutes()
    });
});

router.post('/config', (req, res) => {
    const { costPerSecond, routeId } = req.body;
    db.saveConfig({ costPerSecond, currentRouteId: routeId });
    log(`Rate updated -> ${costPerSecond}`, 'warn');
    res.json({ ok: true });
});

router.post('/routes', (req, res) => {
    const routes = db.getRoutes();
    routes.push({ id: "r-"+Date.now(), name: req.body.name, costPerSecond: req.body.cost });
    db.saveRoutes(routes);
    res.json({ ok: true });
});

router.delete('/routes/:id', (req, res) => {
    let routes = db.getRoutes();
    routes = routes.filter(r => r.id !== req.params.id);
    db.saveRoutes(routes);
    res.json({ ok: true });
});

export default router;