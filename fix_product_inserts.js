#!/usr/bin/env node

import fs from 'fs';

// Read the test file
const filePath = '/workspace/pos/src/db/004_inventory_management.test.js';
let content = fs.readFileSync(filePath, 'utf8');

// Pattern to match product INSERT statements
const productInsertPattern = /INSERT INTO product \([^)]+\)\s*VALUES \([^)]+\)/g;

// Find all matches
const matches = [...content.matchAll(productInsertPattern)];

console.log(`Found ${matches.length} product INSERT statements`);

// Process each match
for (const match of matches) {
  const originalStatement = match[0];
  
  // Skip if already has created_time
  if (originalStatement.includes('created_time')) {
    console.log('Skipping already updated statement');
    continue;
  }
  
  // Extract the column list and values list
  const insertMatch = originalStatement.match(/INSERT INTO product \(([^)]+)\)\s*VALUES \(([^)]+)\)/);
  if (!insertMatch) continue;
  
  const columns = insertMatch[1];
  const values = insertMatch[2];
  
  // Add created_time and updated_time to columns
  const newColumns = columns + ', created_time, updated_time';
  
  // Add timestamp placeholders to values
  const newValues = values + ', ?, ?';
  
  // Create the new statement
  const newStatement = `INSERT INTO product (${newColumns}) VALUES (${newValues})`;
  
  console.log('Original:', originalStatement);
  console.log('New:', newStatement);
  
  // Replace in content
  content = content.replace(originalStatement, newStatement);
}

// Now we need to update the .run() calls to include the timestamp values
// Pattern to match .run() calls after product INSERT
const runPattern = /`\)\.run\(([^)]+)\)\.lastInsertRowid;/g;

// Find all .run() calls and add timestamp values
content = content.replace(runPattern, (match, params) => {
  // Check if this is after a product INSERT by looking backwards
  const beforeMatch = content.substring(0, content.indexOf(match));
  const lastInsertIndex = beforeMatch.lastIndexOf('INSERT INTO product');
  if (lastInsertIndex === -1) return match;
  
  const insertStatement = content.substring(lastInsertIndex, content.indexOf(match, lastInsertIndex));
  
  // Skip if already has timestamp values or doesn't have created_time in columns
  if (!insertStatement.includes('created_time') || params.includes('Math.floor(Date.now()')) {
    return match;
  }
  
  // Add timestamp values
  const newParams = params + ', Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)';
  return `\`).run(${newParams}).lastInsertRowid;`;
});

// Write the updated content back
fs.writeFileSync(filePath, content);

console.log('Updated product INSERT statements');