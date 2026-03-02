import prisma from "../lib/db.js"

// helper to check admin
const isAdmin = (user) => user && user.categoryAccount === "ADMIN"

export const setPlanPricing = async (req, res) => {
    try {
        const { planId } = req.body
        const userId = req.user.userId

        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return res.status(404).json({ error: "User not found" })
        if (user.categoryAccount !== "AGENT" && user.categoryAccount !== "AGENCE") {
            return res.status(403).json({ error: "Only agents/agences may select a subscription plan" })
        }

        // starter plan means remove subscription
        if (!planId || planId === "starter") {
            await prisma.user.update({ where: { id: userId }, data: { planSubscriptionId: null } })
            return res.status(200).json({ message: "Plan removed (starter tier)" })
        }

        const plan = await prisma.planSubscription.findUnique({ where: { id: planId } })
        if (!plan) return res.status(404).json({ error: "Plan not found" })

        await prisma.user.update({ where: { id: userId }, data: { planSubscriptionId: planId } })
        return res.status(200).json({ message: "Plan updated", plan })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
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
        // if (!isAdmin(req.user)) return res.status(403).json({ error: "Forbidden" })
        const { page = 1, limit = 20, search } = req.query
        const baseWhere = { categoryAccount: { in: ["AGENT", "AGENCE"] } }
        let where = baseWhere
        if (search) {
            where = {
                AND: [
                    baseWhere,
                    {
                        OR: [
                            { firstname: { contains: search, mode: "insensitive" } },
                            { lastname: { contains: search, mode: "insensitive" } },
                            { email: { contains: search, mode: "insensitive" } }
                        ]
                    }
                ]
            }
        }
        const take = Number(limit) || 20
        const skip = (Number(page) - 1) * take
        const agents = await prisma.user.findMany({ where, skip, take })
        const total = await prisma.user.count({ where })
        return res.status(200).json({ agents, total, page: Number(page), limit: take })
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
        const user = await prisma.user.findUnique({ where: { id } })
        if (!user) return res.status(404).json({ error: "User not found" })
        return res.status(200).json(user)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getMe = async (req, res) => {
    try {
        const id = req.user.userId
        const user = await prisma.user.findUnique({ where: { id } })
        if (!user) return res.status(404).json({ error: "User not found" })
        return res.status(200).json(user)
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
        const id = req.user.userId
        const data = { ...req.body }
        delete data.id
        if (data.email) delete data.email
        // users cannot change their own category via this endpoint
        if (data.categoryAccount) {
            delete data.categoryAccount
        }
        const user = await prisma.user.update({ where: { id }, data })
        return res.status(200).json(user)
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
        const plans = await prisma.planSubscription.findMany({ orderBy: { createdAt: 'asc' } })
        return res.status(200).json(plans)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: 'Internal Server Error' })
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
