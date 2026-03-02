import prisma from "../lib/db.js"

const isAdmin = (user) => user && user.categoryAccount === "ADMIN"
const isAgent = (user) => user && (user.categoryAccount === "AGENT" || user.categoryAccount === "AGENCE")

export const getAgentStats = async (req, res) => {
    try {
        // compute stats using existing models (no Proposal model assumed)
        const agentId = req.user?.userId
        if (!agentId) return res.status(401).json({ error: "Authentication required" })
        const dbUser = await prisma.user.findUnique({ where: { id: agentId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })
        if (!isAgent(dbUser) && !isAdmin(dbUser)) return res.status(403).json({ error: "Forbidden" })
        // number of missions assigned to this agent
        const totalAssigned = await prisma.mission.count({ where: { agentId } })
        // number of missions the agent created
        const totalCreated = await prisma.mission.count({ where: { userId: agentId } })

        // recent assigned missions
        const recentAssigned = await prisma.mission.findMany({ where: { agentId }, take: 10, orderBy: { updatedAt: 'desc' }, include: { user: true } })

        // average assignment delay for assigned missions (updatedAt - createdAt)
        const assignedMissions = await prisma.mission.findMany({ where: { agentId }, select: { createdAt: true, updatedAt: true } })
        let avgAssignmentMs = null
        if (assignedMissions.length > 0) {
            const diffs = assignedMissions.map(m => new Date(m.updatedAt).getTime() - new Date(m.createdAt).getTime())
            avgAssignmentMs = Math.round(diffs.reduce((a,b) => a+b, 0) / diffs.length)
        }

        return res.status(200).json({
            agentId,
            totalAssigned,
            totalCreated,
            avgAssignmentMs,
            recentAssigned
        })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}

export const getAdminStats = async (req, res) => {
    try {
        const requesterId = req.user?.userId
        if (!requesterId) return res.status(401).json({ error: "Authentication required" })
        const dbUser = await prisma.user.findUnique({ where: { id: requesterId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })
        if (!isAdmin(dbUser)) return res.status(403).json({ error: "Forbidden" })

        const totalUsers = await prisma.user.count()
        const totalAgents = await prisma.user.count({ where: { categoryAccount: { in: ["AGENT", "AGENCE"] } } })
        const totalMissions = await prisma.mission.count()
        const totalProposals = 0 // no Proposal model available in current schema
        const totalBookings = await prisma.booking.count()

        // average assignment delay across all missions that were assigned (updatedAt - createdAt)
        const assigned = await prisma.mission.findMany({ where: { agentId: { not: null } }, select: { createdAt: true, updatedAt: true } })
        let avgAcceptanceMs = null
        if (assigned.length > 0) {
            const diffs = assigned.map(m => new Date(m.updatedAt).getTime() - new Date(m.createdAt).getTime())
            avgAcceptanceMs = Math.round(diffs.reduce((a,b) => a+b, 0) / diffs.length)
        }

        // top agents by accepted missions
        const topAgentsRaw = await prisma.mission.groupBy({
            by: ['agentId'],
            where: { agentId: { not: null } },
            _count: { agentId: true },
            orderBy: { _count: { agentId: 'desc' } },
            take: 5
        })
        const agentIds = topAgentsRaw.map(r => r.agentId)
        const agents = agentIds.length ? await prisma.user.findMany({ where: { id: { in: agentIds } } }) : []
        const topAgents = topAgentsRaw.map(r => ({ agentId: r.agentId, acceptedCount: r._count.agentId, agent: agents.find(a => a.id === r.agentId) || null }))

        return res.status(200).json({
            totalUsers,
            totalAgents,
            totalMissions,
            totalProposals,
            totalBookings,
            avgAcceptanceMs,
            topAgents
        })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}
