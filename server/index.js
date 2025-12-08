import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { Cohere } from '@langchain/cohere';
import { AI21 } from '@langchain/community/llms/ai21';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { BufferMemory } from 'langchain/memory';
import memoryManager from './memoryManager.js';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { RunnableSequence } from '@langchain/core/runnables';
import { formatDocumentsAsString } from 'langchain/util/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import pRetry from 'p-retry';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import db, { logDatabaseInfo, executeQueryWithTimeout } from './database.js';
import logger from './logger.js';
import progressManager from './progressManager.js';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check and create .env file from .env.example if it doesn't exist
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

if (!fs.existsSync(envPath)) {
    logger.info('⚠️  .env file not found. Creating from .env.example...');
    try {
        if (fs.existsSync(envExamplePath)) {
            fs.copyFileSync(envExamplePath, envPath);
            logger.info('✅ .env file created successfully!');
            logger.info('📝 Please edit .env and add your API keys before running queries.');
            logger.info('');
        } else {
            logger.error('❌ .env.example file not found. Cannot create .env file.');
            logger.info('Please create a .env file manually with your configuration.');
            logger.info('');
        }
    } catch (error) {
        logger.error('❌ Failed to create .env file:', error.message);
    }
}

// Now load environment variables
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3001;

// Security: Helmet for security headers (CSP, etc.)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false // Allow Chart.js and other CDN resources
}));

// CORS Configuration - Environment-based origin whitelist
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, Postman, or same-origin requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' })); // Limit JSON payload size
app.use(express.static('public', { dotfiles: 'allow' }));

// --- Power User Configuration ---
let appConfig = { power_user: true }; // Default to true for backward compatibility
try {
    const appConfigPath = path.join(__dirname, 'app-config.json');
    if (fs.existsSync(appConfigPath)) {
        appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf-8'));
        logger.info(`Power user mode: ${appConfig.power_user ? 'ENABLED' : 'DISABLED'}`);
    } else {
        logger.info('app-config.json not found, defaulting to power_user: true (backward compatible)');
    }
} catch (error) {
    logger.warn(`Failed to load app-config.json: ${error.message}, defaulting to power_user: true`);
}

// --- Provider Management ---
const config = JSON.parse(fs.readFileSync('./vendor_config.json', 'utf-8'));
const providerManager = {
    providers: config.providers.map(p => {
        const defaultModel = p.models.find(m => m.default) || p.models[0];
        // SECURITY: API keys are ONLY loaded from environment variables
        // Never fall back to configuration files to prevent accidental key exposure
        const apiKey = process.env[`${p.name.toUpperCase()}_API_KEY`] || null;
        return { ...p, selectedModel: defaultModel.name, apiKey: apiKey };
    }),
    currentIndex: 0,
    getProvider: function () {
        // Simply return the provider at current index without any cycling
        return this.providers[this.currentIndex];
    },
    getProviderWithFallback: function () {
        // If power_user is disabled, try to force OpenAI with gpt-4o-mini
        if (appConfig && !appConfig.power_user) {
            const openaiIndex = this.providers.findIndex(p => p.name === 'openai');
            if (openaiIndex !== -1) {
                const openaiProvider = this.providers[openaiIndex];
                // Ensure gpt-4o-mini is selected
                const gpt4oMini = openaiProvider.models.find(m => m.name === 'gpt-4o-mini');
                if (gpt4oMini) {
                    openaiProvider.selectedModel = 'gpt-4o-mini';
                }
                // If OpenAI is enabled and has valid key, use it
                if (openaiProvider.enabled && this.isValidApiKey(openaiProvider)) {
                    this.currentIndex = openaiIndex;
                    return openaiProvider;
                }
                // If OpenAI doesn't have a valid key, still set it as current but continue to fallback
                this.currentIndex = openaiIndex;
            }
        }

        // Find the first enabled provider with a valid API key
        let currentProvider = this.providers[this.currentIndex];

        // Check if current provider is valid
        if (currentProvider.enabled && this.isValidApiKey(currentProvider)) {
            return currentProvider;
        }

        // If current provider is not valid, try to find the next valid one
        for (let i = 0; i < this.providers.length; i++) {
            this.currentIndex = (this.currentIndex + 1) % this.providers.length;
            currentProvider = this.providers[this.currentIndex];
            if (currentProvider.enabled && this.isValidApiKey(currentProvider)) {
                return currentProvider;
            }
        }

        // No valid provider found - return null to trigger startup failure
        return null;
    },
    isValidApiKey: function (provider) {
        // AWS Bedrock uses IAM roles, not API keys
        if (provider.requiresIAM) {
            return false; // Not currently supported
        }

        // API key must exist, be a non-empty string, and not be a placeholder
        return provider.apiKey &&
            typeof provider.apiKey === 'string' &&
            provider.apiKey.length > 0 &&
            !provider.apiKey.startsWith('YOUR_') &&
            !provider.apiKey.startsWith('your-') &&
            !provider.apiKey.includes('your-api-key') &&
            provider.apiKey !== 'null' &&
            provider.apiKey !== 'undefined';
    },
    nextProvider: function () {
        this.currentIndex = (this.currentIndex + 1) % this.providers.length;
    },
    setSelectedModel: function (providerName, modelName) {
        const providerIndex = this.providers.findIndex(p => p.name === providerName);
        if (providerIndex !== -1) {
            const provider = this.providers[providerIndex];
            const modelExists = provider.models.some(m => m.name === modelName);
            if (modelExists) {
                provider.selectedModel = modelName;
                logger.info(`Set model for provider ${providerName} to ${modelName}`);
                return true;
            }
        }
        return false;
    }
};

// --- Database Schema ---
const getDbSchema = async () => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table'");
        stmt.all([], (err, tables) => {
            if (err) {
                reject(err);
            } else {
                resolve(tables.map(t => t.sql).join('\n'));
            }
        });
    });
};

// --- SQL Security Validation ---

/**
 * Strips SQL comments from a query string for security.
 * Removes both block comments and single-line comments
 * while preserving string literals.
 */
const stripSQLComments = (sqlQuery) => {
    let result = sqlQuery;

    // Remove block comments /* ... */
    // This regex preserves string literals while removing comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, ' ');

    // Remove single-line comments -- (but not inside strings)
    result = result.split('\n').map(line => {
        // Simple approach: remove everything after -- if not in a string
        const stringMatch = line.match(/^([^']*'[^']*')*[^']*$/);
        if (stringMatch) {
            const commentIndex = line.indexOf('--');
            if (commentIndex !== -1) {
                // Check if -- is inside a string by counting quotes before it
                const beforeComment = line.substring(0, commentIndex);
                const quoteCount = (beforeComment.match(/'/g) || []).length;
                // If even number of quotes, -- is outside strings
                if (quoteCount % 2 === 0) {
                    return line.substring(0, commentIndex);
                }
            }
        }
        return line;
    }).join('\n');

    return result.trim();
};

/**
 * Validates SQL queries to prevent SQL injection and unauthorized operations.
 * This implements multiple layers of security:
 * 1. Comment stripping: Removes any comments (defense in depth)
 * 2. Whitelist: Only SELECT statements are allowed
 * 3. Blacklist: Dangerous keywords and patterns are blocked
 * 4. Structure validation: Basic SQL structure is verified
 */
const validateSQLQuery = (sqlQuery) => {
    if (!sqlQuery || typeof sqlQuery !== 'string') {
        return { valid: false, error: 'Invalid query: Query must be a non-empty string' };
    }

    // STEP 1: Strip any comments from the query (defense in depth)
    const cleanedQuery = stripSQLComments(sqlQuery);
    logger.debug(`[SECURITY] Original query length: ${sqlQuery.length}, Cleaned: ${cleanedQuery.length}`);

    const trimmedQuery = cleanedQuery.trim().toUpperCase();

    // 1. WHITELIST: Only allow SELECT statements (read-only)
    if (!trimmedQuery.startsWith('SELECT')) {
        return {
            valid: false,
            error: 'Security violation: Only SELECT queries are allowed. Modifying operations (INSERT, UPDATE, DELETE, DROP, etc.) are prohibited.'
        };
    }

    // 2. BLACKLIST: Block dangerous SQL keywords and patterns

    // First, check for block comments (/* ... */) - should be removed by stripSQLComments
    // But double-check as a safety measure
    if (cleanedQuery.includes('/*') || cleanedQuery.includes('*/')) {
        logger.warn('[SECURITY] Block comments detected even after stripping!');
        return {
            valid: false,
            error: 'Security violation: Block comments (/* */) are not allowed.'
        };
    }

    // Check for dangerous SQL keywords
    const dangerousKeywords = [
        'DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE',
        'TRUNCATE', 'REPLACE', 'EXEC', 'EXECUTE', 'PRAGMA',
        'ATTACH', 'DETACH', 'VACUUM', 'REINDEX',
        'INTO OUTFILE', 'INTO DUMPFILE', 'LOAD_FILE'
    ];

    for (const keyword of dangerousKeywords) {
        // Check for standalone keywords or keywords followed by whitespace/parenthesis
        const pattern = new RegExp(`\\b${keyword}\\b|${keyword}\\s|${keyword}\\(`, 'i');
        if (pattern.test(cleanedQuery)) {
            return {
                valid: false,
                error: `Security violation: Dangerous keyword or pattern detected: "${keyword}". This query has been blocked.`
            };
        }
    }

    // Check for SQL injection patterns (should be mostly handled by comment stripping)
    const injectionPatterns = [
        /;[\s]*--/,  // Semicolon followed by SQL comment
        /UNION[\s]+ALL[\s]+SELECT/i,
        /UNION[\s]+SELECT/i
    ];

    for (const pattern of injectionPatterns) {
        if (pattern.test(cleanedQuery)) {
            return {
                valid: false,
                error: 'Security violation: SQL injection pattern detected. This query has been blocked.'
            };
        }
    }

    // 3. Check for multiple statements (SQL injection attempt)
    // Allow semicolons only within strings, but block multiple statements
    const statementsOutsideStrings = cleanedQuery.replace(/'[^']*'/g, '').split(';').filter(s => s.trim());
    if (statementsOutsideStrings.length > 1) {
        return {
            valid: false,
            error: 'Security violation: Multiple SQL statements detected. Only single SELECT queries are allowed.'
        };
    }

    // 4. Validate basic SELECT structure
    if (!trimmedQuery.includes('FROM')) {
        return {
            valid: false,
            error: 'Invalid query: SELECT statement must include a FROM clause'
        };
    }

    // 5. Block queries attempting to access sensitive SQLite metadata tables
    const sensitivePatterns = [
        /sqlite_master.*WHERE.*type\s*!=\s*['"]table['"]/i,
        /sqlite_temp_master/i
    ];

    for (const pattern of sensitivePatterns) {
        if (pattern.test(cleanedQuery)) {
            return {
                valid: false,
                error: 'Security violation: Unauthorized access to sensitive database metadata'
            };
        }
    }

    // 6. Additional validation: Limit query length to prevent DoS
    if (cleanedQuery.length > 5000) {
        return {
            valid: false,
            error: 'Query too long: Maximum query length is 5000 characters'
        };
    }

    logger.info('[SECURITY] SQL query passed validation checks');
    return { valid: true, cleanedQuery };
};


// --- LangChain Setup ---

const createLlmAndEmbeddings = (provider) => {
    logger.info(`Attempting to create LLM and Embeddings for provider: ${provider.name} with model: ${provider.selectedModel}`);
    switch (provider.name) {
        case 'openai':
            logger.info(`Using OpenAI API Key: ${provider.apiKey ? 'Provided' : 'NOT Provided'}`);
            return {
                llm: new ChatOpenAI({ apiKey: provider.apiKey, modelName: provider.selectedModel, temperature: 0 }),
                embeddings: new OpenAIEmbeddings({ apiKey: provider.apiKey })
            };
        case 'cohere':
            const openaiProviderForCohere = providerManager.providers.find(p => p.name === 'openai');
            if (!openaiProviderForCohere) {
                throw new Error('OpenAI provider not found, which is required for Cohere embeddings.');
            }
            logger.info(`Using Cohere API Key: ${provider.apiKey ? 'Provided' : 'NOT Provided'} with OpenAI Embeddings API Key: ${openaiProviderForCohere.apiKey ? 'Provided' : 'NOT Provided'}`);
            return {
                llm: new Cohere({ apiKey: provider.apiKey, model: provider.selectedModel, temperature: 0 }),
                embeddings: new OpenAIEmbeddings({ apiKey: openaiProviderForCohere.apiKey })
            };
        case 'ai21':
            const openaiProviderForAi21 = providerManager.providers.find(p => p.name === 'openai');
            if (!openaiProviderForAi21) {
                throw new Error('OpenAI provider not found, which is required for AI21 embeddings.');
            }
            logger.info(`Using AI21 API Key: ${provider.apiKey ? 'Provided' : 'NOT Provided'} with OpenAI Embeddings API Key: ${openaiProviderForAi21.apiKey ? 'Provided' : 'NOT Provided'}`);
            return {
                llm: new AI21({ ai21ApiKey: provider.apiKey, model: provider.selectedModel, temperature: 0 }),
                embeddings: new OpenAIEmbeddings({ apiKey: openaiProviderForAi21.apiKey })
            };
        default:
            throw new Error(`Unsupported provider: ${provider.name}`);
    }
};


// Memory is now managed per-tab via memoryManager
// Each tab has its own isolated BufferMemory instance
// This allows multiple independent conversation contexts
const MAX_HISTORY_MESSAGES = memoryManager.getMaxHistoryMessages();

// 2. Prompt Template
const sqlTemplate = `
You are SQL Query Buddy, a conversational AI that helps users explore databases.

CURRENT DATE: {current_date}

Database schema:
{schema}

Conversation history:
{chat_history}

User query: {input}

CRITICAL: You MUST format your entire response using GitHub-Flavored Markdown. This is essential for the application to render it correctly.

IMPORTANT BUSINESS TERMS & RELATIONSHIPS:
- **Sales/Revenue**: When users ask about "sales" or "revenue", they mean the sum of order amounts. Use SUM(orders.total_amount) or SUM(order_items.subtotal) from the orders or order_items tables.
- **NULL Handling**: The subtotal column in order_items may contain NULL values. For better performance, use COALESCE outside SUM: COALESCE(SUM(order_items.subtotal), 0) instead of SUM(COALESCE(order_items.subtotal, 0)). This avoids unnecessary calculations on NULL values during aggregation.
- **Table Relationships**: 
  - orders.customer_id links to customers.customer_id
  - orders.order_id links to order_items.order_id
  - order_items.product_id links to products.product_id
- **Geographic Queries**: Customer location is stored in customers.region (contains state names like "New York", "California", etc.). Use customers.region to filter by location. An index exists on customers.region to speed up WHERE clause filtering operations. Always use this indexed column in WHERE clauses for efficient querying.
- **Monthly/Time-based Queries**: Use strftime('%Y-%m', order_date) to group by year-month, strftime('%Y-%m-%d', order_date) for daily, strftime('%Y', order_date) for yearly.
- **Date Range Queries (OPTIMIZED)**: For year filtering in WHERE clauses, use range queries instead of strftime to leverage the order_date index: WHERE order_date >= '2024-01-01' AND order_date < '2025-01-01' (much faster than strftime('%Y', order_date) = '2024').

COMMON QUERY PATTERNS (OPTIMIZED):
- Sales by region: Use INNER JOIN with indexed columns. SELECT c.region, COALESCE(SUM(o.total_amount), 0) AS total_revenue FROM customers c INNER JOIN orders o ON c.customer_id = o.customer_id GROUP BY c.region ORDER BY total_revenue DESC
- Filter by region: Use indexed region column in WHERE clause. SELECT customer_id, name, email FROM customers WHERE region = 'California' (specify only necessary columns, avoid SELECT *)
- Sales by month: Use strftime('%Y-%m', orders.order_date) AS month, GROUP BY month, COALESCE(SUM(orders.total_amount), 0) ORDER BY month
- Sales by region and month: Use INNER JOIN: SELECT c.region, strftime('%Y-%m', o.order_date) AS month, COALESCE(SUM(o.total_amount), 0) AS sales FROM customers c INNER JOIN orders o ON c.customer_id = o.customer_id GROUP BY c.region, month ORDER BY month
- Sales by region and month with date filter: Use INNER JOIN with range query: SELECT c.region, strftime('%Y-%m', o.order_date) AS month, COALESCE(SUM(o.total_amount), 0) AS sales FROM customers c INNER JOIN orders o ON c.customer_id = o.customer_id WHERE c.region = 'StateName' AND o.order_date >= date('now', '-N months') GROUP BY c.region, month ORDER BY month
- Top customers: Use INNER JOIN, group by ID, order by aggregate directly: SELECT c.customer_id, c.name, COALESCE(SUM(o.total_amount), 0) AS total_sales FROM customers c INNER JOIN orders o ON c.customer_id = o.customer_id GROUP BY c.customer_id ORDER BY SUM(o.total_amount) DESC
- Product revenue: Use INNER JOIN with indexed columns: SELECT p.product_id, p.category, COALESCE(SUM(oi.subtotal), 0) AS revenue FROM products p INNER JOIN order_items oi ON p.product_id = oi.product_id GROUP BY p.product_id, p.category ORDER BY SUM(oi.subtotal) DESC
- Customer-product quantity: Use multiple INNER JOINs with indexed columns: SELECT c.customer_id, c.name, p.product_id, p.name, COALESCE(SUM(oi.quantity), 0) AS total_quantity FROM customers c INNER JOIN orders o ON c.customer_id = o.customer_id INNER JOIN order_items oi ON o.order_id = oi.order_id INNER JOIN products p ON oi.product_id = p.product_id GROUP BY c.customer_id, p.product_id ORDER BY SUM(oi.quantity) DESC
- Top products by quantity: For queries asking for "top N products by quantity sold", use the optimized view: SELECT product_name, total_quantity_sold FROM v_products_quantity_sold LIMIT N; This is much faster than aggregating from scratch.

- Date filtering examples (OPTIMIZED - use range queries to leverage index):
  * "Last 16 months": WHERE order_date >= date('now', '-16 months')
  * "Last year": WHERE order_date >= date('now', '-12 months')
  * "Last 6 months": WHERE order_date >= date('now', '-6 months')
  * "Year 2024": WHERE order_date BETWEEN '2024-01-01' AND '2024-12-31' OR WHERE order_date >= '2024-01-01' AND order_date < '2025-01-01' (preferred over strftime for performance)
  * "Year 2023": WHERE order_date BETWEEN '2023-01-01' AND '2023-12-31' OR WHERE order_date >= '2023-01-01' AND order_date < '2024-01-01'

PERFORMANCE OPTIMIZATION TIPS:
- **Index Optimization**: Indexes exist on customers.customer_id, orders.customer_id, order_items.order_id, order_items.product_id, and products.product_id to speed up JOIN operations. ALWAYS use these indexed columns in JOIN conditions and GROUP BY clauses for efficient querying. The query planner will automatically use these indexes when you join on these columns.

- **JOIN Optimization**: ALWAYS use INNER JOIN explicitly instead of JOIN. This is required for optimal performance and clarity. For all table joins, use the pattern:
  FROM customers c
  INNER JOIN orders o ON c.customer_id = o.customer_id
  INNER JOIN order_items oi ON o.order_id = oi.order_id
  INNER JOIN products p ON oi.product_id = p.product_id
  Never use just "JOIN" - always write "INNER JOIN" explicitly.

- **Aggregate Function Optimization**: ALWAYS move COALESCE outside SUM for better performance. Use COALESCE(SUM(column), 0) instead of SUM(COALESCE(column, 0)). This avoids unnecessary calculations on NULL values during aggregation. Example: Use COALESCE(SUM(o.total_amount), 0) directly for calculating total sales instead of SUM(COALESCE(o.total_amount, 0)) for better performance.

- **GROUP BY Optimization**: 
  - ALWAYS group by ID columns (c.customer_id, p.product_id) instead of name columns (c.name, p.name) for consistency and to avoid unnecessary data retrieval.
  - Indexes exist on customers.customer_id, orders.customer_id, customers.region, (product_id, quantity), and other frequently grouped columns to optimize GROUP BY operations.
  - The query planner will automatically use these indexes when grouping by indexed columns.

- **ORDER BY Optimization**: Order by the aggregate function directly (e.g., ORDER BY SUM(o.total_amount) DESC) instead of using aliases (e.g., ORDER BY total_sales DESC) for better query optimization. However, if you must use an alias, ensure it's defined in the SELECT clause.

- **LIMIT Clause**: Only use LIMIT when necessary. If the user doesn't specify a limit (e.g., "top 10"), consider whether limiting results is actually required. Removing unnecessary LIMIT clauses can improve performance. When LIMIT is needed with aggregations, consider using a subquery to limit rows before aggregation, or use pre-computed views that already have the data sorted.

- **Avoid SELECT ***: Always specify only the columns you need. Instead of selecting all columns using SELECT *, specify only the necessary columns to reduce data retrieval and improve query performance. For example: SELECT customer_id, name, email FROM customers WHERE region = 'California' instead of SELECT * FROM customers WHERE region = 'California'. This reduces data retrieval and improves performance.

- **Use pre-computed views**: For ORDER BY on computed columns (like total_quantity_sold), use views like v_products_quantity_sold instead of computing aggregations in the main query.

- **Date filtering optimization**: Use range queries to leverage the order_date index. Prefer BETWEEN for better readability: WHERE order_date BETWEEN '2024-01-01' AND '2024-12-31'. NEVER use strftime in WHERE clauses (e.g., strftime('%Y', order_date) = '2024') as it prevents index usage and hinders performance.

- **Aggregation optimization**: Index on orders.total_amount exists to improve SUM() performance. Index on order_items.quantity exists to improve SUM(quantity) performance.

- **Query execution plan analysis**: Check the query execution plan using EXPLAIN QUERY PLAN (or EXPLAIN) to verify if indexes are being utilized. Analyze the execution plan to identify potential bottlenecks and ensure indexes are utilized effectively. If an index is not being used, the database statistics may need updating. The database has been analyzed (ANALYZE) to help the query planner make optimal decisions. Example: EXPLAIN QUERY PLAN SELECT ... to see which indexes are used. Always verify that indexes (especially on customers.region, customers.customer_id, orders.customer_id) are being utilized in the execution plan.

INSTRUCTIONS:
1. **Check conversation history first**: If the user uses pronouns ("them", "those", "it") or phrases like "now filter", "show those", "from previous result", or "from the previous query", they're referring to previous results. Look at the conversation history to understand the context.

   **Using Previous Results**: When the user refers to "previous result" or uses pronouns like "them", "they", "that person", "that customer", "she", "he", "it", etc., you MUST:
   - Look at the MOST RECENT query result in the conversation history to find the person/entity being referenced
   - Extract the specific IDs (customer_id, product_id, order_id, etc.) OR names (name, customer_name, product_name, etc.) from the "Key Identifiers" section or the "Results" section in the conversation history
   - For pronouns like "she", "he", "they", "it", "that person", "that customer", look at the LAST query result and extract the name or ID from the FIRST row (which typically represents the top result)
   - Use these values in a WHERE clause to filter the next query:
     * For IDs: WHERE customer_id IN (1, 2, 3, 4, 5)
     * For names: WHERE name = 'John Doe' OR WHERE name IN ('John Doe', 'Jane Smith')
   - If the previous query returned specific rows, use those exact rows' identifying values to filter
   - Example: If previous query "who had the most sales" returned name='Janek Bothwell' in the first row, and user asks "how many sales did she have", extract 'Janek Bothwell' and use: WHERE name = 'Janek Bothwell'
   - Example: If previous query returned customer_id values [1, 2, 3, 4, 5] in the Key Identifiers section, use: WHERE customer_id IN (1, 2, 3, 4, 5)
   - Example: If previous query returned name values ['John Doe'] in the Key Identifiers section, use: WHERE name = 'John Doe' OR WHERE name IN ('John Doe')
   - Example: If user asks "how much in sales did that person have" after a query about "who had the most sales", extract the name value from the FIRST row of previous results and query: SELECT SUM(total_amount) FROM orders o INNER JOIN customers c ON o.customer_id = c.customer_id WHERE c.name = 'extracted_name'
   - Example: If user asks "show me the states they are from" after a query about top 5 customers, extract the customer_id values from previous results and query: SELECT DISTINCT region FROM customers WHERE customer_id IN (extracted_ids)

2. **Generate SQL - READ ONLY**: Create a SQLite SELECT query to answer the user's question. For follow-up questions, build upon or modify the previous SQL query shown in the conversation history, using the specific IDs/values from previous results to filter appropriately.

   **CRITICAL SECURITY REQUIREMENTS**:
   - You must ONLY generate SELECT queries.
   - NEVER generate: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, or any other data modification commands.
   - **ABSOLUTELY NO BLOCK COMMENTS**: NEVER use /* */ style comments in SQL. They will be blocked for security.
   - Do NOT add ANY comments to the SQL query. Generate clean, comment-free SQL only.
   - If a user asks to modify, delete, or update data, politely explain that you can only read data, not modify it.

3. **Handle temporal references**: 
   - When the user says "this year", use the year from CURRENT DATE shown above. 
   - "Last year" means current year - 1. 
   - "Last N months" means orders from N months ago to now. Use: WHERE order_date >= date('now', '-N months')
   - "Over last 16 months" means: WHERE order_date >= date('now', '-16 months')
   - For date comparisons, use: order_date >= date('now', '-N months') or order_date >= date('now', '-N days')
   - Use strftime('%Y', date_column) for year comparisons in SQLite. 
   - For monthly grouping, use strftime('%Y-%m', date_column).

4. **Handle unrelated queries**: If the query has nothing to do with databases or data (e.g., "What's the weather?"), simply explain in the Explanation field that you can only help with database queries, and leave the SQL Query field empty.

5. **Handle modification requests**: If the user asks to modify, delete, insert, or update data, explain that you can only read data (SELECT queries) for security reasons, and leave the SQL Query field empty.

6. **SQLite syntax**: 
   - For GROUP BY: Use strftime('%Y', date_column) for year, strftime('%Y-%m', date_column) for year-month, strftime('%Y-%m-%d', date_column) for full date. Do NOT use EXTRACT.
   - For WHERE clauses: ALWAYS use range queries to leverage the order_date index. Use BETWEEN for readability: WHERE order_date BETWEEN '2024-01-01' AND '2024-12-31' OR WHERE order_date >= '2024-01-01' AND order_date < '2025-01-01'. NEVER use strftime('%Y', order_date) = '2024' in WHERE clauses as it prevents index usage and degrades performance.

Provide your response in this EXACT format with emojis:

🧑‍🏫 Explainable SQL Explanation:
[Insert your beginner-friendly explanation here. Example: "This query selects the top 5 customers by summing their total order amounts and sorting them in descending order."]

Query:
\`\`\`sql
[Your SELECT query here, or leave empty if query is unrelated to databases or asks for data modification]
\`\`\`
`;

const insightsTemplate = `
You are an expert data analyst AI. Your role is to provide deep, actionable insights that go beyond simply describing the data. Analyze patterns, trends, anomalies, and business implications.

User Query: {input}
SQL Query Results: {sql_results}

CRITICAL: You MUST format your entire response using GitHub-Flavored Markdown.

ANALYSIS REQUIREMENTS:
1. **Identify Patterns & Trends**: Look for patterns in the data - are there trends over time? Seasonal patterns? Growth or decline?
2. **Compare & Contextualize**: Compare values to averages, totals, or benchmarks. Calculate percentages, ratios, and relative performance.
3. **Spot Anomalies**: Identify outliers, unusual values, or unexpected results that stand out.
4. **Business Implications**: Explain what the data means for business decisions - opportunities, risks, or areas needing attention.
5. **Actionable Recommendations**: Suggest what actions should be taken based on the insights.
6. **Deeper Analysis**: Don't just state what the data shows - explain WHY it might be happening, what it reveals, and what it means.

AVOID:
- Simply restating what's in the results table
- Listing data without analysis
- Generic statements without specific numbers or context

DO:
- Calculate percentages, growth rates, and comparisons
- Identify the "so what" - why does this matter?
- Provide specific numbers with context
- Make connections between data points
- Suggest implications and next steps

Provide your response in this EXACT format with emoji:

💡 AI-Driven Insights:

[Provide 3-5 bullet points with deep analysis. Each insight should:
- Use **bold** for key metrics and numbers
- Include calculations (percentages, growth rates, comparisons)
- Explain implications and meaning
- Be specific and actionable

Examples of GOOD insights:
- "**Revenue Concentration Risk**: The top 3 customers account for **45%** of total revenue, indicating high dependency that could impact business stability if any key customer leaves."
- "**Regional Growth Opportunity**: California shows **23%** month-over-month growth, significantly higher than the national average of **8%**, suggesting successful local strategies that could be replicated in other regions."
- "**Category Performance Gap**: Electronics generates **$2.4M** in revenue but only represents **12%** of inventory, indicating exceptional efficiency and potential for inventory reallocation."
- "**Seasonal Pattern Detected**: Sales spike **40%** in Q4 compared to Q1, suggesting strong holiday performance but potential cash flow challenges in early quarters."

Examples of BAD insights (avoid these):
- "The query returned 25 customers" (just describing the data)
- "California has sales" (no analysis or context)
- "Products are listed" (no insight)]
`;

const prompt = ChatPromptTemplate.fromTemplate(sqlTemplate);
const insightsPrompt = ChatPromptTemplate.fromTemplate(insightsTemplate);

const optimizationTemplate = `
You are a SQL optimization expert. Given a SQL query, provide suggestions to improve its performance.
Analyze the query and suggest improvements like using appropriate JOINs, indexing strategies, and optimized aggregations.

Original Query:
{sql_query}

CRITICAL: You MUST format your entire response using GitHub-Flavored Markdown.

Provide your response in this EXACT format with emoji:

⚡ Query Optimization:

Your suggestions MUST be formatted as a markdown bulleted or numbered list. Use the following structure:
- **Bold key points** for emphasis
- Use bullet points (- or *) or numbered lists (1., 2., 3.)
- Be specific and actionable
- Include code snippets using backticks if showing SQL examples

Example format:
- **Index Strategy**: Indexes exist on customers.customer_id, orders.customer_id, customers.region, order_items.order_id, order_items.product_id, and products.product_id to speed up JOIN operations and WHERE clause filtering. Ensure there is an index on the 'region' column in the 'customers' table to speed up WHERE clause filtering operations. Ensure these indexed columns are used in JOIN conditions, WHERE clauses, and GROUP BY clauses for efficient querying.

- **JOIN Optimization**: ALWAYS use INNER JOIN explicitly instead of JOIN. Update the query to use INNER JOIN for all table joins:
  FROM customers c
  INNER JOIN orders o ON c.customer_id = o.customer_id
  INNER JOIN order_items oi ON o.order_id = oi.order_id
  INNER JOIN products p ON oi.product_id = p.product_id

- **Aggregate Optimization**: Use COALESCE(SUM(oi.quantity), 0) instead of SUM(COALESCE(oi.quantity, 0)) for better performance in calculating total quantity ordered.

- **Grouping and Ordering**: Group by ID columns (c.customer_id, p.product_id) instead of name columns (c.name, p.name) for consistency and to avoid unnecessary data retrieval. Order by the aggregate function directly (ORDER BY SUM(oi.quantity) DESC) instead of using aliases for better query optimization.

- **Limiting Results**: Consider the necessity of limiting results. If not required, removing the LIMIT clause can improve performance. When LIMIT is needed, consider using subqueries or pre-computed views.

- **Date Range Optimization**: For year filtering, use BETWEEN for better readability: WHERE order_date BETWEEN '2024-01-01' AND '2024-12-31' OR WHERE order_date >= '2024-01-01' AND order_date < '2025-01-01'. NEVER use strftime in WHERE clauses as it prevents index usage.

- **Query Rewrite**: When grouping by month/year, use strftime in SELECT/GROUP BY clauses (e.g., strftime('%Y-%m', order_date) AS month), but use the actual order_date column in WHERE clauses for filtering to leverage the index.

- **Query Structure**: Instead of selecting all columns using SELECT *, specify only the necessary columns to reduce data retrieval and improve query performance. For example: SELECT customer_id, name, email FROM customers WHERE region = 'California' instead of SELECT * FROM customers WHERE region = 'California'.

- **Query Execution Plan**: Check the query execution plan using EXPLAIN QUERY PLAN (or EXPLAIN) to verify if indexes (especially on customers.region) are being utilized. Analyze the execution plan to identify any potential bottlenecks or areas for optimization. If indexes are not being used, consider reindexing the table or updating statistics for better query optimization. Verify that indexes are being utilized.
`;
const optimizationPrompt = ChatPromptTemplate.fromTemplate(optimizationTemplate);


let llm, embeddings, chain, retriever, optimizationChain, insightsChain;
let apiTestResult = { tested: false, success: false, error: null };
let lastQueryStats = null;
let providerTestResults = {}; // Store test results for all providers

// Test API connection with minimal request
const testApiConnection = async (provider) => {
    const providerName = provider?.name || 'Unknown';
    try {
        logger.info(`Testing API connection for ${providerName}...`);
        logger.debug(`Provider object:`, JSON.stringify(provider, null, 2));

        if (!provider) {
            throw new Error('Provider object is undefined or null');
        }

        if (!provider.name) {
            throw new Error('Provider name is missing');
        }

        if (!provider.selectedModel) {
            throw new Error(`Provider ${provider.name} is missing selectedModel`);
        }

        const { llm: testLlm } = createLlmAndEmbeddings(provider);

        // Make the smallest possible request (1 token response) with timeout
        const testPrompt = "Hi";
        const response = await Promise.race([
            testLlm.invoke(testPrompt, { max_tokens: 1 }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('API test timeout after 30s')), 30000)
            )
        ]);

        logger.info(`✅ API test successful for ${providerName}`);
        return { success: true, error: null };
    } catch (error) {
        logger.error(`❌ API test failed for ${providerName}: ${error.message}`);
        logger.debug(`Error stack:`, error.stack);

        // Check for common error types
        let errorType = 'unknown';
        if (error.message.includes('429')) {
            errorType = 'quota_exceeded';
        } else if (error.message.includes('401') || error.message.includes('invalid')) {
            errorType = 'invalid_key';
        } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
            errorType = 'network_error';
        }

        return { success: false, error: error.message, errorType };
    }
};

const initializeLangChain = async () => {
    logger.info('Initializing LangChain...');
    const provider = providerManager.getProvider(); // Use the provider at current index
    logger.info(`Selected provider for LangChain initialization: ${provider.name}`);

    ({ llm, embeddings } = createLlmAndEmbeddings(provider));

    // Test embeddings API before proceeding
    logger.debug('Testing embeddings API...');
    try {
        await embeddings.embedQuery("test");
        logger.info('✅ Embeddings API is working');
    } catch (error) {
        logger.error(`❌ Embeddings API test failed: ${error.message}`);
        throw new Error(`Embeddings API is not accessible: ${error.message}`);
    }

    const dbSchema = await getDbSchema();
    logger.info('Database schema retrieved.');

    const texts = [dbSchema];
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
    const docs = await textSplitter.createDocuments(texts);
    logger.info('Documents created from schema.');

    const run = async () => {
        logger.debug('Attempting to create vector store...');
        logger.debug(`Using embeddings provider: ${provider.name}`);

        try {
            const vectorStore = await Promise.race([
                FaissStore.fromDocuments(docs, embeddings),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Vector store creation timeout after 30s')), 30000)
                )
            ]);

            // Configure retriever with k=3 to limit schema chunks and prevent context overflow
            retriever = vectorStore.asRetriever({ k: 3 });
            logger.info('✅ Vector store created successfully with k=3 limit');
        } catch (error) {
            logger.error(`Vector store creation failed: ${error.message}`);
            throw error;
        }
    };

    try {
        await pRetry(run, {
            retries: 3,
            minTimeout: 1000,
            onFailedAttempt: error => {
                logger.warn(`Attempt ${error.attemptNumber} failed during vector store creation. There are ${error.retriesLeft} retries left. Error: ${error.message}`);
            },
        });
    } catch (error) {
        logger.error('❌ Failed to create vector store after all retries. System may not work correctly.');
        logger.error(`Error details: ${error.message}`);
        throw error;
    }

    chain = RunnableSequence.from([
        {
            schema: async (input) => {
                try {
                    // Try newer API first (invoke), fall back to older API
                    // Limit to top 3 most relevant chunks to prevent context overflow
                    let relevantDocs;
                    if (retriever.invoke) {
                        // For newer API, configure retriever with k parameter if possible
                        // Otherwise, get documents and limit manually
                        const allDocs = await retriever.invoke(input.input);
                        relevantDocs = Array.isArray(allDocs) ? allDocs.slice(0, 3) : [allDocs].slice(0, 3);
                    } else {
                        // For older API, limit to 3 documents
                        relevantDocs = await retriever.getRelevantDocuments(input.input);
                        relevantDocs = relevantDocs.slice(0, 3);
                    }
                    const schemaString = formatDocumentsAsString(relevantDocs);
                    logger.debug(`[SCHEMA] Retrieved ${relevantDocs.length} schema chunks for query "${input.input}": ${schemaString.substring(0, 200)}...`);
                    logger.debug(`[SCHEMA] Total schema length: ${schemaString.length} characters`);
                    return schemaString;
                } catch (error) {
                    logger.error(`Error retrieving documents: ${error.message}`);
                    // Return a limited schema as fallback (not full schema to prevent overflow)
                    const fullSchema = await getDbSchema();
                    // Truncate to first 2000 characters to prevent context overflow
                    const limitedSchema = fullSchema.substring(0, 2000) + (fullSchema.length > 2000 ? '... (schema truncated)' : '');
                    logger.debug(`[SCHEMA] Using limited fallback schema (${limitedSchema.length} chars)`);
                    return limitedSchema;
                }
            },
            input: (input) => input.input,
            chat_history: (input) => input.chat_history,
            current_date: () => {
                const now = new Date();
                return now.toISOString().split('T')[0] + ' (YYYY-MM-DD format)';
            }
        },
        prompt,
        llm,
    ]);
    logger.info('LangChain chain initialized.');

    optimizationChain = RunnableSequence.from([
        optimizationPrompt,
        llm,
    ]);
    logger.info('Optimization chain initialized.');

    insightsChain = RunnableSequence.from([
        insightsPrompt,
        llm,
    ]);
    logger.info('Insights chain initialized.');
};

// --- Rate Limiting ---
const queryRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const apiKeyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit API key operations to 20 per 15 minutes
    message: 'Too many API key operations, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// --- API Endpoints ---

// Health check endpoint
app.get('/api/health', (req, res) => {
    const currentProvider = providerManager.getProvider();
    const hasValidKey = providerManager.isValidApiKey(currentProvider);

    res.json({
        status: 'running',
        provider: currentProvider.name,
        model: currentProvider.selectedModel,
        apiKeyConfigured: hasValidKey,
        apiTested: apiTestResult.tested,
        apiWorking: apiTestResult.success,
        apiError: apiTestResult.error,
        chainInitialized: !!chain,
        timestamp: new Date().toISOString()
    });
});

// SSE Progress Stream Endpoint
app.get('/api/query/progress/:requestId', (req, res) => {
    const { requestId } = req.params;

    logger.info(`[SSE] Client connected to progress stream: ${requestId}`);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx

    // Register connection with progress manager
    progressManager.registerConnection(requestId, res);

    // Setup heartbeat to keep connection alive (every 15 seconds)
    const heartbeatInterval = setInterval(() => {
        if (progressManager.isActive(requestId)) {
            progressManager.sendHeartbeat(requestId);
        } else {
            clearInterval(heartbeatInterval);
        }
    }, 15000);

    // Handle client disconnect
    req.on('close', () => {
        logger.info(`[SSE] Client disconnected from progress stream: ${requestId}`);
        clearInterval(heartbeatInterval);
        progressManager.closeConnection(requestId);
    });
});

app.get('/api/providers', (req, res) => {
    try {
        // If power_user is disabled, ensure OpenAI is selected
        if (appConfig && !appConfig.power_user) {
            const openaiIndex = providerManager.providers.findIndex(p => p.name === 'openai');
            if (openaiIndex !== -1) {
                providerManager.currentIndex = openaiIndex;
                const openaiProvider = providerManager.providers[openaiIndex];
                const gpt4oMini = openaiProvider.models.find(m => m.name === 'gpt-4o-mini');
                if (gpt4oMini) {
                    openaiProvider.selectedModel = 'gpt-4o-mini';
                }
            }
        }
        
        const currentProvider = providerManager.getProvider();
        if (!currentProvider) {
            logger.error('[API] No provider available');
            return res.status(500).json({ 
                error: 'No provider available',
                providers: providerManager.providers || [],
                currentIndex: providerManager.currentIndex || 0
            });
        }
        
        res.json({
            providers: providerManager.providers || [],
            currentIndex: providerManager.currentIndex || 0,
            selectedModel: currentProvider.selectedModel || 'gpt-4o-mini',
            testResults: providerTestResults || {}, // Include test results
            power_user: appConfig ? (appConfig.power_user !== false) : true // Include power_user flag (default to true if not set)
        });
    } catch (error) {
        logger.error(`[API] Error in /api/providers: ${error.message}`);
        logger.error(`[API] Stack: ${error.stack}`);
        res.status(500).json({ 
            error: 'Failed to load providers',
            message: error.message
        });
    }
});

app.get('/api/query-stats', (req, res) => {
    res.json({
        stats: lastQueryStats
    });
});

app.post('/api/providers/next', async (req, res) => {
    // Block provider switching if power_user is disabled
    if (appConfig && !appConfig.power_user) {
        return res.status(403).json({ 
            error: 'Provider switching is disabled. Power user mode is required.',
            power_user: false
        });
    }
    
    providerManager.nextProvider();
    const newProvider = providerManager.getProvider();

    logger.info(`Switched to provider: ${newProvider.name}`);

    // Test the new provider's API
    const hasValidKey = providerManager.isValidApiKey(newProvider);
    if (hasValidKey) {
        logger.info(`Testing API for new provider: ${newProvider.name}`);
        apiTestResult = await testApiConnection(newProvider);
        apiTestResult.tested = true;

        if (apiTestResult.success) {
            logger.info(`✅ ${newProvider.name} API is working`);
            // Re-initialize LangChain with the new provider
            await initializeLangChain();
        } else {
            logger.error(`❌ ${newProvider.name} API test failed: ${apiTestResult.error}`);
        }
    } else {
        logger.warn(`⚠️ ${newProvider.name} has no valid API key`);
        apiTestResult = { tested: false, success: false, error: 'No valid API key configured' };
    }

    res.json({
        currentIndex: providerManager.currentIndex,
        provider: newProvider.name,
        selectedModel: newProvider.selectedModel,
        apiTested: apiTestResult.tested,
        apiWorking: apiTestResult.success
    });
});

app.post('/api/providers/switch', async (req, res) => {
    // Block provider switching if power_user is disabled
    if (appConfig && !appConfig.power_user) {
        return res.status(403).json({ 
            error: 'Provider switching is disabled. Power user mode is required.',
            power_user: false
        });
    }
    
    // Switch to a specific provider by index
    const { index } = req.body;

    if (typeof index !== 'number' || index < 0 || index >= providerManager.providers.length) {
        return res.status(400).json({ error: 'Invalid provider index' });
    }

    const currentProvider = providerManager.getProvider();
    const currentIndex = providerManager.currentIndex;
    const newProvider = providerManager.providers[index]; // Direct access, no cycling

    logger.info(`User clicked to switch from ${currentProvider.name} to ${newProvider.name}`);

    // Validate the provider has a valid API key
    const hasValidKey = providerManager.isValidApiKey(newProvider);

    if (!hasValidKey) {
        logger.error(`❌ ${newProvider.name} has no valid API key - staying on ${currentProvider.name}`);
        return res.status(400).json({
            error: `${newProvider.name} does not have a valid API key configured`,
            currentIndex: currentIndex,
            provider: currentProvider.name
        });
    }

    if (!newProvider.enabled) {
        logger.error(`❌ ${newProvider.name} is disabled - staying on ${currentProvider.name}`);
        return res.status(400).json({
            error: `${newProvider.name} is disabled in vendor_config.json`,
            currentIndex: currentIndex,
            provider: currentProvider.name
        });
    }

    // Test the provider's API
    logger.info(`Testing API for provider: ${newProvider.name}`);
    apiTestResult = await testApiConnection(newProvider);
    apiTestResult.tested = true;

    if (apiTestResult.success) {
        logger.info(`✅ ${newProvider.name} API is working - switching now`);

        // NOW set the index after validation passes
        providerManager.currentIndex = index;

        // Re-initialize LangChain with the new provider
        try {
            await initializeLangChain();
            logger.info(`✅ LangChain initialized successfully with ${newProvider.name}`);
        } catch (error) {
            logger.error(`❌ Failed to initialize LangChain with ${newProvider.name}: ${error.message}`);
            // Revert to previous provider
            providerManager.currentIndex = currentIndex;
            return res.status(500).json({
                error: `Failed to initialize with ${newProvider.name}: ${error.message}`,
                currentIndex: currentIndex,
                provider: currentProvider.name
            });
        }

        return res.json({
            currentIndex: providerManager.currentIndex,
            provider: newProvider.name,
            selectedModel: newProvider.selectedModel,
            apiTested: apiTestResult.tested,
            apiWorking: apiTestResult.success
        });
    } else {
        logger.error(`❌ ${newProvider.name} API test failed: ${apiTestResult.error} - staying on ${currentProvider.name}`);
        return res.status(503).json({
            error: `${newProvider.name} API test failed: ${apiTestResult.error}`,
            currentIndex: currentIndex,
            provider: currentProvider.name
        });
    }
});

app.post('/api/providers/toggle', async (req, res) => {
    // Block provider toggling if power_user is disabled
    if (appConfig && !appConfig.power_user) {
        return res.status(403).json({ 
            error: 'Provider toggling is disabled. Power user mode is required.',
            power_user: false
        });
    }
    
    // Cycle through ALL enabled providers with valid API keys
    const currentProvider = providerManager.getProvider();
    const startIndex = providerManager.currentIndex;
    let attempts = 0;
    let foundProvider = false;

    logger.info(`Starting provider switch from ${currentProvider.name}`);

    // Try to find the next valid provider (with valid API key and enabled)
    while (attempts < providerManager.providers.length) {
        // Move to next provider
        providerManager.currentIndex = (providerManager.currentIndex + 1) % providerManager.providers.length;
        const candidateProvider = providerManager.providers[providerManager.currentIndex];
        attempts++;

        const hasValidKey = providerManager.isValidApiKey(candidateProvider);

        logger.info(`Checking provider: ${candidateProvider.name} - Enabled: ${candidateProvider.enabled}, Valid Key: ${hasValidKey}`);

        if (candidateProvider.enabled && hasValidKey) {
            logger.info(`Testing API for provider: ${candidateProvider.name}`);
            apiTestResult = await testApiConnection(candidateProvider);
            apiTestResult.tested = true;

            if (apiTestResult.success) {
                logger.info(`✅ ${candidateProvider.name} API is working - switching to this provider`);
                foundProvider = true;

                // Re-initialize LangChain with the new provider
                try {
                    await initializeLangChain();
                    logger.info(`✅ LangChain initialized successfully with ${candidateProvider.name}`);
                } catch (error) {
                    logger.error(`❌ Failed to initialize LangChain with ${candidateProvider.name}: ${error.message}`);
                    // Continue to next provider if initialization fails
                    continue;
                }

                break;
            } else {
                logger.warn(`⚠️ ${candidateProvider.name} API test failed: ${apiTestResult.error} - trying next provider`);
            }
        } else {
            logger.warn(`⚠️ Skipping ${candidateProvider.name} - Enabled: ${candidateProvider.enabled}, Valid Key: ${hasValidKey}`);
        }
    }

    const newProvider = providerManager.getProvider();

    if (!foundProvider) {
        logger.error(`❌ No working providers found. Staying with ${currentProvider.name}`);
        providerManager.currentIndex = startIndex; // Revert to original provider
        return res.status(503).json({
            error: 'No working providers available',
            currentIndex: providerManager.currentIndex,
            provider: currentProvider.name,
            selectedModel: currentProvider.selectedModel,
            apiTested: false,
            apiWorking: false
        });
    }

    res.json({
        currentIndex: providerManager.currentIndex,
        provider: newProvider.name,
        selectedModel: newProvider.selectedModel,
        apiTested: apiTestResult.tested,
        apiWorking: apiTestResult.success
    });
});

app.post('/api/providers/select-model', async (req, res) => {
    // Block model selection if power_user is disabled
    if (appConfig && !appConfig.power_user) {
        return res.status(403).json({ 
            error: 'Model selection is disabled. Power user mode is required.',
            power_user: false
        });
    }
    
    const { providerName, modelName } = req.body;
    if (!providerName || !modelName) {
        return res.status(400).json({ error: 'providerName and modelName are required' });
    }

    const success = providerManager.setSelectedModel(providerName, modelName);
    if (success) {
        // Re-initialize LangChain with the newly selected model
        await initializeLangChain();
        const currentProvider = providerManager.getProvider();
        res.json({
            success: true,
            provider: currentProvider.name,
            selectedModel: currentProvider.selectedModel
        });
    } else {
        res.status(404).json({ success: false, error: 'Provider or model not found' });
    }
});

app.post('/api/clear-context', async (req, res) => {
    try {
        const { tabId } = req.body;
        
        if (tabId) {
            // Clear context for specific tab
            await memoryManager.clearMemory(tabId);
            logger.info(`Conversation context cleared for tab: ${tabId}`);
            res.json({ success: true, message: `Conversation context cleared for tab: ${tabId}` });
        } else {
            // If no tabId provided, clear default/current context
            await memoryManager.clearMemory('default');
            logger.info('Conversation context cleared (default).');
            res.json({ success: true, message: 'Conversation context cleared.' });
        }
    } catch (error) {
        logger.error(`Error clearing conversation context: ${error.message}`);
        res.status(500).json({ success: false, error: 'Failed to clear conversation context.' });
    }
});

// Generate a short summary title for a query (max 7 words)
app.post('/api/generate-title', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        if (!llm) {
            await initializeLangChain();
        }

        logger.info(`[TITLE] Generating summary title for query: ${query}`);

        const titlePrompt = ChatPromptTemplate.fromMessages([
            ['system', 'You are a helpful assistant that creates short, concise titles. Generate a title that summarizes the following query in 7 words or less. Only respond with the title, nothing else.'],
            ['user', '{query}']
        ]);

        const titleChain = titlePrompt.pipe(llm);
        const response = await titleChain.invoke({ query });
        const title = response.content.trim();

        logger.info(`[TITLE] Generated title: ${title}`);

        res.json({ success: true, title });
    } catch (error) {
        logger.error(`Error generating title: ${error.message}`);
        res.status(500).json({ success: false, error: 'Failed to generate title.' });
    }
});

app.post('/api/providers/test-all', async (req, res) => {
    try {
        logger.info('Testing all providers...');
        const results = [];

        for (let i = 0; i < providerManager.providers.length; i++) {
            const provider = providerManager.providers[i];

            // Check if API key is valid
            const hasValidKey = providerManager.isValidApiKey(provider);

            if (!hasValidKey || !provider.enabled) {
                const result = {
                    provider: provider.name,
                    success: false,
                    tested: false,
                    error: hasValidKey ? 'Provider disabled' : 'No valid API key configured'
                };
                results.push(result);

                // Store result for this provider
                providerTestResults[provider.name] = result;

                logger.info(`⏭️  Skipping ${provider.name} - ${hasValidKey ? 'disabled' : 'no valid API key'}`);
                continue;
            }

            // Test the provider
            logger.info(`Testing ${provider.name}...`);
            const testResult = await testApiConnection(provider);

            const result = {
                provider: provider.name,
                success: testResult.success,
                tested: true,
                error: testResult.error
            };

            results.push(result);

            // Store result for this provider
            providerTestResults[provider.name] = result;

            if (testResult.success) {
                logger.info(`✅ ${provider.name} - Working`);
            } else {
                logger.warn(`❌ ${provider.name} - Failed: ${testResult.error}`);
            }
        }

        const successCount = results.filter(r => r.success).length;
        logger.info(`Testing complete: ${successCount}/${results.length} providers working`);

        res.json({
            success: true,
            results: results,
            summary: {
                total: results.length,
                working: successCount,
                failed: results.length - successCount
            }
        });

    } catch (error) {
        logger.error(`Error testing providers: ${error.message}`);
        res.status(500).json({ error: `Failed to test providers: ${error.message}` });
    }
});

app.post('/api/providers/test-single', async (req, res) => {
    try {
        const { index } = req.body;

        logger.info(`Received test-single request with index: ${index}`);
        logger.info(`Provider manager has ${providerManager.providers.length} providers`);

        if (index === undefined || index < 0 || index >= providerManager.providers.length) {
            return res.status(400).json({ error: 'Invalid provider index' });
        }

        const provider = providerManager.providers[index];

        if (!provider) {
            logger.error(`Provider at index ${index} is undefined`);
            return res.status(400).json({ error: `Provider at index ${index} not found` });
        }

        logger.info(`Testing provider: ${provider.name}`);

        // Check if API key is valid
        const hasValidKey = providerManager.isValidApiKey(provider);

        if (!hasValidKey) {
            const result = {
                provider: provider.name,
                success: false,
                tested: false,
                error: 'No valid API key configured',
                needsConfiguration: true
            };
            providerTestResults[provider.name] = result;
            return res.json(result);
        }

        if (!provider.enabled) {
            const result = {
                provider: provider.name,
                success: false,
                tested: false,
                error: 'Provider is disabled in configuration'
            };
            providerTestResults[provider.name] = result;
            return res.json(result);
        }

        // Test the provider
        const testResult = await testApiConnection(provider);

        const result = {
            provider: provider.name,
            success: testResult.success,
            tested: true,
            error: testResult.error,
            needsConfiguration: !testResult.success
        };

        // Store result for this provider
        providerTestResults[provider.name] = result;

        if (testResult.success) {
            logger.info(`✅ ${provider.name} - Working`);
        } else {
            logger.warn(`❌ ${provider.name} - Failed: ${testResult.error}`);
        }

        res.json(result);

    } catch (error) {
        logger.error(`Error testing provider: ${error.message}`);
        res.status(500).json({ error: `Failed to test provider: ${error.message}` });
    }
});

app.post('/api/providers/test-key', apiKeyRateLimiter, async (req, res) => {
    try {
        const { provider: providerName, apiKey } = req.body;

        logger.info(`[test-key] Received request for provider: ${providerName}`);
        logger.debug(`[test-key] API key provided: ${apiKey ? 'YES' : 'NO'}`);

        if (!providerName || !apiKey) {
            return res.status(400).json({
                success: false,
                error: 'Provider name and API key are required'
            });
        }

        // Find the provider configuration
        const providerConfig = providerManager.providers.find(p => p.name === providerName);

        if (!providerConfig) {
            return res.json({
                success: false,
                error: 'Provider not found in configuration'
            });
        }

        // Create a temporary provider object with the new API key
        const tempProvider = {
            ...providerConfig,
            apiKey: apiKey
        };

        // Test the API key
        const testResult = await testApiConnection(tempProvider);

        if (testResult.success) {
            logger.info(`✅ ${providerName} - API key is valid`);
            res.json({
                success: true,
                provider: providerName
            });
        } else {
            logger.warn(`❌ ${providerName} - API key validation failed`);
            // Sanitize error message - don't expose internal details
            const sanitizedError = testResult.error && testResult.error.includes('401') 
                ? 'Invalid API key' 
                : (testResult.error && testResult.error.includes('429')
                    ? 'API quota exceeded'
                    : 'API key validation failed');
            res.json({
                success: false,
                error: sanitizedError
            });
        }

    } catch (error) {
        logger.error(`[test-key] Error testing API key: ${error.message}`);
        res.json({
            success: false,
            error: 'Failed to test API key. Please try again.'
        });
    }
});

app.post('/api/providers/configure', apiKeyRateLimiter, async (req, res) => {
    const { provider, apiKey } = req.body;

    if (!provider || !apiKey) {
        return res.status(400).json({ error: 'Provider name and API key are required' });
    }

    // Validate provider exists
    const providerExists = providerManager.providers.some(p => p.name === provider);
    if (!providerExists) {
        return res.status(400).json({ error: `Provider '${provider}' not found` });
    }

    // Validate API key format (basic sanitization)
    if (typeof apiKey !== 'string' || apiKey.trim().length < 10 || apiKey.trim().length > 500) {
        return res.status(400).json({ error: 'Invalid API key format. Key must be between 10 and 500 characters.' });
    }
    
    // Basic sanitization - only allow alphanumeric, dashes, underscores, and dots
    if (!/^[a-zA-Z0-9._-]+$/.test(apiKey.trim())) {
        return res.status(400).json({ error: 'Invalid API key format. Key contains invalid characters.' });
    }

    try {
        logger.info(`Configuring API key for provider: ${provider}`);

        // Read current .env file
        const envPath = path.join(__dirname, '.env');
        let envContent = '';

        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        }

        // Construct the environment variable name
        const envVarName = `${provider.toUpperCase()}_API_KEY`;

        // Check if the key already exists
        const keyRegex = new RegExp(`^${envVarName}=.*$`, 'm');

        if (keyRegex.test(envContent)) {
            // Replace existing key
            envContent = envContent.replace(keyRegex, `${envVarName}=${apiKey}`);
            logger.info(`Updated existing API key for ${provider}`);
        } else {
            // Add new key
            envContent += `\n${envVarName}=${apiKey}\n`;
            logger.info(`Added new API key for ${provider}`);
        }

        // Write back to .env file
        fs.writeFileSync(envPath, envContent, 'utf-8');

        // Update the provider's API key in memory
        const providerIndex = providerManager.providers.findIndex(p => p.name === provider);
        if (providerIndex !== -1) {
            providerManager.providers[providerIndex].apiKey = apiKey;
            logger.info(`Updated API key in memory for ${provider}`);
        }

        logger.info(`✅ Successfully configured API key for ${provider}`);

        res.json({
            success: true,
            message: `API key configured for ${provider}`,
            provider: provider
        });

    } catch (error) {
        logger.error(`Failed to configure API key for ${provider}: ${error.message}`);
        res.status(500).json({ error: `Failed to save API key: ${error.message}` });
    }
});

app.post('/api/providers/delete-key', apiKeyRateLimiter, async (req, res) => {
    const { provider } = req.body;

    if (!provider) {
        return res.status(400).json({ error: 'Provider name is required' });
    }

    // Validate provider exists
    const providerExists = providerManager.providers.some(p => p.name === provider);
    if (!providerExists) {
        return res.status(400).json({ error: `Provider '${provider}' not found` });
    }

    try {
        logger.info(`Deleting API key for provider: ${provider}`);

        // Read current .env file
        const envPath = path.join(__dirname, '.env');
        let envContent = '';

        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        } else {
            return res.json({
                success: true,
                message: `No API key found for ${provider}`,
                provider: provider
            });
        }

        // Construct the environment variable name
        const envVarName = `${provider.toUpperCase()}_API_KEY`;

        // Remove the key line (including the line break before it if it exists)
        const keyRegex = new RegExp(`^${envVarName}=.*$`, 'm');
        if (keyRegex.test(envContent)) {
            // Remove the line with the key
            envContent = envContent.replace(keyRegex, '');
            // Clean up any double newlines that might result
            envContent = envContent.replace(/\n\n+/g, '\n');
            logger.info(`Removed API key for ${provider}`);
        } else {
            return res.json({
                success: true,
                message: `No API key found for ${provider}`,
                provider: provider
            });
        }

        // Write back to .env file
        fs.writeFileSync(envPath, envContent, 'utf-8');

        // Clear the provider's API key in memory
        const providerIndex = providerManager.providers.findIndex(p => p.name === provider);
        if (providerIndex !== -1) {
            providerManager.providers[providerIndex].apiKey = '';
            logger.info(`Cleared API key in memory for ${provider}`);
        }

        logger.info(`✅ Successfully deleted API key for ${provider}`);

        res.json({
            success: true,
            message: `API key deleted for ${provider}`,
            provider: provider
        });

    } catch (error) {
        logger.error(`Failed to delete API key for ${provider}: ${error.message}`);
        res.status(500).json({ error: `Failed to delete API key: ${error.message}` });
    }
});

// Helper function to generate unique request ID
function generateRequestId() {
    return `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

app.post('/api/query', queryRateLimiter, async (req, res) => {
    const startTime = Date.now();
    const { query, requestId: clientRequestId, provider: requestedProvider, model: requestedModel, tabId } = req.body;

    // Generate or use provided request ID
    const requestId = clientRequestId || generateRequestId();

    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    // Store original provider state if switching
    let originalProviderIndex = null;
    let originalModel = null;
    let shouldRestoreProvider = false;

    // If provider/model specified, temporarily switch
    if (requestedProvider || requestedModel) {
        originalProviderIndex = providerManager.currentIndex;
        const currentProvider = providerManager.getProvider();
        originalModel = currentProvider.selectedModel;
        
        // Find and switch to requested provider
        if (requestedProvider) {
            const providerIndex = providerManager.providers.findIndex(p => 
                p.name.toLowerCase() === requestedProvider.toLowerCase()
            );
            
            if (providerIndex !== -1) {
                const requestedProviderObj = providerManager.providers[providerIndex];
                
                // Validate API key
                if (!providerManager.isValidApiKey(requestedProviderObj)) {
                    return res.status(400).json({ 
                        error: `${requestedProvider} does not have a valid API key configured` 
                    });
                }
                
                // Switch provider
                providerManager.currentIndex = providerIndex;
                shouldRestoreProvider = true;
                
                // Switch model if specified
                if (requestedModel && requestedProviderObj.models) {
                    const modelExists = requestedProviderObj.models.find(m => 
                        m.name === requestedModel
                    );
                    if (modelExists) {
                        requestedProviderObj.selectedModel = requestedModel;
                    }
                }
                
                // Re-initialize LangChain with new provider
                try {
                    await initializeLangChain();
                    logger.info(`[PROVIDER SWITCH] Temporarily switched to ${requestedProvider}${requestedModel ? ` with model ${requestedModel}` : ''} for query ${requestId}`);
                } catch (error) {
                    // Restore original provider on error
                    providerManager.currentIndex = originalProviderIndex;
                    return res.status(500).json({ 
                        error: `Failed to initialize with ${requestedProvider}: ${error.message}` 
                    });
                }
            } else {
                return res.status(400).json({ error: `Provider ${requestedProvider} not found` });
            }
        } else if (requestedModel) {
            // Just switch model on current provider
            const currentProvider = providerManager.getProvider();
            if (currentProvider.models) {
                const modelExists = currentProvider.models.find(m => m.name === requestedModel);
                if (modelExists) {
                    originalModel = currentProvider.selectedModel;
                    currentProvider.selectedModel = requestedModel;
                    shouldRestoreProvider = true;
                    
                    // Re-initialize LangChain with new model
                    try {
                        await initializeLangChain();
                        logger.info(`[MODEL SWITCH] Temporarily switched to model ${requestedModel} for query ${requestId}`);
                    } catch (error) {
                        // Restore original model on error
                        currentProvider.selectedModel = originalModel;
                        return res.status(500).json({ 
                            error: `Failed to initialize with model ${requestedModel}: ${error.message}` 
                        });
                    }
                } else {
                    return res.status(400).json({ error: `Model ${requestedModel} not found` });
                }
            }
        }
    }

    // Return immediately with request ID (client will connect to progress stream)
    res.json({
        requestId,
        message: 'Query accepted for processing'
    });

    // Process query asynchronously and send progress updates
    processQueryWithProgress(query, requestId, startTime, shouldRestoreProvider, originalProviderIndex, originalModel, tabId || 'default')
        .catch(error => {
            logger.error(`Fatal error processing query ${requestId}:`, error);
            progressManager.sendError(requestId, 0, 'Fatal error', error);
            
            // Restore provider if needed
            if (shouldRestoreProvider && originalProviderIndex !== null) {
                providerManager.currentIndex = originalProviderIndex;
                if (originalModel) {
                    const currentProvider = providerManager.getProvider();
                    currentProvider.selectedModel = originalModel;
                }
                initializeLangChain().catch(err => {
                    logger.error('Failed to restore original provider:', err);
                });
            }
        });
});

// Function to evaluate if a query is a continuation of previous context
async function evaluateContextContinuation(currentQuery, chatHistory, provider) {
    try {
        // Extract the last user query and AI response from history
        const lastMessages = chatHistory.slice(-2); // Get last 2 messages (user + AI)
        let lastUserQuery = '';
        let lastAIResponse = '';
        
        for (const msg of lastMessages) {
            if (msg._getType && msg._getType() === 'human') {
                lastUserQuery = msg.content || '';
            } else if (msg._getType && msg._getType() === 'ai') {
                lastAIResponse = msg.content || '';
            }
        }
        
        // If no previous context, it's a new query
        if (!lastUserQuery && !lastAIResponse) {
            return false;
        }
        
        // Create a lightweight evaluation prompt
        const evaluationPrompt = `You are evaluating whether a user's current query is a continuation of a previous conversation or a completely new, independent query.

Previous user query: "${lastUserQuery}"
Previous AI response summary: "${lastAIResponse.substring(0, 200)}..."

Current user query: "${currentQuery}"

Determine if the current query:
1. References the previous query/result (uses pronouns like "they", "it", "that", "those", "she", "he", etc.)
2. Asks for more details about the previous result
3. Filters or modifies the previous query
4. Is clearly related to the same topic/entity from the previous query

OR if it is:
1. A completely new topic unrelated to the previous query
2. A standalone question that doesn't reference anything from the previous conversation
3. A different subject matter entirely

Respond with ONLY one word: "CONTINUATION" or "NEW_QUERY"`;

        // Use a lightweight LLM call for evaluation
        const { llm } = createLlmAndEmbeddings(provider);
        const evaluationResponse = await llm.invoke(evaluationPrompt);
        const evaluation = evaluationResponse.content.trim().toUpperCase();
        
        const isContinuation = evaluation.includes('CONTINUATION');
        logger.info(`[CONTEXT EVAL] LLM evaluation: ${evaluation} -> ${isContinuation ? 'CONTINUATION' : 'NEW_QUERY'}`);
        
        return isContinuation;
    } catch (error) {
        logger.warn(`[CONTEXT EVAL] Error evaluating context continuation: ${error.message}. Defaulting to keyword-based detection.`);
        
        // Fallback to keyword-based detection if LLM evaluation fails
        const continuationKeywords = [
            'they', 'them', 'it', 'that', 'those', 'this', 'these',
            'she', 'he', 'her', 'him', 'his', 'hers',
            'previous', 'last', 'above', 'before', 'earlier',
            'from previous', 'from the previous', 'from last',
            'show me', 'tell me more', 'what about', 'how about',
            'filter', 'narrow', 'expand', 'also', 'additionally'
        ];
        
        const queryLower = currentQuery.toLowerCase();
        const hasContinuationKeyword = continuationKeywords.some(keyword => 
            queryLower.includes(keyword)
        );
        
        return hasContinuationKeyword;
    }
}

// NEW FUNCTION: Process query with progress updates
async function processQueryWithProgress(query, requestId, startTime, shouldRestoreProvider = false, originalProviderIndex = null, originalModel = null, tabId = 'default') {
    try {
        logger.separator('=', 60);
        logger.query(`NEW QUERY [${requestId}]: ${query}`);
        logger.separator('=', 60);

        let stepStartTime = Date.now();

        if (!chain) {
            logger.info('[INIT] LangChain chain not initialized. Attempting initialization...');
            progressManager.sendProgress(requestId, 0, 9, 'Initializing AI chain...', stepStartTime);
            await initializeLangChain();
            logger.info('[INIT] LangChain chain initialized successfully.');
        }
        
        // Get current provider for context evaluation
        const provider = providerManager.getProvider();
        if (!provider) {
            throw new Error('No provider available');
        }
        
        // STEP 1
        logger.info(`[STEP 1/9] Evaluating query context...`);
        stepStartTime = Date.now();
        progressManager.sendProgress(requestId, 1, 9, '1/9 Evaluating query context...', stepStartTime);
        
        // Get tab-specific memory instance
        const memory = memoryManager.getMemory(tabId, false);
        
        // Load memory to check if there's existing context
        const memoryResult = await memory.loadMemoryVariables({});
        const existingHistory = memoryResult.chat_history || [];
        
        // Determine if this query is a continuation or a new query
        let shouldUseContext = false;
        let chatHistory = [];
        let contextWasReset = false; // Track if we cleared context for this query
        
        // Check if context was reset (no history means it's either a new tab or context was cleared)
        const hadNoPreviousContext = existingHistory.length === 0;
        
        if (existingHistory.length > 0) {
            // Use LLM to evaluate if this is a continuation
            shouldUseContext = await evaluateContextContinuation(query, existingHistory, provider);
            logger.info(`[CONTEXT] Query evaluated as: ${shouldUseContext ? 'CONTINUATION' : 'NEW QUERY'}`);
            
            if (shouldUseContext) {
                // Limit conversation history to prevent context overflow
                // Keep only the last 10 messages (5 user queries + 5 AI responses) to stay within token limits
                chatHistory = existingHistory;
            } else {
                logger.info(`[CONTEXT] Query is independent - clearing context for new global query`);
                // Clear memory when a new global query is detected (not a continuation)
                await memory.clear();
                contextWasReset = true;
                logger.info(`[CONTEXT] Tab ${tabId}: Memory cleared for new global query`);
                chatHistory = [];
            }
        } else {
            logger.info(`[CONTEXT] No previous context found - treating as new query`);
            chatHistory = [];
        }
        
        if (chatHistory.length > MAX_HISTORY_MESSAGES) {
            logger.warn(`[MEMORY] Tab ${tabId}: Conversation history has ${chatHistory.length} messages, truncating to last ${MAX_HISTORY_MESSAGES} to prevent context overflow`);
            chatHistory = chatHistory.slice(-MAX_HISTORY_MESSAGES);
            // Update memory with truncated history
            // Clear memory and re-add truncated messages
            await memory.clear();
            // Re-add truncated messages in pairs (human + AI)
            for (let i = 0; i < chatHistory.length; i += 2) {
                if (i + 1 < chatHistory.length) {
                    const humanMsg = chatHistory[i];
                    const aiMsg = chatHistory[i + 1];
                    if (humanMsg && aiMsg && humanMsg._getType && humanMsg._getType() === 'human') {
                        await memory.saveContext(
                            { input: humanMsg.content },
                            { output: aiMsg.content }
                        );
                    }
                }
            }
            logger.info(`[MEMORY] Tab ${tabId}: Truncated conversation history to ${chatHistory.length} messages`);
        }

        // Log current date for temporal query reference
        const currentDate = new Date().toISOString().split('T')[0];
        logger.info(`[DATE] Current date provided to AI: ${currentDate}`);

        // Debug: Log conversation history
        if (chatHistory && chatHistory.length > 0) {
            logger.info(`[MEMORY] Using ${chatHistory.length} messages in conversation history`);
            logger.debug('[MEMORY] Chat history:', JSON.stringify(chatHistory, null, 2));
            
            // Log the actual conversation to verify it's incrementing
            chatHistory.forEach((msg, idx) => {
                if (msg._getType && msg._getType() === 'human') {
                    logger.info(`[MEMORY] Query ${idx + 1}: ${msg.content.substring(0, 100)}...`);
                }
            });
        } else {
            logger.info('[MEMORY] No previous conversation history found');
        }

        // STEP 2
        logger.info('[STEP 2/9] Invoking LLM chain...');
        stepStartTime = Date.now();
        progressManager.sendProgress(requestId, 2, 9, '2/9 Invoking LLM chain...', stepStartTime);
        const response = await chain.invoke({ input: query, chat_history: chatHistory });

        // Extract token usage if available
        const tokensUsed = response.response_metadata?.tokenUsage?.totalTokens ||
            response.usage_metadata?.total_tokens ||
            (response.response_metadata?.usage?.total_tokens) ||
            null;

        const aiResponse = response.content.trim();

        // STEP 3
        logger.info('[STEP 3/9] Received AI response');
        stepStartTime = Date.now();
        progressManager.sendProgress(requestId, 3, 9, '3/9 Receiving AI response', stepStartTime);
        logger.debug('[AI RESPONSE] Full response:\n' + aiResponse);

        // STEP 4
        logger.info('[STEP 4/9] Parsing AI response...');
        stepStartTime = Date.now();
        progressManager.sendProgress(requestId, 4, 9, '4/9 Parsing AI response...', stepStartTime);

        const sqlQueryMatch = aiResponse.match(/Query:\s*```sql\s*([\s\S]*?)\s*```/);
        const explanationMatch = aiResponse.match(/🧑‍🏫 Explainable SQL Explanation:\s*([\s\S]*?)(?=Query:|$)/);

        const sqlQuery = sqlQueryMatch ? sqlQueryMatch[1].trim() : "";
        const explanation = explanationMatch ? explanationMatch[1].trim() : "No explanation provided.";

        // Check if query is answerable based on whether SQL was generated
        if (!sqlQuery || sqlQuery.length === 0) {
            logger.info(`[NO SQL] AI did not generate SQL. Explanation: ${explanation}`);

            // Save context
            await memory.saveContext({ input: query }, { output: explanation });

            progressManager.sendComplete(requestId, {
                sqlQuery: '',
                explanation: explanation || 'I can only help with database-related queries. Please ask a question about the data.',
                insights: '',
                optimizations: '',
                results: [],
                irrelevant: true
            });
            return;
        }

        // SECURITY: Validate SQL query before execution
        logger.info('[SECURITY] Validating SQL query for security...');
        const validationResult = validateSQLQuery(sqlQuery);

        if (!validationResult.valid) {
            logger.error(`[SECURITY] SQL validation failed: ${validationResult.error}`);
            logger.error(`[BLOCKED] Dangerous query blocked`);

            // Save context about the blocked attempt
            // Save context to tab-specific memory
            await memory.saveContext(
                { input: query },
                { output: `Security Error: ${validationResult.error}` }
            );

            progressManager.sendError(requestId, 4, validationResult.error,
                'This query was blocked for security reasons. SQL Query Buddy only allows safe, read-only SELECT queries.');
            return;
        }

        // Use the cleaned query for execution (comments stripped)
        const safeQuery = validationResult.cleanedQuery;
        logger.info('[SECURITY] Using cleaned query (comments removed)');
        logger.debug(`[SECURITY] Cleaned query: ${safeQuery}`);

        // STEP 5
        logger.info('[STEP 5/9] Getting query optimizations...');
        stepStartTime = Date.now();
        progressManager.sendProgress(requestId, 5, 9, '5/9 Getting query optimizations...', stepStartTime);
        const optimizationResponse = await optimizationChain.invoke({ sql_query: sqlQuery });
        const optimizationContent = optimizationResponse.content.trim();

        // Parse optimization response to extract just the content after the emoji header
        const optimizationMatch = optimizationContent.match(/⚡ Query Optimization:\s*([\s\S]*?)$/);
        const optimizations = optimizationMatch ? optimizationMatch[1].trim() : optimizationContent;

        // STEP 6
        logger.info('[STEP 6/9] Executing SQL query on database...');
        stepStartTime = Date.now();
        progressManager.sendProgress(requestId, 6, 9, '6/9 Executing SQL query on database...', stepStartTime);
        logger.query('Generated SQL: ' + sqlQuery);
        logger.query('Safe SQL (cleaned): ' + safeQuery);
        logger.query('User Query: ' + query);

        // Execute query with timeout (30 seconds max)
        let rows;
        try {
            rows = await executeQueryWithTimeout(safeQuery, [], 30000);
        } catch (queryError) {
            const latencyMs = Date.now() - startTime;
            const duration = (latencyMs / 1000).toFixed(2);
            const currentProvider = providerManager.getProvider();
            
            logger.error(`[ERROR] Database query failed: ${queryError.message}`);
            logger.error(`[FAILED] Total time: ${duration}s`);

            // Update stats for failed query
            lastQueryStats = {
                provider: currentProvider.name,
                model: currentProvider.selectedModel,
                tokensUsed: tokensUsed,
                lastRun: new Date().toISOString(),
                latencyMs: latencyMs,
                success: false,
                error: queryError.message
            };

            progressManager.sendError(requestId, 7, 'Database query failed', queryError);
            return;
        }

        const latencyMs = Date.now() - startTime;
        const duration = (latencyMs / 1000).toFixed(2);
        const currentProvider = providerManager.getProvider();

        logger.info(`[SUCCESS] Query returned ${rows.length} rows`);
        logger.info(`[COMPLETE] Total time: ${duration}s`);
        logger.separator('-', 60);

        // STEP 7
        logger.info('[STEP 7/9] Performing SQL Query...');
        stepStartTime = Date.now();
        progressManager.sendProgress(requestId, 7, 9, '7/9 Performing SQL Query...', stepStartTime);

        // Update stats for successful query
        lastQueryStats = {
                provider: currentProvider.name,
                model: currentProvider.selectedModel,
                tokensUsed: tokensUsed,
                lastRun: new Date().toISOString(),
                latencyMs: latencyMs,
                success: true
            };

        // Get AI-Driven Insights
        let insights = "";
        if (rows.length > 0) {
            // STEP 8
            logger.info('[STEP 8/9] Querying AI with SQL Results for Insights...');
            stepStartTime = Date.now();
            progressManager.sendProgress(requestId, 8, 9, '8/9 Querying AI with SQL Results for Insights...', stepStartTime);
                
            // Limit rows sent to insights chain to prevent context overflow
            // Keep max 50 rows and limit total JSON size to ~5000 characters
            const MAX_INSIGHTS_ROWS = 50;
            const MAX_INSIGHTS_JSON_SIZE = 5000;
            
            let rowsForInsights = rows;
            if (rows.length > MAX_INSIGHTS_ROWS) {
                logger.warn(`[INSIGHTS] Limiting results from ${rows.length} to ${MAX_INSIGHTS_ROWS} rows for insights generation`);
                rowsForInsights = rows.slice(0, MAX_INSIGHTS_ROWS);
            }
            
            // Create a summary if data is still too large
            let sqlResultsForInsights = JSON.stringify(rowsForInsights);
            if (sqlResultsForInsights.length > MAX_INSIGHTS_JSON_SIZE) {
                logger.warn(`[INSIGHTS] Results JSON too large (${sqlResultsForInsights.length} chars), creating summary`);
                // Create a compact summary with key statistics
                const summary = {
                    totalRows: rows.length,
                    sampleRows: rowsForInsights.slice(0, 10), // First 10 rows
                    columns: Object.keys(rows[0] || {}),
                    rowCount: rows.length
                };
                sqlResultsForInsights = JSON.stringify(summary);
                logger.info(`[INSIGHTS] Using summary format (${sqlResultsForInsights.length} chars)`);
            }
            
            try {
                const insightsResponse = await insightsChain.invoke({ 
                    input: query, 
                    sql_results: sqlResultsForInsights 
                });
                const insightsMatch = insightsResponse.content.trim().match(/💡 AI-Driven Insights:\s*([\s\S]*?)$/);
                insights = insightsMatch ? insightsMatch[1].trim() : "";
            } catch (error) {
                // Handle context length exceeded error gracefully
                if (error.code === 'context_length_exceeded' || error.message?.includes('context length')) {
                    logger.error(`[INSIGHTS] Context length exceeded. Creating fallback summary instead.`);
                    // Create a simple fallback insight based on row count and basic stats
                    insights = `**Query Results Summary**: This query returned **${rows.length}** row(s). `;
                    if (rows.length > 0) {
                        const columns = Object.keys(rows[0]);
                        insights += `The results contain ${columns.length} column(s): ${columns.slice(0, 5).join(', ')}${columns.length > 5 ? '...' : ''}. `;
                        // Try to extract basic numeric stats if possible
                        const numericCols = columns.filter(col => {
                            const val = rows[0][col];
                            return typeof val === 'number' || !isNaN(parseFloat(val));
                        });
                        if (numericCols.length > 0) {
                            insights += `Numeric columns detected: ${numericCols.slice(0, 3).join(', ')}. `;
                        }
                    }
                    insights += `*Note: Full insights could not be generated due to large result set. Consider adding filters or limits to your query for detailed analysis.*`;
                } else {
                    // Re-throw other errors
                    throw error;
                }
            }
        }

        // Save conversation context with SQL query and results summary
        // For small result sets (≤10 rows), save complete data to enable follow-up queries
        // For larger sets, save a more complete sample with key identifying columns
        
        let resultSummary;
        let keyIdentifiers = '';
        
        if (rows.length > 0) {
            // Detect key identifying columns (customer_id, product_id, order_id, name, etc.)
            const firstRow = rows[0];
            const keyColumns = Object.keys(firstRow).filter(key => 
                key.toLowerCase().includes('id') || 
                key.toLowerCase().includes('name') ||
                key.toLowerCase() === 'customer_id' ||
                key.toLowerCase() === 'product_id' ||
                key.toLowerCase() === 'order_id' ||
                key.toLowerCase() === 'customer_name' ||
                key.toLowerCase() === 'product_name'
            );
            
            if (rows.length <= 10) {
                // For small result sets: Save ALL rows with complete data
                const fullResults = JSON.stringify(rows);
                if (fullResults.length <= 2000) {
                    resultSummary = `Returned ${rows.length} row(s). Complete results: ${fullResults}`;
                } else {
                    // If still too large, save first 10 rows with key columns prioritized
                    const keyData = rows.map(row => {
                        const keyObj = {};
                        keyColumns.forEach(col => {
                            if (row[col] !== undefined) keyObj[col] = row[col];
                        });
                        return keyObj;
                    });
                    resultSummary = `Returned ${rows.length} row(s). Key data from all rows: ${JSON.stringify(keyData)}. Full sample (first 2): ${JSON.stringify(rows.slice(0, 2))}`;
                }
                
                // Extract key identifying values for structured access
                // For single-result queries, prioritize the first row
                if (keyColumns.length > 0) {
                    const extractedIds = {};
                    keyColumns.forEach(col => {
                        const values = rows.map(row => row[col]).filter(v => v !== null && v !== undefined);
                        if (values.length > 0) {
                            // For single-result queries, put first value first in array for clarity
                            if (rows.length === 1) {
                                extractedIds[col] = [values[0]];
                            } else {
                                extractedIds[col] = [...new Set(values)]; // Remove duplicates
                            }
                        }
                    });
                    if (Object.keys(extractedIds).length > 0) {
                        keyIdentifiers = `\nKey Identifiers: ${JSON.stringify(extractedIds)}`;
                    }
                }
            } else {
                // For larger result sets: Save up to 10 rows with key columns prioritized
                const sampleRows = rows.slice(0, 10);
                const keyData = sampleRows.map(row => {
                    const keyObj = {};
                    keyColumns.forEach(col => {
                        if (row[col] !== undefined) keyObj[col] = row[col];
                    });
                    // Also include other columns if space allows
                    Object.keys(row).forEach(col => {
                        if (!keyColumns.includes(col) && Object.keys(keyObj).length < 5) {
                            keyObj[col] = row[col];
                        }
                    });
                    return keyObj;
                });
                resultSummary = `Returned ${rows.length} row(s). Sample (first 10 with key columns): ${JSON.stringify(keyData)}`;
                
                // Extract key identifying values from sample
                // Prioritize the first row for clarity in follow-up queries
                if (keyColumns.length > 0) {
                    const extractedIds = {};
                    keyColumns.forEach(col => {
                        const values = sampleRows.map(row => row[col]).filter(v => v !== null && v !== undefined);
                        if (values.length > 0) {
                            // Put first value first in array for clarity
                            const uniqueValues = [...new Set(values)];
                            if (uniqueValues.length > 0 && values[0] !== undefined) {
                                // Ensure first value is at the beginning
                                const firstValue = values[0];
                                const rest = uniqueValues.filter(v => v !== firstValue);
                                extractedIds[col] = [firstValue, ...rest];
                            } else {
                                extractedIds[col] = uniqueValues;
                            }
                        }
                    });
                    if (Object.keys(extractedIds).length > 0) {
                        keyIdentifiers = `\nKey Identifiers (from sample, first row prioritized): ${JSON.stringify(extractedIds)}`;
                    }
                }
            }
        } else {
            resultSummary = 'No results returned.';
        }

        // Truncate insights to prevent context overflow (keep first 500 chars)
        const truncatedInsights = insights ? insights.substring(0, 500) + (insights.length > 500 ? '...' : '') : '';
        
        const contextOutput = `SQL: ${safeQuery.substring(0, 500)}${safeQuery.length > 500 ? '...' : ''}\nResults: ${resultSummary}${keyIdentifiers}${truncatedInsights ? `\nInsights: ${truncatedInsights}` : ''}`;

        // Save context to tab-specific memory
        await memory.saveContext({ input: query }, { output: contextOutput });
        logger.info(`[CONTEXT] Tab ${tabId}: Saved comprehensive context including SQL and results`);
        
        // Verify context was saved by checking memory
        const verifyMemory = await memory.loadMemoryVariables({});
        const totalMessages = verifyMemory.chat_history?.length || 0;
        logger.info(`[CONTEXT] Tab ${tabId}: Total conversation turns: ${totalMessages}`);
        
        // Warn if approaching context limit
        if (totalMessages > MAX_HISTORY_MESSAGES - 2) {
            logger.warn(`[CONTEXT] Conversation history approaching limit (${totalMessages}/${MAX_HISTORY_MESSAGES}). Next query will truncate history.`);
        }

        // Calculate total query time
        const totalTime = Date.now() - startTime;

        // STEP 9
        logger.info('[STEP 9/9] Generating Response...');
        stepStartTime = Date.now();
        progressManager.sendProgress(requestId, 9, 9, '9/9 Generating Response...', stepStartTime);

        // Send completion with results
        progressManager.sendComplete(requestId, {
            sqlQuery: safeQuery,  // Return cleaned query to frontend
            explanation,
            insights,
            optimizations,
            results: rows,
            stats: lastQueryStats,
            totalQueryTime: totalTime, // Add total time in milliseconds
            contextReset: contextWasReset // Flag to indicate context was reset for this query
        });
        
        // Restore original provider if it was switched
        if (shouldRestoreProvider && originalProviderIndex !== null) {
            const currentProvider = providerManager.getProvider();
            const modelToRestore = originalModel || currentProvider.selectedModel;
            
            providerManager.currentIndex = originalProviderIndex;
            const restoredProvider = providerManager.getProvider();
            restoredProvider.selectedModel = modelToRestore;
            
            // Re-initialize LangChain with original provider
            try {
                await initializeLangChain();
                logger.info(`[RESTORE] Restored provider to ${restoredProvider.name} with model ${modelToRestore}`);
            } catch (error) {
                logger.error(`[RESTORE] Failed to restore original provider: ${error.message}`);
            }
        }
    } catch (error) {
        const latencyMs = Date.now() - startTime;
        const duration = (latencyMs / 1000).toFixed(2);
        const currentProvider = providerManager.getProvider();

        logger.error(`Exception in processQueryWithProgress: ${error.message}`);
        logger.error(`Stack trace: ${error.stack}`);
        logger.error(`Total time: ${duration}s`);
        logger.separator('-', 60);

        // Update stats for exception
        lastQueryStats = {
            provider: currentProvider.name,
            model: currentProvider.selectedModel,
            tokensUsed: null,
            lastRun: new Date().toISOString(),
            latencyMs: latencyMs,
            success: false,
            error: error.message
        };

        progressManager.sendError(requestId, 0, 'Failed to process query', error);
        
        // Restore provider in error case too
        if (shouldRestoreProvider && originalProviderIndex !== null) {
            providerManager.currentIndex = originalProviderIndex;
            if (originalModel) {
                const currentProvider = providerManager.getProvider();
                currentProvider.selectedModel = originalModel;
            }
            initializeLangChain().catch(err => {
                logger.error('Failed to restore original provider after error:', err);
            });
        }
    }
}

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
    const healthStatus = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'unknown',
        providers: []
    };

    try {
        // Check database connection
        await new Promise((resolve, reject) => {
            db.get('SELECT 1', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        healthStatus.database = 'connected';
    } catch (error) {
        healthStatus.database = 'disconnected';
        healthStatus.status = 'degraded';
        healthStatus.databaseError = error.message;
    }

    // Check provider status
    providerManager.providers.forEach(provider => {
        healthStatus.providers.push({
            name: provider.name,
            enabled: provider.enabled,
            hasApiKey: providerManager.isValidApiKey(provider),
            selectedModel: provider.selectedModel
        });
    });

    const statusCode = healthStatus.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
});

// --- Server Initialization ---
app.listen(port, async () => {
    logger.startup('SQL Query Buddy Server Started!');
    logger.separator('=', 60);

    // CRITICAL: Validate that at least one provider has a valid API key
    const currentProvider = providerManager.getProviderWithFallback();

    if (!currentProvider) {
        // No valid providers found - fail fast
        logger.separator('=', 60);
        logger.error('  FATAL ERROR: No valid API keys configured!');
        logger.separator('=', 60);
        logger.error('');
        logger.error('  The server cannot start without at least ONE valid API key.');
        logger.error('');
        logger.error('  REQUIRED STEPS:');
        logger.error('  1. Edit the .env file in the server directory');
        logger.error('  2. Add at least one API key from the list below:');
        logger.error('');

        // List all enabled providers
        const enabledProviders = providerManager.providers.filter(p => p.enabled && !p.requiresIAM);
        enabledProviders.forEach(p => {
            const envVarName = `${p.name.toUpperCase()}_API_KEY`;
            logger.error(`     - ${envVarName}=your-key-here`);
        });

        logger.error('');
        logger.error('  3. Get API keys from:');
        logger.error('     - OpenAI: https://platform.openai.com/api-keys');
        logger.error('     - Google: https://aistudio.google.com/app/apikey (Free tier)');
        logger.error('     - Groq: https://console.groq.com/keys (Free tier)');
        logger.error('     - Cohere: https://dashboard.cohere.com/api-keys');
        logger.error('');
        logger.error('  4. Restart the server: npm start');
        logger.error('');
        logger.separator('=', 60);

        // Exit with error code
        process.exit(1);
    }

    const hasValidKey = providerManager.isValidApiKey(currentProvider);

    logger.info(`  Provider Status: ${hasValidKey ? '✅ Ready' : '⚠️  No API Key'}`);
    logger.info(`  - Active:  ${currentProvider.name}`);
    logger.info(`  - Model:   ${currentProvider.selectedModel}`);
    logger.info(`  - API Key: ${hasValidKey ? '✅ Configured' : '❌ Not Configured'}`);

    // Check for missing providers and warn user
    const missingProviders = providerManager.providers.filter(p =>
        p.enabled && !p.requiresIAM && !providerManager.isValidApiKey(p)
    );

    if (missingProviders.length > 0) {
        logger.separator('=', 60);
        logger.info('  ⚠️  Additional Providers Available:');
        logger.info('');
        logger.info(`  You have ${missingProviders.length} provider(s) that could be configured:`);
        logger.info('');
        missingProviders.forEach(p => {
            const envVarName = `${p.name.toUpperCase()}_API_KEY`;
            logger.info(`  - ${p.name.padEnd(12)} → Add ${envVarName} to .env`);
        });
        logger.info('');
        logger.info('  Alternatively, you can add API keys from the web interface');
        logger.info('  by clicking on providers in the configuration table.');
    }

    // Test API connection if key is configured
    if (hasValidKey) {
        logger.separator('=', 60);
        logger.info('  Running API Connection Test...');
        apiTestResult = await testApiConnection(currentProvider);
        apiTestResult.tested = true;

        if (apiTestResult.success) {
            logger.info(`  - Status:  ✅ API Working`);
            
            // Log database information before "Ready" message
            logDatabaseInfo();
            logger.info(`  Database Connected: ✅`);
            
            logger.info(`  - Ready:   System is ready for queries ✨`);
        } else {
            logger.error(`  - Status:  ❌ API Test Failed`);

            if (apiTestResult.errorType === 'quota_exceeded') {
                logger.error(`  - Issue:   Quota exceeded or out of credits`);
                logger.error(`  - Action:  Add credits at https://platform.openai.com/account/billing`);
            } else if (apiTestResult.errorType === 'invalid_key') {
                logger.error(`  - Issue:   Invalid API key`);
                logger.error(`  - Action:  Check your API key in server/.env`);
            } else if (apiTestResult.errorType === 'network_error') {
                logger.error(`  - Issue:   Network connection failed`);
                logger.error(`  - Action:  Check internet connection and firewall`);
            } else {
                logger.error(`  - Issue:   ${apiTestResult.error}`);
            }

            logger.warn(`  - Warning: Queries will fail until API is fixed`);
        }
    } else {
        logger.warn('  ⚠️  WARNING: No valid API key found!');
        logger.warn('  Please set your API key in server/.env');
        logger.warn(`  Example: OPENAI_API_KEY=sk-your-key-here`);
        
        // Log database information
        logDatabaseInfo();
    }

    logger.separator('=', 60);
    logger.info(`  API Health Check URL:      http://localhost:${port}/api/health`);
    logger.info(`  SQL Query Buddy App URL:   http://localhost:${port}/`);
    logger.info('  Press Ctrl+C to stop');
});
