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

    // Privacy-safe debugging - only log structure, not content
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    console.log(`Processing ${lines.length} lines for transactions...`)
    console.log("Sample line structures (content masked):")

    // Show line patterns without exposing actual data
    lines.slice(0, 10).forEach((line, index) => {
      const masked = line.replace(/\d/g, "X").replace(/[A-Za-z]/g, "A")
      console.log(`Line ${index} pattern: "${masked}"`)
    })

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

  // Try multiple regex patterns for Starling Bank format
  const patterns = [
    // Pattern 1: DD/MM/YYYY Description £Amount
    /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-+]?\s*£\d+\.\d{2})\s*$/,
    // Pattern 2: DD MMM YYYY Description £Amount
    /(\d{2}\s+\w{3}\s+\d{4})\s+(.+?)\s+([-+]?\s*£\d+\.\d{2})\s*$/,
    // Pattern 3: DD-MM-YYYY Description Amount
    /(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([-+]?\s*\d+\.\d{2})\s*$/,
    // Pattern 4: More flexible
    /(\d{1,2}[/-]\d{1,2}[/-]\d{4})\s+(.+?)\s+([-+]?\s*£?\d+\.\d{2})\s*$/,
    // Pattern 5: Starling specific - try without £ symbol
    /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-]?\d+\.\d{2})\s*$/,
  ]

  let matchCount = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Try each pattern
    for (let patternIndex = 0; patternIndex < patterns.length; patternIndex++) {
      const pattern = patterns[patternIndex]
      const match = line.match(pattern)

      if (match) {
        matchCount++
        console.log(`Found transaction match (pattern ${patternIndex})`)

        const [_, dateStr, description, amountStr] = match

        // Parse amount
        let amount = amountStr.replace("£", "").replace(/\s+/g, "")
        amount = Number.parseFloat(amount)

        if (!isNaN(amount)) {
          const type = amount < 0 ? "expense" : "income"

          const transaction = {
            date: dateStr,
            description: description.trim(),
            amount: Math.abs(amount),
            type,
            category: categorizeTransaction(description),
            currency: "GBP",
            originalText: "***MASKED***",
          }

          transactions.push(transaction)
          break
        }
      }
    }
  }

  console.log(`Total pattern matches found: ${matchCount}`)
  return transactions
}

/**
 * Categorize a transaction based on its description
 */
function categorizeTransaction(description) {
  description = description.toLowerCase()

  if (description.includes("salary") || description.includes("payroll")) {
    return "Income:Salary"
  }
  if (description.includes("tesco") || description.includes("sainsbury")) {
    return "Expenses:Groceries"
  }
  if (description.includes("amazon") || description.includes("ebay")) {
    return "Expenses:Shopping"
  }

  return "Uncategorized"
}

module.exports = {
  parseStarlingStatement,
}
