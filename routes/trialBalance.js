const express = require("express")
const TrialBalanceService = require("../services/trialBalanceService")

const router = express.Router()
const trialBalanceService = new TrialBalanceService()

// Get detailed trial balance
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id
    const { dateFrom, dateTo, includeZeroBalances } = req.query

    const options = {
      dateFrom,
      dateTo,
      includeZeroBalances: includeZeroBalances === "true",
    }

    const result = await trialBalanceService.getTrialBalance(userId, options)

    if (!result.success) {
      return res.status(500).json({ error: result.error })
    }

    res.json(result)
  } catch (error) {
    console.error("Error in trial balance route:", error)
    res.status(500).json({ error: "Failed to fetch trial balance" })
  }
})

// Get trial balance summary
router.get("/summary", async (req, res) => {
  try {
    const userId = req.user.id
    const result = await trialBalanceService.getTrialBalanceSummary(userId)

    if (!result.success) {
      return res.status(500).json({ error: result.error })
    }

    res.json(result)
  } catch (error) {
    console.error("Error in trial balance summary route:", error)
    res.status(500).json({ error: "Failed to fetch trial balance summary" })
  }
})

// Get trial balance totals
router.get("/totals", async (req, res) => {
  try {
    const userId = req.user.id
    const result = await trialBalanceService.getTrialBalanceTotals(userId)

    if (!result.success) {
      return res.status(500).json({ error: result.error })
    }

    res.json(result)
  } catch (error) {
    console.error("Error in trial balance totals route:", error)
    res.status(500).json({ error: "Failed to fetch trial balance totals" })
  }
})

// Validate trial balance for commit
router.get("/validate", async (req, res) => {
  try {
    const userId = req.user.id
    const result = await trialBalanceService.validateForCommit(userId)

    if (!result.success) {
      return res.status(500).json({ error: result.error })
    }

    res.json(result)
  } catch (error) {
    console.error("Error validating trial balance:", error)
    res.status(500).json({ error: "Failed to validate trial balance" })
  }
})

// Export trial balance
router.get("/export/:format", async (req, res) => {
  try {
    const userId = req.user.id
    const { format } = req.params
    const { dateFrom, dateTo, includeZeroBalances } = req.query

    const options = {
      dateFrom,
      dateTo,
      includeZeroBalances: includeZeroBalances === "true",
    }

    const result = await trialBalanceService.exportTrialBalance(userId, format, options)

    if (!result.success) {
      return res.status(500).json({ error: result.error })
    }

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv")
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`)
      res.send(result.data)
    } else {
      res.json(result)
    }
  } catch (error) {
    console.error("Error exporting trial balance:", error)
    res.status(500).json({ error: "Failed to export trial balance" })
  }
})

module.exports = router
