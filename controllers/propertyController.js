import prisma from "../lib/db.js"

// only agents/agencies may create properties
const isAgent = (user) => user && (user.categoryAccount === "AGENT" || user.categoryAccount === "AGENCE")
const isAdmin = (user) => user && user.categoryAccount === "ADMIN"

// helper to get user's plan limit (default 5 if none)
const getVisibleLimit = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
    })
    if (!user) return 0
    return user.subscription?.visiblePropertiesLimit ?? 5
}

export const getProperties = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, userId, city, country, minLat, maxLat, minLng, maxLng } = req.query
        const where = {}

        // full-text style search on title/description/location
        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { location: { contains: search, mode: "insensitive" } }
            ]
        }

        // filter by explicit city/country if provided (assumes stored in location)
        if (city) {
            where.location = { contains: city, mode: "insensitive" }
        }
        if (country) {
            where.location = where.location
                ? { ...where.location, contains: country } // combine with city
                : { contains: country, mode: "insensitive" }
        }

        // bounding box filter on coordinates
        if (minLat || maxLat) {
            where.latitude = {}
            if (minLat) where.latitude.gte = Number(minLat)
            if (maxLat) where.latitude.lte = Number(maxLat)
        }
        if (minLng || maxLng) {
            where.longitude = {}
            if (minLng) where.longitude.gte = Number(minLng)
            if (maxLng) where.longitude.lte = Number(maxLng)
        }

        // list properties for specific user
        if (userId) {
            where.userId = userId
        }

        // visibility rules for non-admins - consult latest DB user when available
        const requestingId = req.user?.userId
        let dbUser = null
        if (requestingId) {
            dbUser = await prisma.user.findUnique({ where: { id: requestingId } })
        }
        const admin = dbUser ? isAdmin(dbUser) : false
        const agent = dbUser ? isAgent(dbUser) : false
        if (!admin) {
            if (!(requestingId && userId === requestingId && agent)) {
                where.isVisible = true
            }
        }

        const take = Number(limit) || 20
        const skip = (Number(page) - 1) * take
        const properties = await prisma.property.findMany({ where, skip, take })
        const total = await prisma.property.count({ where })
        return res.status(200).json({ properties, total, page: Number(page), limit: take })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getProperty = async (req, res) => {
    try {
        const { id } = req.params
        const prop = await prisma.property.findUnique({ where: { id } })
        if (!prop) return res.status(404).json({ error: "Property not found" })
        return res.status(200).json(prop)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const createProperty = async (req, res) => {
    try {
        // Validate user is attached and authenticated
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: "User not authenticated" })
        }
        // fetch latest user from DB to reflect any role changes
        const dbUser = await prisma.user.findUnique({ where: { id: req.user.userId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })

        // Check role (based on DB state)
        if (!isAgent(dbUser) && !isAdmin(dbUser)) {
            console.error(`Unauthorized: db user categoryAccount is ${dbUser.categoryAccount} (token had ${req.user.categoryAccount})`)
            return res.status(403).json({ error: "Only agents/agencies may create properties" })
        }
        
        const data = { ...req.body }
        // if isVisible not provided, schema default is true — treat undefined as true for validation
        const willBeVisible = data.hasOwnProperty('isVisible') ? Boolean(data.isVisible) : true
        // enforce visible limit only when the property will be visible
        if (willBeVisible) {
            const limit = await getVisibleLimit(req.user.userId)
            const count = await prisma.property.count({ where: { userId: req.user.userId, isVisible: true } })
            if (limit && count >= limit) {
                return res.status(403).json({ error: `Visible property limit reached (${limit})` })
            }
        }
        data.isVisible = willBeVisible
        data.userId = req.user.userId
        const prop = await prisma.property.create({ data })
        return res.status(201).json(prop)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const updateProperty = async (req, res) => {
    try {
        const { id } = req.params
        const existing = await prisma.property.findUnique({ where: { id } })
        if (!existing) return res.status(404).json({ error: "Property not found" })
        // consult DB for latest role
        const dbUser = await prisma.user.findUnique({ where: { id: req.user.userId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })
        if (existing.userId !== req.user.userId && !isAdmin(dbUser)) {
            return res.status(403).json({ error: "Forbidden" })
        }
        const data = { ...req.body }
        // if changing visibility to true, enforce limit
        if (data.isVisible && !existing.isVisible) {
            const limit = await getVisibleLimit(req.user.userId)
            const count = await prisma.property.count({
                where: { userId: req.user.userId, isVisible: true }
            })
            if (limit && count >= limit) {
                return res.status(403).json({ error: `Visible property limit reached (${limit})` })
            }
        }
        const updated = await prisma.property.update({ where: { id }, data })
        return res.status(200).json(updated)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const deleteProperty = async (req, res) => {
    try {
        const { id } = req.params
        const existing = await prisma.property.findUnique({ where: { id } })
        if (!existing) return res.status(404).json({ error: "Property not found" })
        const dbUser = await prisma.user.findUnique({ where: { id: req.user.userId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })
        if (existing.userId !== req.user.userId && !isAdmin(dbUser)) {
            return res.status(403).json({ error: "Forbidden" })
        }
        await prisma.property.delete({ where: { id } })
        return res.status(204).send()
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}
