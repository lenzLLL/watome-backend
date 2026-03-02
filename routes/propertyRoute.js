import { Router } from "express"
import { verifyToken } from "../middleware/verifyToken.js"
import {
    getProperties,
    getProperty,
    createProperty,
    updateProperty,
    deleteProperty
} from "../controllers/propertyController.js"

const router = Router()

// public access to listings (visibility enforced in controller)
router.get("/", getProperties)
router.get("/:id", getProperty)

// modify operations require authentication
router.post("/", verifyToken, createProperty)
router.put("/:id", verifyToken, updateProperty)
router.delete("/:id", verifyToken, deleteProperty)

export default router
