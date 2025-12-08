# SQL Query Buddy - Documentation

## Overview

SQL Query Buddy is a conversational AI agent that converts natural language questions into SQL queries, executes them, and provides AI-driven insights. Built with LangChain, Vector Databases, and modern web technologies.

## Getting Started

### Prerequisites
- Node.js (v18.x or higher)
- npm (comes with Node.js)
- API key from at least one supported provider (OpenAI, Cohere, AI21, or Google Gemini)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/jorgenyc/sql-query-buddy.git
   cd sql-query-buddy
   ```

2. **Install dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Configure API keys**
   - Copy `.env.example` to `.env`
   - Add at least one API key:
     ```
     OPENAI_API_KEY=your-key-here
     # OR
     COHERE_API_KEY=your-key-here
     # OR
     AI21_API_KEY=your-key-here
     # OR
     GEMINI_API_KEY=your-key-here
     ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open in browser**
   - Navigate to `http://localhost:3001`

## How to Use

### Basic Querying

1. **Enter your question** in natural language
   - Example: "Show me the top 5 customers by total sales"
   - Example: "What products were sold in California last month?"

2. **View results** which include:
   - Generated SQL query
   - Query explanation
   - Database results
   - AI-driven insights
   - Optimization suggestions

### Multi-Provider Support

**Currently Implemented Providers:**

SQL Query Buddy supports multiple AI providers:
- **OpenAI** (Fully Supported)
  - Models: gpt-4o-mini (default), gpt-3.5-turbo, gpt-4o, gpt-4-turbo
  - Provides both LLM and embeddings
  - Recommended for best results

- **Cohere** (Partial Support)
  - Models: command-r, command-r-plus
  - **⚠️ Requires OpenAI API key** for embeddings (uses OpenAI embeddings, Cohere LLM)

- **AI21** (Partial Support)
  - Models: j2-light, j2-mid, j2-ultra
  - **⚠️ Requires OpenAI API key** for embeddings (uses OpenAI embeddings, AI21 LLM)

**Note**: Other providers listed in `vendor_config.json` (Google Gemini, Anthropic, Mistral, Groq, Together, OpenRouter, AWS Bedrock) are configured but not yet implemented in code.

### Power User Mode

The application can be configured to restrict provider/model selection via `server/app-config.json`:

- **Power User Disabled** (`power_user: false`):
  - API settings drawer is hidden
  - Provider/model selection is locked
  - App uses OpenAI `gpt-4o-mini` by default
  - Provider switching endpoints are disabled

- **Power User Enabled** (`power_user: true`):
  - Full access to all provider/model features
  - API settings drawer is visible

**Note**: If `app-config.json` doesn't exist, defaults to `power_user: true` for backward compatibility.

### Switching Providers

**Note**: Provider switching is only available when Power User Mode is enabled.

1. Click the **"AI Settings"** button on the right side
2. Select a provider from the table
3. Choose a model from the dropdown
4. The system will automatically use your selection for new queries

### Query History & Per-Tab Context

- Each query creates a new tab
- Tabs are automatically named based on your query
- **Per-Tab Context**: Each tab maintains its own independent conversation context
- **Fresh Start**: "New Query" tabs begin with cleared context
- Click between tabs to view previous queries and results
- Close tabs using the X button (except "New Query" tab)
- Follow-up queries within the same tab reference previous results

### Dark Mode

- Toggle dark mode using the moon/sun icon in the header
- Your preference is saved and restored on next visit

## Advanced Features

### RAG-Powered SQL Generation

The system uses Retrieval-Augmented Generation (RAG) to:
- Search database schema using vector similarity
- Find relevant table information
- Generate context-aware SQL queries

### Query Optimization

After each query, the AI provides:
- Performance improvement suggestions
- Index recommendations
- JOIN optimization tips

### Advanced Analysis Tools

Automatic statistical analysis for query results:
- **Statistical Summary**: Mean, median, mode, standard deviation, quartiles, IQR, range
- **Correlation Matrix**: Pearson correlation coefficients between numeric columns
- **Trend Analysis**: Growth rates, CAGR, period-over-period changes

### Geographic Visualization

Automatic map rendering for geographic data:
- **US State Map**: Detects state/region columns in results
- **Heatmap Coloring**: Visual representation of numeric data by state
- **Interactive Tooltips**: Hover to see detailed state information

### Query Templates

Pre-built query templates for common use cases:
- Access via "Templates" button
- One-click execution
- Common patterns: Top customers, revenue by region, monthly trends

### Compare Mode

Side-by-side query comparison:
- Compare results from different queries simultaneously
- Test same query with different AI providers
- Compare different models side-by-side

### Data Visualization

Query results with numeric data automatically generate charts using Chart.js:
- Bar charts for categorical data
- Line charts for time series (prioritized for chronological data)
- Supports up to 50 data points for chronological data, 20 for others
- Charts adapt to dark/light theme

### Query Statistics

Real-time query performance metrics displayed in a horizontal HUD bar:
- Provider & Model used
- Time of Query
- Context Iteration (number of queries in conversation)
- Tokens Used
- Latency
- Estimated Cost

## Troubleshooting

### API Key Issues

If you see errors about API keys:
1. Check that your `.env` file is in the `server/` directory
2. Verify the API key format is correct (no extra spaces)
3. Ensure the provider is enabled in `vendor_config.json`
4. Test the API key using the "Test API" button in AI Settings

### Query Failures

If queries fail:
1. Check the browser console for error messages
2. Verify your database connection
3. Ensure your question is related to database queries
4. Try rephrasing your question

### Performance Issues

- Large result sets may take longer to process
- Charts are limited to 20 data points for performance
- Consider using more specific queries for better performance

## API Endpoints

- `POST /api/query` - Submit a natural language query
- `GET /api/providers` - Get list of available providers
- `POST /api/providers/configure` - Configure API key for a provider
- `POST /api/providers/test-key` - Test an API key
- `POST /api/providers/delete-key` - Delete an API key
- `GET /api/health` - Health check endpoint

## Support

For issues, questions, or contributions:
- Open an issue on [GitHub](https://github.com/jorgenyc/sql-query-buddy/issues)
- Check the [README.md](../README.md) for more information

