#!/usr/bin/env node

import fs from 'fs';

// Read the test file
const filePath = '/workspace/pos/src/db/004_inventory_management.test.js';
let content = fs.readFileSync(filePath, 'utf8');

// Split content into lines for easier processing
const lines = content.split('\n');
const newLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Check if this line contains a .run() call after a product INSERT
  if (line.includes('.run(') && line.includes('.lastInsertRowid')) {
    // Look backwards to find the INSERT statement
    let foundProductInsert = false;
    for (let j = i - 1; j >= 0; j--) {
      if (lines[j].includes('INSERT INTO product')) {
        foundProductInsert = true;
        break;
      }
      if (lines[j].includes('INSERT INTO') && !lines[j].includes('INSERT INTO product')) {
        break; // Found a different INSERT, stop looking
      }
    }
    
    if (foundProductInsert && !line.includes('Math.floor(Date.now()')) {
      // Check if the INSERT has created_time by looking backwards
      let hasCreatedTime = false;
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j].includes('INSERT INTO product')) {
          // Look forward from this line to find the column list
          for (let k = j; k <= i; k++) {
            if (lines[k].includes('created_time')) {
              hasCreatedTime = true;
              break;
            }
          }
          break;
        }
      }
      
      if (hasCreatedTime) {
        // Add timestamp values to the .run() call
        const runMatch = line.match(/^(\s*`\)\.run\()([^)]+)(\)\.lastInsertRowid;.*)$/);
        if (runMatch) {
          const newLine = runMatch[1] + runMatch[2] + ', Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)' + runMatch[3];
          console.log('Updated line:', line.trim());
          console.log('To:', newLine.trim());
          newLines.push(newLine);
          continue;
        }
      }
    }
  }
  
  newLines.push(line);
}

// Write the updated content back
fs.writeFileSync(filePath, newLines.join('\n'));

console.log('Updated product .run() calls');