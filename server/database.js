import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to pre-built database
const dbPath = path.join(__dirname, '..', 'sample_data', 'database.sqlite');

// Function to log database information (called during server startup)
export function logDatabaseInfo() {
    if (fs.existsSync(dbPath)) {
        // Get database file size
        const stats = fs.statSync(dbPath);
        const fileSizeInBytes = stats.size;
        const fileSizeInKB = (fileSizeInBytes / 1024).toFixed(2);
        const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
        const sizeDisplay = fileSizeInBytes > 1024 * 1024 
            ? `${fileSizeInMB} MB` 
            : `${fileSizeInKB} KB`;
        
        // Extract last 2 parent folders and filename
        const pathParts = dbPath.split(path.sep);
        const shortPath = path.join('..', ...pathParts.slice(-3));
        
        // Log database info
        logger.info(`  Database: ${shortPath}`);
        logger.info(`  Database Size: ${sizeDisplay} (${fileSizeInBytes.toLocaleString()} bytes)`);
    } else {
        logger.info(`  Database: In-memory (pre-built database not found)`);
    }
}

// Check if database exists, if not, fall back to in-memory
let db;
if (fs.existsSync(dbPath)) {
    // Database loaded successfully
    db = new sqlite3.Database(dbPath);
    
    // Apply performance optimizations
    db.run('PRAGMA foreign_keys = ON;');
    db.run('PRAGMA journal_mode = WAL;'); // Write-Ahead Logging for better concurrency
    db.run('PRAGMA synchronous = NORMAL;'); // Faster writes with WAL (still safe)
    db.run('PRAGMA cache_size = -64000;'); // 64MB cache (negative = KB, positive = pages)
    db.run('PRAGMA temp_store = MEMORY;'); // Use memory for temporary tables (faster)
    db.run('PRAGMA mmap_size = 268435456;'); // 256MB memory-mapped I/O for faster reads
    
    // Server-level optimizations (Critical)
    // Busy timeout: Automatically retry locked operations for up to 5 seconds
    // This prevents "database is locked" errors under concurrent access
    db.configure('busyTimeout', 5000);
    
    logger.info('Database performance optimizations applied (WAL, cache, temp_store, mmap, busyTimeout)');
} else {
    // Log warning only in development
    if (process.env.NODE_ENV !== 'production') {
        console.log('⚠️  Pre-built database not found, using in-memory database');
        console.log('💡 Run "npm run build-db" from the server directory to create the database');
    }
    db = new sqlite3.Database(':memory:');
    
    // Fallback: create old schema for backward compatibility
    const createTables = () => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE customers (
                    customer_id INT PRIMARY KEY,
                    first_name VARCHAR(50),
                    last_name VARCHAR(50),
                    email VARCHAR(100),
                    state VARCHAR(50),
                    registration_date DATE
                );
            `);

            db.run(`
                CREATE TABLE products (
                    product_id INT PRIMARY KEY,
                    product_name VARCHAR(100),
                    category VARCHAR(50),
                    price DECIMAL(10, 2)
                );
            `);

            db.run(`
                CREATE TABLE orders (
                    order_id INT PRIMARY KEY,
                    customer_id INT,
                    product_id INT,
                    order_date DATE,
                    quantity INT,
                    total_amount DECIMAL(10, 2),
                    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
                    FOREIGN KEY (product_id) REFERENCES products(product_id)
                );
            `);
        });
    };

    const populateData = () => {
        db.serialize(() => {
            const customersStmt = db.prepare('INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?)');
            customersStmt.run(1, 'John', 'Doe', 'john.doe@email.com', 'California', '2024-01-15');
            customersStmt.run(2, 'Jane', 'Smith', 'jane.smith@email.com', 'New York', '2024-02-20');
            customersStmt.finalize();

            const productsStmt = db.prepare('INSERT INTO products VALUES (?, ?, ?, ?)');
            productsStmt.run(1, 'Laptop', 'Electronics', 1200.00);
            productsStmt.run(2, 'Smartphone', 'Electronics', 800.00);
            productsStmt.finalize();

            const ordersStmt = db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?)');
            ordersStmt.run(1, 1, 1, '2024-03-10', 1, 1200.00);
            ordersStmt.run(2, 2, 2, '2024-03-15', 2, 1600.00);
            ordersStmt.finalize();
        });
    };

    createTables();
    populateData();
}

// WAL Checkpointing - Run periodically to merge WAL into main database
// This prevents WAL file growth and improves recovery time
let queryCount = 0;
const CHECKPOINT_INTERVAL = 100; // Checkpoint every 100 queries

export function checkpointWAL() {
    return new Promise((resolve, reject) => {
        if (!db) {
            resolve();
            return;
        }
        
        db.run('PRAGMA wal_checkpoint(TRUNCATE);', (err) => {
            if (err) {
                logger.warn(`[DB] WAL checkpoint warning: ${err.message}`);
                resolve(); // Don't fail on checkpoint errors
            } else {
                logger.debug('[DB] WAL checkpoint completed');
                resolve();
            }
        });
    });
}

// Increment query counter and checkpoint if needed
export function incrementQueryCount() {
    queryCount++;
    if (queryCount % CHECKPOINT_INTERVAL === 0) {
        checkpointWAL().catch(err => {
            logger.warn(`[DB] WAL checkpoint failed: ${err.message}`);
        });
    }
}

// Query timeout wrapper - prevents long-running queries from blocking
export function executeQueryWithTimeout(query, params = [], timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const timeout = setTimeout(() => {
            reject(new Error(`Query timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        try {
            const stmt = db.prepare(query, (prepareErr) => {
                clearTimeout(timeout);
                if (prepareErr) {
                    reject(prepareErr);
                    return;
                }
            });

            stmt.all(params, (err, rows) => {
                clearTimeout(timeout);
                if (err) {
                    reject(err);
                } else {
                    incrementQueryCount(); // Track queries for checkpointing
                    resolve(rows);
                }
            });

            stmt.finalize();
        } catch (error) {
            clearTimeout(timeout);
            reject(error);
        }
    });
}

export default db;
