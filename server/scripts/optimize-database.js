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

if (!fs.existsSync(dbPath)) {
    console.error('❌ Database not found at:', dbPath);
    console.error('Please run "npm run build-db-from-sql" first to create the database.');
    process.exit(1);
}

// Open database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('✅ Database opened:', dbPath);
});

// Enable foreign keys and WAL mode for better performance
db.run('PRAGMA foreign_keys = ON;');
db.run('PRAGMA journal_mode = WAL;'); // Write-Ahead Logging for better concurrency
db.run('PRAGMA synchronous = NORMAL;'); // Faster writes with WAL (still safe)
db.run('PRAGMA cache_size = -64000;'); // 64MB cache (negative = KB, positive = pages)
db.run('PRAGMA temp_store = MEMORY;'); // Use memory for temporary tables (faster)
db.run('PRAGMA mmap_size = 268435456;'); // 256MB memory-mapped I/O for faster reads

// Execute SQL statement with error handling
const executeStatement = (sql, description) => {
    return new Promise((resolve, reject) => {
        db.run(sql, (err) => {
            if (err) {
                // Some errors are expected (like index already exists)
                if (err.message.includes('already exists') || 
                    err.message.includes('duplicate column name')) {
                    console.log(`⚠️  ${description} - already exists (skipping)`);
                    resolve();
                } else {
                    console.error(`❌ Error: ${description}`, err.message);
                    reject(err);
                }
            } else {
                console.log(`✅ ${description}`);
                resolve();
            }
        });
    });
};

// Main optimization function
const optimizeDatabase = async () => {
    try {
        console.log('🚀 Starting database optimization...\n');

        // 1. Create indexes on foreign keys for JOIN operations
        console.log('📊 Creating indexes for JOIN operations...');
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);',
            'Index on customers.customer_id'
        );
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);',
            'Index on orders.customer_id'
        );
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);',
            'Index on orders.order_id'
        );
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);',
            'Index on order_items.order_id'
        );
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);',
            'Index on order_items.product_id'
        );
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(product_id);',
            'Index on products.product_id'
        );

        // 2. Create index on order_date for date range filtering
        console.log('\n📅 Creating indexes for date filtering...');
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);',
            'Index on orders.order_date (for WHERE clause year filtering and range queries)'
        );
        
        // Index on total_amount for aggregation optimization
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_orders_total_amount ON orders(total_amount);',
            'Index on orders.total_amount (for SUM aggregation performance)'
        );

        // 3. Create composite indexes for common query patterns
        console.log('\n🔗 Creating composite indexes for common patterns...');
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_orders_date_customer ON orders(order_date, customer_id);',
            'Composite index on orders(order_date, customer_id)'
        );
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_order_items_order_product ON order_items(order_id, product_id);',
            'Composite index on order_items(order_id, product_id)'
        );

        // 4. Create indexes on other frequently filtered columns
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_customers_region ON customers(region);',
            'Index on customers.region (for geographic queries)'
        );
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);',
            'Index on products.category (for category filtering)'
        );
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_customers_signup_date ON customers(signup_date);',
            'Index on customers.signup_date (for signup trend queries)'
        );
        
        // 5. Additional indexes for GROUP BY and aggregation optimization
        console.log('\n🔢 Creating indexes for aggregation operations...');
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_order_items_quantity ON order_items(quantity);',
            'Index on order_items.quantity (for SUM aggregation)'
        );
        await executeStatement(
            'CREATE INDEX IF NOT EXISTS idx_order_items_product_quantity ON order_items(product_id, quantity);',
            'Composite index on order_items(product_id, quantity) for GROUP BY optimization'
        );

        // 6. Create views for common template query patterns
        // Note: SQLite doesn't support materialized views, but regular views with indexes
        // will provide significant performance benefits
        // These views pre-compute aggregations to optimize ORDER BY operations on computed columns
        console.log('\n📋 Creating views for common query patterns...');
        
        // View: Monthly Revenue Summary (optimized with COALESCE outside SUM)
        await executeStatement(`
            CREATE VIEW IF NOT EXISTS v_monthly_revenue AS
            SELECT 
                strftime('%Y-%m', o.order_date) AS month,
                strftime('%Y', o.order_date) AS year,
                COUNT(DISTINCT o.order_id) AS order_count,
                COALESCE(SUM(o.total_amount), 0) AS total_revenue,
                AVG(COALESCE(o.total_amount, 0)) AS avg_order_value
            FROM orders o
            WHERE o.order_date IS NOT NULL
            GROUP BY strftime('%Y-%m', o.order_date)
            ORDER BY month DESC;
        `, 'View: v_monthly_revenue (monthly revenue trends - optimized with COALESCE)');

        // View: Revenue by Region (optimized with INNER JOIN)
        await executeStatement(`
            CREATE VIEW IF NOT EXISTS v_revenue_by_region AS
            SELECT 
                c.region,
                COUNT(DISTINCT o.order_id) AS order_count,
                COALESCE(SUM(o.total_amount), 0) AS total_revenue,
                AVG(COALESCE(o.total_amount, 0)) AS avg_order_value,
                COUNT(DISTINCT c.customer_id) AS customer_count
            FROM customers c
            INNER JOIN orders o ON c.customer_id = o.customer_id
            WHERE c.region IS NOT NULL
            GROUP BY c.region
            ORDER BY total_revenue DESC;
        `, 'View: v_revenue_by_region (revenue by customer region - optimized with INNER JOIN)');

        // View: Top Customers by Revenue (optimized with INNER JOIN and COALESCE outside SUM)
        await executeStatement(`
            CREATE VIEW IF NOT EXISTS v_top_customers AS
            SELECT 
                c.customer_id,
                c.name,
                c.region,
                COUNT(DISTINCT o.order_id) AS order_count,
                COALESCE(SUM(o.total_amount), 0) AS total_spent,
                AVG(COALESCE(o.total_amount, 0)) AS avg_order_value,
                MIN(o.order_date) AS first_order_date,
                MAX(o.order_date) AS last_order_date
            FROM customers c
            INNER JOIN orders o ON c.customer_id = o.customer_id
            GROUP BY c.customer_id, c.name, c.region
            ORDER BY total_spent DESC;
        `, 'View: v_top_customers (customer revenue summary - optimized with INNER JOIN)');

        // View: Product Category Revenue (optimized with INNER JOIN and COALESCE outside SUM)
        await executeStatement(`
            CREATE VIEW IF NOT EXISTS v_category_revenue AS
            SELECT 
                p.category,
                COUNT(DISTINCT oi.order_id) AS order_count,
                COALESCE(SUM(oi.subtotal), 0) AS total_revenue,
                COALESCE(SUM(oi.quantity), 0) AS total_quantity,
                AVG(COALESCE(oi.subtotal, 0)) AS avg_item_value,
                COUNT(DISTINCT p.product_id) AS product_count
            FROM products p
            INNER JOIN order_items oi ON p.product_id = oi.product_id
            WHERE p.category IS NOT NULL
            GROUP BY p.category
            ORDER BY total_revenue DESC;
        `, 'View: v_category_revenue (revenue by product category - optimized with INNER JOIN)');

        // View: Order Items with Product Details
        await executeStatement(`
            CREATE VIEW IF NOT EXISTS v_order_items_detail AS
            SELECT 
                oi.item_id,
                oi.order_id,
                oi.product_id,
                oi.quantity,
                COALESCE(oi.subtotal, 0) AS subtotal,
                p.name AS product_name,
                p.category AS product_category,
                CAST(p.price AS REAL) AS product_price,
                o.order_date,
                o.customer_id,
                c.name AS customer_name,
                c.region AS customer_region
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.product_id
            LEFT JOIN orders o ON oi.order_id = o.order_id
            LEFT JOIN customers c ON o.customer_id = c.customer_id;
        `, 'View: v_order_items_detail (order items with full details)');

        // View: Monthly Order Trends (optimized with COALESCE outside SUM)
        await executeStatement(`
            CREATE VIEW IF NOT EXISTS v_monthly_orders AS
            SELECT 
                strftime('%Y-%m', o.order_date) AS month,
                strftime('%Y', o.order_date) AS year,
                COUNT(DISTINCT o.order_id) AS order_count,
                COUNT(DISTINCT o.customer_id) AS unique_customers,
                COALESCE(SUM(o.total_amount), 0) AS total_revenue
            FROM orders o
            WHERE o.order_date IS NOT NULL
            GROUP BY strftime('%Y-%m', o.order_date)
            ORDER BY month DESC;
        `, 'View: v_monthly_orders (monthly order trends - optimized with COALESCE)');

        // View: Customer Signups by Month
        await executeStatement(`
            CREATE VIEW IF NOT EXISTS v_monthly_signups AS
            SELECT 
                strftime('%Y-%m', c.signup_date) AS month,
                strftime('%Y', c.signup_date) AS year,
                COUNT(*) AS signup_count,
                COUNT(DISTINCT c.region) AS regions_represented
            FROM customers c
            WHERE c.signup_date IS NOT NULL
            GROUP BY strftime('%Y-%m', c.signup_date)
            ORDER BY month DESC;
        `, 'View: v_monthly_signups (customer signup trends)');

        // View: Top Products by Quantity Sold (optimized for ORDER BY total_quantity_sold)
        // This view pre-computes the aggregation, making ORDER BY operations much faster
        await executeStatement(`
            CREATE VIEW IF NOT EXISTS v_products_quantity_sold AS
            SELECT 
                p.product_id,
                p.name AS product_name,
                p.category AS product_category,
                CAST(p.price AS REAL) AS product_price,
                COALESCE(SUM(oi.quantity), 0) AS total_quantity_sold,
                COUNT(DISTINCT oi.order_id) AS order_count,
                COALESCE(SUM(oi.subtotal), 0) AS total_revenue
            FROM products p
            INNER JOIN order_items oi ON p.product_id = oi.product_id
            GROUP BY p.product_id, p.name, p.category, p.price
            ORDER BY total_quantity_sold DESC;
        `, 'View: v_products_quantity_sold (top products by quantity - optimized with INNER JOIN and COALESCE)');

        // 7. Analyze tables to update statistics for query planner
        console.log('\n📈 Analyzing tables for query optimizer...');
        await executeStatement('ANALYZE customers;', 'Analyzed customers table');
        await executeStatement('ANALYZE products;', 'Analyzed products table');
        await executeStatement('ANALYZE orders;', 'Analyzed orders table');
        await executeStatement('ANALYZE order_items;', 'Analyzed order_items table');

        // Close database
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
                process.exit(1);
            }
            console.log('\n✅ Database optimization completed successfully!');
            console.log('\n📊 Summary:');
            console.log('   - PRAGMA settings optimized (WAL mode, cache_size, temp_store, mmap_size)');
            console.log('   - Indexes created for JOIN operations');
            console.log('   - Index on orders.order_date (for WHERE clause year filtering)');
            console.log('   - Index on orders.total_amount (for SUM aggregation performance)');
            console.log('   - Index on customers.region (for WHERE clause filtering)');
            console.log('   - Composite indexes for common patterns');
            console.log('   - Views optimized with INNER JOIN and COALESCE outside SUM');
            console.log('   - Tables analyzed (ANALYZE) for query planner optimization');
            console.log('\n💡 Optimization Notes:');
            console.log('   - SQLite does not support materialized views natively.');
            console.log('   - Regular views with proper indexes provide excellent performance.');
            console.log('   - The views will automatically use the indexes we created.');
            console.log('\n📝 Query Pattern Recommendations:');
            console.log('   - Index Optimization: Indexes on customers.customer_id and orders.customer_id speed up JOINs.');
            console.log('   - JOIN Optimization: Use INNER JOIN instead of JOIN for better performance and clarity.');
            console.log('   - Aggregate Optimization: Use COALESCE(SUM(column), 0) instead of SUM(COALESCE(column, 0)).');
            console.log('   - Avoid SELECT *: Specify only needed columns to reduce data retrieval.');
            console.log('   - GROUP BY Optimization: Index on customers.region optimizes GROUP BY operations.');
            console.log('   - For queries with LIMIT: Use subqueries to limit rows before aggregation.');
            console.log('   - For ORDER BY on computed columns: Use pre-computed views (e.g., v_products_quantity_sold).');
            console.log('   - For aggregations: The indexes on (product_id, quantity) optimize GROUP BY operations.');
            console.log('   - For date filtering: Use range queries (order_date >= \'2024-01-01\' AND order_date < \'2025-01-01\')');
            console.log('     instead of strftime in WHERE clauses to leverage the order_date index.');
            console.log('   - For date formatting: Use strftime in SELECT/GROUP BY, but avoid it in WHERE clauses.');
            console.log('   - Example optimized query: SELECT product_name, total_quantity_sold FROM v_products_quantity_sold LIMIT 5;');
            console.log('   - Use EXPLAIN QUERY PLAN to analyze query execution and identify bottlenecks.');
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Error optimizing database:', error);
        db.close();
        process.exit(1);
    }
};

// Run the optimization
optimizeDatabase();

