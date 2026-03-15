import { Router } from "express"
import { verifyToken, optionalAuth } from "../middleware/verifyToken.js"
import {
    getMissions,
    getMission,
    createMission,
    updateMission,
    deleteMission,
    acceptMission
} from "../controllers/missionController.js"

const router = Router()

router.get("/", verifyToken, getMissions)
router.get("/:id", verifyToken, getMission)
router.post("/", optionalAuth, createMission) // Allow creation with optional auth
router.put("/:id", verifyToken, updateMission)
router.post("/:id/accept", verifyToken, acceptMission)
router.delete("/:id", verifyToken, deleteMission)

export default router
