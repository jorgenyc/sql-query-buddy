import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths - script runs from server/scripts directory
const serverDir = path.dirname(__dirname);
const rootDir = path.dirname(serverDir);
const dbPath = path.join(rootDir, 'sample_data', 'database.sqlite');
const sampleDataDir = path.join(rootDir, 'sample_data');

// Ensure sample_data directory exists
if (!fs.existsSync(sampleDataDir)) {
    fs.mkdirSync(sampleDataDir, { recursive: true });
    console.log('Created sample_data directory');
}

// Remove existing database if it exists
if (fs.existsSync(dbPath)) {
    console.log('Removing existing database...');
    fs.unlinkSync(dbPath);
}

// Create database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error creating database:', err);
        process.exit(1);
    }
    console.log('✅ Database created at:', dbPath);
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON;');

// Execute SQL file
const executeSqlFile = (filePath, description) => {
    return new Promise((resolve, reject) => {
        console.log(`\n📄 Processing ${description}...`);
        
        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${filePath}`);
            reject(new Error(`File not found: ${filePath}`));
            return;
        }
        
        const sqlContent = fs.readFileSync(filePath, 'utf-8');
        
        // Split by semicolons and filter out empty statements
        const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        
        if (statements.length === 0) {
            console.log(`⚠️  No statements found in ${path.basename(filePath)}`);
            resolve();
            return;
        }
        
        let executed = 0;
        let errors = 0;
        let completed = 0;
        
        db.serialize(() => {
            // Use transaction for better performance
            db.run('BEGIN TRANSACTION;', (err) => {
                if (err) {
                    console.error('Error starting transaction:', err);
                    reject(err);
                    return;
                }
                
                statements.forEach((statement, index) => {
                    db.run(statement + ';', (err) => {
                        completed++;
                        
                        if (err) {
                            // Some errors are expected (like duplicate keys), log but continue
                            if (!err.message.includes('UNIQUE constraint') && 
                                !err.message.includes('duplicate key') &&
                                !err.message.includes('FOREIGN KEY constraint failed') &&
                                !err.message.includes('no such table')) {
                                console.error(`Error executing statement ${index + 1}:`, err.message);
                                errors++;
                            }
                        } else {
                            executed++;
                        }
                        
                        // Check if all statements are completed
                        if (completed === statements.length) {
                            db.run('COMMIT;', (commitErr) => {
                                if (commitErr) {
                                    console.error('Error committing transaction:', commitErr);
                                    reject(commitErr);
                                    return;
                                }
                                console.log(`✅ Executed ${executed} statements from ${path.basename(filePath)}`);
                                if (errors > 0) {
                                    console.log(`⚠️  ${errors} errors encountered (some may be expected)`);
                                }
                                resolve();
                            });
                        }
                    });
                });
            });
        });
    });
};

// Main execution
const buildDatabase = async () => {
    try {
        console.log('🚀 Starting database build from SQL files...\n');
        
        // Execute SQL files in the exact order specified
        const sqlFiles = [
            { file: 'customers.sql', description: 'customers.sql → customers table' },
            { file: 'products.sql', description: 'products.sql → products table' },
            { file: 'orders.sql', description: 'orders.sql → orders table' },
            { file: 'order_items.sql', description: 'order_items.sql → order_items table' }
        ];
        
        for (const { file, description } of sqlFiles) {
            const filePath = path.join(sampleDataDir, file);
            await executeSqlFile(filePath, description);
        }
        
        // Close database
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
                process.exit(1);
            }
            console.log('\n✅ Database build completed successfully!');
            console.log(`📁 Database saved to: ${dbPath}`);
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Error building database:', error);
        db.close();
        process.exit(1);
    }
};

// Run the build
buildDatabase();

