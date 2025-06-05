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

    // Extract account information
    const accountInfo = extractAccountInfo(text)

    // Extract transactions
    const transactions = extractTransactions(text)

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
 * Extract account information from statement text
 * @param {string} text - PDF text content
 * @returns {Object} Account information
 */
function extractAccountInfo(text) {
  const accountInfo = {
    bankName: "Starling Bank",
    accountType: "Unknown",
    accountNumber: "Unknown",
    sortCode: "Unknown",
    statementPeriod: "Unknown",
    currency: "GBP",
  }

  // Extract account number (format: 12345678)
  const accountNumberMatch = text.match(/Account number:\s*(\d{8})/i)
  if (accountNumberMatch) {
    accountInfo.accountNumber = accountNumberMatch[1]
  }

  // Extract sort code (format: 12-34-56)
  const sortCodeMatch = text.match(/Sort code:\s*(\d{2}-\d{2}-\d{2})/i)
  if (sortCodeMatch) {
    accountInfo.sortCode = sortCodeMatch[1]
  }

  // Extract statement period
  const periodMatch = text.match(/Statement for the period:?\s*([\w\d\s]+to[\w\d\s]+)/i)
  if (periodMatch) {
    accountInfo.statementPeriod = periodMatch[1].trim()
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
 * Extract transactions from statement text
 * @param {string} text - PDF text content
 * @returns {Array} Extracted transactions
 */
function extractTransactions(text) {
  const transactions = []

  // Split text into lines
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  // Regular expression to match transaction lines
  // Starling format typically has date, description, and amount
  const transactionRegex = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-+]?\s*£\d+\.\d{2})\s*$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(transactionRegex)

    if (match) {
      const [_, dateStr, description, amountStr] = match

      // Parse amount (remove £ sign and convert to number)
      let amount = amountStr.replace("£", "").replace(/\s+/g, "")
      amount = Number.parseFloat(amount)

      // Determine transaction type
      const type = amount < 0 ? "expense" : "income"

      // Create transaction object
      const transaction = {
        date: dateStr,
        description: description.trim(),
        amount: Math.abs(amount), // Store absolute value
        type,
        category: categorizeTransaction(description),
        currency: "GBP",
        originalText: line,
      }

      transactions.push(transaction)
    }
  }

  return transactions
}

/**
 * Categorize a transaction based on its description
 * @param {string} description - Transaction description
 * @returns {string} Category
 */
function categorizeTransaction(description) {
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
  if (
    description.includes("netflix") ||
    description.includes("spotify") ||
    description.includes("disney") ||
    description.includes("prime")
  ) {
    return "Expenses:Subscriptions"
  }
  if (
    description.includes("train") ||
    description.includes("tfl") ||
    description.includes("transport") ||
    description.includes("uber")
  ) {
    return "Expenses:Transport"
  }
  if (description.includes("hmrc") || description.includes("tax")) {
    return "Expenses:Tax"
  }

  // Default category
  return "Uncategorized"
}

module.exports = {
  parseStarlingStatement,
}
