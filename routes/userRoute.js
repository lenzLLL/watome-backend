import {Router} from "express"
import { getUsers, getAgents, getUser, getMe, updateUser, updateMe, deleteUser, deleteMe, removePlan, upgradePlan, setPlanPricing, becomeAgent, getPlans, createPlan, updatePlan, deletePlan, adminSetUserPlan } from "../controllers/userController.js"
import { verifyToken } from "../middleware/verifyToken.js"
import { requireAdmin } from "../middleware/roles.js"

const router = Router()

router.use(verifyToken)

router.get("/", getUsers)
router.get("/agents", requireAdmin, getAgents)
router.get("/me", getMe)

// public list of plans (any authenticated user)
router.get("/plans", getPlans)

router.get("/:id", getUser)
router.put("/:id", updateUser)
router.put("/me", updateMe)
router.delete("/:id", requireAdmin, deleteUser)
router.delete("/me", deleteMe)

router.post("/remove-plan", removePlan)
router.post("/upgrade-plan", upgradePlan)
router.post("/pricing", setPlanPricing)

// allow user to promote themselves to agent
router.post("/become-agent", becomeAgent)

// admin plan management
router.post("/plans", requireAdmin, createPlan)
router.put("/plans/:id", requireAdmin, updatePlan)
router.delete("/plans/:id", requireAdmin, deletePlan)

// admin can override a user's plan
router.post("/user-plan", requireAdmin, adminSetUserPlan)

export default router