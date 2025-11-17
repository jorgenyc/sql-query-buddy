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

// Get all indexes
const getIndexes = () => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                name as index_name,
                tbl_name as table_name,
                sql as create_statement
            FROM sqlite_master 
            WHERE type='index' 
            AND name NOT LIKE 'sqlite_%'
            ORDER BY tbl_name, name
        `, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

// Check specific indexes
const checkSpecificIndexes = async () => {
    const indexes = await getIndexes();
    
    console.log('📊 Current Indexes in Database\n');
    console.log('='.repeat(70));
    
    if (indexes.length === 0) {
        console.log('⚠️  No indexes found!');
    } else {
        console.log(`\nFound ${indexes.length} indexes:\n`);
        
        // Group by table
        const byTable = {};
        indexes.forEach(idx => {
            if (!byTable[idx.table_name]) {
                byTable[idx.table_name] = [];
            }
            byTable[idx.table_name].push(idx);
        });
        
        Object.keys(byTable).sort().forEach(tableName => {
            console.log(`\n📋 Table: ${tableName.toUpperCase()}`);
            console.log('-'.repeat(70));
            byTable[tableName].forEach(idx => {
                console.log(`   ✅ ${idx.index_name}`);
                if (idx.create_statement) {
                    // Extract column name from CREATE INDEX statement
                    const match = idx.create_statement.match(/ON\s+\w+\s*\(([^)]+)\)/i);
                    if (match) {
                        console.log(`      Columns: ${match[1]}`);
                    }
                }
            });
        });
    }
    
    // Check for specific indexes requested
    console.log('\n' + '='.repeat(70));
    console.log('\n🔍 Checking for Required Indexes:\n');
    
    const requiredIndexes = [
        { name: 'idx_customers_customer_id', table: 'customers', column: 'customer_id' },
        { name: 'idx_orders_customer_id', table: 'orders', column: 'customer_id' }
    ];
    
    let allExist = true;
    requiredIndexes.forEach(req => {
        const exists = indexes.some(idx => 
            idx.index_name === req.name || 
            (idx.table_name === req.table && idx.create_statement && idx.create_statement.includes(req.column))
        );
        
        if (exists) {
            console.log(`   ✅ ${req.name} on ${req.table}.${req.column} - EXISTS`);
        } else {
            console.log(`   ❌ ${req.name} on ${req.table}.${req.column} - MISSING`);
            allExist = false;
        }
    });
    
    if (allExist) {
        console.log('\n✅ All required indexes exist!');
    } else {
        console.log('\n⚠️  Some indexes are missing. Run "npm run optimize-db" to create them.');
    }
    
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
            process.exit(1);
        }
        process.exit(0);
    });
};

checkSpecificIndexes();

