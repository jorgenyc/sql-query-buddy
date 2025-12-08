import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Generate log file names based on current date
const getLogFileName = (type = 'app') => {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(logsDir, `${type}-${date}.log`);
};

// Format timestamp
const timestamp = () => {
    return new Date().toISOString();
};

// Write to log file
const writeToFile = (filename, message) => {
    try {
        fs.appendFileSync(filename, message + '\n', 'utf8');
    } catch (error) {
        console.error('Failed to write to log file:', error.message);
    }
};

// Logger object with different log levels
const logger = {
    // Info level - general information
    info: (message, ...args) => {
        const logMessage = `[${timestamp()}] [INFO] ${message}`;
        console.log(logMessage, ...args);
        writeToFile(getLogFileName('app'), logMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
    },

    // Error level - errors and exceptions
    error: (message, ...args) => {
        const logMessage = `[${timestamp()}] [ERROR] ${message}`;
        console.error(logMessage, ...args);
        writeToFile(getLogFileName('error'), logMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
        writeToFile(getLogFileName('app'), logMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
    },

    // Warning level - warnings
    warn: (message, ...args) => {
        const logMessage = `[${timestamp()}] [WARN] ${message}`;
        console.warn(logMessage, ...args);
        writeToFile(getLogFileName('app'), logMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
    },

    // Debug level - detailed debugging info
    // Only writes to log file, not to console output
    debug: (message, ...args) => {
        const logMessage = `[${timestamp()}] [DEBUG] ${message}`;
        // Don't output to console - only write to log file
        writeToFile(getLogFileName('debug'), logMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
    },

    // Query level - SQL queries and API requests
    // Only writes to log file, not to console output
    query: (message, ...args) => {
        const logMessage = `[${timestamp()}] [QUERY] ${message}`;
        // Don't output to console - only write to log file
        writeToFile(getLogFileName('query'), logMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
        writeToFile(getLogFileName('app'), logMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
    },

    // Separator for readability
    separator: (char = '=', length = 50) => {
        const line = char.repeat(length);
        console.log(line);
        writeToFile(getLogFileName('app'), line);
    },

    // Log startup information
    startup: (message) => {
        const line = '='.repeat(60);
        const logMessage = `[${timestamp()}] [STARTUP] ${message}`;
        console.log('\n' + line);
        console.log(logMessage);
        console.log(line + '\n');
        writeToFile(getLogFileName('app'), '\n' + line);
        writeToFile(getLogFileName('app'), logMessage);
        writeToFile(getLogFileName('app'), line + '\n');
    }
};

export default logger;
