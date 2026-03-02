import { Router } from "express"
import { verifyToken } from "../middleware/verifyToken.js"
import { getBookings, getBooking, createBooking, updateBooking, deleteBooking } from "../controllers/bookingController.js"

const router = Router()

// list and get require auth for scoping
router.get("/", verifyToken, getBookings)
router.get("/:id", verifyToken, getBooking)

// create/update/delete
router.post("/", verifyToken, createBooking)
router.put("/:id", verifyToken, updateBooking)
router.delete("/:id", verifyToken, deleteBooking)

export default router
