const express = require("express")
const cors = require("cors")
const multer = require("multer")
const { createClient } = require("@supabase/supabase-js")
const pdf = require("pdf-parse")
const csv = require("csv-parser")
const { v4: uuidv4 } = require("uuid")
const { parseStarlingStatement } = require("./parsers/starling-parser")
const AccountCodingService = require("./services/accountCoding.js")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 8080

// Initialize account coding service
const accountCoding = new AccountCodingService()

console.log("🚀 Starting Get My Books Done API...")
console.log("Environment variables check:")
console.log("- PORT:", PORT)
console.log("- SUPABASE_URL:", !!process.env.SUPABASE_URL)
console.log("- SUPABASE_SERVICE_ROLE_KEY:", !!process.env.SUPABASE_SERVICE_ROLE_KEY)

// Basic middleware
app.use(express.json())

// CORS configuration
app.use(
  cors({
    origin: ["https://v0-getmybooksdone-frontend.vercel.app", "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)

// Test endpoint to verify our server is running
app.get("/custom-test", (req, res) => {
  console.log("Custom test endpoint hit!")
  res.json({
    message: "✅ Our custom server is running!",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cors: "Configured for v0-getmybooksdone-frontend.vercel.app",
  })
})

// Health check route
app.get("/health", (req, res) => {
  console.log("Health check requested")
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
  })
})

// Root route
app.get("/", (req, res) => {
  console.log("Root endpoint hit!")
  res.json({
    message: "Get My Books Done API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
  })
})

// Initialize Supabase with error handling
let supabase
try {
  supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
  console.log("✅ Supabase client initialized")
} catch (error) {
  console.error("❌ Failed to initialize Supabase:", error)
  process.exit(1)
}

// Configure multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["application/pdf", "text/csv", "application/vnd.ms-excel"]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Invalid file type. Only PDF and CSV files are allowed."))
    }
  },
})

// Function to convert DD/MM/YYYY to YYYY-MM-DD
function formatDate(dateStr) {
  // Check if the date is in DD/MM/YYYY format
  const ddmmyyyyPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  const match = dateStr.match(ddmmyyyyPattern)

  if (match) {
    const day = match[1].padStart(2, "0")
    const month = match[2].padStart(2, "0")
    const year = match[3]
    return `${year}-${month}-${day}`
  }

  // If it's not in DD/MM/YYYY format, return as is
  return dateStr
}

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({ error: "No token provided" })
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" })
    }

    req.user = user
    next()
  } catch (error) {
    console.error("Auth error:", error)
    res.status(401).json({ error: "Authentication failed" })
  }
}

// Get chart of accounts
app.get("/api/chart-of-accounts", authenticateUser, async (req, res) => {
  try {
    const accounts = accountCoding.getAllAccounts()
    res.json({ accounts })
  } catch (error) {
    console.error("Error fetching chart of accounts:", error)
    res.status(500).json({ error: "Failed to fetch chart of accounts" })
  }
})

// Get transactions with coding details
app.get("/api/transactions", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    const { upload_id, status = "all" } = req.query

    let query = supabase
      .from("transactions")
      .select(`
        *,
        uploads!inner(file_name, created_at)
      `)
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false })

    if (upload_id) {
      query = query.eq("upload_id", upload_id)
    }

    if (status !== "all") {
      if (status === "coded") {
        query = query.not("account_code", "is", null)
      } else if (status === "uncoded") {
        query = query.is("account_code", null)
      }
    }

    const { data: transactions, error } = await query

    if (error) {
      console.error("Error fetching transactions:", error)
      return res.status(500).json({ error: "Failed to fetch transactions" })
    }

    // Enhance transactions with account information and suggestions
    const enhancedTransactions = transactions.map((transaction) => {
      const account = transaction.account_code ? accountCoding.getAccount(transaction.account_code) : null
      const suggestions = accountCoding.getSuggestedCodes(
        transaction.description,
        transaction.amount,
        transaction.is_income,
      )

      return {
        ...transaction,
        account_name: account?.name || null,
        account_type: account?.type || null,
        tax_code: account?.taxCode || null,
        suggested_codes: suggestions,
        coding_status: transaction.account_code ? "coded" : "pending",
      }
    })

    res.json({
      transactions: enhancedTransactions,
      summary: {
        total: enhancedTransactions.length,
        coded: enhancedTransactions.filter((t) => t.coding_status === "coded").length,
        pending: enhancedTransactions.filter((t) => t.coding_status === "pending").length,
      },
    })
  } catch (error) {
    console.error("Error fetching transactions:", error)
    res.status(500).json({ error: "Failed to fetch transactions" })
  }
})

// Update transaction coding
app.put("/api/transactions/:id/code", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params
    const { account_code, notes } = req.body
    const userId = req.user.id

    // Validate account code exists
    const account = accountCoding.getAccount(account_code)
    if (!account) {
      return res.status(400).json({ error: "Invalid account code" })
    }

    // Update transaction
    const { data, error } = await supabase
      .from("transactions")
      .update({
        account_code,
        notes: notes || null,
        coded_at: new Date().toISOString(),
        coded_by: userId,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("Error updating transaction coding:", error)
      return res.status(500).json({ error: "Failed to update transaction coding" })
    }

    res.json({
      transaction: {
        ...data,
        account_name: account.name,
        account_type: account.type,
        tax_code: account.taxCode,
      },
    })
  } catch (error) {
    console.error("Error updating transaction coding:", error)
    res.status(500).json({ error: "Failed to update transaction coding" })
  }
})

// Bulk update transaction coding
app.put("/api/transactions/bulk-code", authenticateUser, async (req, res) => {
  try {
    const { updates } = req.body // Array of { id, account_code, notes }
    const userId = req.user.id

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "Invalid updates array" })
    }

    const results = []
    const errors = []

    for (const update of updates) {
      try {
        const { id, account_code, notes } = update

        // Validate account code
        const account = accountCoding.getAccount(account_code)
        if (!account) {
          errors.push({ id, error: "Invalid account code" })
          continue
        }

        // Update transaction
        const { data, error } = await supabase
          .from("transactions")
          .update({
            account_code,
            notes: notes || null,
            coded_at: new Date().toISOString(),
            coded_by: userId,
          })
          .eq("id", id)
          .eq("user_id", userId)
          .select()
          .single()

        if (error) {
          errors.push({ id, error: error.message })
        } else {
          results.push({
            ...data,
            account_name: account.name,
            account_type: account.type,
            tax_code: account.taxCode,
          })
        }
      } catch (err) {
        errors.push({ id: update.id, error: err.message })
      }
    }

    res.json({
      success: results.length,
      errors: errors.length,
      results,
      errors,
    })
  } catch (error) {
    console.error("Error bulk updating transaction coding:", error)
    res.status(500).json({ error: "Failed to bulk update transaction coding" })
  }
})

// Auto-code transactions
app.post("/api/transactions/auto-code", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    const { upload_id, overwrite = false } = req.body

    let query = supabase.from("transactions").select("*").eq("user_id", userId)

    if (upload_id) {
      query = query.eq("upload_id", upload_id)
    }

    if (!overwrite) {
      query = query.is("account_code", null)
    }

    const { data: transactions, error } = await query

    if (error) {
      console.error("Error fetching transactions for auto-coding:", error)
      return res.status(500).json({ error: "Failed to fetch transactions" })
    }

    const updates = []
    const errors = []

    for (const transaction of transactions) {
      try {
        const accountCode = accountCoding.autoCodeTransaction(
          transaction.description,
          transaction.amount,
          transaction.is_income,
        )

        const { error: updateError } = await supabase
          .from("transactions")
          .update({
            account_code: accountCode,
            coded_at: new Date().toISOString(),
            coded_by: userId,
            notes: "Auto-coded",
          })
          .eq("id", transaction.id)

        if (updateError) {
          errors.push({ id: transaction.id, error: updateError.message })
        } else {
          updates.push({
            id: transaction.id,
            account_code: accountCode,
            account_name: accountCoding.getAccount(accountCode)?.name,
          })
        }
      } catch (err) {
        errors.push({ id: transaction.id, error: err.message })
      }
    }

    res.json({
      message: `Auto-coded ${updates.length} transactions`,
      success: updates.length,
      errors: errors.length,
      updates,
      errors,
    })
  } catch (error) {
    console.error("Error auto-coding transactions:", error)
    res.status(500).json({ error: "Failed to auto-code transactions" })
  }
})

// File processing endpoint (enhanced with auto-coding)
app.post("/api/process-file", authenticateUser, upload.single("file"), async (req, res) => {
  const timeout = setTimeout(() => {
    console.log("⚠️ Processing timeout after 30 seconds")
    if (!res.headersSent) {
      res.status(408).json({ error: "Processing timeout" })
    }
  }, 30000)

  try {
    console.log("📁 File upload request received")
    const file = req.file
    const userId = req.user.id

    if (!file) {
      clearTimeout(timeout)
      return res.status(400).json({ error: "No file uploaded" })
    }

    console.log(`Processing file: ${file.originalname} for user: ${userId}`)

    const filePath = `processed/${uuidv4()}-${file.originalname}`

    // Create upload record
    const { data: uploadRecord, error: dbError } = await supabase
      .from("uploads")
      .insert({
        user_id: userId,
        file_name: file.originalname,
        file_type: file.mimetype,
        file_size: `${(file.size / 1024).toFixed(1)} KB`,
        file_path: filePath,
        status: "processing",
      })
      .select()
      .single()

    if (dbError) {
      console.error("Database error:", dbError)
      throw dbError
    }

    // Process the file
    let parseResult = {
      success: false,
      transactions: [],
      accountInfo: {},
      transactionCount: 0,
    }

    if (file.mimetype === "application/pdf") {
      if (file.originalname.toLowerCase().includes("starling")) {
        parseResult = await parseStarlingStatement(file.buffer)
      } else {
        const pdfData = await pdf(file.buffer)
        parseResult = {
          success: true,
          transactions: [],
          accountInfo: {
            bankName: "Unknown",
            accountType: "Unknown",
            statementPeriod: "Unknown",
          },
          transactionCount: 0,
          rawText: pdfData.text,
        }
      }
    } else if (file.mimetype === "text/csv" || file.mimetype === "application/vnd.ms-excel") {
      parseResult = {
        success: true,
        transactions: [],
        accountInfo: {
          bankName: "Unknown",
          accountType: "Unknown",
          statementPeriod: "Unknown",
        },
        transactionCount: 0,
      }
    }

    // Store transactions with auto-coding
    if (parseResult.success && parseResult.transactions.length > 0) {
      const uniqueTransactions = removeDuplicateTransactions(parseResult.transactions)
      console.log(`Removed ${parseResult.transactions.length - uniqueTransactions.length} duplicate transactions`)

      const transactionsToInsert = uniqueTransactions.map((tx) => {
        // Auto-code the transaction
        const accountCode = accountCoding.autoCodeTransaction(tx.description, tx.amount, tx.type === "income")

        return {
          user_id: userId,
          upload_id: uploadRecord.id,
          transaction_date: formatDate(tx.date),
          description: tx.description,
          amount: tx.amount,
          is_income: tx.type === "income",
          category: tx.category,
          account_code: accountCode,
          coded_at: new Date().toISOString(),
          coded_by: userId,
          notes: "Auto-coded on import",
        }
      })

      const { error: txError } = await supabase.from("transactions").insert(transactionsToInsert)

      if (txError) {
        console.error("Error storing transactions:", txError)
      } else {
        console.log(`✅ Stored ${uniqueTransactions.length} transactions with auto-coding`)
      }
    }

    // Update upload record status
    await supabase
      .from("uploads")
      .update({
        status: "completed",
        transaction_count: parseResult.transactions.length,
        account_info: parseResult.accountInfo,
      })
      .eq("id", uploadRecord.id)

    console.log("✅ File processed successfully")
    clearTimeout(timeout)
    res.json({
      uploadId: uploadRecord.id,
      summary: {
        totalIncome: parseResult.transactions
          .filter((tx) => tx.type === "income")
          .reduce((sum, tx) => sum + tx.amount, 0),
        totalExpenses: parseResult.transactions
          .filter((tx) => tx.type === "expense")
          .reduce((sum, tx) => sum + tx.amount, 0),
        transactionCount: parseResult.transactions.length,
      },
      accountInfo: parseResult.accountInfo,
      transactionCount: parseResult.transactions.length,
    })
  } catch (error) {
    clearTimeout(timeout)
    console.error("File processing error:", error)
    res.status(500).json({ error: "Failed to process file", details: error.message })
  }
})

// Route to fix stuck uploads
app.post("/api/fix-uploads", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id

    const { data: stuckUploads, error: findError } = await supabase
      .from("uploads")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "processing")

    if (findError) {
      console.error("Error finding stuck uploads:", findError)
      return res.status(500).json({ error: "Failed to find stuck uploads" })
    }

    if (!stuckUploads || stuckUploads.length === 0) {
      return res.json({ message: "No stuck uploads found", fixed: 0 })
    }

    const { error: updateError } = await supabase
      .from("uploads")
      .update({ status: "completed" })
      .in(
        "id",
        stuckUploads.map((upload) => upload.id),
      )

    if (updateError) {
      console.error("Error fixing stuck uploads:", updateError)
      return res.status(500).json({ error: "Failed to fix stuck uploads" })
    }

    console.log(`Fixed ${stuckUploads.length} stuck uploads for user ${userId}`)
    res.json({ message: "Successfully fixed stuck uploads", fixed: stuckUploads.length })
  } catch (error) {
    console.error("Error fixing uploads:", error)
    res.status(500).json({ error: "Failed to fix uploads", details: error.message })
  }
})

// Admin routes
const adminRoutes = require("./routes/admin")
app.use("/api/admin", authenticateUser, adminRoutes)

// Function to remove duplicate transactions
function removeDuplicateTransactions(transactions) {
  const seen = new Set()
  return transactions.filter((tx) => {
    const key = `${tx.date}-${tx.amount}-${tx.description.substring(0, 10)}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err)
  res.status(500).json({
    error: "Internal server error",
    ...(process.env.NODE_ENV === "development" && { details: err.message }),
  })
})

// Global error handlers
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error)
  console.error("Stack:", error.stack)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason)
})

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`CORS configured for: https://v0-getmybooksdone-frontend.vercel.app`)
  console.log(`✅ Server started successfully at ${new Date().toISOString()}`)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully")
  server.close(() => {
    console.log("✅ Server closed")
    process.exit(0)
  })
})

module.exports = app
