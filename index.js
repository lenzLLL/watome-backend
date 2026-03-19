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

app.use(cors({origin:"https://watome-frontend.vercel.app",methods:["GET","POST","DELETE","PUT","PATCH"],credentials:true}))
// app.use(cors({origin:"http://localhost:3000",methods:["GET","POST","DELETE","PUT","PATCH"],credentials:true}))
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

const port = process.env.PORT||8080
app.listen(
    port,()=>{
        console.log(`Server is running on ${port}`)
    }
)