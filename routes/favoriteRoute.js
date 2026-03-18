import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { getFavorites, addFavorite, removeFavorite } from '../controllers/favoriteController.js'

const router = express.Router()

// Get all favorites for the current user
router.get('/', verifyToken, getFavorites)

// Add a property to favorites
router.post('/', verifyToken, addFavorite)

// Remove a property from favorites
router.delete('/', verifyToken, removeFavorite)

export default router
