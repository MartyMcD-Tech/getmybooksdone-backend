const express = require("express")
const cors = require("cors")
const multer = require("multer")
const { createClient } = require("@supabase/supabase-js")
const pdf = require("pdf-parse")
const csv = require("csv-parser")
const { v4: uuidv4 } = require("uuid")
const { parseStarlingStatement } = require("./parsers/starling-parser")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 8080

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

// File processing endpoint
app.post("/api/process-file", authenticateUser, upload.single("file"), async (req, res) => {
  try {
    console.log("📁 File upload request received")
    const file = req.file
    const userId = req.user.id

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    console.log(`Processing file: ${file.originalname} for user: ${userId}`)

    // Generate a unique file path
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

    // Process the file based on type
    let parseResult = {
      success: false,
      transactions: [],
      accountInfo: {},
      transactionCount: 0,
    }

    if (file.mimetype === "application/pdf") {
      // Check if it's a Starling Bank statement
      if (file.originalname.toLowerCase().includes("starling")) {
        parseResult = await parseStarlingStatement(file.buffer)
      } else {
        // Generic PDF parsing
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
      // CSV parsing logic would go here
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

    // Store transactions in database if any were found
    if (parseResult.success && parseResult.transactions.length > 0) {
      const { error: txError } = await supabase.from("transactions").insert(
        parseResult.transactions.map((tx) => ({
          user_id: userId,
          upload_id: uploadRecord.id,
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          category: tx.category,
          currency: tx.currency || "GBP",
        })),
      )

      if (txError) {
        console.error("Error storing transactions:", txError)
      } else {
        console.log(`✅ Stored ${parseResult.transactions.length} transactions`)
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
    console.error("File processing error:", error)
    res.status(500).json({ error: "Failed to process file", details: error.message })
  }
})

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
  // Don't exit immediately, let Railway handle it
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason)
  // Don't exit immediately, let Railway handle it
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
