import { Router } from "express"
import { verifyToken } from "../middleware/verifyToken.js"
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
router.post("/", verifyToken, createMission)
router.put("/:id", verifyToken, updateMission)
router.post("/:id/accept", verifyToken, acceptMission)
router.delete("/:id", verifyToken, deleteMission)

export default router
