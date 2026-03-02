import { Router } from "express"
import { verifyToken } from "../middleware/verifyToken.js"
import { getAgentStats, getAdminStats } from "../controllers/statsController.js"

const router = Router()

router.get('/agent', verifyToken, getAgentStats)
router.get('/admin', verifyToken, getAdminStats)

export default router
