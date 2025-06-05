/**
 * Starling Bank PDF statement parser
 * Extracts transactions from Starling Bank PDF statements
 */
const pdf = require("pdf-parse")

/**
 * Parse a Starling Bank PDF statement
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Object} Parsed statement data
 */
async function parseStarlingStatement(buffer) {
  try {
    console.log("Starting Starling Bank PDF parsing...")

    // Extract text from PDF
    const data = await pdf(buffer)
    const text = data.text

    console.log(`Extracted ${text.length} characters from PDF`)

    // Log a sample of the text to help with debugging
    console.log("Sample text from PDF (first 200 chars):", text.substring(0, 200).replace(/\n/g, "\\n"))

    // Split text into lines
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    console.log(`Processing ${lines.length} lines for transactions...`)

    // Log some sample lines to help with debugging
    console.log("Sample lines (5-10):", lines.slice(5, 10))

    // Try multiple approaches to find transactions

    // Approach 1: Look for date patterns and extract transactions
    console.log("Approach 1: Looking for date patterns...")
    const dateTransactions = extractTransactionsByDatePattern(lines)
    if (dateTransactions.length > 0) {
      console.log(`Found ${dateTransactions.length} transactions using date pattern approach`)
      return {
        success: true,
        transactions: dateTransactions,
        accountInfo: extractAccountInfo(text),
        transactionCount: dateTransactions.length,
      }
    }

    // Approach 2: Look for transaction sections
    console.log("Approach 2: Looking for transaction sections...")
    const sectionTransactions = extractTransactionsBySection(lines)
    if (sectionTransactions.length > 0) {
      console.log(`Found ${sectionTransactions.length} transactions using section approach`)
      return {
        success: true,
        transactions: sectionTransactions,
        accountInfo: extractAccountInfo(text),
        transactionCount: sectionTransactions.length,
      }
    }

    // Approach 3: Try to find table structure with IN/OUT columns
    console.log("Approach 3: Looking for IN/OUT table structure...")
    const tableInfo = findTransactionTable(lines)
    if (tableInfo.found) {
      const tableTransactions = extractTransactionsFromTable(lines, tableInfo)
      console.log(`Found ${tableTransactions.length} transactions using table structure approach`)
      return {
        success: true,
        transactions: tableTransactions,
        accountInfo: extractAccountInfo(text),
        transactionCount: tableTransactions.length,
      }
    }

    // Approach 4: Last resort - try to match any money amounts with dates
    console.log("Approach 4: Last resort - matching any money amounts with dates...")
    const fallbackTransactions = extractTransactionsByMoneyPattern(lines)

    return {
      success: fallbackTransactions.length > 0,
      transactions: fallbackTransactions,
      accountInfo: extractAccountInfo(text),
      transactionCount: fallbackTransactions.length,
    }
  } catch (error) {
    console.error("Error parsing Starling statement:", error)
    return {
      success: false,
      error: error.message,
      transactions: [],
      accountInfo: {},
    }
  }
}

/**
 * Extract transactions by looking for date patterns
 * @param {Array} lines - Array of text lines
 * @returns {Array} Extracted transactions
 */
function extractTransactionsByDatePattern(lines) {
  const transactions = []

  // Common date patterns in UK format
  const datePatterns = [
    /(\d{1,2}\/\d{1,2}\/\d{4})/, // DD/MM/YYYY
    /(\d{1,2}-\d{1,2}-\d{4})/, // DD-MM-YYYY
    /(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/, // DD MMM YYYY
    /(\d{1,2}\s+[A-Za-z]+\s+\d{4})/, // DD Month YYYY
  ]

  // Money pattern (with optional £ symbol)
  const moneyPattern = /£?\s*(\d+[,.]\d{2})/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip short lines
    if (line.length < 8) continue

    // Check if line contains a date
    let dateMatch = null
    let dateStr = ""

    for (const pattern of datePatterns) {
      dateMatch = line.match(pattern)
      if (dateMatch) {
        dateStr = dateMatch[1]
        break
      }
    }

    if (!dateStr) continue

    console.log(`Found date in line ${i}: ${dateStr} - "${line}"`)

    // Look for money amounts in the same line
    const moneyMatches = [...line.matchAll(new RegExp(moneyPattern, "g"))]

    if (moneyMatches.length > 0) {
      // Extract description - everything between date and first amount
      const dateEndIndex = line.indexOf(dateStr) + dateStr.length
      let description = ""

      if (moneyMatches.length >= 2) {
        // If we have two amounts, assume IN and OUT columns
        const firstAmountIndex = line.indexOf(moneyMatches[0][0])
        description = line.substring(dateEndIndex, firstAmountIndex).trim()

        // Parse amounts
        const amount1 = Number.parseFloat(moneyMatches[0][1].replace(",", "."))
        const amount2 = Number.parseFloat(moneyMatches[1][1].replace(",", "."))

        // Determine which is IN and which is OUT
        // For Starling, we need to check the position in the line
        const firstAmountPosition = moneyMatches[0].index
        const secondAmountPosition = moneyMatches[1].index

        // If the first amount is non-zero, add it as a transaction
        if (amount1 > 0) {
          // Assume first amount is OUT (expense) - this is a guess based on common formats
          transactions.push({
            date: dateStr,
            description: description || "Transaction",
            amount: amount1,
            type: "expense", // Assuming first column is OUT
            category: categorizeTransaction(description),
          })
        }

        // If the second amount is non-zero, add it as a transaction
        if (amount2 > 0) {
          // Assume second amount is IN (income)
          transactions.push({
            date: dateStr,
            description: description || "Transaction",
            amount: amount2,
            type: "income", // Assuming second column is IN
            category: categorizeTransaction(description),
          })
        }
      } else if (moneyMatches.length === 1) {
        // If we have only one amount, try to determine if it's income or expense
        const amountIndex = line.indexOf(moneyMatches[0][0])
        description = line.substring(dateEndIndex, amountIndex).trim()

        const amount = Number.parseFloat(moneyMatches[0][1].replace(",", "."))

        // Try to determine type from description or context
        const type = determineTypeFromDescription(description)

        transactions.push({
          date: dateStr,
          description: description || "Transaction",
          amount: amount,
          type: type,
          category: categorizeTransaction(description),
        })
      }
    }
  }

  return transactions
}

/**
 * Extract transactions by looking for sections that might contain transactions
 * @param {Array} lines - Array of text lines
 * @returns {Array} Extracted transactions
 */
function extractTransactionsBySection(lines) {
  const transactions = []

  // Look for sections that might contain transactions
  let inTransactionSection = false
  let sectionStartIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()

    // Look for section headers that might indicate transactions
    if (
      line.includes("transaction") ||
      line.includes("statement") ||
      line.includes("activity") ||
      (line.includes("date") && (line.includes("in") || line.includes("out")))
    ) {
      console.log(`Potential transaction section at line ${i}: "${lines[i]}"`)
      inTransactionSection = true
      sectionStartIndex = i + 1
      continue
    }

    // If we're in a transaction section, look for date patterns
    if (inTransactionSection) {
      // Skip if we're still on the header line
      if (i === sectionStartIndex) continue

      // Date patterns
      const datePattern = /(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/
      const dateMatch = lines[i].match(datePattern)

      if (dateMatch) {
        console.log(`Found date in transaction section at line ${i}: "${lines[i]}"`)

        // Money pattern
        const moneyPattern = /£?\s*(\d+[,.]\d{2})/g
        const moneyMatches = [...lines[i].matchAll(moneyPattern)]

        if (moneyMatches.length > 0) {
          const dateStr = dateMatch[1]

          // Extract description - everything between date and first amount
          const dateEndIndex = lines[i].indexOf(dateStr) + dateStr.length
          const firstAmountIndex = lines[i].indexOf(moneyMatches[0][0])
          const description = lines[i].substring(dateEndIndex, firstAmountIndex).trim()

          // Process amounts
          for (const match of moneyMatches) {
            const amount = Number.parseFloat(match[1].replace(",", "."))

            // Try to determine if it's IN or OUT
            // For Starling, we need to check the position in the line or context
            const type = determineTypeFromContext(lines[i], match.index)

            transactions.push({
              date: dateStr,
              description: description || "Transaction",
              amount: amount,
              type: type,
              category: categorizeTransaction(description),
            })
          }
        }
      } else if (lines[i].trim() === "" || i === lines.length - 1) {
        // Empty line or end of file might indicate end of transaction section
        inTransactionSection = false
      }
    }
  }

  return transactions
}

/**
 * Find transaction table structure
 * @param {Array} lines - Array of text lines
 * @returns {Object} Table information
 */
function findTransactionTable(lines) {
  const tableInfo = {
    found: false,
    headerIndex: -1,
    columns: [],
    dateIndex: -1,
    descriptionIndex: -1,
    inIndex: -1,
    outIndex: -1,
    balanceIndex: -1,
  }

  // Look for potential table headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()

    // Skip short lines
    if (line.length < 10) continue

    // Check for common header patterns
    if (
      (line.includes("date") || line.includes("day")) &&
      (line.includes("description") || line.includes("details") || line.includes("reference")) &&
      ((line.includes("in") && line.includes("out")) ||
        (line.includes("credit") && line.includes("debit")) ||
        (line.includes("paid in") && line.includes("paid out")))
    ) {
      console.log(`Found transaction table header at line ${i}: "${lines[i]}"`)

      // Split into columns
      const columns = lines[i]
        .split(/\s{2,}/)
        .map((col) => col.trim())
        .filter((col) => col.length > 0)
      console.log(`Header columns: ${JSON.stringify(columns)}`)

      if (columns.length >= 3) {
        tableInfo.found = true
        tableInfo.headerIndex = i
        tableInfo.columns = columns

        // Identify column positions
        columns.forEach((col, index) => {
          const colLower = col.toLowerCase()

          if (colLower.includes("date") || colLower.includes("day")) {
            tableInfo.dateIndex = index
          }

          if (
            colLower.includes("description") ||
            colLower.includes("details") ||
            colLower.includes("reference") ||
            colLower.includes("transaction")
          ) {
            tableInfo.descriptionIndex = index
          }

          if (colLower === "in" || colLower.includes("paid in") || colLower.includes("credit")) {
            tableInfo.inIndex = index
          }

          if (colLower === "out" || colLower.includes("paid out") || colLower.includes("debit")) {
            tableInfo.outIndex = index
          }

          if (colLower.includes("balance")) {
            tableInfo.balanceIndex = index
          }
        })

        // If we found date and either in or out columns, we're good
        if (tableInfo.dateIndex !== -1 && (tableInfo.inIndex !== -1 || tableInfo.outIndex !== -1)) {
          return tableInfo
        }
      }
    }
  }

  return tableInfo
}

/**
 * Extract transactions from table structure
 * @param {Array} lines - Array of text lines
 * @param {Object} tableInfo - Table information
 * @returns {Array} Extracted transactions
 */
function extractTransactionsFromTable(lines, tableInfo) {
  const transactions = []

  // Start from the line after the header
  for (let i = tableInfo.headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]

    // Skip empty lines
    if (line.trim() === "") continue

    // Check if this line might be the end of the table
    if (
      line.toLowerCase().includes("total") ||
      line.toLowerCase().includes("balance") ||
      line.toLowerCase().includes("page")
    ) {
      break
    }

    // Split into columns
    const columns = line
      .split(/\s{2,}/)
      .map((col) => col.trim())
      .filter((col) => col.length > 0)

    // Check if we have enough columns
    if (columns.length >= Math.max(tableInfo.dateIndex, tableInfo.inIndex, tableInfo.outIndex) + 1) {
      // Get date
      const dateStr = columns[tableInfo.dateIndex]

      // Check if this looks like a date
      if (!/\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4}/.test(dateStr)) {
        continue
      }

      // Get description
      let description = ""
      if (tableInfo.descriptionIndex !== -1 && tableInfo.descriptionIndex < columns.length) {
        description = columns[tableInfo.descriptionIndex]
      }

      // Check IN column
      if (tableInfo.inIndex !== -1 && tableInfo.inIndex < columns.length) {
        const inAmount = parseAmount(columns[tableInfo.inIndex])
        if (inAmount > 0) {
          transactions.push({
            date: dateStr,
            description: description || "Income transaction",
            amount: inAmount,
            type: "income",
            category: categorizeTransaction(description),
          })
        }
      }

      // Check OUT column
      if (tableInfo.outIndex !== -1 && tableInfo.outIndex < columns.length) {
        const outAmount = parseAmount(columns[tableInfo.outIndex])
        if (outAmount > 0) {
          transactions.push({
            date: dateStr,
            description: description || "Expense transaction",
            amount: outAmount,
            type: "expense",
            category: categorizeTransaction(description),
          })
        }
      }
    }
  }

  return transactions
}

/**
 * Last resort: Extract transactions by looking for money patterns
 * @param {Array} lines - Array of text lines
 * @returns {Array} Extracted transactions
 */
function extractTransactionsByMoneyPattern(lines) {
  const transactions = []

  // Money pattern with £ symbol
  const moneyPattern = /£\s*(\d+[,.]\d{2})/g

  // Date patterns
  const datePattern = /(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip short lines
    if (line.length < 8) continue

    // Check if line contains a date
    const dateMatch = line.match(datePattern)
    if (!dateMatch) continue

    // Check if line contains money amounts
    const moneyMatches = [...line.matchAll(moneyPattern)]
    if (moneyMatches.length === 0) continue

    console.log(`Found money pattern in line ${i}: "${line}"`)

    const dateStr = dateMatch[1]

    // Extract description - everything between date and first amount
    const dateEndIndex = line.indexOf(dateStr) + dateStr.length
    const firstAmountIndex = line.indexOf(moneyMatches[0][0])
    const description = line.substring(dateEndIndex, firstAmountIndex).trim()

    // For each money amount, create a transaction
    for (const match of moneyMatches) {
      const amount = Number.parseFloat(match[1].replace(",", "."))

      // Try to determine if it's income or expense
      const type = determineTypeFromContext(line, match.index)

      transactions.push({
        date: dateStr,
        description: description || "Transaction",
        amount: amount,
        type: type,
        category: categorizeTransaction(description),
      })
    }
  }

  return transactions
}

/**
 * Extract account information from statement text
 * @param {string} text - PDF text content
 * @returns {Object} Account information
 */
function extractAccountInfo(text) {
  const accountInfo = {
    bankName: "Starling Bank",
    accountType: "Unknown",
    accountNumber: "****MASKED****",
    sortCode: "**-**-**",
    statementPeriod: "Unknown",
    currency: "GBP",
  }

  // Extract account type
  if (text.includes("Personal Account")) {
    accountInfo.accountType = "Personal"
  } else if (text.includes("Business Account")) {
    accountInfo.accountType = "Business"
  }

  return accountInfo
}

/**
 * Parse amount from string
 * @param {string} amountStr - Amount string
 * @returns {number} Parsed amount
 */
function parseAmount(amountStr) {
  if (!amountStr || amountStr.trim() === "") return 0

  // Remove currency symbol, spaces, and commas
  let cleaned = amountStr.replace(/£|\s|,/g, "")

  // Check for parentheses (negative amount)
  const isNegative = cleaned.includes("(") && cleaned.includes(")")

  // Remove any parentheses
  cleaned = cleaned.replace(/[()]/g, "")

  // Parse as float
  const amount = Number.parseFloat(cleaned)

  // Return amount (negative if in parentheses)
  return isNaN(amount) ? 0 : isNegative ? -amount : amount
}

/**
 * Determine transaction type from description
 * @param {string} description - Transaction description
 * @returns {string} "income" or "expense"
 */
function determineTypeFromDescription(description) {
  if (!description) return "expense"

  const desc = description.toLowerCase()

  // Common income keywords
  const incomeKeywords = [
    "salary",
    "wage",
    "deposit",
    "interest",
    "credit",
    "refund",
    "transfer in",
    "payment received",
    "dividend",
  ]

  // Check for income keywords
  for (const keyword of incomeKeywords) {
    if (desc.includes(keyword)) {
      return "income"
    }
  }

  // Default to expense
  return "expense"
}

/**
 * Determine transaction type from context
 * @param {string} line - Full line of text
 * @param {number} amountIndex - Position of the amount in the line
 * @returns {string} "income" or "expense"
 */
function determineTypeFromContext(line, amountIndex) {
  // This is a heuristic - for Starling Bank statements, we need to check
  // if the amount is in the IN or OUT column based on position

  // If the amount is in the second half of the line, it's more likely to be IN (income)
  // This is a guess based on common statement formats
  if (amountIndex > line.length / 2) {
    return "income"
  }

  // Otherwise, assume it's OUT (expense)
  return "expense"
}

/**
 * Categorize a transaction based on its description
 * @param {string} description - Transaction description
 * @returns {string} Category
 */
function categorizeTransaction(description) {
  if (!description) return "Uncategorized"

  const desc = description.toLowerCase()

  // Income categories
  if (desc.includes("salary") || desc.includes("payroll")) {
    return "Income:Salary"
  }
  if (desc.includes("dividend")) {
    return "Income:Dividends"
  }
  if (desc.includes("interest")) {
    return "Income:Interest"
  }
  if (desc.includes("freelance") || desc.includes("invoice")) {
    return "Income:Freelance"
  }

  // Expense categories
  if (
    desc.includes("tesco") ||
    desc.includes("sainsbury") ||
    desc.includes("asda") ||
    desc.includes("morrisons") ||
    desc.includes("waitrose") ||
    desc.includes("aldi") ||
    desc.includes("lidl") ||
    desc.includes("grocery")
  ) {
    return "Expenses:Groceries"
  }
  if (
    desc.includes("uber") ||
    desc.includes("deliveroo") ||
    desc.includes("just eat") ||
    desc.includes("restaurant") ||
    desc.includes("cafe") ||
    desc.includes("coffee")
  ) {
    return "Expenses:Dining"
  }
  if (desc.includes("amazon") || desc.includes("ebay") || desc.includes("argos") || desc.includes("currys")) {
    return "Expenses:Shopping"
  }
  if (
    desc.includes("petrol") ||
    desc.includes("fuel") ||
    desc.includes("parking") ||
    desc.includes("transport") ||
    desc.includes("train") ||
    desc.includes("bus") ||
    desc.includes("taxi")
  ) {
    return "Expenses:Transport"
  }

  return "Uncategorized"
}

module.exports = {
  parseStarlingStatement,
}
