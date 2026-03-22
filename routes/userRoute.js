import {Router} from "express"
import multer from "multer"
import { getUsers, getAgents, getAgent, getAgentReviews, postAgentReview, deleteAgentReview, getUser, getMe, updateUser, updateMe, deleteUser, deleteMe, removePlan, upgradePlan, setPlanPricing, becomeAgent, getPlans, createPlan, updatePlan, deletePlan, adminSetUserPlan, getPaymentHistory, getUserSubscriptionHistory, uploadProfilePhoto } from "../controllers/userController.js"
import { verifyToken } from "../middleware/verifyToken.js"
import { requireAdmin } from "../middleware/roles.js"

// multer for profile photo
const storage = multer.memoryStorage()
const upload = multer({
    storage: storage,
    limits: { fileSize: 1.5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true)
        else cb(new Error('Only image files are allowed'))
    }
})

const router = Router()

// Public routes
router.get("/agents", getAgents) // Public route for listing agents
router.get("/agents/:id", getAgent) // Public route for agent details
router.get("/agents/:id/reviews", getAgentReviews) // Public route for agent reviews

// Protected routes (require authentication)
router.use(verifyToken)
router.post("/agents/:id/reviews", postAgentReview)
router.delete("/agents/:id/reviews", deleteAgentReview)
router.put("/update", updateMe)
router.get("/", getUsers)
router.get("/me", getMe)
router.get("/subscription-history", getUserSubscriptionHistory)
router.get("/payment-history", getPaymentHistory)

router.get("/:id", getUser)
router.put("/:id", updateUser)
router.delete("/:id", requireAdmin, deleteUser)
router.delete("/me", deleteMe)

router.post("/remove-plan", removePlan)
router.post("/upgrade-plan", upgradePlan)
router.post("/pricing", setPlanPricing)

// allow user to promote themselves to agent
router.post("/become-agent", becomeAgent)

// profile photo upload for current user
router.post("/upload/photo", verifyToken, upload.single('photo'), uploadProfilePhoto)

// admin plan management
router.get("/plans", getPlans)
router.post("/plans", requireAdmin, createPlan)
router.put("/plans/:id", requireAdmin, updatePlan)
router.delete("/plans/:id", requireAdmin, deletePlan)

// admin can override a user's plan
router.post("/user-plan", requireAdmin, adminSetUserPlan)

export default router