import {Router} from "express"
import { signup, login, activateAccount, logout, requestPasswordReset, resetPassword, changePassword } from "../controllers/authController.js"
import { verifyToken } from "../middleware/verifyToken.js"
const authRoutes = Router()
authRoutes.post("/signup", signup)
authRoutes.post("/login", login)
authRoutes.post("/activate-account", activateAccount)
authRoutes.post("/request-password-reset", requestPasswordReset)
authRoutes.post("/reset-password", resetPassword)

authRoutes.post("/logout", verifyToken, logout)
authRoutes.post("/change-password", verifyToken, changePassword)

export default authRoutes