import { Router } from "express"
import { registerWaitlist, getWaitlist, announceWaitlist } from "../controllers/waitlistController.js"
import { verifyToken } from "../middleware/verifyToken.js"
import { requireAdmin } from "../middleware/roles.js"

const router = Router()

// public registration
router.post("/register", registerWaitlist)

// the following require admin auth
// router.use(verifyToken, requireAdmin)
router.get("/", getWaitlist)
router.post("/announce", announceWaitlist)

export default router