const fs = require("fs")
const path = require("path")
const csv = require("csv-parser")

/**
 * Account Coding Service
 * Handles mapping transactions to chart of accounts
 */
class AccountCodingService {
  constructor() {
    this.chartOfAccounts = new Map()
    this.loadChartOfAccounts()
  }

  /**
   * Load chart of accounts from hardcoded data
   */
  async loadChartOfAccounts() {
    try {
      // Hardcoded chart of accounts based on UK standards
      const accounts = [
        // Revenue/Turnover
        { code: "4000", name: "Sales", type: "Revenue", taxCode: "Standard Rate" },
        { code: "4010", name: "Fees", type: "Revenue", taxCode: "Standard Rate" },
        { code: "4020", name: "Reimbursed Expenses", type: "Revenue", taxCode: "Standard Rate" },

        // Cost of Sales
        { code: "5000", name: "Purchases", type: "Expenses", taxCode: "Standard Rate" },
        { code: "5010", name: "Increase/Decrease in Stocks", type: "Expenses", taxCode: "No VAT" },
        { code: "5020", name: "Subcontractor Costs", type: "Expenses", taxCode: "Standard Rate" },
        { code: "5030", name: "Direct Labour", type: "Expenses", taxCode: "No VAT" },

        // Administrative Expenses - Employee Costs
        { code: "6000", name: "Wages and Salaries", type: "Expenses", taxCode: "No VAT" },
        { code: "6010", name: "Directors Salaries", type: "Expenses", taxCode: "No VAT" },
        { code: "6020", name: "Pensions", type: "Expenses", taxCode: "No VAT" },
        { code: "6040", name: "Employer NI", type: "Expenses", taxCode: "No VAT" },
        { code: "6050", name: "Staff Training and Welfare", type: "Expenses", taxCode: "Standard Rate" },
        { code: "6060", name: "Travel and Subsistence", type: "Expenses", taxCode: "Standard Rate" },

        // Administrative Expenses - General
        { code: "6100", name: "Motor Expenses", type: "Expenses", taxCode: "Standard Rate" },
        { code: "6110", name: "Entertaining", type: "Expenses", taxCode: "Standard Rate" },
        { code: "6120", name: "Telephone and Fax", type: "Expenses", taxCode: "Standard Rate" },
        { code: "6130", name: "Internet", type: "Expenses", taxCode: "Standard Rate" },
        { code: "6140", name: "Postage", type: "Expenses", taxCode: "Standard Rate" },
        { code: "6150", name: "Stationery and Printing", type: "Expenses", taxCode: "Standard Rate" },
        { code: "6160", name: "Bank Charges", type: "Expenses", taxCode: "No VAT" },
        { code: "6170", name: "Insurance", type: "Expenses", taxCode: "No VAT" },
        { code: "6180", name: "Software", type: "Expenses", taxCode: "Standard Rate" },
        { code: "6190", name: "Repairs and Maintenance", type: "Expenses", taxCode: "Standard Rate" },
        { code: "6200", name: "Depreciation", type: "Expenses", taxCode: "No VAT" },

        // Administrative Expenses - Premises
        { code: "6300", name: "Rent", type: "Expenses", taxCode: "No VAT" },
        { code: "6310", name: "Rates", type: "Expenses", taxCode: "No VAT" },
        { code: "6320", name: "Light and Heat", type: "Expenses", taxCode: "Standard Rate" },
        { code: "6330", name: "Cleaning", type: "Expenses", taxCode: "Standard Rate" },

        // Administrative Expenses - Legal & Professional
        { code: "6400", name: "Audit Fees", type: "Expenses", taxCode: "No VAT" },
        { code: "6410", name: "Accountancy Fees", type: "Expenses", taxCode: "No VAT" },
        { code: "6420", name: "Solicitors Fees", type: "Expenses", taxCode: "No VAT" },
        { code: "6430", name: "Consultancy Fees", type: "Expenses", taxCode: "Standard Rate" },

        // Other Income/Expenses
        { code: "7000", name: "Interest Receivable", type: "Revenue", taxCode: "No VAT" },
        { code: "7100", name: "Interest Payable", type: "Expenses", taxCode: "No VAT" },
        { code: "7200", name: "Corporation Tax", type: "Expenses", taxCode: "No VAT" },

        // Fixed Assets
        { code: "1000", name: "Computer Equipment - Cost", type: "Assets", taxCode: "No VAT" },
        { code: "1001", name: "Computer Equipment - Depreciation", type: "Assets", taxCode: "No VAT" },
        { code: "1100", name: "Motor Vehicles - Cost", type: "Assets", taxCode: "No VAT" },
        { code: "1101", name: "Motor Vehicles - Depreciation", type: "Assets", taxCode: "No VAT" },

        // Current Assets
        { code: "1200", name: "Trade Debtors", type: "Assets", taxCode: "No VAT" },
        { code: "1210", name: "Other Debtors", type: "Assets", taxCode: "No VAT" },
        { code: "1220", name: "VAT Control Account", type: "Assets", taxCode: "No VAT" },
        { code: "1230", name: "Prepayments", type: "Assets", taxCode: "No VAT" },
        { code: "1300", name: "Cash at Bank", type: "Assets", taxCode: "No VAT" },
        { code: "1310", name: "Petty Cash", type: "Assets", taxCode: "No VAT" },

        // Current Liabilities
        { code: "2000", name: "Trade Creditors", type: "Liabilities", taxCode: "No VAT" },
        { code: "2010", name: "Other Creditors", type: "Liabilities", taxCode: "No VAT" },
        { code: "2020", name: "VAT Liability", type: "Liabilities", taxCode: "No VAT" },
        { code: "2030", name: "PAYE/NI Liability", type: "Liabilities", taxCode: "No VAT" },
        { code: "2040", name: "Corporation Tax Liability", type: "Liabilities", taxCode: "No VAT" },
        { code: "2050", name: "Directors Loan Account", type: "Liabilities", taxCode: "No VAT" },
        { code: "2060", name: "Accruals", type: "Liabilities", taxCode: "No VAT" },

        // Equity
        { code: "3000", name: "Share Capital", type: "Equity", taxCode: "No VAT" },
        { code: "3100", name: "Profit and Loss Account", type: "Equity", taxCode: "No VAT" },
        { code: "3200", name: "Dividends", type: "Equity", taxCode: "No VAT" },
      ]

      accounts.forEach((account) => {
        this.chartOfAccounts.set(account.code, account)
      })

      console.log(`Loaded ${this.chartOfAccounts.size} accounts into chart of accounts`)
    } catch (error) {
      console.error("Error loading chart of accounts:", error)
    }
  }

  /**
   * Get account by code
   */
  getAccount(code) {
    return this.chartOfAccounts.get(code)
  }

  /**
   * Get all accounts by type
   */
  getAccountsByType(type) {
    const accounts = []
    this.chartOfAccounts.forEach((account) => {
      if (account.type === type) {
        accounts.push(account)
      }
    })
    return accounts
  }

  /**
   * Auto-code a transaction based on description
   */
  autoCodeTransaction(description, amount, isIncome) {
    const desc = description.toLowerCase()

    // Income transactions
    if (isIncome) {
      if (desc.includes("salary") || desc.includes("wage") || desc.includes("payroll")) {
        return "4000" // Sales (treating salary as business income)
      }
      if (desc.includes("interest")) {
        return "7000" // Interest Receivable
      }
      if (desc.includes("dividend") || desc.includes("investment")) {
        return "4010" // Fees
      }
      return "4000" // Default to Sales
    }

    // Expense transactions
    if (desc.includes("bank") && desc.includes("fee")) {
      return "6160" // Bank Charges
    }
    if (desc.includes("fuel") || desc.includes("petrol") || desc.includes("parking") || desc.includes("car")) {
      return "6100" // Motor Expenses
    }
    if (desc.includes("restaurant") || desc.includes("cafe") || desc.includes("lunch") || desc.includes("dinner")) {
      return "6110" // Entertaining
    }
    if (desc.includes("office") || desc.includes("stationery") || desc.includes("supplies")) {
      return "6150" // Stationery and Printing
    }
    if (desc.includes("phone") || desc.includes("mobile") || desc.includes("internet") || desc.includes("broadband")) {
      return "6120" // Telephone and Fax
    }
    if (desc.includes("insurance")) {
      return "6170" // Insurance
    }
    if (desc.includes("rent") || desc.includes("rental")) {
      return "6300" // Rent
    }
    if (desc.includes("travel") || desc.includes("train") || desc.includes("bus") || desc.includes("taxi")) {
      return "6060" // Travel and Subsistence
    }
    if (desc.includes("subscription") || desc.includes("membership")) {
      return "6180" // Software
    }
    if (desc.includes("legal") || desc.includes("solicitor") || desc.includes("lawyer")) {
      return "6420" // Solicitors Fees
    }
    if (desc.includes("accountant") || desc.includes("accounting") || desc.includes("bookkeeping")) {
      return "6410" // Accountancy Fees
    }
    if (desc.includes("electricity") || desc.includes("gas") || desc.includes("water") || desc.includes("utility")) {
      return "6320" // Light and Heat
    }

    // Default to General Expenses (we'll use Software as a catch-all)
    return "6180"
  }

  /**
   * Get suggested account codes for a transaction
   */
  getSuggestedCodes(description, amount, isIncome) {
    const suggestions = []
    const primaryCode = this.autoCodeTransaction(description, amount, isIncome)
    const primaryAccount = this.getAccount(primaryCode)

    if (primaryAccount) {
      suggestions.push({
        code: primaryCode,
        name: primaryAccount.name,
        confidence: 0.9,
        reason: "Auto-matched from description",
      })
    }

    // Add alternative suggestions based on type
    if (isIncome) {
      const revenueAccounts = this.getAccountsByType("Revenue")
      revenueAccounts.forEach((account) => {
        if (account.code !== primaryCode) {
          suggestions.push({
            code: account.code,
            name: account.name,
            confidence: 0.3,
            reason: "Alternative revenue account",
          })
        }
      })
    } else {
      const expenseAccounts = this.getAccountsByType("Expenses")
      expenseAccounts.slice(0, 5).forEach((account) => {
        if (account.code !== primaryCode) {
          suggestions.push({
            code: account.code,
            name: account.name,
            confidence: 0.3,
            reason: "Alternative expense account",
          })
        }
      })
    }

    return suggestions.slice(0, 5) // Return top 5 suggestions
  }

  /**
   * Get all accounts for dropdown/selection
   */
  getAllAccounts() {
    const accounts = []
    this.chartOfAccounts.forEach((account, code) => {
      accounts.push({
        code,
        ...account,
      })
    })
    return accounts.sort((a, b) => a.code.localeCompare(b.code))
  }
}

module.exports = AccountCodingService
