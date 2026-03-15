import prisma from "../lib/db.js"

// helper to check admin
const isAdmin = (user) => user && user.categoryAccount === "ADMIN"

export const setPlanPricing = async (req, res) => {
    const transaction = await prisma.$transaction(async (prisma) => {
        const { planId, paymentMethod = null, transactionId = null } = req.body
        const userId = req.user.userId

        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) throw new Error("User not found")
        if (user.categoryAccount !== "AGENT" && user.categoryAccount !== "AGENCE") {
            throw new Error("Only agents/agences may select a subscription plan")
        }

        let selectedPlan;
        let action = 'SUBSCRIBE';

        // If no planId, find free plan
        if (!planId) {
            selectedPlan = await prisma.planSubscription.findFirst({
                where: { price: 0 }
            })
            if (!selectedPlan) {
                throw new Error("No free plan available")
            }
        } else {
            // Validate new plan exists by ID
            selectedPlan = await prisma.planSubscription.findUnique({ where: { id: planId } })
            if (!selectedPlan) throw new Error("Plan not found")
        }

        // Check if user already has an active subscription
        const existingSubscription = await prisma.userSubscription.findUnique({
            where: { userId: userId },
            include: { plan: true }
        })

        // Determine action type
        if (existingSubscription) {
            if (existingSubscription.planId === selectedPlan.id) {
                throw new Error("User already has this plan active")
            }
            if (selectedPlan.price > existingSubscription.plan.price) {
                action = 'UPGRADE'
            } else if (selectedPlan.price < existingSubscription.plan.price) {
                action = 'DOWNGRADE'
            } else {
                action = 'RENEW'
            }
        }

        // Calculate end date based on plan duration
        const startDate = new Date()
        const endDate = new Date(startDate)
        endDate.setMonth(endDate.getMonth() + selectedPlan.monthDuration)

        // Update or create UserSubscription
        const userSubscription = await prisma.userSubscription.upsert({
            where: { userId: userId },
            update: {
                planId: selectedPlan.id,
                startDate: startDate,
                endDate: endDate,
                amount: selectedPlan.price,
                status: "ACTIVE",
                paymentMethod: paymentMethod,
                updatedAt: new Date()
            },
            create: {
                userId: userId,
                planId: selectedPlan.id,
                startDate: startDate,
                endDate: endDate,
                amount: selectedPlan.price,
                status: "ACTIVE",
                paymentMethod: paymentMethod
            }
        })

        // Update user's current plan reference
        await prisma.user.update({
            where: { id: userId },
            data: { planSubscriptionId: selectedPlan.id }
        })

        // Handle property visibility based on plan limits
        const userProperties = await prisma.property.findMany({
            where: { userId: userId },
            orderBy: { createdAt: 'desc' }
        })

        if (userProperties.length > selectedPlan.visiblePropertiesLimit) {
            // Hide excess properties beyond the plan limit
            const propertiesToHide = userProperties.slice(selectedPlan.visiblePropertiesLimit)
            await prisma.property.updateMany({
                where: { id: { in: propertiesToHide.map(p => p.id) } },
                data: { isVisible: false }
            })
            console.log(`Cached ${propertiesToHide.length} properties due to plan limit (${selectedPlan.visiblePropertiesLimit})`)
        }

        // Record in subscription history only for paid subscriptions
        if (selectedPlan.price > 0) {
            await prisma.subscriptionHistory.create({
                data: {
                    userId: userId,
                    planId: selectedPlan.id,
                    action: action,
                    amount: selectedPlan.price,
                    paymentMethod: paymentMethod,
                    paymentStatus: transactionId ? 'COMPLETED' : 'PENDING',
                    transactionId: transactionId,
                    startDate: startDate,
                    endDate: endDate,
                    notes: existingSubscription ? `Changed from ${existingSubscription.plan.name}` : null
                }
            })
        }

        return { 
            message: action === 'UPGRADE' ? "Plan upgraded successfully" : 
                    action === 'DOWNGRADE' ? "Plan downgraded successfully" : 
                    "Plan activated successfully", 
            plan: selectedPlan,
            action: action
        }
    })

    try {
        return res.status(200).json(transaction)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: err.message || "Internal Server Error" })
    }
}

export const getUsers = async (req, res) => {
    try {
        // if (!isAdmin(req.user)) return res.status(403).json({ error: "Forbidden" })
        const { page = 1, limit = 20, search } = req.query
        const where = search ? {
            OR: [
                { firstname: { contains: search, mode: "insensitive" } },
                { lastname: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } }
            ]
        } : {}
        const take = Number(limit) || 20
        const skip = (Number(page) - 1) * take
        const users = await prisma.user.findMany({ where, skip, take })
        const total = await prisma.user.count({ where })
        return res.status(200).json({ users, total, page: Number(page), limit: take })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getAgents = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, location } = req.query
        const baseWhere = {
            categoryAccount: { in: ["AGENT", "AGENCE"] },
            isActive: true // Only show active agents
        }

        // Build combined filter for both search and location
        let where = baseWhere
        const searchConditions = []

        if (search) {
            searchConditions.push({
                OR: [
                    { firstname: { contains: search, mode: "insensitive" } },
                    { lastname: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { agence: { contains: search, mode: "insensitive" } }
                ]
            })
        }

        if (location) {
            // Split location by comma and search each part independently
            const locationParts = location.split(',').map(part => part.trim()).filter(part => part.length > 0);

            // Handle common country abbreviations
            const normalizedParts = locationParts.map(part => {
                const lowerPart = part.toLowerCase();
                // Common country mappings
                if (lowerPart === 'ci' || lowerPart === 'cote d\'ivoire' || lowerPart === 'côte d\'ivoire') {
                    return ['ci', 'cote d\'ivoire', 'côte d\'ivoire', 'ivoire'];
                }
                if (lowerPart === 'cm' || lowerPart === 'cameroun' || lowerPart === 'cameroon') {
                    return ['cameroun', 'cameroon', 'cm'];
                }
                return [part];
            }).flat();

            const locationConditions = normalizedParts.map(part => ({
                OR: [
                    { city: { contains: part, mode: "insensitive" } },
                    { country: { contains: part, mode: "insensitive" } },
                    { address: { contains: part, mode: "insensitive" } }
                ]
            }));

            searchConditions.push({
                AND: locationConditions
            });
        }

        if (searchConditions.length > 0) {
            where = {
                AND: [
                    baseWhere,
                    ...searchConditions
                ]
            }
        }

        const take = Number(limit) || 20
        const skip = (Number(page) - 1) * take
        const agents = await prisma.user.findMany({
            where,
            skip,
            take,
            select: {
                id: true,
                firstname: true,
                lastname: true,
                email: true,
                phone: true,
                agence: true,
                city: true,
                country: true,
                address: true,
                desc: true,
                profilePicture: true,
                categoryAccount: true,
                createdAt: true,
                languages: true,
                experience: true,
                salesCount: true,
                specialties: true,
                bio: true,
                _count: {
                    select: {
                        properties: true,
                        missionsRequested: true,
                        missionsAssigned: true,
                        bookings: true,
                        subscriptionHistory: true
                    }
                }
            }
        })

        // Get visible properties count for each agent
        const agentsWithVisibleCount = await Promise.all(
            agents.map(async (agent) => {
                const visiblePropertiesCount = await prisma.property.count({
                    where: {
                        userId: agent.id,
                        isVisible: true
                    }
                })
                return {
                    ...agent,
                    _count: {
                        ...agent._count,
                        visibleProperties: visiblePropertiesCount
                    }
                }
            })
        )

        const total = await prisma.user.count({ where })
        return res.status(200).json({ agents: agentsWithVisibleCount, total, page: Number(page), limit: take })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getAgent = async (req, res) => {
    try {
        const id = req.params.id

        const agent = await prisma.user.findUnique({
            where: {
                id,
                categoryAccount: { in: ["AGENT", "AGENCE"] },
                isActive: true // Only show active agents
            },
            select: {
                id: true,
                firstname: true,
                lastname: true,
                email: true,
                phone: true,
                agence: true,
                city: true,
                country: true,
                address: true,
                desc: true,
                profilePicture: true,
                categoryAccount: true,
                createdAt: true,
                languages: true,
                experience: true,
                salesCount: true,
                specialties: true,
                bio: true,
                _count: {
                    select: {
                        properties: true,
                        missionsRequested: true,
                        missionsAssigned: true,
                        bookings: true,
                        subscriptionHistory: true
                    }
                }
            }
        })

        if (!agent) return res.status(404).json({ error: "Agent not found" })

        // Count visible properties separately
        const visiblePropertiesCount = await prisma.property.count({
            where: {
                userId: id,
                isVisible: true
            }
        })

        // Add visible properties count to the response
        const agentWithVisibleCount = {
            ...agent,
            _count: {
                ...agent._count,
                visibleProperties: visiblePropertiesCount
            }
        }

        return res.status(200).json(agentWithVisibleCount)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getUser = async (req, res) => {
    try {
        const id = req.params.id
        if (!isAdmin(req.user) && req.user.userId !== id) {
            return res.status(403).json({ error: "Forbidden" })
        }
        const user = await prisma.user.findUnique({ 
            where: { id },
            include: {
                properties: {
                    select: { id: true, isVisible: true }
                }
            }
        })
        if (!user) return res.status(404).json({ error: "User not found" })

        // Add count of properties
        const userWithCount = {
            ...user,
            _count: {
                properties: user.properties.length,
                visibleProperties: user.properties.filter(p => p.isVisible).length
            }
        }

        return res.status(200).json(userWithCount)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getMe = async (req, res) => {
    try {
        const id = req.user.userId

        // Get user with basic info and current plan
        // fetch user and include property visibility flag so we can compute both totals
        const user = await prisma.user.findUnique({
            where: { id },
            include: {
                subscription: true,
                properties: {
                    select: { id: true, isVisible: true }
                }
            }
        })

        if (!user) return res.status(404).json({ error: "User not found" })

        // Get active subscription
        const activeSubscription = await prisma.userSubscription.findFirst({
            where: {
                userId: id,
                status: "ACTIVE"
            },
            include: {
                plan: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        // compute counts
        const totalProperties = user.properties.length;
        const visibleProperties = user.properties.filter(p => p.isVisible).length;

        // Add count of properties and active subscription
        const userWithCount = {
            ...user,
            _count: {
                properties: totalProperties,
                visibleProperties: visibleProperties
            },
            activeSubscription: activeSubscription
        }

        return res.status(200).json(userWithCount)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const updateUser = async (req, res) => {
    try {
        const id = req.params.id
        if (!isAdmin(req.user) && req.user.userId !== id) {
            return res.status(403).json({ error: "Forbidden" })
        }
        const data = { ...req.body }
        // prevent id/email change maybe
        delete data.id
        if (data.email) delete data.email
        // only admin may modify category directly
        if (data.categoryAccount && !isAdmin(req.user)) {
            delete data.categoryAccount
        }
        const user = await prisma.user.update({ where: { id }, data })
        return res.status(200).json(user)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const updateMe = async (req, res) => {
    try {
        console.log("updateMe called with body:", req.body)
        const id = req.user.userId

        // Only allow properties that actually exist on the User model.
        // Passing unknown properties (e.g. `bio`) to Prisma causes a validation error.
        // Map known aliases: `bio` -> `desc`.
        const rawData = { ...req.body }
        if (typeof rawData.bio === "string" && rawData.desc === undefined) {
            rawData.desc = rawData.bio
        }

        const allowedFields = new Set([
            "firstname",
            "lastname",
            "phone",
            "agence",
            "city",
            "country",
            "address",
            "desc",
            "profilePicture",
            "languages",
            "experience",
            "salesCount",
            "specialties",
            "bio"
        ])

        let data = Object.fromEntries(
            Object.entries(rawData).filter(([key]) => allowedFields.has(key))
        )

        // Convert empty strings into null for optional fields to avoid unique constraint issues.
        // This is especially important for `phone` (which is unique) and other optional metadata.
        const optionalFields = [
            "phone",
            "agence",
            "city",
            "country",
            "address",
            "desc",
            "profilePicture",
            "experience",
            "bio"
        ]
        for (const key of optionalFields) {
            if (data[key] !== undefined && typeof data[key] === "string") {
                const trimmed = data[key].trim();
                data[key] = trimmed === "" ? null : trimmed;
            }
        }

        // For agents, ensure city and country are provided if address is being updated
        const user = await prisma.user.findUnique({ where: { id } })
        if (user.categoryAccount === 'AGENT' && data.address && (!data.city || !data.country)) {
            return res.status(400).json({ error: "Pour les agents, l'adresse doit obligatoirement contenir la ville et le pays." })
        }

        const updatedUser = await prisma.user.update({ where: { id }, data })
        return res.status(200).json(updatedUser)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const deleteUser = async (req, res) => {
    try {
        const id = req.params.id
        if (!isAdmin(req.user)) {
            return res.status(403).json({ error: "Forbidden" })
        }
        await prisma.user.delete({ where: { id } })
        return res.status(204).send()
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const deleteMe = async (req, res) => {
    try {
        const id = req.user.userId
        await prisma.user.delete({ where: { id } })
        return res.status(204).send()
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const uploadProfilePhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No photo provided" })
        }
        // same Cloudflare config as propertyController
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
        const fileName = `profile_${req.user.userId}_${Date.now()}`
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
                    rejectUnauthorized: false
                })
            }
        })
        const uploadParams = {
            Bucket: cloudflare.bucketName,
            Key: `profiles/${fileName}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }
        const command = new PutObjectCommand(uploadParams)
        await s3Client.send(command)
        const url = `${cloudflare.publicUrl}/profiles/${fileName}`
        // save url in user record
        await prisma.user.update({ where: { id: req.user.userId }, data: { profilePicture: url } })
        return res.status(200).json({ url })
    } catch (err) {
        console.error("uploadProfilePhoto error:", err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

// convenience endpoints for explicitly removing or upgrading plan
export const removePlan = async (req, res) => {
    try {
        const id = req.user.userId
        await prisma.user.update({ where: { id }, data: { planSubscriptionId: null } })
        return res.status(200).json({ message: "Plan removed" })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

// allow a regular customer to upgrade their account to an AGENT
export const becomeAgent = async (req, res) => {
    try {
        const id = req.user.userId
        const { agence } = req.body // optional additional info

        const user = await prisma.user.findUnique({ where: { id } })
        if (!user) return res.status(404).json({ error: "User not found" })
        if (user.categoryAccount === "AGENT" || user.categoryAccount === "AGENCE") {
            return res.status(400).json({ error: "Account is already an agent/agency" })
        }

        const data = { categoryAccount: "AGENT" }
        if (agence) data.agence = agence

        const updated = await prisma.user.update({ where: { id }, data })
        return res.status(200).json({ message: "Account upgraded to agent", user: updated })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const upgradePlan = async (req, res) => {
    try {
        const id = req.user.userId
        const { planId } = req.body
        const plan = await prisma.planSubscription.findUnique({ where: { id: planId } })
        if (!plan) return res.status(404).json({ error: "Plan not found" })
        await prisma.user.update({ where: { id }, data: { planSubscriptionId: planId } })
        return res.status(200).json({ message: "Plan upgraded", plan })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

// --- admin plan management ------------------------------------------------

export const getPlans = async (req, res) => {
    try {
        const plans = await prisma.planSubscription.findMany({
            orderBy: {
                createdAt: 'asc'
            }
        })
        return res.status(200).json(plans)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getUserSubscriptionHistory = async (req, res) => {
    try {
        const userId = req.user.userId
        const limit = Math.min(parseInt(req.query.limit) || 10, 100) // Max 100 per request
        const offset = parseInt(req.query.offset) || 0

        const [history, total] = await Promise.all([
            prisma.subscriptionHistory.findMany({
                where: { userId: userId },
                include: {
                    plan: true
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: limit,
                skip: offset
            }),
            prisma.subscriptionHistory.count({
                where: { userId: userId }
            })
        ])

        return res.status(200).json({
            data: history,
            total: total,
            limit: limit,
            offset: offset,
            hasMore: offset + limit < total
        })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getPaymentHistory = async (req, res) => {
    try {
        const userId = req.user.userId

        const payments = await prisma.subscriptionHistory.findMany({
            where: { 
                userId: userId,
                amount: { gt: 0 },
                paymentStatus: 'COMPLETED'
            },
            include: {
                plan: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        return res.status(200).json(payments)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const createPlan = async (req, res) => {
    try {
        const { name, price, monthDuration, infos, visiblePropertiesLimit } = req.body
        if (!name || price == null || monthDuration == null) {
            return res.status(400).json({ error: 'name, price and monthDuration are required' })
        }
        const plan = await prisma.planSubscription.create({
            data: {
                name,
                price: Number(price),
                monthDuration: Number(monthDuration),
                infos: infos || [],
                visiblePropertiesLimit: visiblePropertiesLimit != null ? Number(visiblePropertiesLimit) : undefined
            }
        })
        return res.status(201).json(plan)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}

export const updatePlan = async (req, res) => {
    try {
        const { id } = req.params
        const data = { ...req.body }
        if (data.price != null) data.price = Number(data.price)
        if (data.monthDuration != null) data.monthDuration = Number(data.monthDuration)
        if (data.visiblePropertiesLimit != null) data.visiblePropertiesLimit = Number(data.visiblePropertiesLimit)
        const plan = await prisma.planSubscription.update({ where: { id }, data })
        return res.status(200).json(plan)
    } catch (err) {
        console.error(err)
        if (err.code === 'P2025') { // record not found
            return res.status(404).json({ error: 'Plan not found' })
        }
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}

export const deletePlan = async (req, res) => {
    try {
        const { id } = req.params
        await prisma.planSubscription.delete({ where: { id } })
        return res.status(204).send()
    } catch (err) {
        console.error(err)
        if (err.code === 'P2025') {
            return res.status(404).json({ error: 'Plan not found' })
        }
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}

// admin can assign or change a user's plan
export const adminSetUserPlan = async (req, res) => {
    try {
        const { userId, planId } = req.body
        if (!userId) return res.status(400).json({ error: 'userId required' })
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return res.status(404).json({ error: 'User not found' })
        if (planId) {
            const plan = await prisma.planSubscription.findUnique({ where: { id: planId } })
            if (!plan) return res.status(404).json({ error: 'Plan not found' })
        }
        await prisma.user.update({ where: { id: userId }, data: { planSubscriptionId: planId || null } })
        return res.status(200).json({ message: 'User plan updated' })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}
