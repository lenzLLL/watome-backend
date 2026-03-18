import { Router } from "express"
import multer from "multer"
import { verifyToken } from "../middleware/verifyToken.js"
import {
    getProperties,
    getProperty,
    createProperty,
    updateProperty,
    deleteProperty,
    uploadImage,
    toggleVisibility,
    checkVisibilityQuota,
    getAgentProperties,
    getAgentPublicProperties,
    incrementViews
} from "../controllers/propertyController.js"

const router = Router()

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

// public access to listings (visibility enforced in controller)
router.get("/", getProperties)
router.get("/agent/:agentId", getAgentPublicProperties) // Public route for agent properties
router.get("/agent", verifyToken, getAgentProperties) // must come before /:id to avoid param collision
router.get("/visibility-quota", verifyToken, checkVisibilityQuota) // must come before /:id
router.patch("/:id/increment-views", incrementViews) // Public route to increment views
router.get("/:id", getProperty)

// modify operations require authentication
router.post("/", verifyToken, createProperty)
router.put("/:id", verifyToken, updateProperty)
router.delete("/:id", verifyToken, deleteProperty)
router.patch("/:id/toggle-visibility", verifyToken, toggleVisibility)

// image upload route
router.post("/upload/image", verifyToken, upload.single('image'), uploadImage)

export default router
