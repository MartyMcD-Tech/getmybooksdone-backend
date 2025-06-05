/**
 * Trial Balance Service
 * Handles trial balance calculations and formatting for UK accounting standards
 */
const { createClient } = require("@supabase/supabase-js")

class TrialBalanceService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
  }

  /**
   * Get detailed trial balance for a user
   */
  async getTrialBalance(userId, options = {}) {
    try {
      const { dateFrom, dateTo, includeZeroBalances = false } = options

      let query = this.supabase.from("trial_balance_detailed").select("*").eq("user_id", userId)

      if (!includeZeroBalances) {
        query = query.neq("trial_balance_amount", 0)
      }

      const { data, error } = await query.order("sort_order")

      if (error) {
        console.error("Error fetching trial balance:", error)
        return { success: false, error: error.message }
      }

      // Group by section and category for structured display
      const structured = this.structureTrialBalance(data)

      return {
        success: true,
        trialBalance: structured,
        totals: this.calculateTotals(data),
        metadata: {
          generatedAt: new Date().toISOString(),
          userId,
          options,
          accountCount: data.length,
        },
      }
    } catch (error) {
      console.error("Error in getTrialBalance:", error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Get trial balance summary by category
   */
  async getTrialBalanceSummary(userId) {
    try {
      const { data, error } = await this.supabase
        .from("trial_balance_summary")
        .select("*")
        .eq("user_id", userId)
        .order("section")

      if (error) {
        console.error("Error fetching trial balance summary:", error)
        return { success: false, error: error.message }
      }

      return {
        success: true,
        summary: data,
      }
    } catch (error) {
      console.error("Error in getTrialBalanceSummary:", error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Get trial balance totals for validation
   */
  async getTrialBalanceTotals(userId) {
    try {
      const { data, error } = await this.supabase.from("trial_balance_totals").select("*").eq("user_id", userId)

      if (error) {
        console.error("Error fetching trial balance totals:", error)
        return { success: false, error: error.message }
      }

      return {
        success: true,
        totals: data,
        isBalanced: this.validateBalance(data),
      }
    } catch (error) {
      console.error("Error in getTrialBalanceTotals:", error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Structure trial balance data for display
   */
  structureTrialBalance(data) {
    const structured = {
      "P&L": {},
      "Balance Sheet": {},
    }

    data.forEach((account) => {
      const section = account.section
      const category = account.category || "Other"

      if (!structured[section]) {
        structured[section] = {}
      }

      if (!structured[section][category]) {
        structured[section][category] = {
          accounts: [],
          totals: {
            debits: 0,
            credits: 0,
            balance: 0,
          },
        }
      }

      structured[section][category].accounts.push({
        code: account.code,
        name: account.name,
        subcategory: account.subcategory,
        debitAmount: account.debit_amount || 0,
        creditAmount: account.credit_amount || 0,
        trialBalanceAmount: account.trial_balance_amount || 0,
        transactionCount: account.transaction_count || 0,
        normalBalance: account.normal_balance,
      })

      // Update category totals
      structured[section][category].totals.debits += account.debit_amount || 0
      structured[section][category].totals.credits += account.credit_amount || 0
      structured[section][category].totals.balance += account.trial_balance_amount || 0
    })

    return structured
  }

  /**
   * Calculate overall totals
   */
  calculateTotals(data) {
    const totals = {
      totalDebits: 0,
      totalCredits: 0,
      netBalance: 0,
      accountCount: data.length,
      transactionCount: 0,
    }

    data.forEach((account) => {
      totals.totalDebits += account.debit_amount || 0
      totals.totalCredits += account.credit_amount || 0
      totals.netBalance += account.trial_balance_amount || 0
      totals.transactionCount += account.transaction_count || 0
    })

    return totals
  }

  /**
   * Validate that trial balance is balanced
   */
  validateBalance(totalsData) {
    const totalRow = totalsData.find((row) => row.section === "TOTAL")
    if (!totalRow) return false

    // In a proper trial balance, total debits should equal total credits
    const difference = Math.abs(totalRow.section_debits - totalRow.section_credits)
    const tolerance = 0.01 // Allow for rounding differences

    return difference <= tolerance
  }

  /**
   * Export trial balance to various formats
   */
  async exportTrialBalance(userId, format = "json", options = {}) {
    try {
      const trialBalanceResult = await this.getTrialBalance(userId, options)

      if (!trialBalanceResult.success) {
        return trialBalanceResult
      }

      switch (format.toLowerCase()) {
        case "csv":
          return this.exportToCSV(trialBalanceResult)
        case "pdf":
          return this.exportToPDF(trialBalanceResult)
        default:
          return trialBalanceResult
      }
    } catch (error) {
      console.error("Error exporting trial balance:", error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Export to CSV format
   */
  exportToCSV(trialBalanceData) {
    const headers = ["Account Code", "Account Name", "Category", "Debits", "Credits", "Balance"]
    const rows = [headers.join(",")]

    Object.entries(trialBalanceData.trialBalance).forEach(([section, categories]) => {
      rows.push(`\n"${section}",,,,,`)

      Object.entries(categories).forEach(([category, categoryData]) => {
        rows.push(`"","${category}",,,,,`)

        categoryData.accounts.forEach((account) => {
          rows.push(
            [
              `"${account.code}"`,
              `"${account.name}"`,
              `"${account.subcategory || ""}"`,
              account.debitAmount.toFixed(2),
              account.creditAmount.toFixed(2),
              account.trialBalanceAmount.toFixed(2),
            ].join(","),
          )
        })

        // Category totals
        rows.push(
          [
            '""',
            `"${category} Total"`,
            '""',
            categoryData.totals.debits.toFixed(2),
            categoryData.totals.credits.toFixed(2),
            categoryData.totals.balance.toFixed(2),
          ].join(","),
        )
      })
    })

    return {
      success: true,
      format: "csv",
      data: rows.join("\n"),
      filename: `trial-balance-${new Date().toISOString().split("T")[0]}.csv`,
    }
  }

  /**
   * Validate trial balance before commit
   */
  async validateForCommit(userId) {
    try {
      const totalsResult = await this.getTrialBalanceTotals(userId)
      const trialBalanceResult = await this.getTrialBalance(userId)

      if (!totalsResult.success || !trialBalanceResult.success) {
        return {
          success: false,
          error: "Failed to fetch trial balance data for validation",
        }
      }

      const validationResults = {
        isBalanced: totalsResult.isBalanced,
        totalDebits: totalsResult.totals.find((t) => t.section === "TOTAL")?.section_debits || 0,
        totalCredits: totalsResult.totals.find((t) => t.section === "TOTAL")?.section_credits || 0,
        accountsWithBalances: totalsResult.totals.find((t) => t.section === "TOTAL")?.accounts_with_balances || 0,
        uncodedTransactions: await this.getUncodedTransactionCount(userId),
        warnings: [],
        errors: [],
      }

      // Check for uncoded transactions
      if (validationResults.uncodedTransactions > 0) {
        validationResults.errors.push(
          `${validationResults.uncodedTransactions} transactions are not coded and cannot be included in trial balance`,
        )
      }

      // Check if trial balance is balanced
      if (!validationResults.isBalanced) {
        validationResults.errors.push(
          `Trial balance is not balanced. Debits: £${validationResults.totalDebits.toFixed(2)}, Credits: £${validationResults.totalCredits.toFixed(2)}`,
        )
      }

      // Check for accounts with zero balances
      const zeroBalanceAccounts = Object.values(trialBalanceResult.trialBalance)
        .flatMap((section) => Object.values(section))
        .flatMap((category) => category.accounts)
        .filter((account) => Math.abs(account.trialBalanceAmount) < 0.01)

      if (zeroBalanceAccounts.length > 0) {
        validationResults.warnings.push(`${zeroBalanceAccounts.length} accounts have zero balances`)
      }

      return {
        success: true,
        validation: validationResults,
        readyForCommit: validationResults.errors.length === 0,
      }
    } catch (error) {
      console.error("Error validating trial balance:", error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Get count of uncoded transactions
   */
  async getUncodedTransactionCount(userId) {
    try {
      const { count, error } = await this.supabase
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("account_code", null)

      if (error) {
        console.error("Error counting uncoded transactions:", error)
        return 0
      }

      return count || 0
    } catch (error) {
      console.error("Error in getUncodedTransactionCount:", error)
      return 0
    }
  }
}

module.exports = TrialBalanceService
