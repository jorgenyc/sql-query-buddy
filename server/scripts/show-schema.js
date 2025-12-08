import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverDir = path.dirname(__dirname);
const rootDir = path.dirname(serverDir);
const dbPath = path.join(rootDir, 'sample_data', 'database.sqlite');

if (!fs.existsSync(dbPath)) {
    console.error('❌ Database not found at:', dbPath);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
});

// Get table schemas
const getTableSchema = (tableName) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows[0]?.sql || null);
            }
        });
    });
};

// Get foreign key information
const getForeignKeys = (tableName) => {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA foreign_key_list(${tableName})`, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

// Check if foreign keys are enabled
const checkForeignKeysEnabled = () => {
    return new Promise((resolve, reject) => {
        db.get('PRAGMA foreign_keys', (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row.foreign_keys === 1);
            }
        });
    });
};

const showSchema = async () => {
    try {
        console.log('📋 Database Schema Information\n');
        console.log('=' .repeat(60));
        
        // Check if foreign keys are enabled
        const fkEnabled = await checkForeignKeysEnabled();
        console.log(`\n🔑 Foreign Keys Status: ${fkEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n`);
        
        const tables = ['customers', 'products', 'orders', 'order_items'];
        
        for (const tableName of tables) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📊 Table: ${tableName.toUpperCase()}`);
            console.log('='.repeat(60));
            
            // Get CREATE TABLE statement
            const schema = await getTableSchema(tableName);
            if (schema) {
                console.log('\n📝 CREATE TABLE Statement:');
                console.log(schema);
            }
            
            // Get foreign key constraints
            const foreignKeys = await getForeignKeys(tableName);
            if (foreignKeys && foreignKeys.length > 0) {
                console.log('\n🔗 Foreign Key Constraints:');
                foreignKeys.forEach((fk, index) => {
                    console.log(`   ${index + 1}. ${tableName}.${fk.from} → ${fk.table}.${fk.to}`);
                    if (fk.on_update) console.log(`      ON UPDATE: ${fk.on_update}`);
                    if (fk.on_delete) console.log(`      ON DELETE: ${fk.on_delete}`);
                });
            } else {
                console.log('\n⚠️  No foreign key constraints defined');
            }
            
            // Get column information
            db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
                if (!err && columns) {
                    console.log('\n📋 Columns:');
                    columns.forEach(col => {
                        const pk = col.pk ? ' (PRIMARY KEY)' : '';
                        const notnull = col.notnull ? ' NOT NULL' : '';
                        const defaultVal = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
                        console.log(`   - ${col.name}: ${col.type}${pk}${notnull}${defaultVal}`);
                    });
                }
            });
        }
        
        // Wait a bit for async operations
        setTimeout(() => {
            db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                    process.exit(1);
                }
                console.log('\n' + '='.repeat(60));
                console.log('✅ Schema inspection complete');
                process.exit(0);
            });
        }, 1000);
        
    } catch (error) {
        console.error('❌ Error:', error);
        db.close();
        process.exit(1);
    }
};

showSchema();

