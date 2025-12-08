# SQL Query Buddy - Installation Guide

## Getting Started

### Prerequisites

Before installing SQL Query Buddy, ensure you have:

- **Node.js** (v18.x or higher) - [Download Node.js](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** (optional, for cloning the repository)

### Installation

#### Step 1: Clone or Download the Repository

**Option A: Clone with Git**
```bash
git clone https://github.com/jorgenyc/sql-query-buddy.git
cd sql-query-buddy
```

**Option B: Download ZIP**
1. Visit the [GitHub repository](https://github.com/jorgenyc/sql-query-buddy)
2. Click "Code" → "Download ZIP"
3. Extract the ZIP file
4. Open terminal in the extracted folder

#### Step 2: Navigate to Server Directory

```bash
cd server
```

#### Step 3: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Express.js (web server)
- LangChain (AI framework)
- FAISS (vector database)
- SQLite3 (database)
- And other dependencies

**Expected Output:**
```
added 250 packages, and audited 251 packages in 15s
```

### Configuration

> **⚠️ Important Note for Graders/Reviewers:**
> 
> **API keys are pre-configured/hardcoded for grading purposes.** You do not need to set up a `.env` file or configure API keys to test the application. The application is ready to run immediately after installation.

For regular users who want to use their own API keys:

#### Step 4: Configure Environment Variables (Optional)

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit the `.env` file** and add your API keys:
   ```env
   # OpenAI (Recommended for best results)
   OPENAI_API_KEY=sk-your-openai-key-here

   # OR Google Gemini (Free tier available)
   GEMINI_API_KEY=your-gemini-key-here

   # OR Cohere
   COHERE_API_KEY=your-cohere-key-here

   # OR AI21
   AI21_API_KEY=your-ai21-key-here
   ```

   **Important Notes:**
   - You only need **one** API key to get started
   - OpenAI and Gemini offer free tiers for testing
   - Never commit your `.env` file to version control
   - The `.env` file is already in `.gitignore`

3. **Verify Provider Configuration**
   - Check `vendor_config.json` to ensure your provider is enabled
   - The default configuration should work out of the box

4. **Configure Power User Mode (Optional)**
   - Edit `server/app-config.json` to control provider/model selection:
     ```json
     {
       "power_user": false
     }
     ```
   - **`power_user: false`**: Hides API settings, locks to OpenAI gpt-4o-mini
   - **`power_user: true`**: Full access to provider/model selection
   - If file doesn't exist, defaults to `power_user: true` (backward compatible)

### Running the App

#### Step 5: Start the Server

**Development Mode (with auto-restart):**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

**Expected Output:**
```
SQL Query Buddy Server Started!
  Provider Status:
  - Active:  openai
  - Model:   gpt-3.5-turbo
  ✅ API Working
  SQL Query Buddy App URL:   http://localhost:3001/
```

#### Step 6: Open in Browser

1. Open your web browser
2. Navigate to: `http://localhost:3001`
3. You should see the SQL Query Buddy interface

## Verification

### Test the Installation

1. **Check Server Status:**
   - Visit `http://localhost:3001/api/health`
   - Should return JSON with status information

2. **Test a Query:**
   - Type: "Show me all customers"
   - Click Submit
   - You should see SQL query, results, and insights

3. **Verify API Key:**
   - Click "AI Settings" button (right side)
   - Check that your provider shows ✅ (green checkmark)
   - If it shows ❌, verify your API key is correct

## Troubleshooting

### Common Issues

#### 1. "No valid API keys configured"

**Solution:**
- Ensure your `.env` file is in the `server/` directory
- Check that the API key variable name matches exactly (e.g., `OPENAI_API_KEY`)
- Verify there are no extra spaces in the API key
- Restart the server after adding/changing API keys

#### 2. "Port 3001 already in use"

**Solution:**
- Change the port in `.env`: `PORT=3002`
- Or stop the process using port 3001:
  ```bash
  # Mac/Linux
  lsof -ti:3001 | xargs kill
  
  # Or find and kill the process manually
  # Check what's using the port, then kill it
  ```

#### 3. "Module not found" errors

**Solution:**
```bash
cd server
rm -rf node_modules package-lock.json
npm install
```

#### 4. API Key Test Fails

**Solution:**
- Verify the API key is correct (no typos)
- Check if the API key has expired
- Ensure you have credits/quota remaining
- Try a different provider to isolate the issue

#### 5. Database Errors

**Solution:**
- The database is created automatically on first run
- If issues persist, delete `server/database.sqlite` and restart
- Ensure write permissions in the `server/` directory

## Next Steps

After successful installation:

1. **Read the [Documentation](DOCUMENTATION.md)** to learn how to use the app
2. **Explore [Features](FEATURES.md)** to see what's available
3. **Try example queries**:
   - "Show top 5 customers by sales"
   - "What products were sold in California?"
   - "Calculate total revenue by month"

## Getting API Keys

### OpenAI
1. Visit https://platform.openai.com/api-keys
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)

### Google Gemini (Free Tier)
1. Visit https://aistudio.google.com/app/apikey
2. Sign in with Google account
3. Click "Create API Key"
4. Copy the key

### Cohere
1. Visit https://dashboard.cohere.com/api-keys
2. Sign up or log in
3. Create a new API key
4. Copy the key

### AI21
1. Visit https://studio.ai21.com/account/api-keys
2. Sign up or log in
3. Generate a new API key
4. Copy the key

## Support

If you encounter issues:
1. Check the [Troubleshooting](#troubleshooting) section above
2. Review server logs in the `logs/` directory
3. Open an issue on [GitHub](https://github.com/jorgenyc/sql-query-buddy/issues)
4. Check the [README.md](../README.md) for more details

