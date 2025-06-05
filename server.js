const express = require("express")
const cors = require("cors")
const multer = require("multer")
const { createClient } = require("@supabase/supabase-js")
const pdf = require("pdf-parse")
const csv = require("csv-parser")
const { v4: uuidv4 } = require("uuid")
require("dotenv").config()

const app = express()
// Use Railway's PORT environment variable or default to 8080
const PORT = process.env.PORT || 8080

// Basic middleware
app.use(express.json())

// Updated CORS configuration to allow your Vercel frontend
app.use(
  cors({
    origin: ["https://v0-getmybooksdone-frontend.vercel.app", "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)

// Special test endpoint to verify our code is running
app.get("/custom-test", (req, res) => {
  res.json({
    message: "This is our custom server!",
    timestamp: new Date().toISOString(),
    cors: "Configured for v0-getmybooksdone-frontend.vercel.app",
  })
})

// Health check route
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  })
})

// Basic test route
app.get("/", (req, res) => {
  res.json({
    message: "Get My Books Done API",
    version: "1.0.0",
    status: "running",
  })
})

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// Configure multer for in-memory file uploads
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

// Routes

// Basic file processing endpoint
app.post("/api/process-file", authenticateUser, upload.single("file"), async (req, res) => {
  try {
    const file = req.file
    const userId = req.user.id

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    console.log(`Processing file: ${file.originalname} for user: ${userId}`)

    // Create upload record
    const { data: uploadRecord, error: dbError } = await supabase
      .from("uploads")
      .insert({
        user_id: userId,
        file_name: file.originalname,
        file_type: file.mimetype,
        file_size: `${(file.size / 1024).toFixed(1)} KB`,
        file_path: `processed/${uuidv4()}-${file.originalname}`,
        status: "completed",
      })
      .select()
      .single()

    if (dbError) {
      console.error("Database error:", dbError)
      throw dbError
    }

    res.json({
      uploadId: uploadRecord.id,
      summary: {
        totalIncome: 0,
        totalExpenses: 0,
        transactionCount: 0,
      },
      accountInfo: {},
      transactionCount: 0,
    })
  } catch (error) {
    console.error("File processing error:", error)
    res.status(500).json({ error: "Failed to process file", details: error.message })
  }
})

// Error handling
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err)
  res.status(500).json({
    error: "Internal server error",
    ...(process.env.NODE_ENV === "development" && { details: err.message }),
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`CORS configured for: https://v0-getmybooksdone-frontend.vercel.app`)
})

module.exports = app
