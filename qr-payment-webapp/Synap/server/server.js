import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './utils/logger.js';
import * as iota from './services/iotaService.js';

// Import Routes
import authRoutes from './routes/auth.routes.js';
import tripRoutes from './routes/trip.routes.js';
import adminRoutes from './routes/admin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Init System
const start = async () => {
    console.clear();
    const addr = await iota.init();
    log(`System Online. Wallet: ${addr.substring(0,10)}...`, 'system');
};
start();

// Mount Routes
app.use('/api/auth', authRoutes);   // Gestisce /api/auth/login, etc.
app.use('/api/trip', tripRoutes);   // Gestisce /api/trip/start, etc.
app.use('/api/admin', adminRoutes); // Gestisce /api/admin/dashboard

// Start
app.listen(PORT, () => {
    // Log gestito da start()
});