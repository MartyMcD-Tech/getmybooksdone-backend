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

    // Find the header row with IN/OUT columns
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
 * Find the transaction header row with IN/OUT columns
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

  // Look for lines that contain both "IN" and "OUT" or similar column headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()
    const originalLine = lines[i]

    // Skip very short lines
    if (line.length < 10) continue

    // Look for lines that might be headers with IN/OUT columns
    if (
      (line.includes("in") && line.includes("out")) ||
      (line.includes("credit") && line.includes("debit")) ||
      (line.includes("money in") && line.includes("money out"))
    ) {
      console.log(`Potential IN/OUT header at line ${i}: "${originalLine}"`)

      // Split the line into potential columns
      const columns = originalLine
        .split(/\s{2,}/)
        .map((col) => col.trim())
        .filter((col) => col.length > 0)

      console.log(`Header columns: ${JSON.stringify(columns)}`)

      if (columns.length >= 3) {
        headerInfo.found = true
        headerInfo.index = i
        headerInfo.columns = columns

        // Identify column positions
        columns.forEach((col, index) => {
          const colLower = col.toLowerCase()

          // Check for date column
          if (colLower.includes("date") || colLower.includes("day")) {
            headerInfo.dateIndex = index
          }

          // Check for description column
          if (
            colLower.includes("description") ||
            colLower.includes("details") ||
            colLower.includes("transaction") ||
            colLower.includes("particulars")
          ) {
            headerInfo.descriptionIndex = index
          }

          // Check for IN/credit column
          if (
            colLower.includes("in") ||
            colLower.includes("credit") ||
            colLower.includes("money in") ||
            colLower.includes("received")
          ) {
            headerInfo.inIndex = index
            console.log(`Found IN column at index ${index}: "${col}"`)
          }

          // Check for OUT/debit column
          if (
            colLower.includes("out") ||
            colLower.includes("debit") ||
            colLower.includes("money out") ||
            colLower.includes("paid")
          ) {
            headerInfo.outIndex = index
            console.log(`Found OUT column at index ${index}: "${col}"`)
          }

          // Check for balance column
          if (colLower.includes("balance") || colLower.includes("closing")) {
            headerInfo.balanceIndex = index
          }
        })

        // If we found IN and OUT columns, we're good
        if (headerInfo.inIndex !== -1 && headerInfo.outIndex !== -1) {
          console.log(`✅ Found proper IN/OUT header structure`)
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
    console.log("No IN/OUT header structure found, falling back to pattern matching")
    return extractTransactionsByPattern(lines)
  }

  // Start processing from the line after the header
  const startIndex = headerInfo.index + 1
  console.log(`Starting transaction extraction from line ${startIndex}`)
  console.log(`IN column at index: ${headerInfo.inIndex}, OUT column at index: ${headerInfo.outIndex}`)

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
    if (
      line.length < 5 ||
      line.toLowerCase().includes("page") ||
      line.toLowerCase().includes("statement") ||
      line.toLowerCase().includes("total") ||
      line.toLowerCase().includes("balance brought forward")
    ) {
      continue
    }

    // Split the line into columns based on multiple spaces or tabs
    const columns = line
      .split(/\s{2,}|\t/)
      .map((col) => col.trim())
      .filter((col) => col.length > 0)

    // Check if this looks like a transaction line (should have enough columns)
    if (columns.length >= Math.max(headerInfo.inIndex, headerInfo.outIndex) + 1) {
      // Try to identify a date in the expected date column
      const dateCol = columns[headerInfo.dateIndex] || columns[0]
      let isTransactionLine = false

      for (const pattern of datePatterns) {
        if (pattern.test(dateCol)) {
          isTransactionLine = true
          break
        }
      }

      if (isTransactionLine) {
        console.log(`Processing transaction line ${i}: "${line}"`)
        console.log(`Columns (${columns.length}): ${JSON.stringify(columns)}`)

        const date = dateCol
        let description = ""
        let amount = 0
        let type = "unknown"

        // Get description
        if (headerInfo.descriptionIndex !== -1 && headerInfo.descriptionIndex < columns.length) {
          description = columns[headerInfo.descriptionIndex]
        } else {
          // Find the description column (usually the longest text column that's not a number)
          for (let j = 1; j < columns.length; j++) {
            if (j !== headerInfo.inIndex && j !== headerInfo.outIndex && j !== headerInfo.balanceIndex) {
              if (!/^\d+\.?\d*$/.test(columns[j]) && columns[j].length > description.length) {
                description = columns[j]
              }
            }
          }
        }

        // Check IN column (credits/deposits)
        if (headerInfo.inIndex !== -1 && headerInfo.inIndex < columns.length) {
          const inAmount = parseAmount(columns[headerInfo.inIndex])
          if (inAmount > 0) {
            amount = inAmount // Positive amount for income
            type = "income"
            console.log(`Found IN transaction: £${amount}`)
          }
        }

        // Check OUT column (debits/payments) - multiply by -1
        if (amount === 0 && headerInfo.outIndex !== -1 && headerInfo.outIndex < columns.length) {
          const outAmount = parseAmount(columns[headerInfo.outIndex])
          if (outAmount > 0) {
            amount = outAmount * -1 // Negative amount for expenses
            type = "expense"
            console.log(`Found OUT transaction: £${Math.abs(amount)} (stored as ${amount})`)
          }
        }

        // If we found a valid transaction, add it
        if (amount !== 0) {
          const transaction = {
            date,
            description: description || "Transaction",
            amount: Math.abs(amount), // Store absolute value
            type: amount > 0 ? "income" : "expense", // Determine type from sign
            category: categorizeTransaction(description),
            currency: "GBP",
            rawAmount: amount, // Keep the signed amount for debugging
          }

          transactions.push(transaction)
          console.log(
            `✅ Added transaction: ${date} - ${transaction.type} - £${transaction.amount} - ${description.substring(0, 30)}`,
          )
        } else {
          console.log(`⚠️ No amount found in IN/OUT columns for line: ${line}`)
        }
      }
    }
  }

  // If we didn't find any transactions with the structure approach, try pattern matching
  if (transactions.length === 0) {
    console.log("No transactions found with IN/OUT structure approach, trying pattern matching")
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
    // Pattern 1: DD/MM/YYYY Description Amount Amount (IN/OUT format)
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+(\d+\.\d{2})\s+(\d+\.\d{2})/,
    // Pattern 2: DD/MM/YYYY Description £Amount
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+£(\d+\.\d{2})/,
    // Pattern 3: DD/MM/YYYY Description Amount (no £)
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+(\d+\.\d{2})\s*$/,
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
        console.log(`Found transaction match (pattern ${patternIndex}) at line ${i}: "${line}"`)

        let dateStr, description, amount1, amount2

        if (match.length === 5) {
          // Pattern with two amounts (IN/OUT format)
          dateStr = match[1]
          description = match[2]
          amount1 = Number.parseFloat(match[3])
          amount2 = Number.parseFloat(match[4])

          // Assume first amount is OUT (expense), second is IN (income)
          // This is a guess - you might need to adjust based on actual format
          if (amount1 > 0) {
            const transaction = {
              date: dateStr,
              description: description.trim(),
              amount: amount1,
              type: "expense",
              category: categorizeTransaction(description),
              currency: "GBP",
            }
            transactions.push(transaction)
          }
          if (amount2 > 0) {
            const transaction = {
              date: dateStr,
              description: description.trim(),
              amount: amount2,
              type: "income",
              category: categorizeTransaction(description),
              currency: "GBP",
            }
            transactions.push(transaction)
          }
        } else if (match.length === 4) {
          // Pattern with single amount
          dateStr = match[1]
          description = match[2]
          const amount = Number.parseFloat(match[3])

          if (amount > 0) {
            // Determine type from description
            const type = determineTypeFromDescription(description)

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
          }
        }
        break // Stop trying other patterns for this line
      }
    }
  }

  return transactions
}

/**
 * Parse amount from string
 * @param {string} amountStr - Amount string
 * @returns {number} Parsed amount (always positive)
 */
function parseAmount(amountStr) {
  if (!amountStr || amountStr.trim() === "") return 0

  // Remove currency symbol, spaces, and commas
  let cleaned = amountStr.replace(/£|\s|,/g, "")

  // Remove any parentheses or negative signs for now
  cleaned = cleaned.replace(/[-()]/g, "")

  // Parse as float
  const amount = Number.parseFloat(cleaned)

  // Return absolute value
  return isNaN(amount) ? 0 : Math.abs(amount)
}

/**
 * Determine transaction type from description (fallback method)
 * @param {string} description - Transaction description
 * @returns {string} "income" or "expense"
 */
function determineTypeFromDescription(description) {
  if (!description) return "income"

  const desc = description.toLowerCase()

  // Common expense keywords
  const expenseKeywords = [
    "payment",
    "purchase",
    "withdrawal",
    "atm",
    "fee",
    "charge",
    "debit",
    "transfer out",
    "standing order",
    "direct debit",
    "card payment",
    "contactless",
    "chip and pin",
    "online payment",
    "bill payment",
    "subscription",
  ]

  // Check for expense keywords
  for (const keyword of expenseKeywords) {
    if (desc.includes(keyword)) {
      return "expense"
    }
  }

  // Default to income
  return "income"
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
  if (description.includes("freelance") || description.includes("invoice")) {
    return "Income:Freelance"
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
  if (
    description.includes("petrol") ||
    description.includes("fuel") ||
    description.includes("parking") ||
    description.includes("transport") ||
    description.includes("train") ||
    description.includes("bus") ||
    description.includes("taxi")
  ) {
    return "Expenses:Transport"
  }

  return "Uncategorized"
}

module.exports = {
  parseStarlingStatement,
}
