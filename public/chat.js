/**
 * AI Chat Frontend for SQLite-Based Accounting Assistant
 *
 * This frontend application provides a chat interface for an accounting LLM assistant
 * that can interact with a SQLite accounting database running in the browser via WebAssembly.
 *
 * Key Features:
 * - Web-based chat UI for natural language accounting queries
 * - SQLite database management using sql.js (WASM)
 * - Integration with Gemma 3 LLM for intelligent accounting assistance
 * - Function calling system for database operations
 * - Real-time table display for query results
 *
 * Function Calls Available to Gemma 3:
 * - write_sqlite_query(query=single_statement_query): Execute mutation queries (INSERT, UPDATE, DELETE)
 * - read_sqlite_query(query=single_statement_query): Execute read queries (SELECT) and display results as table
 *
 * Architecture:
 * - Frontend: HTML5 + CSS3 + Vanilla JavaScript
 * - Database: SQLite via sql.js WebAssembly
 * - AI Model: Gemma 3 via OpenAI-compatible API
 * - Schema: Double-entry accounting system with multi-currency support
 *
 * @author Your Name
 * @version 1.0.0
 * @license MIT
 */

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

const SCHEMA_FILES = [
  '/sqlite/001_core_accounting.sql',
  '/sqlite/002_finance_reporting.sql',
  '/sqlite/003_asset_register.sql',
  '/sqlite/004_foreign_exchange.sql',
];

const OPENAI_URL_KEY = 'openai_api_url';

// ============================================================================
// GLOBAL STATE VARIABLES
// ============================================================================

let db = null;                    // SQLite database instance
let SQL = null;                   // sql.js library instance
let chatHistory = [];             // History sent to model (includes function calls)
let displayHistory = [];          // History for display (natural language only)
let isFirstUserMessage = true;    // Flag for Gemma 3 system prompt handling
let systemPrompt = null;          // System prompt content

// ============================================================================
// DOM ELEMENT REFERENCES
// ============================================================================

const chatDiv = document.getElementById('chat');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const apiKeyInput = document.getElementById('api-key');
const openaiUrlInput = document.getElementById('openai-url');

// ============================================================================
// UTILITY FUNCTIONS FOR LOCAL STORAGE PERSISTENCE
// ============================================================================

/**
 * Initialize localStorage persistence for OpenAI URL
 * Loads saved URL on page load and saves changes automatically
 */
function initializeUrlPersistence() {
  // Load from localStorage on page load
  const savedUrl = localStorage.getItem(OPENAI_URL_KEY);
  if (savedUrl) {
    openaiUrlInput.value = savedUrl;
  }

  // Save to localStorage on change
  openaiUrlInput.addEventListener('input', () => {
    localStorage.setItem(OPENAI_URL_KEY, openaiUrlInput.value.trim());
  });
}

// ============================================================================
// UI AND MESSAGE HANDLING FUNCTIONS
// ============================================================================

/**
 * Add a message to the chat display
 * @param {string} role - Message role ('user' or 'assistant')
 * @param {string} content - Message content
 * @param {boolean} isTable - Whether content is HTML table
 */
function addMessage(role, content, isTable = false) {
  // Check if user is near the bottom before adding message
  const isAtBottom = chatDiv.scrollHeight - chatDiv.scrollTop - chatDiv.clientHeight < 10;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg ' + role;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (isTable) {
    bubble.innerHTML = content;
  } else if (role === 'assistant') {
    // Render markdown for assistant messages
    if (window.marked) {
      bubble.innerHTML = window.marked.parse(content);
    } else {
      bubble.textContent = content;
    }
  } else {
    bubble.textContent = content;
  }

  msgDiv.appendChild(bubble);
  chatDiv.appendChild(msgDiv);

  // Only scroll to bottom if user was already at the bottom
  if (isAtBottom) {
    chatDiv.scrollTop = chatDiv.scrollHeight;
  }
}

// ============================================================================
// DATABASE INITIALIZATION AND MANAGEMENT
// ============================================================================

/**
 * Load and execute SQL schema files into the database
 * Removes comments and handles SQL execution errors gracefully
 */
async function loadSchemas() {
  const sqlPromises = SCHEMA_FILES.map(url => fetch(url).then(r => r.text()));
  const schemas = await Promise.all(sqlPromises);

  for (const schema of schemas) {
    // Remove multiline and single-line comments
    let cleaned = schema
      .replace(/\/\*[\s\S]*?\*\//g, '') // remove /* ... */
      .replace(/--.*$/gm, ''); // remove -- ...

    try {
      db.run(cleaned);
    } catch (e) {
      console.warn('SQL error:', e, cleaned);
    }
  }
}

/**
 * Initialize SQLite database in browser using sql.js WebAssembly
 */
async function initDB() {
  SQL = await initSqlJs({
    locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/${file}`,
  });
  db = new SQL.Database();
  await loadSchemas();
}

/**
 * Execute SQL query and return structured result
 * @param {string} query - SQL query to execute
 * @returns {Object} Result object with columns, values, or error
 */
function runSQL(query) {
  try {
    const stmt = db.prepare(query);
    const columns = stmt.getColumnNames();
    const values = [];

    while (stmt.step()) {
      values.push(stmt.get());
    }

    stmt.free();
    return { columns, values };
  } catch (e) {
    return { error: e.message };
  }
}

// ============================================================================
// AI MODEL INTEGRATION (GEMMA 3)
// ============================================================================

/**
 * Call Gemma 3 LLM via OpenAI-compatible API
 * Gemma 3 uses 'user' and 'model' roles (no system/function roles)
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Object} API response object
 */
async function callGemma(messages) {
  const apiKey = apiKeyInput.value.trim();
  let openaiUrl = openaiUrlInput.value.trim();

  if (!openaiUrl) {
    return {
      choices: [
        {
          message: {
            role: 'model',
            content: 'Gemma API URL is required. Please provide the endpoint URL to use AI features.',
          },
        },
      ],
    };
  }

  const body = {
    model: 'gemma-3',
    messages,
    stream: false,
  };

  const headers = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = 'Bearer ' + apiKey;
  }

  const res = await fetch(openaiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error('Gemma API error: ' + res.status);
  return res.json();
}

// ============================================================================
// FUNCTION CALLING SYSTEM
// ============================================================================

/**
 * Parse and execute write_sqlite_query function call
 * @param {string} sql - SQL query to execute
 * @returns {string} Execution result message
 */
function executeWriteQuery(sql) {
  try {
    runSQL(sql);
    return 'executed';
  } catch (e) {
    return 'failed: ' + e.message;
  }
}

/**
 * Parse and execute read_sqlite_query function call
 * @param {string} sql - SQL query to execute
 * @returns {string} CSV formatted result
 */
function executeReadQuery(sql) {
  let result = runSQL(sql);
  let csv = '';

  if (result.error) {
    csv = 'error,' + result.error;
  } else if (result.columns && result.values) {
    csv = result.columns.join(',') + '\n';
    csv += result.values.map(row =>
      row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','),
    ).join('\n');
  } else {
    csv = '';
  }

  return csv;
}

/**
 * Parse and display table from CSV data
 * @param {string} csv - CSV data with headers
 */
function displayTableFromCSV(csv) {
  // Remove possible surrounding quotes
  if (csv.startsWith('"') && csv.endsWith('"')) {
    csv = csv.slice(1, -1);
  }

  // Unescape double quotes
  csv = csv.replace(/""/g, '"');

  // Parse CSV to HTML table
  let rows = csv.split(/\r?\n/).filter(Boolean).map(line => {
    // Split by comma, but handle quoted commas
    const re = /(?:"([^"]*(?:""[^"]*)*)"|([^",]+))/g;
    let row = [];
    let match;
    let lineCopy = line;

    while ((match = re.exec(lineCopy)) !== null) {
      row.push(match[1] ? match[1].replace(/""/g, '"') : (match[2] || ''));
    }

    return row;
  });

  let html = '<table><thead><tr>';

  if (rows.length > 0) {
    for (const col of rows[0]) {
      html += `<th>${col}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (let i = 1; i < rows.length; ++i) {
      html += '<tr>' + rows[i].map(cell => `<td>${cell}</td>`).join('') + '</tr>';
    }

    html += '</tbody></table>';
  } else {
    html = '<em>No result</em>';
  }

  addMessage('assistant', html, true);
  displayHistory.push({ role: 'assistant', content: '[table]' });
}

// ============================================================================
// MAIN CHAT LOGIC AND EVENT HANDLING
// ============================================================================

/**
 * Handle user input and manage conversation flow with function calling
 * @param {Event} e - Form submit event
 */
async function handleUserInput(e) {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  addMessage('user', text);
  displayHistory.push({ role: 'user', content: text });
  userInput.value = '';
  sendBtn.disabled = true;

  // For Gemma 3: first user message acts as system prompt
  if (isFirstUserMessage) {
    chatHistory = [{ role: 'user', content: text }];
    isFirstUserMessage = false;
  } else {
    chatHistory.push({ role: 'user', content: text });
  }

  let response = await callGemma([...chatHistory]);
  let msg = response.choices[0].message;

  // Check if response contains function calls and replace them with execution results
  if (msg.content) {
    let processedContent = msg.content;
    let hasDisplayedTable = false;

    // Handle write_sqlite_query function calls
    let writeMatch = processedContent.match(/\[write_sqlite_query\(query=(.*?)\)\]/);
    if (writeMatch && writeMatch[1]) {
      let sql = writeMatch[1];
      let result = executeWriteQuery(sql);

      // Replace function call with execution result in the message
      processedContent = processedContent.replace(
        /\[write_sqlite_query\(query=.*?\)\]/,
        `Query executed successfully: ${result}`,
      );
    }

    // Handle read_sqlite_query function calls
    let readMatch = processedContent.match(/\[read_sqlite_query\(query=(.*?)\)\]/);
    if (readMatch && readMatch[1]) {
      let sql = readMatch[1];
      let csv = executeReadQuery(sql);

      // Display the table to user
      if (csv && !csv.startsWith('error,')) {
        displayTableFromCSV(csv);
        hasDisplayedTable = true;
      }

      // Replace function call with execution summary
      processedContent = processedContent.replace(
        /\[read_sqlite_query\(query=.*?\)\]/,
        csv.startsWith('error,') ? `Error: ${csv.substring(6)}` : 'Query results displayed above.',
      );
    }

    // Only display the processed message if it has meaningful content
    if (processedContent.trim() && !processedContent.match(/^\[.*\]$/)) {
      addMessage('assistant', processedContent);
      displayHistory.push({ role: 'assistant', content: processedContent });
      chatHistory.push({ role: 'model', content: processedContent });
    } else if (hasDisplayedTable) {
      // If we only displayed a table without additional text, add a generic response
      displayHistory.push({ role: 'assistant', content: '[table displayed]' });
      chatHistory.push({ role: 'model', content: 'Here are the query results.' });
    }
  }

  sendBtn.disabled = false;
}

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

/**
 * Initialize the application on page load
 * Sets up database, loads system prompt, and configures event handlers
 */
(async function initializeApp() {
  try {
    // Initialize URL persistence
    initializeUrlPersistence();

    // Initialize database
    await initDB();

    // Fetch and load system prompt
    const res = await fetch('/chat-system-prompt.txt');
    if (res.ok) {
      systemPrompt = await res.text();
      // Set as the first user message in chatHistory for Gemma 3
      chatHistory = [
        { role: 'user', content: systemPrompt },
        { role: 'model', content: 'Hi there, I am your accounting assistant. How can I help you today?' },
      ];
      isFirstUserMessage = false;
    } else {
      console.warn('Failed to fetch system prompt.');
    }

    // Set up event handlers
    document.getElementById('input-area').addEventListener('submit', handleUserInput);

  } catch (error) {
    console.error('Error initializing application:', error);
  }
})();
