import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');

// Assicura che la cartella data esista
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const getPath = (file) => path.join(DATA_DIR, file);

// Funzione generica per leggere
export const loadJSON = (filename, defaultValue = []) => {
    try {
        return JSON.parse(fs.readFileSync(getPath(filename), 'utf8'));
    } catch (e) {
        // Se il file non esiste, lo creiamo vuoto
        saveJSON(filename, defaultValue);
        return defaultValue;
    }
};

// Funzione generica per salvare
export const saveJSON = (filename, data) => {
    fs.writeFileSync(getPath(filename), JSON.stringify(data, null, 2));
};