const express = require("express")
const cors = require("cors")
const multer = require("multer")
const { createClient } = require("@supabase/supabase-js")
const pdf = require("pdf-parse")
const csv = require("csv-parser")
const { v4: uuidv4 } = require("uuid")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 3001

// CORS configuration for your Vercel frontend
app.use(
  cors({
    origin: [
      "https://your-vercel-app.vercel.app", // Replace with your actual Vercel URL
      "http://localhost:3000", // For local development
    ],
    credentials: true,
  }),
)

app.use(express.json())

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  })
})

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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
    const file = req.file
    const userId = req.user.id

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

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

    if (dbError) throw dbError

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
    res.status(500).json({ error: "Failed to process file" })
  }
})

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`)
})

module.exports = app
