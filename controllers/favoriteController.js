import prisma from "../lib/db.js"

// Get all favorites for the current user
export const getFavorites = async (req, res) => {
  try {
    const userId = req.user?.userId
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" })
    }

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      select: {
        id: true,
        propertyId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    })

    return res.status(200).json({ favorites })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
}

// Add a property to favorites
export const addFavorite = async (req, res) => {
  try {
    const userId = req.user?.userId
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" })
    }

    const { propertyId } = req.body
    if (!propertyId) {
      return res.status(400).json({ error: "propertyId is required" })
    }

    // Check if property exists
    const property = await prisma.property.findUnique({ 
      where: { id: propertyId },
      select: { id: true } // Only select id to avoid relation issues
    })
    if (!property) {
      return res.status(404).json({ error: "Property not found" })
    }

    // Check if already favorited
    const existingFavorite = await prisma.favorite.findUnique({
      where: { userId_propertyId: { userId, propertyId } }
    })

    if (existingFavorite) {
      return res.status(409).json({ error: "Already in favorites" })
    }

    const favorite = await prisma.favorite.create({
      data: { userId, propertyId }
    })

    return res.status(201).json(favorite)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
}

// Remove a property from favorites
export const removeFavorite = async (req, res) => {
  try {
    const userId = req.user?.userId
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" })
    }

    const { propertyId } = req.body
    if (!propertyId) {
      return res.status(400).json({ error: "propertyId is required" })
    }

    const favorite = await prisma.favorite.findUnique({
      where: { userId_propertyId: { userId, propertyId } }
    })

    if (!favorite) {
      return res.status(404).json({ error: "Favorite not found" })
    }

    await prisma.favorite.delete({
      where: { userId_propertyId: { userId, propertyId } }
    })

    return res.status(200).json({ message: "Removed from favorites" })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
}
