import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverDir = path.dirname(__dirname);
const rootDir = path.dirname(serverDir);
const dbPath = path.join(rootDir, 'sample_data', 'database.sqlite');
const sampleDataDir = path.join(rootDir, 'sample_data');

// Check if database exists and is locked
const checkDatabase = () => {
    if (!fs.existsSync(dbPath)) {
        return { exists: false, locked: false };
    }
    
    // Try to open in exclusive mode to check if locked
    try {
        const testDb = new sqlite3.Database(dbPath);
        testDb.close();
        return { exists: true, locked: false };
    } catch (err) {
        if (err.code === 'SQLITE_BUSY' || err.message.includes('locked')) {
            return { exists: true, locked: true };
        }
        return { exists: true, locked: false };
    }
};

// Execute SQL file with better error handling
const executeSqlFile = (db, filePath, description) => {
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
        
        console.log(`   Found ${statements.length} statements to execute...`);
        
        let executed = 0;
        let errors = 0;
        let completed = 0;
        
        // Use prepare/run for better control
        db.serialize(() => {
            db.run('BEGIN TRANSACTION;', (err) => {
                if (err) {
                    console.error('Error starting transaction:', err);
                    reject(err);
                    return;
                }
                
                // Execute statements sequentially to avoid issues
                const executeNext = (index) => {
                    if (index >= statements.length) {
                        // All statements queued, wait for completion
                        return;
                    }
                    
                    const statement = statements[index];
                    db.run(statement + ';', function(err) {
                        completed++;
                        
                        if (err) {
                            // Some errors are expected
                            if (!err.message.includes('UNIQUE constraint') && 
                                !err.message.includes('duplicate key') &&
                                !err.message.includes('FOREIGN KEY constraint failed') &&
                                !err.message.includes('no such table') &&
                                !err.message.includes('already exists')) {
                                console.error(`   ⚠️  Statement ${index + 1} error (continuing):`, err.message.substring(0, 100));
                                errors++;
                            }
                        } else {
                            executed++;
                            if (executed % 100 === 0) {
                                process.stdout.write(`   ...${executed} statements executed\r`);
                            }
                        }
                        
                        // Check if all statements are completed
                        if (completed === statements.length) {
                            db.run('COMMIT;', (commitErr) => {
                                if (commitErr) {
                                    console.error('\n❌ Error committing transaction:', commitErr);
                                    reject(commitErr);
                                    return;
                                }
                                console.log(`\n✅ Executed ${executed} statements from ${path.basename(filePath)}`);
                                if (errors > 0) {
                                    console.log(`   ⚠️  ${errors} errors encountered (some may be expected)`);
                                }
                                resolve();
                            });
                        } else {
                            // Execute next statement
                            executeNext(index + 1);
                        }
                    });
                };
                
                // Start executing
                executeNext(0);
            });
        });
    });
};

// Create relationships
const createRelationships = async (db) => {
    return new Promise((resolve, reject) => {
        console.log('\n🔗 Creating relationships between tables...');
        
        db.all('SELECT customer_id FROM customers', (err, customers) => {
            if (err) {
                reject(err);
                return;
            }
            
            db.all('SELECT order_id FROM orders', (err, orders) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                db.all('SELECT product_id FROM products', (err, products) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const customerIds = customers.map(c => c.customer_id);
                    const orderIds = orders.map(o => o.order_id);
                    const productIds = products.map(p => p.product_id);
                    
                    console.log(`   Found ${customerIds.length} customers, ${orderIds.length} orders, ${productIds.length} products`);
                    
                    if (customerIds.length === 0 || orderIds.length === 0) {
                        console.error('❌ Not enough data to create relationships');
                        reject(new Error('Not enough data'));
                        return;
                    }
                    
                    // Link orders to customers
                    console.log('\n📝 Linking orders to customers...');
                    db.run('BEGIN TRANSACTION;', (beginErr) => {
                        if (beginErr) {
                            reject(beginErr);
                            return;
                        }
                        
                        let linked = 0;
                        const linkOrders = () => {
                            if (linked >= orderIds.length) {
                                db.run('COMMIT;', (commitErr) => {
                                    if (commitErr) {
                                        reject(commitErr);
                                        return;
                                    }
                                    console.log(`   ✅ Linked ${linked} orders to customers`);
                                    
                                    // Link order_items if products exist
                                    if (productIds.length > 0) {
                                        linkOrderItems();
                                    } else {
                                        console.log('   ⚠️  No products found, skipping order_items linking');
                                        resolve();
                                    }
                                });
                                return;
                            }
                            
                            const orderId = orderIds[linked];
                            const randomCustomerId = customerIds[Math.floor(Math.random() * customerIds.length)];
                            
                            db.run(
                                `UPDATE orders SET customer_id = ? WHERE order_id = ? AND (customer_id IS NULL OR customer_id = '')`,
                                [randomCustomerId, orderId],
                                function(updateErr) {
                                    if (updateErr) {
                                        console.error(`   Error linking order ${orderId}:`, updateErr.message);
                                    }
                                    linked++;
                                    if (linked % 100 === 0) {
                                        process.stdout.write(`   ...linked ${linked} orders\r`);
                                    }
                                    linkOrders();
                                }
                            );
                        };
                        
                        const linkOrderItems = () => {
                            console.log('\n📝 Linking order_items to orders and products...');
                            db.all('SELECT item_id, order_id, product_id FROM order_items WHERE order_id IS NULL OR product_id IS NULL OR order_id = "" OR product_id = ""', (err, items) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                
                                if (items.length === 0) {
                                    console.log('   ✅ All order_items already linked');
                                    resolve();
                                    return;
                                }
                                
                                db.run('BEGIN TRANSACTION;', (beginErr) => {
                                    if (beginErr) {
                                        reject(beginErr);
                                        return;
                                    }
                                    
                                    let itemLinked = 0;
                                    const linkNext = () => {
                                        if (itemLinked >= items.length) {
                                            db.run('COMMIT;', (commitErr) => {
                                                if (commitErr) {
                                                    reject(commitErr);
                                                    return;
                                                }
                                                console.log(`   ✅ Linked ${itemLinked} order items`);
                                                resolve();
                                            });
                                            return;
                                        }
                                        
                                        const item = items[itemLinked];
                                        const randomOrderId = orderIds[Math.floor(Math.random() * orderIds.length)];
                                        const randomProductId = productIds[Math.floor(Math.random() * productIds.length)];
                                        
                                        const updates = [];
                                        const values = [];
                                        
                                        if (!item.order_id || item.order_id === '') {
                                            updates.push('order_id = ?');
                                            values.push(randomOrderId);
                                        }
                                        if (!item.product_id || item.product_id === '') {
                                            updates.push('product_id = ?');
                                            values.push(randomProductId);
                                        }
                                        
                                        if (updates.length > 0) {
                                            values.push(item.item_id);
                                            db.run(
                                                `UPDATE order_items SET ${updates.join(', ')} WHERE item_id = ?`,
                                                values,
                                                function(updateErr) {
                                                    if (updateErr) {
                                                        console.error(`   Error linking item ${item.item_id}:`, updateErr.message);
                                                    }
                                                    itemLinked++;
                                                    if (itemLinked % 100 === 0) {
                                                        process.stdout.write(`   ...linked ${itemLinked} items\r`);
                                                    }
                                                    linkNext();
                                                }
                                            );
                                        } else {
                                            itemLinked++;
                                            linkNext();
                                        }
                                    };
                                    
                                    linkNext();
                                });
                            });
                        };
                        
                        linkOrders();
                    });
                });
            });
        });
    });
};

// Main function
const rebuildAndFix = async () => {
    try {
        console.log('🚀 Rebuilding and fixing database...\n');
        
        const dbStatus = checkDatabase();
        if (dbStatus.locked) {
            console.error('❌ Database is locked. Please stop your server first.');
            console.log('   Then run: node server/scripts/rebuild-and-fix-database.js');
            process.exit(1);
        }
        
        // Remove existing database
        if (dbStatus.exists) {
            console.log('🗑️  Removing existing database...');
            try {
                fs.unlinkSync(dbPath);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.error('❌ Error removing database:', err.message);
                    console.log('   Database may be locked. Please stop your server and try again.');
                    process.exit(1);
                }
            }
        }
        
        // Create new database
        console.log('📦 Creating new database...');
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error creating database:', err);
                process.exit(1);
            }
        });
        
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON;');
        
        // Execute SQL files in order
        const sqlFiles = [
            { file: 'customers.sql', description: 'customers.sql → customers table' },
            { file: 'products.sql', description: 'products.sql → products table' },
            { file: 'orders.sql', description: 'orders.sql → orders table' },
            { file: 'order_items.sql', description: 'order_items.sql → order_items table' }
        ];
        
        for (const { file, description } of sqlFiles) {
            const filePath = path.join(sampleDataDir, file);
            await executeSqlFile(db, filePath, description);
        }
        
        // Create relationships
        await createRelationships(db);
        
        // Verify
        db.all('SELECT COUNT(*) as count FROM customers', (err, rows) => {
            if (err) {
                console.error('Error:', err);
                db.close();
                process.exit(1);
            }
            const customerCount = rows[0].count;
            
            db.all('SELECT COUNT(*) as count FROM orders', (err, rows) => {
                const orderCount = rows[0].count;
                
                db.all('SELECT COUNT(*) as count FROM products', (err, rows) => {
                    const productCount = rows[0].count;
                    
                    db.all('SELECT COUNT(*) as count FROM order_items', (err, rows) => {
                        const itemCount = rows[0].count;
                        
                        db.all('SELECT COUNT(*) as count FROM orders o INNER JOIN customers c ON o.customer_id = c.customer_id', (err, rows) => {
                            const linkedCount = rows[0].count;
                            
                            db.close((closeErr) => {
                                if (closeErr) {
                                    console.error('Error closing database:', closeErr);
                                    process.exit(1);
                                }
                                
                                console.log('\n✅ Database rebuild and fix completed!');
                                console.log(`\n📊 Final counts:`);
                                console.log(`   - Customers: ${customerCount}`);
                                console.log(`   - Orders: ${orderCount}`);
                                console.log(`   - Products: ${productCount}`);
                                console.log(`   - Order Items: ${itemCount}`);
                                console.log(`   - Linked Orders: ${linkedCount}`);
                                
                                if (linkedCount === 0) {
                                    console.log('\n⚠️  WARNING: No orders are linked to customers!');
                                    console.log('   The data may have NULL foreign keys. Relationships were created programmatically.');
                                }
                                
                                console.log('\n💡 Next step: Run "npm run optimize-db" to add indexes and views.');
                                process.exit(0);
                            });
                        });
                    });
                });
            });
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

rebuildAndFix();

