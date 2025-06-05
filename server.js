const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")
const session = require("express-session")
const passport = require("passport")
const LocalStrategy = require("passport-local").Strategy
const bcrypt = require("bcrypt")
const User = require("./models/User")
const bookRoutes = require("./routes/bookRoutes")
const authRoutes = require("./routes/authRoutes")
const dotenv = require("dotenv")

dotenv.config()

const app = express()
const port = process.env.PORT || 5000

// Middleware
app.use(express.json())

// Update the CORS configuration
app.use(
  cors({
    origin: ["https://v0-getmybooksdone-frontend.vercel.app", "http://localhost:3000", "https://railway.com"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // Set to true in production if using HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: "lax", // Adjust as needed
    },
  }),
)

// Passport middleware
app.use(passport.initialize())
app.use(passport.session())

// Passport configuration
passport.use(
  new LocalStrategy({ usernameField: "email" }, (email, password, done) => {
    User.findOne({ email: email })
      .then((user) => {
        if (!user) {
          return done(null, false, { message: "Incorrect email." })
        }
        bcrypt.compare(password, user.password, (err, res) => {
          if (err) {
            return done(err)
          }
          if (res) {
            // Passwords match, log user in
            return done(null, user)
          } else {
            // Passwords do not match
            return done(null, false, { message: "Incorrect password." })
          }
        })
      })
      .catch((err) => {
        return done(err)
      })
  }),
)

passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then((user) => {
      done(null, user)
    })
    .catch((err) => done(err))
})

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/books", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB")
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err)
  })

// Routes
app.use("/api/books", bookRoutes)
app.use("/api/auth", authRoutes)

app.get("/", (req, res) => {
  res.send("Server is running!")
})

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

