import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths - script runs from server directory
const serverDir = path.dirname(__dirname);
const rootDir = path.join(serverDir, '..');
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

// Create unified schema
const createSchema = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Create customers table (matching customers.sql schema)
            db.run(`
                CREATE TABLE customers (
                    customer_id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(50),
                    email VARCHAR(50),
                    region VARCHAR(50),
                    signup_date DATE
                );
            `, (err) => {
                if (err) {
                    console.error('Error creating customers table:', err);
                    reject(err);
                    return;
                }
                console.log('✅ Created customers table');
            });

            // Create products table
            db.run(`
                CREATE TABLE products (
                    product_id INT PRIMARY KEY,
                    name VARCHAR(100),
                    category VARCHAR(50),
                    price DECIMAL(10,2)
                );
            `, (err) => {
                if (err) {
                    console.error('Error creating products table:', err);
                    reject(err);
                    return;
                }
                console.log('✅ Created products table');
            });

            // Create orders table
            db.run(`
                CREATE TABLE orders (
                    order_id INT PRIMARY KEY,
                    customer_id VARCHAR(50),
                    order_date DATE,
                    total_amount DECIMAL(10,2),
                    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
                );
            `, (err) => {
                if (err) {
                    console.error('Error creating orders table:', err);
                    reject(err);
                    return;
                }
                console.log('✅ Created orders table');
            });

            // Create order_items table
            db.run(`
                CREATE TABLE order_items (
                    item_id INT PRIMARY KEY,
                    order_id INT,
                    product_id INT,
                    quantity INT,
                    subtotal DECIMAL(10,2),
                    FOREIGN KEY (order_id) REFERENCES orders(order_id),
                    FOREIGN KEY (product_id) REFERENCES products(product_id)
                );
            `, (err) => {
                if (err) {
                    console.error('Error creating order_items table:', err);
                    reject(err);
                    return;
                }
                console.log('✅ Created order_items table');
                resolve();
            });
        });
    });
};

// Import hardcoded data from database.js
const importHardcodedData = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            console.log('\n📦 Importing hardcoded data from database.js...');
            
            // Import customers (map schema: first_name + last_name → name, state → region, registration_date → signup_date)
            const customersStmt = db.prepare('INSERT INTO customers (customer_id, name, email, region, signup_date) VALUES (?, ?, ?, ?, ?)');
            customersStmt.run('1', 'John Doe', 'john.doe@email.com', 'California', '2024-01-15');
            customersStmt.run('2', 'Jane Smith', 'jane.smith@email.com', 'New York', '2024-02-20');
            customersStmt.finalize((err) => {
                if (err) {
                    console.error('Error importing hardcoded customers:', err);
                    reject(err);
                    return;
                }
                console.log('✅ Imported 2 hardcoded customers');
            });

            // Import products (map schema: product_name → name)
            const productsStmt = db.prepare('INSERT INTO products (product_id, name, category, price) VALUES (?, ?, ?, ?)');
            productsStmt.run(1, 'Laptop', 'Electronics', 1200.00);
            productsStmt.run(2, 'Smartphone', 'Electronics', 800.00);
            productsStmt.finalize((err) => {
                if (err) {
                    console.error('Error importing hardcoded products:', err);
                    reject(err);
                    return;
                }
                console.log('✅ Imported 2 hardcoded products');
            });

            // Import orders (note: schema is different - hardcoded has product_id and quantity, but SQL schema doesn't)
            // We'll import the hardcoded orders but they won't have product_id/quantity in the new schema
            const ordersStmt = db.prepare('INSERT INTO orders (order_id, customer_id, order_date, total_amount) VALUES (?, ?, ?, ?)');
            ordersStmt.run(1, '1', '2024-03-10', 1200.00);
            ordersStmt.run(2, '2', '2024-03-15', 1600.00);
            ordersStmt.finalize((err) => {
                if (err) {
                    console.error('Error importing hardcoded orders:', err);
                    reject(err);
                    return;
                }
                console.log('✅ Imported 2 hardcoded orders');
                resolve();
            });
        });
    });
};

// Process and execute SQL file
const executeSqlFile = (filePath, tableName) => {
    return new Promise((resolve, reject) => {
        console.log(`\n📄 Processing ${path.basename(filePath)}...`);
        
        const sqlContent = fs.readFileSync(filePath, 'utf-8');
        
        // Replace MOCK_DATA with actual table name if needed
        let processedSql = sqlContent;
        if (tableName) {
            processedSql = processedSql.replace(/MOCK_DATA/g, tableName);
        }
        
        // Split by semicolons and filter out empty statements
        const statements = processedSql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.toLowerCase().startsWith('create table'));
        
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
                
                if (statements.length === 0) {
                    db.run('COMMIT;', (commitErr) => {
                        if (commitErr) {
                            console.error('Error committing transaction:', commitErr);
                            reject(commitErr);
                            return;
                        }
                        console.log(`✅ No statements to execute from ${path.basename(filePath)}`);
                        resolve();
                    });
                    return;
                }
                
                statements.forEach((statement, index) => {
                    db.run(statement + ';', (err) => {
                        completed++;
                        
                        if (err) {
                            // Some errors are expected (like duplicate keys), log but continue
                            if (!err.message.includes('UNIQUE constraint') && 
                                !err.message.includes('duplicate key') &&
                                !err.message.includes('FOREIGN KEY constraint failed')) {
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
                                    console.log(`⚠️  ${errors} errors encountered (some may be expected, e.g., duplicate keys or foreign key constraints)`);
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
        console.log('🚀 Starting database build process...\n');
        
        // Step 1: Create schema
        await createSchema();
        
        // Step 2: Import hardcoded data
        await importHardcodedData();
        
        // Step 3: Import SQL files in specified order
        const sqlFiles = [
            { file: 'customers.sql', table: null }, // Has CREATE TABLE, so table is null
            { file: 'products.sql', table: 'products' },
            { file: 'orders.sql', table: 'orders' },
            { file: 'order_items.sql', table: 'order_items' }
        ];
        
        for (const { file, table } of sqlFiles) {
            const filePath = path.join(sampleDataDir, file);
            if (!fs.existsSync(filePath)) {
                console.error(`❌ File not found: ${filePath}`);
                process.exit(1);
            }
            await executeSqlFile(filePath, table);
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

