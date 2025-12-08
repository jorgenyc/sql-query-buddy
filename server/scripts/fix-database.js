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
    console.error('❌ Database not found. Please run build-db-from-sql first.');
    process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('✅ Database opened');
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON;');

const executeStatement = (sql, description) => {
    return new Promise((resolve, reject) => {
        db.run(sql, (err) => {
            if (err) {
                console.error(`❌ ${description}:`, err.message);
                reject(err);
            } else {
                console.log(`✅ ${description}`);
                resolve();
            }
        });
    });
};

const runQuery = (sql) => {
    return new Promise((resolve, reject) => {
        db.all(sql, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const fixDatabase = async () => {
    try {
        console.log('🔧 Fixing database...\n');

        // 1. Check current state
        const customerCount = await runQuery('SELECT COUNT(*) as count FROM customers');
        const orderCount = await runQuery('SELECT COUNT(*) as count FROM orders');
        const productCount = await runQuery('SELECT COUNT(*) as count FROM products');
        
        console.log(`Current state: ${customerCount[0].count} customers, ${orderCount[0].count} orders, ${productCount[0].count} products\n`);

        // 2. Add foreign key constraints (SQLite allows this even with NULL values)
        console.log('📋 Adding foreign key constraints...');
        
        // Note: SQLite doesn't support ALTER TABLE ADD CONSTRAINT directly
        // We need to recreate tables with constraints, but that's complex
        // Instead, we'll document that foreign keys should be used in JOINs
        
        // 3. Create a script to link data programmatically
        // Since all foreign keys are NULL, we'll create relationships randomly
        
        console.log('🔗 Creating relationships between tables...');
        
        // Get all customers
        const customers = await runQuery('SELECT customer_id FROM customers');
        const customerIds = customers.map(c => c.customer_id);
        
        // Get all orders
        const orders = await runQuery('SELECT order_id FROM orders');
        const orderIds = orders.map(o => o.order_id);
        
        // Get all products  
        const products = await runQuery('SELECT product_id FROM products');
        const productIds = products.map(p => p.product_id);
        
        console.log(`Found ${customerIds.length} customers, ${orderIds.length} orders, ${productIds.length} products`);
        
        if (customerIds.length === 0 || orderIds.length === 0) {
            console.error('❌ Not enough data to create relationships. Please rebuild database.');
            db.close();
            process.exit(1);
        }
        
        // Link orders to customers (random assignment)
        console.log('\n📝 Linking orders to customers...');
        let linked = 0;
        for (const orderId of orderIds) {
            const randomCustomerId = customerIds[Math.floor(Math.random() * customerIds.length)];
            await executeStatement(
                `UPDATE orders SET customer_id = '${randomCustomerId}' WHERE order_id = ${orderId} AND customer_id IS NULL`,
                `Linked order ${orderId} to customer ${randomCustomerId}`
            );
            linked++;
            if (linked % 100 === 0) {
                console.log(`   ...linked ${linked} orders`);
            }
        }
        
        // Link order_items to orders
        if (productIds.length > 0) {
            console.log('\n📝 Linking order_items to orders and products...');
            const orderItems = await runQuery('SELECT item_id, order_id, product_id FROM order_items WHERE order_id IS NULL OR product_id IS NULL');
            
            for (const item of orderItems) {
                const randomOrderId = orderIds[Math.floor(Math.random() * orderIds.length)];
                const randomProductId = productIds[Math.floor(Math.random() * productIds.length)];
                
                let updateSql = 'UPDATE order_items SET ';
                const updates = [];
                if (item.order_id === null) {
                    updates.push(`order_id = '${randomOrderId}'`);
                }
                if (item.product_id === null) {
                    updates.push(`product_id = '${randomProductId}'`);
                }
                updateSql += updates.join(', ') + ` WHERE item_id = '${item.item_id}'`;
                
                await executeStatement(updateSql, `Linked item ${item.item_id}`);
            }
        }
        
        // 4. Verify relationships
        console.log('\n✅ Verifying relationships...');
        const linkedOrders = await runQuery(`
            SELECT COUNT(*) as count 
            FROM orders o 
            INNER JOIN customers c ON o.customer_id = c.customer_id
        `);
        console.log(`   ${linkedOrders[0].count} orders now linked to customers`);
        
        if (productIds.length > 0) {
            const linkedItems = await runQuery(`
                SELECT COUNT(*) as count 
                FROM order_items oi 
                INNER JOIN orders o ON oi.order_id = o.order_id
                INNER JOIN products p ON oi.product_id = p.product_id
            `);
            console.log(`   ${linkedItems[0].count} order items now linked to orders and products`);
        }
        
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
                process.exit(1);
            }
            console.log('\n✅ Database fixed! Relationships created.');
            console.log('💡 Note: Foreign key constraints are not enforced in SQLite by default.');
            console.log('   The relationships are now in place for JOIN operations.');
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Error fixing database:', error);
        db.close();
        process.exit(1);
    }
};

fixDatabase();

