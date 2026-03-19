import "dotenv/config" // loads .env as early as possible
import express from "express"
import multer from "multer"

import cors from "cors"
import cookieParser from "cookie-parser"
import authRoutes from "./routes/authRoute.js"
import userRoutes from "./routes/userRoute.js"
import propertyRoutes from "./routes/propertyRoute.js"
import bookingRoutes from "./routes/bookingRoute.js"
import waitlistRoutes from "./routes/waitlistRoute.js"
import missionRoutes from "./routes/missionRoute.js"
import statsRoutes from "./routes/statsRoute.js"
import planRoutes from "./routes/planRoute.js"
import favoriteRoutes from "./routes/favoriteRoute.js"

const app = express()

// Configuration multer pour l'upload d'images
const storage = multer.memoryStorage()
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1.5 * 1024 * 1024, // 1.5 MB max
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true)
        } else {
            cb(new Error('Only image files are allowed'))
        }
    }
})

const allowedOrigins = [
  "https://watome-frontend.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS policy: Origin not allowed"));
  },
  methods: ["GET", "POST", "DELETE", "PUT", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin"
  ],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(cookieParser())
app.use(express.json({limit: '50mb'}))
app.use("/api/auth",authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/properties", propertyRoutes)
app.use("/api/bookings", bookingRoutes)
app.use("/api/waitlist", waitlistRoutes)
app.use("/api/missions", missionRoutes)
app.use("/api/stats", statsRoutes)
app.use("/api/plans", planRoutes)
app.use("/api/favorites", favoriteRoutes)

// In serverless environments (like Vercel), we export the Express app as the handler.
// When running locally, start the server normally.
if (!process.env.VERCEL) {
  const port = process.env.PORT || 8080
  app.listen(port, () => {
    console.log(`Server is running on ${port}`)
  })
}

export default app
