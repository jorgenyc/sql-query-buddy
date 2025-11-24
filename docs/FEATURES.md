# SQL Query Buddy - Features

## Core Features

### 1. Conversational Querying

Ask complex, natural language questions and get SQL queries generated automatically:

- **Natural Language Input**: Type questions in plain English
- **Context Awareness**: The system remembers previous queries in the conversation
- **Follow-up Questions**: Use pronouns like "them", "those", "it" to reference previous results
- **Example Queries**:
  - "Show top 5 customers by total sales"
  - "Now filter them to California only"
  - "What's the total revenue from them this year?"

### 2. RAG-Powered SQL Generation

Uses Retrieval-Augmented Generation (RAG) architecture:

- **Vector Database Search**: Uses FAISS to semantically search database schemas
- **Context-Aware**: Finds relevant table information before generating SQL
- **Multi-Table Support**: Understands relationships across multiple tables
- **Accurate Queries**: Generates correct SQL based on actual schema structure

### 3. Multi-Provider LLM Support

Switch between different AI providers and models:

- **OpenAI**: GPT-3.5-turbo, GPT-4
- **Cohere**: Command models
- **AI21**: Jurassic models
- **Google Gemini**: Gemini Pro

**Benefits**:
- Compare results across different models
- Optimize costs by choosing cheaper models
- Fallback options if one provider is unavailable
- Test query quality across different AI systems

### 4. Query Optimization

Automatic performance suggestions:

- **JOIN Optimization**: Suggests faster JOIN strategies
- **Index Recommendations**: Identifies where indexes would help
- **Aggregation Tips**: Optimizes GROUP BY and aggregation queries
- **Performance Analysis**: Explains why optimizations would improve speed

### 5. AI-Driven Insights

Intelligent data analysis:

- **Pattern Recognition**: Identifies trends and anomalies
- **Contextual Summaries**: Explains what the data means
- **Business Insights**: Highlights important findings
- **Example Insights**:
  - "Sales in California grew 15% month-over-month"
  - "Customer Alice Chen contributed 22% of total Q1 revenue"
  - "Product category Electronics accounts for 40% of total sales"

### 6. Explainable SQL

Beginner-friendly explanations:

- **Plain English Descriptions**: Each query includes a clear explanation
- **Learning Tool**: Helps users understand SQL concepts
- **Example**: "This query selects the top 5 customers by summing their total order amounts and sorting them in descending order."

### 7. Per-Tab Context Isolation

Isolated conversation memory per tab:

- **Independent Memory**: Each tab has its own BufferMemory instance
- **Fresh Start**: "New Query" tabs begin with cleared context
- **Context Continuity**: Switching tabs preserves each tab's conversation history
- **Follow-up Support**: Understands references to previous queries within the same tab
- **Natural Flow**: Enables human-like conversation patterns
- **Tab-Based Sessions**: Multiple independent conversation contexts

### 8. Advanced Analysis Tools

Automatic statistical analysis for query results:

- **Statistical Summary**: Mean, median, mode, standard deviation, quartiles, IQR, range
- **Correlation Matrix**: Pearson correlation coefficients between numeric columns with color-coded visualization
- **Trend Analysis**: Growth rates, CAGR, period-over-period changes, trend direction
- **Auto-Detection**: Automatically generated when relevant data is present

### 9. Geographic Visualization

Automatic map rendering for geographic data:

- **US State Map**: Detects state/region columns in results
- **Heatmap Coloring**: Visual representation of numeric data by state
- **Interactive Tooltips**: Hover to see detailed state information
- **Auto-Detection**: Automatically renders when geographic data is detected

### 10. Query Templates

Pre-built query templates for common use cases:

- **Quick Start**: Access via "Templates" button
- **Common Patterns**: Top customers, revenue by region, monthly trends
- **One-Click Execution**: Select template to run immediately
- **Template Library**: Growing collection of useful query patterns

### 11. Compare Mode

Side-by-side query comparison:

- **Multiple Queries**: Compare results from different queries simultaneously
- **Provider Comparison**: Test same query with different AI providers
- **Model Comparison**: Compare different models side-by-side
- **Performance Metrics**: Compare latency, tokens, and costs across providers

### 12. Query Statistics (Tron HUD Style)

Real-time query performance metrics:

- **Provider & Model**: Shows which AI provider and model was used
- **Time of Query**: Timestamp of when query was executed
- **Context Iteration**: Number of queries in current conversation
- **Tokens Used**: Total tokens consumed by the query
- **Latency**: Query execution time
- **Est. Cost**: Estimated API cost for the query
- **Responsive Design**: Hides less critical metrics on smaller screens

### 13. Data Visualization

Automatic chart generation:

- **Chart.js Integration**: Creates interactive charts from query results
- **Auto-Detection**: Automatically detects chart type (bar, line)
- **Chronological Priority**: Line charts for time-series data
- **Dark Mode Support**: Charts adapt to light/dark theme
- **Multiple Datasets**: Supports comparing multiple numeric columns

### 14. Modern Web Interface

User-friendly design:

- **Clean Chat Interface**: Modern, responsive design with "cyber/glass" theme
- **Tab Management**: Organize multiple queries in tabs
- **Dark Mode**: Full dark theme with persistent preference
- **Real-time Progress**: Live updates during query processing via SSE
- **Query History**: Access and review past queries
- **Frosted Glass UI**: Modern glassmorphism design elements

### 15. Query History Management

Organized query sessions:

- **Automatic Tab Creation**: New tab for each query
- **Tab Naming**: Tabs automatically named based on query content
- **Session Persistence**: History saved in browser localStorage
- **Quick Access**: Switch between queries instantly
- **Context Preservation**: Each tab maintains its own conversation context

### 16. Provider Management

Easy API key configuration:

- **Visual Status Indicators**: See which providers are configured (✅/❌)
- **One-Click Testing**: Test API keys before saving
- **Key Validation**: Validates keys before storing
- **Secure Storage**: Keys saved to `.env` file (not in code)
- **Provider Status**: Real-time API health checks
- **Cost Estimation**: Shows estimated costs per query

### 17. Security Features

Built-in safety measures:

- **Read-Only Queries**: Only SELECT statements are generated
- **SQL Injection Prevention**: No user input directly in SQL
- **API Key Protection**: Keys stored securely in `.env` file
- **Input Sanitization**: All user input is sanitized
- **CSP Headers**: Content Security Policy for XSS protection
- **Rate Limiting**: Prevents API abuse

## Technical Features

### Architecture
- **RAG Implementation**: Vector database for schema retrieval
- **LangChain Integration**: Professional AI agent framework
- **Express.js Backend**: Fast, reliable server
- **SQLite Database**: Lightweight, file-based database

### Performance
- **Streaming Responses**: Real-time progress updates via SSE
- **Efficient Vector Search**: Fast schema retrieval (top 3 chunks)
- **Optimized Queries**: AI suggests performance improvements
- **Database Optimizations**: 15 indexes, 8 pre-computed views, PRAGMA settings
- **Query Timeout**: 30-second timeout prevents long-running queries
- **Busy Timeout**: 5-second timeout handles concurrent database access
- **WAL Checkpointing**: Automatic checkpointing every 100 queries
- **Context Window Management**: Smart truncation to prevent context overflow
- **Caching**: Conversation context cached in memory per tab

### Developer Experience
- **Comprehensive Logging**: Detailed logs for debugging
- **Error Handling**: Graceful error messages
- **Health Check Endpoint**: Monitor system status
- **Modular Code**: Clean, maintainable architecture

## Future Enhancements

Planned features (see [README.md](../README.md) for details):
- Support for PostgreSQL and MySQL
- Query result export (CSV, JSON)
- User authentication
- Advanced visualization options
- Query performance analytics dashboard
- Natural language query suggestions
- Multi-database connection support

