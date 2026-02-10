// server/utils/logger.js

const serverLogs = []; 

const C = {
    reset: "\x1b[0m", bright: "\x1b[1m", dim: "\x1b[2m",
    cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
    red: "\x1b[31m", magenta: "\x1b[35m", blue: "\x1b[34m", white: "\x1b[37m"
};

export const Colors = C;

export function getLogs() {
    return serverLogs;
}

export function log(message, type = 'info') {
    const now = new Date();
    const time = now.toLocaleTimeString('it-IT', { hour12: false });
    
    let label = "INFO";
    let color = C.white;
    
    switch(type) {
        case 'error':  label = "ERROR";  color = C.red; break;
        case 'success':label = "OK";     color = C.green; break;
        case 'warn':   label = "WARN";   color = C.yellow; break;
        case 'system': label = "SYSTEM"; color = C.cyan; break;
        case 'trip':   label = "TRIP";   color = C.blue; break;
        case 'money':  label = "MONEY";  color = C.magenta; break;
    }

    const colTime = `${C.dim} ${time} ${C.reset}`;
    const colType = `${color}${label.padEnd(8)}${C.reset}`; 
    const separator = `${C.dim}│${C.reset}`;

    console.log(`${colTime} ${separator} ${colType} ${separator} ${message}`);
    
    serverLogs.push(`[${time}] [${label}] ${message}`);
    if (serverLogs.length > 50) serverLogs.shift();
}