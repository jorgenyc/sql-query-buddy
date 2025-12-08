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
    console.log('✅ Database opened:', dbPath);
});

// Helper to run queries
const runQuery = (sql, description) => {
    return new Promise((resolve, reject) => {
        db.all(sql, (err, rows) => {
            if (err) {
                console.error(`❌ Error: ${description}`, err.message);
                reject(err);
            } else {
                console.log(`\n📊 ${description}:`);
                if (rows.length === 0) {
                    console.log('   (No results)');
                } else if (rows.length <= 5) {
                    console.log(JSON.stringify(rows, null, 2));
                } else {
                    console.log(`   (Showing first 5 of ${rows.length} results)`);
                    console.log(JSON.stringify(rows.slice(0, 5), null, 2));
                }
                resolve(rows);
            }
        });
    });
};

const diagnose = async () => {
    try {
        console.log('🔍 Diagnosing database...\n');

        // 1. Check tables exist
        await runQuery(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
            'Tables in database'
        );

        // 2. Check row counts
        await runQuery('SELECT COUNT(*) as count FROM customers', 'Customer count');
        await runQuery('SELECT COUNT(*) as count FROM orders', 'Order count');
        await runQuery('SELECT COUNT(*) as count FROM order_items', 'Order items count');
        await runQuery('SELECT COUNT(*) as count FROM products', 'Products count');

        // 3. Check for NULL foreign keys
        await runQuery(
            "SELECT COUNT(*) as null_count FROM orders WHERE customer_id IS NULL",
            'Orders with NULL customer_id'
        );
        await runQuery(
            "SELECT COUNT(*) as null_count FROM order_items WHERE order_id IS NULL",
            'Order items with NULL order_id'
        );
        await runQuery(
            "SELECT COUNT(*) as null_count FROM order_items WHERE product_id IS NULL",
            'Order items with NULL product_id'
        );

        // 4. Check sample data
        await runQuery(
            'SELECT customer_id, name, region FROM customers LIMIT 5',
            'Sample customers'
        );
        await runQuery(
            'SELECT order_id, customer_id, order_date, total_amount FROM orders LIMIT 5',
            'Sample orders'
        );
        await runQuery(
            'SELECT item_id, order_id, product_id, quantity FROM order_items LIMIT 5',
            'Sample order items'
        );

        // 5. Check if JOINs work
        await runQuery(
            `SELECT o.order_id, o.customer_id, c.name as customer_name 
             FROM orders o 
             LEFT JOIN customers c ON o.customer_id = c.customer_id 
             LIMIT 5`,
            'Orders JOIN Customers (should show matches)'
        );

        // 6. Check foreign key constraints
        await runQuery(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'",
            'Orders table schema'
        );
        await runQuery(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='order_items'",
            'Order items table schema'
        );

        // 7. Check foreign keys are enabled
        await runQuery('PRAGMA foreign_keys', 'Foreign keys enabled');

        // 8. Check actual relationships
        await runQuery(
            `SELECT COUNT(*) as matching_orders 
             FROM orders o 
             INNER JOIN customers c ON o.customer_id = c.customer_id`,
            'Orders that match customers (INNER JOIN)'
        );

        await runQuery(
            `SELECT COUNT(*) as matching_items 
             FROM order_items oi 
             INNER JOIN orders o ON oi.order_id = o.order_id`,
            'Order items that match orders (INNER JOIN)'
        );

        await runQuery(
            `SELECT COUNT(*) as matching_products 
             FROM order_items oi 
             INNER JOIN products p ON oi.product_id = p.product_id`,
            'Order items that match products (INNER JOIN)'
        );

        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
                process.exit(1);
            }
            console.log('\n✅ Diagnosis complete!');
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Error during diagnosis:', error);
        db.close();
        process.exit(1);
    }
};

diagnose();

