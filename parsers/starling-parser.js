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

    // Split text into lines
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    console.log(`Processing ${lines.length} lines for transactions...`)

    // Find the header row
    const headerInfo = findTransactionHeader(lines)
    console.log(`Transaction header found: ${JSON.stringify(headerInfo)}`)

    // Extract account information
    const accountInfo = extractAccountInfo(text)

    // Extract transactions based on the header structure
    const transactions = extractTransactionsFromStructure(lines, headerInfo)

    console.log(`Found ${transactions.length} transactions`)

    return {
      accountInfo,
      transactions,
      success: true,
      transactionCount: transactions.length,
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
 * Find the transaction header row
 * @param {Array} lines - Array of text lines
 * @returns {Object} Header information
 */
function findTransactionHeader(lines) {
  const headerInfo = {
    found: false,
    index: -1,
    columns: [],
    dateIndex: -1,
    descriptionIndex: -1,
    inIndex: -1,
    outIndex: -1,
    balanceIndex: -1,
  }

  // Common header terms
  const dateTerms = ["date", "day", "when"]
  const descriptionTerms = ["description", "details", "transaction", "particulars", "narrative"]
  const inTerms = ["in", "credit", "deposit", "received", "money in"]
  const outTerms = ["out", "debit", "payment", "paid", "money out", "withdrawal"]
  const balanceTerms = ["balance", "closing", "end of day"]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()

    // Skip very short lines
    if (line.length < 10) continue

    // Check if this line looks like a header
    let potentialHeader = false

    // Check for date terms
    for (const term of dateTerms) {
      if (line.includes(term)) {
        potentialHeader = true
        break
      }
    }

    // If it might be a header, check for other column terms
    if (potentialHeader) {
      console.log(`Potential header at line ${i}: "${lines[i]}"`)

      // Split the line into potential columns
      const columns = line
        .split(/\s{2,}/)
        .map((col) => col.trim())
        .filter((col) => col.length > 0)
      console.log(`Potential columns: ${JSON.stringify(columns)}`)

      if (columns.length >= 3) {
        // At minimum we need date, description, and amount
        headerInfo.found = true
        headerInfo.index = i
        headerInfo.columns = columns

        // Identify column positions
        columns.forEach((col, index) => {
          // Check for date column
          if (dateTerms.some((term) => col.includes(term))) {
            headerInfo.dateIndex = index
          }

          // Check for description column
          if (descriptionTerms.some((term) => col.includes(term))) {
            headerInfo.descriptionIndex = index
          }

          // Check for in/credit column
          if (inTerms.some((term) => col.includes(term))) {
            headerInfo.inIndex = index
          }

          // Check for out/debit column
          if (outTerms.some((term) => col.includes(term))) {
            headerInfo.outIndex = index
          }

          // Check for balance column
          if (balanceTerms.some((term) => col.includes(term))) {
            headerInfo.balanceIndex = index
          }
        })

        // If we found enough columns, break
        if (
          headerInfo.dateIndex !== -1 &&
          (headerInfo.descriptionIndex !== -1 || headerInfo.inIndex !== -1 || headerInfo.outIndex !== -1)
        ) {
          break
        }
      }
    }
  }

  return headerInfo
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
 * Extract transactions based on the header structure
 * @param {Array} lines - Array of text lines
 * @param {Object} headerInfo - Header information
 * @returns {Array} Extracted transactions
 */
function extractTransactionsFromStructure(lines, headerInfo) {
  const transactions = []

  if (!headerInfo.found || headerInfo.index === -1) {
    console.log("No header structure found, falling back to pattern matching")
    return extractTransactionsByPattern(lines)
  }

  // Start processing from the line after the header
  const startIndex = headerInfo.index + 1
  console.log(`Starting transaction extraction from line ${startIndex}`)

  // Date patterns to recognize
  const datePatterns = [
    /^\d{1,2}\/\d{1,2}\/\d{4}$/, // DD/MM/YYYY
    /^\d{1,2}-\d{1,2}-\d{4}$/, // DD-MM-YYYY
    /^\d{1,2}\s+\w{3}\s+\d{4}$/, // DD MMM YYYY
  ]

  // Process lines after the header
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim()

    // Skip empty lines or obvious non-transaction lines
    if (line.length < 5 || line.toLowerCase().includes("page") || line.toLowerCase().includes("statement")) {
      continue
    }

    // Split the line into columns based on multiple spaces
    const columns = line
      .split(/\s{2,}/)
      .map((col) => col.trim())
      .filter((col) => col.length > 0)

    // Debug column structure
    if (columns.length >= 2) {
      console.log(`Line ${i} columns: ${columns.length}`)
    }

    // Check if this looks like a transaction line
    if (columns.length >= 2) {
      // Try to identify a date in the first column
      const firstCol = columns[0]
      let isTransactionLine = false

      for (const pattern of datePatterns) {
        if (pattern.test(firstCol)) {
          isTransactionLine = true
          break
        }
      }

      // If it has a date, process as transaction
      if (isTransactionLine) {
        const date = columns[headerInfo.dateIndex] || columns[0]
        let description = ""
        let amount = 0
        let type = "unknown"

        // Get description
        if (headerInfo.descriptionIndex !== -1 && headerInfo.descriptionIndex < columns.length) {
          description = columns[headerInfo.descriptionIndex]
        } else if (columns.length > 1) {
          description = columns[1] // Assume second column is description
        }

        // Get amount - check both in and out columns
        if (headerInfo.inIndex !== -1 && headerInfo.inIndex < columns.length) {
          const inAmount = parseAmount(columns[headerInfo.inIndex])
          if (inAmount > 0) {
            amount = inAmount
            type = "income"
          }
        }

        if (amount === 0 && headerInfo.outIndex !== -1 && headerInfo.outIndex < columns.length) {
          const outAmount = parseAmount(columns[headerInfo.outIndex])
          if (outAmount > 0) {
            amount = outAmount
            type = "expense"
          }
        }

        // If we couldn't find amount in specific columns, look for any column with currency symbol
        if (amount === 0) {
          for (const col of columns) {
            if (col.includes("£") || /\d+\.\d{2}/.test(col)) {
              const parsedAmount = parseAmount(col)
              if (parsedAmount > 0) {
                amount = parsedAmount
                // Determine type based on context or position
                type = col.includes("-") ? "expense" : "income"
                break
              }
            }
          }
        }

        // If we found a valid transaction, add it
        if (amount > 0) {
          const transaction = {
            date,
            description: description || "Transaction",
            amount,
            type,
            category: categorizeTransaction(description),
            currency: "GBP",
          }

          transactions.push(transaction)
          console.log(`Added transaction: ${date} - ${type} - £${amount}`)
        }
      }
    }
  }

  // If we didn't find any transactions with the structure approach, try pattern matching
  if (transactions.length === 0) {
    console.log("No transactions found with structure approach, trying pattern matching")
    return extractTransactionsByPattern(lines)
  }

  return transactions
}

/**
 * Extract transactions using pattern matching as fallback
 * @param {Array} lines - Array of text lines
 * @returns {Array} Extracted transactions
 */
function extractTransactionsByPattern(lines) {
  const transactions = []

  // Try multiple regex patterns for different Starling Bank formats
  const patterns = [
    // Pattern 1: DD/MM/YYYY Description £Amount
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+([-+]?\s*£\d+\.\d{2})\s*$/,
    // Pattern 2: DD-MM-YYYY Description £Amount
    /(\d{1,2}-\d{1,2}-\d{4})\s+(.+?)\s+([-+]?\s*£\d+\.\d{2})\s*$/,
    // Pattern 3: DD MMM YYYY Description £Amount
    /(\d{1,2}\s+\w{3}\s+\d{4})\s+(.+?)\s+([-+]?\s*£\d+\.\d{2})\s*$/,
    // Pattern 4: Amount at the end without £
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+([-+]?\s*\d+\.\d{2})\s*$/,
    // Pattern 5: Just look for any line with date and amount
    /(\d{1,2}[/-]\d{1,2}[/-]\d{4}).*?([-+]?\s*£?\d+\.\d{2})/,
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip empty lines or obvious headers
    if (line.length < 10 || line.toLowerCase().includes("page") || line.toLowerCase().includes("statement")) {
      continue
    }

    // Try each pattern
    for (let patternIndex = 0; patternIndex < patterns.length; patternIndex++) {
      const pattern = patterns[patternIndex]
      const match = line.match(pattern)

      if (match) {
        console.log(`Found transaction match (pattern ${patternIndex}) at line ${i}`)

        let dateStr, description, amountStr

        if (match.length >= 4) {
          dateStr = match[1]
          description = match[2]
          amountStr = match[3]
        } else if (match.length === 3) {
          dateStr = match[1]
          description = "Transaction"
          amountStr = match[2]
        } else {
          continue
        }

        // Parse amount
        const amount = parseAmount(amountStr)

        if (amount > 0) {
          const type = amountStr.includes("-") ? "expense" : "income"

          const transaction = {
            date: dateStr,
            description: description.trim(),
            amount,
            type,
            category: categorizeTransaction(description),
            currency: "GBP",
          }

          transactions.push(transaction)
          console.log(`Added transaction: ${dateStr} - ${type} - £${amount}`)
          break // Stop trying other patterns for this line
        }
      }
    }
  }

  return transactions
}

/**
 * Parse amount from string
 * @param {string} amountStr - Amount string
 * @returns {number} Parsed amount
 */
function parseAmount(amountStr) {
  if (!amountStr) return 0

  // Remove currency symbol, spaces, and commas
  let cleaned = amountStr.replace(/£|\s|,/g, "")

  // Handle negative amounts (could be with - or parentheses)
  const isNegative = cleaned.includes("-") || (cleaned.includes("(") && cleaned.includes(")"))
  cleaned = cleaned.replace(/[-()]/g, "")

  // Parse as float
  const amount = Number.parseFloat(cleaned)

  // Return absolute value (sign is handled by transaction type)
  return isNaN(amount) ? 0 : amount
}

/**
 * Categorize a transaction based on its description
 */
function categorizeTransaction(description) {
  if (!description) return "Uncategorized"

  description = description.toLowerCase()

  // Income categories
  if (description.includes("salary") || description.includes("payroll")) {
    return "Income:Salary"
  }
  if (description.includes("dividend")) {
    return "Income:Dividends"
  }
  if (description.includes("interest")) {
    return "Income:Interest"
  }

  // Expense categories
  if (
    description.includes("tesco") ||
    description.includes("sainsbury") ||
    description.includes("asda") ||
    description.includes("morrisons") ||
    description.includes("waitrose") ||
    description.includes("aldi") ||
    description.includes("lidl") ||
    description.includes("grocery")
  ) {
    return "Expenses:Groceries"
  }
  if (
    description.includes("uber") ||
    description.includes("deliveroo") ||
    description.includes("just eat") ||
    description.includes("restaurant") ||
    description.includes("cafe") ||
    description.includes("coffee")
  ) {
    return "Expenses:Dining"
  }
  if (
    description.includes("amazon") ||
    description.includes("ebay") ||
    description.includes("argos") ||
    description.includes("currys")
  ) {
    return "Expenses:Shopping"
  }

  return "Uncategorized"
}

module.exports = {
  parseStarlingStatement,
}
