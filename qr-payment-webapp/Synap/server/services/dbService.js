// server/services/dbService.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

// Helper generico per leggere/scrivere
const rw = (file, data) => {
    const p = path.join(DATA_DIR, file);
    if (data) {
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
    } else {
        try { 
            return JSON.parse(fs.readFileSync(p, 'utf8')); 
        } catch { 
            return []; // Ritorna array vuoto se file non esiste
        }
    }
};

export const getUsers = () => rw('users.json');
export const saveUsers = (u) => rw('users.json', u);

export const getHistory = () => rw('history.json');
export const saveHistory = (h) => rw('history.json', h);

export const getRoutes = () => rw('routes.json');
export const saveRoutes = (r) => rw('routes.json', r);

export const getConfig = () => {
    try { 
        return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf8')); 
    } catch { 
        return { costPerSecond: 0.01, currentRouteId: null }; 
    }
};
export const saveConfig = (c) => fs.writeFileSync(path.join(DATA_DIR, 'config.json'), JSON.stringify(c, null, 2));