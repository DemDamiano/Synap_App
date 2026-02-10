// server/services/storage.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// I file JSON sono nella cartella ../data
const DATA_DIR = path.join(__dirname, '../data');

// Assicura che la cartella esista
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const ROUTES_FILE = path.join(DATA_DIR, 'routes.json');

// Helper interno per leggere/scrivere
function read(file, defaultVal) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return defaultVal; }
}
function write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export const Storage = {
    loadConfig: () => read(CONFIG_FILE, { costPerSecond: 0.01, currentRouteId: null }),
    saveConfig: (data) => write(CONFIG_FILE, data),

    loadUsers: () => read(USERS_FILE, []),
    saveUsers: (data) => write(USERS_FILE, data),

    loadHistory: () => read(HISTORY_FILE, []),
    saveHistory: (data) => write(HISTORY_FILE, data),

    loadRoutes: () => read(ROUTES_FILE, []),
    saveRoutes: (data) => write(ROUTES_FILE, data)
};