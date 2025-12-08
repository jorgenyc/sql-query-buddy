# SQL Query Buddy

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.1.0-blue.svg)](https://expressjs.com/)
[![LangChain](https://img.shields.io/badge/LangChain-1.0.3-orange.svg)](https://www.langchain.com/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)


A conversational AI agent that lets users explore databases using natural language. SQL Query Buddy converts plain-English questions into accurate, optimized SQL queries, executes them, and provides AI-driven insights on top of the results.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technologies Used](#technologies-used)
- [Folder Structure](#folder-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Development Workflow](#development-workflow)
- [API Endpoints](#api-endpoints)
- [Example Queries](#example-queries)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Author](#author)

## Overview

SQL Query Buddy is a conversational AI agent built with LangChain, Vector Databases, and modern web technologies. It helps users understand patterns, trends, and anomalies in their data instantly by:

- Converting natural language questions to SQL queries
- Executing queries against a database
- Providing beginner-friendly explanations
- Offering AI-driven insights and optimization suggestions

### 🎓 Project Context

This project was created as the **capstone project** for the **Codecademy Mastering Generative AI & Agents for Developers bootcamp**. It demonstrates practical application of:

- **LangChain** for building AI agent workflows
- **RAG (Retrieval-Augmented Generation)** using vector databases
- **Multi-provider LLM integration** (OpenAI, Cohere, AI21, Google Gemini)
- **Natural language to SQL conversion** with context awareness
- **Full-stack web development** with Node.js and Express

### 🎯 Learning Objectives Achieved

- ✅ Built a production-ready conversational AI agent
- ✅ Implemented RAG architecture with FAISS vector database
- ✅ Integrated multiple LLM providers with fallback mechanisms
- ✅ Created a responsive, modern web interface
- ✅ Applied prompt engineering for SQL generation
- ✅ Implemented conversation memory and context management
- ✅ Built a complete full-stack application with proper error handling

## Features

### Conversational Querying
Ask complex, natural questions such as:
- "Show top 5 customers by total sales."
- "Now filter them to California only."
- "What's the total revenue from them this year?"

The chatbot remembers context and understands follow-up questions naturally.

### RAG-Powered SQL Generation
Uses LangChain + Vector Database (FAISS) to semantically search table schemas and metadata before generating SQL, ensuring accuracy and context-awareness across multiple tables.

### Query Optimization
Suggests faster JOINs, indexing strategies, and optimized aggregations to improve database performance.

### AI-Driven Insights
After executing a query, SQL Query Buddy uses the LLM to interpret and summarize data with contextual insights, such as:
- "Sales in California grew 15% month-over-month."
- "Customer Alice Chen contributed 22% of total Q1 revenue."
- "Product category Electronics accounts for 40% of total sales."

### Explainable SQL
Each query includes a beginner-friendly explanation:
> "This query selects the top 5 customers by summing their total order amounts and sorting them in descending order."

### Per-Tab Context Isolation
Each query tab maintains its own independent conversation context:
- **Isolated Memory**: Each tab has its own BufferMemory instance
- **Fresh Start**: "New Query" tabs begin with cleared context
- **Context Continuity**: Switching tabs preserves each tab's conversation history
- **Follow-up Queries**: Reference previous results within the same tab using pronouns like "them", "those", "it"

### Advanced Analysis Tools
Automatic statistical analysis for query results:
- **Statistical Summary**: Mean, median, mode, standard deviation, quartiles, IQR, range
- **Correlation Matrix**: Pearson correlation coefficients between numeric columns with color-coded visualization
- **Trend Analysis**: Growth rates, CAGR, period-over-period changes, trend direction
- **Auto-Detection**: Automatically generated when relevant data is present

### Geographic Visualization
Automatic map rendering for geographic data:
- **US State Map**: Detects state/region columns in results
- **Heatmap Coloring**: Visual representation of numeric data by state
- **Interactive Tooltips**: Hover to see detailed state information

### Query Templates
Pre-built query templates for common use cases:
- **Quick Start**: Access via "Templates" button
- **Common Patterns**: Top customers, revenue by region, monthly trends
- **One-Click Execution**: Select template to run immediately

### Compare Mode
Side-by-side query comparison:
- **Multiple Queries**: Compare results from different queries simultaneously
- **Provider Comparison**: Test same query with different AI providers
- **Model Comparison**: Compare different models side-by-side

### Query Statistics (Tron HUD Style)
Real-time query performance metrics displayed in a horizontal HUD bar:
- **Provider & Model**: Shows which AI provider and model was used
- **Time of Query**: Timestamp of when query was executed
- **Context Iteration**: Number of queries in current conversation
- **Tokens Used**: Total tokens consumed by the query
- **Latency**: Query execution time
- **Est. Cost**: Estimated API cost for the query

### Clean Chat Interface
A modern, interactive web interface that displays:
- User questions
- Generated SQL queries
- Raw query results
- AI-generated insights and explanations
- Query optimization suggestions
- Statistical analysis dashboards
- Interactive charts and maps

## Technologies Used

This project leverages modern technologies across the full stack to deliver a powerful conversational AI experience.

### Core Technologies

#### Backend Framework & Runtime
- **[Node.js](https://nodejs.org/)** (v18.x+)
  - JavaScript runtime built on Chrome's V8 engine
  - Enables server-side JavaScript execution
  - Provides asynchronous, event-driven architecture for handling multiple requests

- **[Express.js](https://expressjs.com/)** (v5.1.0)
  - Fast, unopinionated web framework for Node.js
  - Handles HTTP requests and routing
  - Serves static files and API endpoints
  - Middleware support for CORS and JSON parsing

#### AI & Machine Learning

- **[LangChain](https://www.langchain.com/)** (v0.1.3)
  - Framework for developing applications powered by language models
  - Orchestrates the entire AI pipeline (prompts, chains, memory)
  - Provides abstractions for working with multiple LLM providers
  - Implements RAG (Retrieval Augmented Generation) patterns
  - Components used:
    - `ChatPromptTemplate` - Structured prompt engineering
    - `BufferMemory` - Conversation history management
    - `RunnableSequence` - Chain multiple operations
    - `RecursiveCharacterTextSplitter` - Document chunking for embeddings

- **[FAISS (Facebook AI Similarity Search)](https://github.com/facebookresearch/faiss)**
  - Vector database for efficient similarity search
  - Stores and retrieves database schema embeddings
  - Enables semantic search across table definitions
  - Powers the RAG system for context-aware SQL generation
  - Implementation via `faiss-node` (v0.5.1)

#### Language Models & Providers

**Currently Implemented Providers:**

- **[OpenAI](https://openai.com/)** (Primary Provider - Fully Supported)
  - **gpt-4o-mini** (default) - Most affordable GPT-4 class model, excellent for high volume
  - **gpt-3.5-turbo** - Fast, cost-effective language model
  - **gpt-4o** - Advanced model for complex queries
  - **gpt-4-turbo** - High-performance model
  - **text-embedding-ada-002** - Text embeddings for semantic search
  - Provides both LLM and embeddings (fully self-contained)
  - Integrated via `@langchain/openai` (v0.0.14) and `openai` (v6.8.1)

- **[Cohere](https://cohere.com/)** (Alternative Provider - Partial Support)
  - **command-r** - Command model for text generation
  - **command-r-plus** - Enhanced command model
  - **⚠️ Requires OpenAI API key** for embeddings (uses OpenAI embeddings, Cohere LLM)
  - Integrated via `@langchain/cohere` (v1.0.0) and `cohere-ai` (v7.19.0)

- **[AI21 Labs](https://www.ai21.com/)** (Alternative Provider - Partial Support)
  - **j2-light** - Lightweight Jurassic model
  - **j2-mid** - Mid-tier Jurassic model
  - **j2-ultra** - High-performance Jurassic model
  - **⚠️ Requires OpenAI API key** for embeddings (uses OpenAI embeddings, AI21 LLM)
  - Integrated via `@langchain/community` (v1.0.0) and `ai21` (v1.3.0)

**Note**: Other providers listed in `vendor_config.json` (Google Gemini, Anthropic, Mistral, Groq, Together, OpenRouter, AWS Bedrock) are configured but not yet implemented in code. Adding an API key for these providers will result in an "Unsupported provider" error.

#### Database

- **[SQLite3](https://www.sqlite.org/)** (v5.1.7)
  - Lightweight, serverless SQL database engine
  - In-memory database for demo purposes
  - Contains sample data (customers, products, orders)
  - Can be easily replaced with persistent storage or other SQL databases

### Frontend Technologies

- **HTML5**
  - Semantic markup for the chat interface
  - Modern web standards for structure

- **CSS3**
  - Modern styling with flexbox and grid layouts
  - Responsive design for various screen sizes
  - Custom animations and transitions

- **Vanilla JavaScript (ES6+)**
  - Client-side logic for user interactions
  - Asynchronous API communication using Fetch API
  - DOM manipulation for dynamic content rendering
  - Event handling for chat interface

### Supporting Libraries

#### Development & Environment

- **[dotenv](https://www.npmjs.com/package/dotenv)** (v17.2.3)
  - Loads environment variables from `.env` file
  - Secures API keys and sensitive configuration
  - Enables environment-specific settings

- **[CORS](https://www.npmjs.com/package/cors)** (v2.8.5)
  - Cross-Origin Resource Sharing middleware
  - Enables frontend-backend communication
  - Configures allowed origins and methods

#### Reliability & Error Handling

- **[p-retry](https://www.npmjs.com/package/p-retry)** (v7.1.0)
  - Retry logic for API calls
  - Handles transient failures gracefully
  - Configurable retry strategies and backoff
  - Used for vector store initialization and LLM requests

### Architecture Pattern

- **RAG (Retrieval Augmented Generation)**
  - Combines semantic search with language model generation
  - Retrieves relevant database schema before generating SQL
  - Improves accuracy and context-awareness
  - Reduces hallucinations in SQL generation

- **Provider Fallback System**
  - Multiple LLM providers for resilience
  - Automatic failover if one provider is unavailable
  - Configurable via `vendor_config.json`

### Package Manager

- **[npm](https://www.npmjs.com/)** (Node Package Manager)
  - Dependency management
  - Script execution (`npm start`, `npm test`)
  - Version control with `package-lock.json`

### Version Control

- **[Git](https://git-scm.com/)**
  - Source code version control
  - Collaboration and change tracking
  - Branch management for features

### Development Tools

- **ES Modules (ESM)**
  - Modern JavaScript module system (`import/export`)
  - Enabled via `"type": "module"` in `package.json`
  - Better tree-shaking and code organization

### API Integration

- **RESTful API Design**
  - Clean, resource-based endpoints
  - JSON request/response format
  - HTTP status codes for error handling

### Future-Ready Technologies

The architecture is designed to easily integrate:
- **Redis** - For caching frequent queries
- **PostgreSQL/MySQL** - For production databases
- **Docker** - For containerization
- **PM2** - For process management in production
- **WebSockets** - For real-time streaming responses
- **Authentication** - OAuth, JWT for user management

## Folder Structure

```
project-SQL_Query_Buddy/
│
├── server/                          # Backend application
│   ├── public/                      # Static frontend files
│   │   ├── index.html              # Main HTML page
│   │   ├── script.js               # Frontend JavaScript logic
│   │   └── style.css               # Styling for the interface
│   │
│   ├── database.js                  # SQLite database setup & sample data
│   ├── index.js                     # Main Express server & LangChain logic
│   ├── logger.js                    # Custom logging utility
│   ├── vendor_config.json           # LLM provider configuration
│   ├── .env.example                 # Environment variables template (COMMITTED)
│   ├── .env                         # Actual environment variables (GITIGNORED)
│   ├── package.json                 # Node.js dependencies & metadata
│   └── package-lock.json            # Dependency lock file
│
├── logs/                            # Application logs (gitignored)
│   ├── app-YYYY-MM-DD.log          # Main application logs
│   ├── query-YYYY-MM-DD.log        # Query-specific logs
│   ├── error-YYYY-MM-DD.log        # Error logs
│   ├── debug-YYYY-MM-DD.log        # Debug logs
│   └── README.md                    # Logging documentation
│
├── .gitignore                       # Git ignore rules for sensitive files
├── LICENSE                          # MIT License
└── README.md                        # This file
```

### File Descriptions

#### `server/index.js`
The main application file containing:
- Express server configuration
- LangChain setup (chains, prompts, memory)
- Provider management (OpenAI, Cohere, AI21)
- API endpoint definitions
- RAG implementation with FAISS vector store
- Query processing and optimization logic

#### `server/database.js`
Database initialization file that:
- Creates an in-memory SQLite database
- Defines schema (customers, products, orders tables)
- Populates sample data for testing
- Exports database connection

#### `server/logger.js`
Custom logging utility that:
- Writes logs to both console and files
- Organizes logs by type (app, query, error, debug)
- Creates date-stamped log files (YYYY-MM-DD)
- Provides multiple log levels (info, error, warn, debug, query)
- Supports structured logging with timestamps

#### `server/vendor_config.json`
Configuration for multiple LLM providers:
- Provider names and models
- API key references
- Enable/disable flags
- Fallback provider support

#### `server/public/`
Frontend files served statically:
- **index.html**: Main chat interface structure
- **script.js**: Handles user input, API calls, and result display
- **style.css**: Modern, responsive styling

#### `server/.env`
Environment variables (not committed to version control):
```
OPENAI_API_KEY=your_openai_api_key_here
COHERE_API_KEY=your_cohere_api_key_here
AI21_API_KEY=your_ai21_api_key_here
PORT=3001
```

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.x or higher) - [Download Node.js](https://nodejs.org/)
- **npm** (comes bundled with Node.js)
- **Git** (optional, for cloning the repository)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jorgenyc/sql-query-buddy.git
   cd sql-query-buddy
   ```

2. **Navigate to the server directory**
   ```bash
   cd server
   ```

3. **Install dependencies** ⚠️ **REQUIRED STEP**
   ```bash
   npm install
   ```
   
   **⚠️ Important:** You MUST run `npm install` before starting the server. This installs all required packages including Express.js, LangChain, FAISS, SQLite3, and other dependencies.
   
   **Note:** The project includes an `.npmrc` file that automatically handles peer dependency conflicts using the `--legacy-peer-deps` flag, so `npm install` should work without any additional flags.

### Configuration

**Important Note for Graders/Reviewers:**

> **API keys are pre-configured/hardcoded for grading purposes.** You do not need to set up a `.env` file or configure API keys to test the application. The application is ready to run out of the box.

#### Power User Mode

The application supports a **Power User Mode** that controls whether users can change AI providers and models. This is configured in `server/app-config.json`:

   ```json
   {
  "power_user": false
}
```

- **`power_user: false`** (Default): 
  - API settings drawer is hidden
  - Provider/model selection is disabled
  - App defaults to OpenAI with `gpt-4o-mini`
  - Subtitle text about provider selection is hidden
  - All provider switching endpoints return 403 Forbidden

- **`power_user: true`**:
  - Full access to provider/model selection
  - API settings drawer is visible
  - All provider switching features are enabled

**Note**: If `app-config.json` doesn't exist, the app defaults to `power_user: true` for backward compatibility.

For regular users who want to use their own API keys:

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit the `.env` file** and add your API keys:
   ```env
   OPENAI_API_KEY=sk-your-openai-key-here
   COHERE_API_KEY=your-cohere-key-here
   AI21_API_KEY=your-ai21-key-here
   GEMINI_API_KEY=your-gemini-key-here
   ```

   **Note:** You only need **one** API key to get started. See the [Installation Guide](docs/INSTALLATION_GUIDE.md) for links to obtain API keys.

### Running the App

**⚠️ Important:** Make sure you've completed the installation steps above (especially `npm install`) before trying to start the server.

**Start the server:**
   ```bash
   npm start
   ```

**Or for development mode with auto-restart:**
```bash
npm run dev
```

**Note:** Always use `npm start` or `npm run dev` - do not run `node index.js` directly as it won't work without the installed dependencies.

**Access the application:**
   Open your browser and navigate to:
   ```
   http://localhost:3001
   ```

The server will start on port 3001 (or your configured PORT in `.env`).

## Configuration

### Environment Variables

Create a `.env` file in the `server/` directory with the following variables:

```env
# Required: At least one API key must be provided
OPENAI_API_KEY=sk-your-openai-key-here
COHERE_API_KEY=your-cohere-key-here
AI21_API_KEY=your-ai21-key-here

# Optional: Server port (default: 3001)
PORT=3001
```

### Provider Configuration

The `vendor_config.json` file allows you to configure multiple LLM providers:

```json
{
  "providers": [
    {
      "name": "openai",
      "apiKey": "${process.env.OPENAI_API_KEY}",
      "model": "gpt-3.5-turbo",
      "enabled": true
    },
    {
      "name": "cohere",
      "apiKey": "${process.env.COHERE_API_KEY}",
      "model": "command",
      "enabled": false
    }
  ]
}
```

- **name**: Provider identifier (openai, cohere, ai21)
- **apiKey**: Environment variable reference
- **model**: Specific model to use
- **enabled**: Whether this provider is active

### Database Configuration

The current implementation uses an in-memory SQLite database with sample data. To use a persistent database or connect to your own:

1. Modify `server/database.js`
2. Replace `:memory:` with a file path: `new sqlite3.Database('./data.db')`
3. Update the schema and data population logic as needed

## Usage

### Starting the Application

```bash
cd server
npm start
```

The server will start on `http://localhost:3001` (or your configured PORT).

### Using the Chat Interface

1. Open your browser to `http://localhost:3001`
2. Type a natural language question in the input field
3. Press Enter or click Submit
4. View the results, which include:
   - **SQL Query**: The generated SQL statement
   - **Explanation**: Beginner-friendly description
   - **Results**: Data returned from the database
   - **Insights**: AI-generated analysis
   - **Optimizations**: Performance improvement suggestions

### Provider Management

You can switch between LLM providers using the API:

```javascript
// Get current provider
fetch('http://localhost:3001/api/providers')
  .then(res => res.json())
  .then(data => console.log(data));

// Switch to next provider
fetch('http://localhost:3001/api/providers/next', {
  method: 'POST'
})
  .then(res => res.json())
  .then(data => console.log(data));
```

## Development Workflow

This section explains the most efficient way to develop and test the application, especially when working on complex features.

### NPM Scripts (Cross-Platform)

If you prefer using npm commands (works on Windows, Mac, Linux):

#### Development Mode with Auto-Restart
```bash
cd server
npm run dev
```
- Cross-platform development mode
- Auto-restarts on file changes
- Best for active development

#### Development Mode with Custom Watch Settings
```bash
cd server
npm run dev:watch
```
- Watches all files except the `public/` directory
- Monitors `.js` and `.json` file changes
- More fine-tuned control over what triggers restarts

#### Production Mode
```bash
cd server
npm start
```
- Standard production start
- No file watching or auto-restart

### Development Best Practices

#### Efficient Workflow for Code Changes

1. **Start in Development Mode**
   ```bash
   npm run dev
   ```

2. **Make Your Changes**
   - Edit code in your IDE
   - Save files (Ctrl+S / Cmd+S)
   - Server automatically restarts
   - Check console for any errors

3. **Test Immediately**
   - Open browser to `http://localhost:3001`
   - Test your changes
   - No need to manually restart!

4. **Monitor Console Output**
   - Watch for initialization messages
   - Check for errors or warnings
   - Verify database and LangChain setup

5. **Stop When Done**
   - Press Ctrl+C in the terminal

#### Working with Multiple AI Providers

When testing different LLM providers:

1. Update `server/vendor_config.json`
2. Enable/disable providers
3. Save the file
4. Server auto-restarts (in dev mode)
5. Test the new provider immediately

#### Environment Variable Changes

When modifying `.env` file:

1. Update the API key or variable
2. Save `.env`
3. **Manually restart** the server (env vars need full restart)
   - Press Ctrl+C to stop
   - Run `npm run dev` again

#### Database Schema Changes

When modifying `server/database.js`:

1. Make schema changes
2. Save the file
3. Server auto-restarts
4. New schema is loaded automatically (in-memory DB)

#### Frontend Changes

When modifying files in `server/public/`:

1. Edit `index.html`, `script.js`, or `style.css`
2. Save files
3. **Just refresh browser** (no restart needed - static files!)
4. For CSS changes, may need hard refresh (Ctrl+Shift+R)

### Debugging Tips

#### Verbose Logging

The application logs detailed information to console:
- Provider selection
- Database schema loading
- Vector store creation
- Query processing steps
- Error details with stack traces

Keep the console visible during development to catch issues immediately.

#### Common Development Scenarios

**Scenario: Testing a new feature**
```bash
# Terminal 1
npm run dev

# Make changes, save files, test immediately
# Server auto-restarts on each save
```

**Scenario: Multiple developers**
```bash
# Each developer can use different ports
PORT=3002 npm run dev
```

**Scenario: API testing**
```bash
# Use tools like Postman, curl, or Insomnia
# Server stays running between requests
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Show top customers"}'
```

### Git Workflow

#### Before Committing

1. Ensure `.env` is in `.gitignore` (already configured)
2. Never commit API keys
3. Test your changes thoroughly
4. Stop the development server

#### .gitignore Configuration

The project includes a comprehensive `.gitignore` that excludes:
- Environment files (`.env`, `.env.*`)
- Node modules (`node_modules/`)
- IDE files (`.vscode/`, `.idea/`)
- AI assistant files (`.claude/`, `.gemini/`)
- OS files (`.DS_Store`, `Thumbs.db`)
- Build outputs and logs
- Database files (if using persistent SQLite)
- Vector store files (`.faiss`, `.pkl`)

**Always verify before pushing:**
```bash
git status
# Ensure no sensitive files are staged
```

### Performance Tips

#### Fast Feedback Loop

1. **Use Dev Mode**: Auto-restart is crucial for productivity
2. **Keep Console Open**: Catch errors immediately
3. **Use Browser DevTools**: Monitor network requests and console
4. **Test Small Changes**: Incremental testing catches issues early

#### Avoiding Restarts

Files that DON'T require restart:
- `public/index.html` (just refresh browser)
- `public/script.js` (just refresh browser)
- `public/style.css` (hard refresh browser)

Files that REQUIRE restart:
- `index.js` (auto-restart in dev mode)
- `database.js` (auto-restart in dev mode)
- `.env` (manual restart required)
- `package.json` (manual restart required)
- `vendor_config.json` (auto-restart in dev mode)

### Troubleshooting Development Issues

**Port Already in Use**
```bash
# Check what's running (Mac/Linux)
lsof -ti:3001 | xargs kill

# Or change the port in .env
PORT=3002 npm run dev
```

**Changes Not Reflecting**
- Frontend changes: Hard refresh browser (Ctrl+Shift+R)
- Backend changes: Check if nodemon restarted (see console)
- Environment variables: Manually restart server

**Nodemon Not Working**
```bash
# Reinstall dependencies
cd server
npm install --legacy-peer-deps
```

### Advanced: Custom Development Setup

#### Using PM2 (Production Process Manager)
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
cd server
pm2 start index.js --name sql-query-buddy

# Monitor
pm2 monit

# Stop
pm2 stop sql-query-buddy
```

#### Docker Development (Optional)
```dockerfile
# Future: Add Dockerfile for containerized development
# Ensures consistent environment across team
```

## API Endpoints

### `GET /api/providers`
Returns information about configured LLM providers.

**Response:**
```json
{
  "providers": [
    {
      "name": "openai",
      "model": "gpt-3.5-turbo",
      "enabled": true
    }
  ],
  "currentIndex": 0
}
```

### `POST /api/providers/next`
Switches to the next available LLM provider.

**Response:**
```json
{
  "currentIndex": 1
}
```

### `POST /api/query`
Processes a natural language query and returns SQL, results, and insights.

**Request:**
```json
{
  "query": "Show me the top 5 customers by total purchase amount"
}
```

**Response:**
```json
{
  "sqlQuery": "SELECT customer_id, SUM(total_amount) as total FROM orders GROUP BY customer_id ORDER BY total DESC LIMIT 5",
  "explanation": "This query selects customers and sums their total order amounts...",
  "insights": "Customer 2 has the highest total purchase amount at $1,600...",
  "optimizations": "Consider adding an index on customer_id for faster aggregation...",
  "results": [
    { "customer_id": 2, "total": 1600 },
    { "customer_id": 1, "total": 1200 }
  ]
}
```

## Example Queries

Try these natural language questions:

1. "Show me the top 5 customers by total purchase amount."
2. "Which product category made the most revenue this quarter?"
3. "List customers who haven't ordered anything in the last 3 months."
4. "Show total sales per region for 2024."
5. "Find the average order value for returning customers."
6. "How many unique products were sold in January?"
7. "Which salesperson generated the highest sales last month?"
8. "From the previous result, filter customers from New York only."
9. "Show the trend of monthly revenue over time."
10. "How many orders contained more than 3 items?"

## Technical Features

### Context Window Management
- **History Limiting**: Maximum 10 conversation messages per tab (5 queries + 5 responses)
- **Schema Retrieval**: Limited to top 3 most relevant schema chunks to prevent context overflow
- **Result Truncation**: Large result sets are summarized to prevent context overflow
- **Token Optimization**: Automatic truncation of saved context to stay within model limits
- **Smart Context Saving**: For small result sets (≤10 rows), saves all rows; for larger sets, saves up to 10 rows with key identifiers prioritized

### Database Optimizations
- **15 Indexes**: Optimized indexes on foreign keys, date columns, and frequently filtered columns
  - JOIN indexes: `customers.customer_id`, `orders.customer_id`, `orders.order_id`, `order_items.order_id`, `order_items.product_id`, `products.product_id`
  - Filtering indexes: `orders.order_date`, `customers.region`, `products.category`, `customers.signup_date`
  - Aggregation indexes: `orders.total_amount`, `order_items.quantity`
  - Composite indexes: `orders(order_date, customer_id)`, `order_items(order_id, product_id)`, `order_items(product_id, quantity)`
- **8 Pre-computed Views**: Common query patterns pre-optimized with INNER JOIN and COALESCE
- **PRAGMA Settings**: 
  - `journal_mode = WAL` - Write-Ahead Logging for better concurrency
  - `synchronous = NORMAL` - Faster writes with WAL
  - `cache_size = -64000` - 64MB cache
  - `temp_store = MEMORY` - Use memory for temporary tables
  - `mmap_size = 268435456` - 256MB memory-mapped I/O
  - `foreign_keys = ON` - Referential integrity
- **Query Timeout**: 30-second timeout prevents long-running queries from blocking
- **Busy Timeout**: 5-second timeout handles concurrent database access
- **WAL Checkpointing**: Automatic checkpointing every 100 queries to manage WAL file size
- **ANALYZE**: Query planner statistics updated for optimal query execution

### Real-time Progress Updates
- **Server-Sent Events (SSE)**: Live progress updates during query processing
- **9-Step Process**: Visual progress bar showing each stage:
  1. Loading conversation context
  2. Retrieving relevant schema
  3. Generating SQL query
  4. Executing query
  5. Generating explanation
  6. Analyzing results
  7. Generating insights
  8. Optimizing query
  9. Generating response
- **Error Handling**: Graceful error messages with retry logic using `p-retry`

## Best Practices

### Security
- **Never commit API keys** to version control
- Use environment variables for sensitive data
- Implement rate limiting for production deployments
- Validate and sanitize all user inputs
- Use parameterized queries to prevent SQL injection
- Only SELECT queries are generated (no data modification)

### Provider Selection
- **For Best Results**: Use OpenAI (gpt-4o-mini or gpt-4o)
- **For Cost Savings**: Use gpt-4o-mini (most affordable GPT-4 class model)
- **For Comparison**: Use Compare Mode to test same query with different providers
- **Important**: Cohere and AI21 require OpenAI API key for embeddings

### Context Management
- **Keep Queries Focused**: Specific queries work better than broad ones
- **Use Follow-ups**: Reference previous results within the same tab
- **Start Fresh**: Create new "New Query" tab for unrelated topics
- **Tab Isolation**: Each tab maintains independent context
- **Context Iteration**: Track conversation depth via stats bar

### Code Quality
- Follow JavaScript/Node.js best practices
- Use ESLint for code linting
- Write unit tests for critical functions
- Document complex logic with comments
- Use meaningful variable and function names

### Performance
- **Use Indexed Columns**: Queries on indexed columns (customer_id, order_date, region) are faster
- **Limit Results**: Use "top N" or "first N" to limit result sets
- **Date Ranges**: Use specific date ranges instead of broad queries
- **Review Optimizations**: Check optimization suggestions for performance improvements
- Monitor API usage to stay within provider limits
- Optimize vector store retrieval with appropriate chunk sizes
- Consider using persistent FAISS indexes for larger schemas

### Development Workflow
- Create feature branches for new functionality
- Write descriptive commit messages
- Test thoroughly before merging to main
- Keep dependencies up to date
- Document breaking changes

### Production Deployment
- **Debug Mode**: Set `IS_DEBUG_MODE = false` in `server/public/script.js` for production
- **Logging**: Detailed logs in `logs/` directory using local system time
- **Environment Variables**: At least one API key required (OPENAI_API_KEY recommended)
- Use a process manager (PM2, forever)
- Set up proper logging and monitoring
- Implement error tracking (Sentry, etc.)
- Use a reverse proxy (nginx, Apache)
- Enable HTTPS/SSL
- Set appropriate CORS policies
- Use a persistent database instead of in-memory

## Troubleshooting

### Common Issues

**Issue: "Failed to initialize LangChain"**
- Check that your API key is correctly set in `.env`
- Verify the API key is valid and has sufficient credits
- Ensure the provider is enabled in `vendor_config.json`

**Issue: "Database query error"**
- Check the generated SQL query for syntax errors
- Verify the database schema matches your queries
- Ensure the database is properly initialized

**Issue: "CORS errors in browser"**
- Verify CORS is enabled in `server/index.js`
- Check that the frontend is accessing the correct port
- Clear browser cache and try again

**Issue: "Vector store creation failed"**
- Check OpenAI API key (required for embeddings)
- Verify network connectivity
- Review retry logs in console output

**Issue: "Cannot find package 'express'" or "ERR_MODULE_NOT_FOUND"**
- **Solution:** You must run `npm install` first in the `server/` directory
- This error occurs when dependencies haven't been installed yet
- After cloning, always run:
  ```bash
  cd server
  npm install
  ```
- Then use `npm start` or `npm run dev` to start the server (don't use `node index.js` directly)

**Issue: "ERESOLVE could not resolve" dependency conflict**
- **Solution:** The project includes a `server/.npmrc` file that should automatically fix this
- If you still get this error, it means the `.npmrc` file is missing (you may have cloned before it was added)
- **Quick fix:** Create `server/.npmrc` file with this content:
  ```
  legacy-peer-deps=true
  ```
- Then run `npm install` again
- Alternatively, run: `npm install --legacy-peer-deps`

### Debugging

Enable detailed logging by checking console output:
```bash
npm start
```

The application logs:
- Provider initialization
- Database schema retrieval
- Vector store creation
- Query processing steps
- Error details with stack traces

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** and test thoroughly
4. **Commit with descriptive messages**: `git commit -m "Add: Feature description"`
5. **Push to your fork**: `git push origin feature/your-feature-name`
6. **Submit a pull request** with a clear description of changes

### Code Standards
- Follow existing code style and conventions
- Add comments for complex logic
- Update documentation as needed
- Ensure all tests pass before submitting

### Reporting Issues
When reporting bugs, please include:
- Description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)
- Error messages or logs

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 jorgenyc

## Author

**jorgenyc**

- LinkedIn: [linkedin.com/in/jorgenyc](https://www.linkedin.com/in/jorgenyc/)
- GitHub: [github.com/jorgenyc](https://github.com/jorgenyc)

## 🚀 Project Highlights

### Key Features Implemented
- **Multi-Provider LLM Support**: Seamlessly switch between OpenAI (fully supported), Cohere, and AI21 (partial support - require OpenAI for embeddings)
- **RAG-Powered SQL Generation**: Uses vector similarity search to find relevant schema information
- **Per-Tab Context Isolation**: Each tab maintains independent conversation context using separate BufferMemory instances
- **Query Optimization**: AI provides suggestions for improving SQL performance with 15 indexes and 8 pre-computed views
- **Advanced Analysis Tools**: Statistical summary, correlation matrix, and trend analysis automatically generated
- **Geographic Visualization**: Automatic US state map rendering with heatmap coloring for geographic data
- **Query Templates**: Pre-built templates for common query patterns
- **Compare Mode**: Side-by-side query comparison across providers and models
- **Tron HUD Stats Bar**: Real-time query performance metrics (provider, model, tokens, latency, cost)
- **Data Visualization**: Automatic chart generation for query results using Chart.js
- **Dark Mode**: Full dark theme support with persistent user preference
- **Query History**: Tab-based interface for managing multiple query sessions

### Technical Challenges Overcome
1. **Schema Embedding & Retrieval**: Implemented efficient vector search to find relevant database schema information
2. **Multi-Provider Abstraction**: Created a unified interface for different LLM providers with consistent error handling
3. **Context Management**: Built conversation memory system that maintains SQL query context across follow-up questions
4. **Real-time Progress Updates**: Implemented Server-Sent Events (SSE) for live query progress feedback
5. **SQL Security**: Ensured only SELECT queries are generated, preventing data modification

### Future Enhancements
- [ ] Support for additional database types (PostgreSQL, MySQL)
- [ ] Query result export (CSV, JSON)
- [ ] User authentication and query history persistence
- [ ] Advanced visualization options
- [ ] Query performance analytics dashboard
- [ ] Natural language query suggestions
- [ ] Multi-database connection support

## 📚 Educational Value

This project serves as a comprehensive example of:
- Building production-ready AI applications
- Implementing RAG architecture from scratch
- Creating user-friendly interfaces for complex AI systems
- Best practices in prompt engineering and LLM integration
- Full-stack development with modern JavaScript

## 🙏 Acknowledgments

- **Codecademy** for the excellent GenAI & Agents Bootcamp curriculum
- **LangChain** team for the powerful framework
- **OpenAI, Cohere, AI21, and Google** for their LLM APIs
- The open-source community for the amazing tools and libraries
- Built as part of the **Codecademy Mastering Generative AI & Agents for Developers Bootcamp**

---

**Questions or Feedback?** Open an issue on the [GitHub repository](https://github.com/jorgenyc/sql-query-buddy) or connect with me on [LinkedIn](https://www.linkedin.com/in/jorgenyc/)!
