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
  
  // Check if this line contains INSERT INTO inventory_transaction
  if (line.includes('INSERT INTO inventory_transaction (')) {
    // Look forward to find the column list and VALUES clause
    let columnLine = line;
    let j = i + 1;
    
    // Find the complete column list
    while (j < lines.length && !lines[j].includes(') VALUES (')) {
      columnLine += ' ' + lines[j].trim();
      j++;
    }
    
    // Check if created_time is already in the column list
    if (!columnLine.includes('created_time')) {
      // Add created_time to the column list
      const updatedLine = line.replace('INSERT INTO inventory_transaction (', 'INSERT INTO inventory_transaction (');
      
      // Find the line with the closing parenthesis before VALUES
      for (let k = i; k <= j; k++) {
        if (lines[k].includes(') VALUES (')) {
          // Add created_time before the closing parenthesis
          const valuesLine = lines[k];
          const beforeValues = valuesLine.substring(0, valuesLine.indexOf(') VALUES ('));
          const afterValues = valuesLine.substring(valuesLine.indexOf(') VALUES ('));
          
          newLines.push(line); // Original INSERT line
          
          // Add intermediate lines
          for (let m = i + 1; m < k; m++) {
            newLines.push(lines[m]);
          }
          
          // Add the modified VALUES line with created_time
          const newValuesLine = beforeValues + ', created_time' + afterValues.replace('VALUES (', 'VALUES (').replace('?)', '?, ?)');
          newLines.push(newValuesLine);
          
          console.log('Updated inventory_transaction INSERT at line', i + 1);
          
          // Skip to after this INSERT statement
          i = k;
          break;
        }
      }
      continue;
    }
  }
  
  newLines.push(line);
}

// Now update the .run() calls to include created_time value
const finalContent = newLines.join('\n');
const updatedContent = finalContent.replace(
  /(`\)\.run\([^)]+)\)\.lastInsertRowid;/g,
  (match, runCall) => {
    // Check if this is after an inventory_transaction INSERT
    const beforeMatch = finalContent.substring(0, finalContent.indexOf(match));
    const lastInsertIndex = beforeMatch.lastIndexOf('INSERT INTO inventory_transaction');
    if (lastInsertIndex === -1) return match;
    
    const insertStatement = finalContent.substring(lastInsertIndex, finalContent.indexOf(match, lastInsertIndex));
    
    // Check if this INSERT has created_time and the run call doesn't already have enough parameters
    if (insertStatement.includes('created_time') && !runCall.includes('Math.floor(Date.now() / 1000)')) {
      // Count the number of ? placeholders in the INSERT
      const questionMarks = (insertStatement.match(/\?/g) || []).length;
      
      // Count the number of parameters in the run call
      const runParams = runCall.substring(runCall.indexOf('(') + 1);
      const paramCount = runParams.split(',').length;
      
      // If we need one more parameter for created_time
      if (questionMarks === paramCount + 1) {
        return runCall + ', Math.floor(Date.now() / 1000)).lastInsertRowid;';
      }
    }
    
    return match;
  }
);

// Write the updated content back
fs.writeFileSync(filePath, updatedContent);

console.log('Updated inventory_transaction INSERT statements');