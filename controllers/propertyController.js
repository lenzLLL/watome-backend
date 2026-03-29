import prisma from "../lib/db.js"

// only agents/agencies may create properties
const isAgent = (user) => user && (user.categoryAccount === "AGENT" || user.categoryAccount === "AGENCE")
const isAdmin = (user) => user && user.categoryAccount === "ADMIN"

// Helper function to serialize BigInt fields
const serializeProperty = (property) => {
    return {
        ...property,
        views: property.views ? Number(property.views) : 0
    }
}

const serializeProperties = (properties) => {
    if (Array.isArray(properties)) {
        return properties.map(serializeProperty)
    }
    return serializeProperty(properties)
}

// helper to get user's plan limit (default 5 if none)
// Prefers the current active subscription (UserSubscription) when available.
const getVisibleLimit = async (userId) => {
    // Try active subscription first
    const activeSubscription = await prisma.userSubscription.findFirst({
        where: { userId, status: "ACTIVE" },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
    })
    if (activeSubscription?.plan?.visiblePropertiesLimit != null) {
        return activeSubscription.plan.visiblePropertiesLimit
    }

    // Fallback to the plan associated directly on the user (planSubscriptionId)
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
    })
    if (!user) return 0
    return user.subscription?.visiblePropertiesLimit ?? 5
}

const getTotalPropertiesLimit = async (userId) => {
    const visibleLimit = await getVisibleLimit(userId)
    // Business rule: doublons allowed, max total properties = 2x visible limit
    // For backward compatibility, use 10 if visibleLimit is missing/invalid
    const computed = visibleLimit && visibleLimit > 0 ? visibleLimit * 2 : 10
    return Math.max(computed, 10)
}

// Returns all properties owned by the authenticated agent (no visibility filtering)
export const getAgentPublicProperties = async (req, res) => {
    try {
        const agentId = req.params.agentId
        if (!agentId) {
            return res.status(400).json({ error: "Agent ID is required" })
        }

        // Verify agent exists and is active
        const agent = await prisma.user.findUnique({
            where: {
                id: agentId,
                categoryAccount: { in: ["AGENT", "AGENCE"] },
                isActive: true
            }
        })

        if (!agent) {
            return res.status(404).json({ error: "Agent not found" })
        }

        const { page = 1, limit = 10 } = req.query
        const take = Number(limit) || 10
        const skip = (Number(page) - 1) * take

        const [properties, total] = await Promise.all([
            prisma.property.findMany({
                where: {
                    userId: agentId,
                    isVisible: true // Only show visible properties
                },
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    title: true,
                    price: true,
                    location: true,
                    chambres: true,
                    sallesDeBain: true,
                    surface: true,
                    images: true,
                    type: true,
                    category: true,
                    createdAt: true
                }
            }),
            prisma.property.count({
                where: {
                    userId: agentId,
                    isVisible: true
                }
            })
        ])

        return res.status(200).json({ properties: serializeProperties(properties), total, page: Number(page), limit: take })
    } catch (err) {
        console.error("getAgentPublicProperties error:", err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getAgentProperties = async (req, res) => {
    try {
        const userId = req.user?.userId
        if (!userId) {
            return res.status(401).json({ error: "User not authenticated" })
        }
        // optionally ensure role is agent or admin
        const dbUser = await prisma.user.findUnique({ where: { id: userId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })
        if (!isAgent(dbUser) && !isAdmin(dbUser)) {
            return res.status(403).json({ error: "Forbidden" })
        }

        const { page = 1, limit = 20 } = req.query
        const take = Number(limit) || 20
        const skip = (Number(page) - 1) * take

        const [properties, total] = await Promise.all([
            prisma.property.findMany({
                where: { userId },
                skip,
                take,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.property.count({ where: { userId } })
        ])

        return res.status(200).json({ properties: serializeProperties(properties), total, page: Number(page), limit: take })
    } catch (err) {
        console.error("getAgentProperties error:", err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getProperties = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, userId, city, country, minLat, maxLat, minLng, maxLng, category, exclude } = req.query
        const where = {}

        // full-text style search on title/description/location
        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { location: { contains: search, mode: "insensitive" } }
            ]
        }

        // filter by category
        if (category) {
            where.category = category
        }

        // exclude specific property
        if (exclude) {
            where.id = { not: exclude }
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
        return res.status(200).json({ properties: serializeProperties(properties), total, page: Number(page), limit: take })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getProperty = async (req, res) => {
    try {
        const { id } = req.params
        const prop = await prisma.property.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        firstname: true,
                        lastname: true,
                        email: true,
                        phone: true,
                        agence: true,
                        profilePicture: true,
                        categoryAccount: true,
                        bio: true,
                        languages: true,
                        experience: true,
                        salesCount: true,
                        specialties: true
                    }
                }
            }
        })
        if (!prop) return res.status(404).json({ error: "Property not found" })

        const agentReviewStats = await prisma.agentReview.aggregate({
            where: { agentId: prop.userId },
            _avg: { rating: true },
            _count: { rating: true }
        })

        const propertyWithAgentRating = {
            ...prop,
            user: {
                ...prop.user,
                rating: Number((agentReviewStats._avg.rating ?? 0).toFixed(1)),
                reviewCount: agentReviewStats._count.rating
            }
        }

        return res.status(200).json(serializeProperty(propertyWithAgentRating))
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
        
        let data = { ...req.body };
        // convert numeric strings to proper types
        const toInt = v => v !== undefined && v !== null ? parseInt(v, 10) : v;
        const toFloat = v => v !== undefined && v !== null ? parseFloat(v) : v;
        data.chambres = toInt(data.chambres);
        data.sallesDeBain = toInt(data.sallesDeBain);
        data.salon = toInt(data.salon);
        data.surface = toInt(data.surface);
        data.price = toFloat(data.price);
        data.latitude = toFloat(data.latitude);
        data.longitude = toFloat(data.longitude);

        // if isVisible not provided, schema default is true — treat undefined as true for validation
        const willBeVisible = data.hasOwnProperty('isVisible') ? Boolean(data.isVisible) : true

        // enforce total property limit first
        const totalLimit = await getTotalPropertiesLimit(req.user.userId)
        const totalCount = await prisma.property.count({ where: { userId: req.user.userId } })
        if (totalCount >= totalLimit) {
            return res.status(403).json({
                error: `Total property limit reached (${totalCount}/${totalLimit})`,
                details: `Votre forfait permet jusqu'à ${totalLimit} annonces au total, dont ${await getVisibleLimit(req.user.userId)} visibles.`
            })
        }

        // enforce visible limit only when the property will be visible
        if (willBeVisible) {
            const limit = await getVisibleLimit(req.user.userId)
            const visibleCount = await prisma.property.count({ where: { userId: req.user.userId, isVisible: true } })
            if (limit && visibleCount >= limit) {
                return res.status(403).json({ error: `Visible property limit reached (${visibleCount}/${limit})` })
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
        let data = { ...req.body };
        // coerce numeric strings
        const toInt = v => v !== undefined && v !== null ? parseInt(v, 10) : v;
        const toFloat = v => v !== undefined && v !== null ? parseFloat(v) : v;
        const toBool = v => v !== undefined && v !== null ? (typeof v === 'string' ? v === 'true' || v === '1' : Boolean(v)) : v;
        
        data.chambres = toInt(data.chambres);
        data.sallesDeBain = toInt(data.sallesDeBain);
        data.salon = toInt(data.salon);
        data.surface = toInt(data.surface);
        data.price = toFloat(data.price);
        data.latitude = toFloat(data.latitude);
        data.longitude = toFloat(data.longitude);
        
        // Convert isVisible to boolean if present
        if (data.hasOwnProperty('isVisible')) {
            data.isVisible = toBool(data.isVisible)
        }

        // if changing visibility to true, enforce limit
        const newIsVisible = data.hasOwnProperty('isVisible') ? data.isVisible : existing.isVisible
        console.log(`updateProperty: Checking visibility for ${id}. newIsVisible=${newIsVisible}, existing.isVisible=${existing.isVisible}`)
        
        if (newIsVisible && !existing.isVisible) {
            const limit = await getVisibleLimit(req.user.userId)
            const count = await prisma.property.count({
                where: { userId: req.user.userId, isVisible: true }
            })
            
            console.log(`updateProperty: User ${req.user.userId} visibility check - visible count: ${count}, limit: ${limit}`)
            
            if (count >= limit) {
                console.warn(`updateProperty: QUOTA EXCEEDED - User ${req.user.userId} visible=${count}/${limit}`)
                return res.status(403).json({ 
                    error: `Limite de propriétés visibles atteinte (${count}/${limit})`,
                    details: `Vous avez déjà ${count} propriété(s) visible(s). Votre forfait en autorise ${limit}. Veuillez masquer une propriété avant d'en publier une nouvelle.`
                })
            }
            console.log(`updateProperty: QUOTA OK - User can make property visible (${count}/${limit})`)
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

        // Vérifier les permissions de l'utilisateur d'abord
        const dbUser = await prisma.user.findUnique({ where: { id: req.user.userId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })

        // Essayer de supprimer directement avec une condition WHERE pour éviter la course condition
        const deleteResult = await prisma.property.deleteMany({
            where: {
                id: id,
                userId: isAdmin(dbUser) ? undefined : req.user.userId // Admin peut supprimer n'importe quelle propriété
            }
        })

        if (deleteResult.count === 0) {
            return res.status(404).json({ error: "Property not found or access denied" })
        }

        return res.status(204).send()
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const uploadImage = async (req, res) => {
    try {
        console.log("Upload endpoint called")
        console.log("File:", req.file ? { name: req.file.originalname, size: req.file.size } : "No file")

        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" })
        }

        // Configuration Cloudflare R2
        const cloudflare = {
            accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
            accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
            secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
            bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME,
            publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL
        }

        if (!cloudflare.accessKeyId || !cloudflare.secretAccessKey) {
            console.error("Cloudflare R2 credentials missing")
            return res.status(500).json({ error: "Cloudflare R2 configuration missing" })
        }

        // Générer le nom du fichier
        const fileName = `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        console.log("Uploading to Cloudflare R2:", { fileName, fileSize: req.file.size })

        // Upload vers Cloudflare R2
        const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3")
        const s3Client = new S3Client({
            region: "auto",
            endpoint: `https://${cloudflare.accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: cloudflare.accessKeyId,
                secretAccessKey: cloudflare.secretAccessKey
            },
            requestHandler: {
                httpsAgent: (await import("https")).default.Agent({
                    rejectUnauthorized: false // Temporaire pour contourner les problèmes SSL
                })
            }
        })

        const uploadWithRetry = async (attempt = 1, maxAttempts = 3) => {
            try {
                console.log(`Upload attempt ${attempt}/${maxAttempts} for file: ${fileName}`)

                const uploadParams = {
                    Bucket: cloudflare.bucketName,
                    Key: `properties/${fileName}`,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype
                    // Cloudflare R2 n'utilise pas les ACL comme S3
                }

                const command = new PutObjectCommand(uploadParams)
                await s3Client.send(command)

                // Construire l'URL publique - format Cloudflare R2 standard
                const imageUrl = `${cloudflare.publicUrl}/properties/${fileName}`
                console.log("Cloudflare R2 upload successful:")
                console.log("  - URL complète:", imageUrl)
                console.log("  - Bucket:", cloudflare.bucketName)
                console.log("  - Clé:", `properties/${fileName}`)
                return res.status(200).json({ url: imageUrl })

            } catch (error) {
                console.error(`Cloudflare R2 upload attempt ${attempt} failed:`, {
                    message: error.message,
                    code: error.code,
                    name: error.name,
                    statusCode: error.$metadata?.httpStatusCode,
                    requestId: error.$metadata?.requestId
                })

                // Retry on certain errors
                if (attempt < maxAttempts && (
                    error.code === 'TimeoutError' ||
                    error.code === 'NetworkingError' ||
                    error.code === 'RequestTimeout' ||
                    error.name === 'TimeoutError' ||
                    error.message?.includes('certificate') ||
                    error.message?.includes('SSL')
                )) {
                    console.log(`Retrying upload in ${attempt * 2} seconds...`)
                    await new Promise(resolve => setTimeout(resolve, attempt * 2000))
                    return uploadWithRetry(attempt + 1, maxAttempts)
                }

                return res.status(500).json({
                    error: `Upload failed after ${attempt} attempts: ${error.message}`
                })
            }
        }

        return uploadWithRetry()

    } catch (err) {
        console.error("Image upload error:", err)
        return res.status(500).json({ error: err.message || "Failed to upload image" })
    }
}

export const toggleVisibility = async (req, res) => {
    try {
        const { id } = req.params
        const userId = req.user?.userId
        
        if (!userId) {
            return res.status(401).json({ error: "Non authentifié" })
        }

        // Vérifier que la propriété appartient à l'utilisateur
        const property = await prisma.property.findFirst({
            where: {
                id: id,
                userId: userId
            }
        })

        if (!property) {
            return res.status(404).json({ error: "Propriété non trouvée" })
        }

        // Si on veut rendre visible, vérifier le quota
        if (!property.isVisible) {
            const visibleCount = await prisma.property.count({
                where: {
                    userId: userId,
                    isVisible: true
                }
            })

            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { subscription: true }
            })
            
            if (!user) {
                return res.status(404).json({ error: "Utilisateur non trouvé" })
            }

            const maxVisible = user.subscription?.visiblePropertiesLimit ?? 5

            if (visibleCount >= maxVisible) {
                return res.status(400).json({
                    error: `Vous avez atteint la limite de ${maxVisible} propriétés visibles selon votre plan`
                })
            }
        }

        // Toggle la visibilité
        const updatedProperty = await prisma.property.update({
            where: { id: id },
            data: { isVisible: !property.isVisible }
        })

        console.log(`Property ${id} visibility toggled to: ${updatedProperty.isVisible}`)
        return res.status(200).json({
            isVisible: updatedProperty.isVisible,
            message: updatedProperty.isVisible ? "Propriété rendue visible" : "Propriété masquée"
        })

    } catch (err) {
        console.error("Toggle visibility error:", err)
        return res.status(500).json({ error: "Erreur lors de la modification de la visibilité", details: err.message })
    }
}

export const checkVisibilityQuota = async (req, res) => {
    try {
        const userId = req.user?.userId
        
        if (!userId) {
            return res.status(401).json({ error: "Non authentifié" })
        }

        // Compter les propriétés visibles actuelles
        const visibleCount = await prisma.property.count({
            where: {
                userId: userId,
                isVisible: true
            }
        })

        // Récupérer la limite de l'utilisateur
        const maxVisible = await getVisibleLimit(userId)
        if (maxVisible === 0) {
            return res.status(404).json({ error: "Utilisateur non trouvé" })
        }
        const canMakeVisible = visibleCount < maxVisible

        console.log(`User ${userId} quota check: ${visibleCount}/${maxVisible} visible properties`)

        return res.status(200).json({
            canMakeVisible: canMakeVisible,
            currentVisible: visibleCount,
            maxVisible: maxVisible,
            remaining: Math.max(0, maxVisible - visibleCount)
        })

    } catch (err) {
        console.error("Check visibility quota error:", err)
        const errorMessage = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ error: "Erreur lors de la vérification du quota", details: errorMessage })
    }
}

export const incrementViews = async (req, res) => {
    try {
        const { id } = req.params

        if (!id) {
            return res.status(400).json({ error: "Property ID is required" })
        }

        // Increment views count
        const updatedProperty = await prisma.property.update({
            where: { id },
            data: {
                views: {
                    increment: 1
                }
            }
        })

        return res.status(200).json({
            success: true,
            views: typeof updatedProperty.views === 'bigint' ? Number(updatedProperty.views) : updatedProperty.views
        })
    } catch (err) {
        console.error("Increment views error:", err)
        return res.status(500).json({ error: "Erreur lors de l'incrémentation des vues" })
    }
}
