import prisma from "../lib/db.js"
import { Resend } from "resend"
import { cleanPhoneNumber } from "../lib/utils.js"

// initialize resend client (requires RESEND_API_KEY in env)
const resend = new Resend(process.env.RESEND_API_KEY)

// helpers
const isAdmin = (user) => user && user.categoryAccount === "ADMIN"
const isAgent = (user) => user && (user.categoryAccount === "AGENT" || user.categoryAccount === "AGENCE")

// list missions with sensible scoping
export const getMissions = async (req, res) => {
    try {
        const { page = 1, limit = 20, city, status } = req.query
        const where = {}

        const requesterId = req.user?.userId
        let dbUser = null
        if (requesterId) dbUser = await prisma.user.findUnique({ where: { id: requesterId } })

        if (!dbUser) {
            return res.status(401).json({ error: "Authentication required to list missions" })
        }

        // filter by city if provided
        if (city) {
            where.city = { contains: city, mode: "insensitive" }
        }

        // filter by status if provided (PENDING, ACCEPTED, etc.)
        if (status) {
            if (status === 'PENDING') {
                where.agentId = null
            } else if (status === 'ACCEPTED') {
                where.agentId = { not: null }
            }
        }

        if (!isAdmin(dbUser)) {
            if (dbUser.categoryAccount === "CUSTOMER") {
                where.userId = requesterId
            } else if (isAgent(dbUser)) {
                // Agents can see all missions in their city (to accept them) plus their own created missions
                where.OR = [
                    { city: { contains: city || '', mode: "insensitive" } },
                    { userId: requesterId }
                ]
            }
        }

        const take = Number(limit) || 20
        const skip = (Number(page) - 1) * take
        const missions = await prisma.mission.findMany({ where, skip, take, include: { user: true, agent: true } })
        const total = await prisma.mission.count({ where })
        return res.status(200).json({ missions, total, page: Number(page), limit: take })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getMission = async (req, res) => {
    try {
        const { id } = req.params
        const mission = await prisma.mission.findUnique({ where: { id }, include: { user: true, agent: true } })
        if (!mission) return res.status(404).json({ error: "Mission not found" })

        const requesterId = req.user?.userId
        let dbUser = null
        if (requesterId) dbUser = await prisma.user.findUnique({ where: { id: requesterId } })
        if (!dbUser) return res.status(401).json({ error: "Authentication required" })

        if (!isAdmin(dbUser) && mission.userId !== requesterId && mission.agentId !== requesterId) {
            return res.status(403).json({ error: "Forbidden" })
        }

        return res.status(200).json(mission)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const createMission = async (req, res) => {
    try {
        const requesterId = req.user?.userId // May be null if not authenticated

        // Validation
        const { address, city, country, minPrice, maxPrice, apartmentType, description, customerEmail, customerPhone, customerName, agentId } = req.body

        // Address, city, country are mandatory and must be selected from Mapbox
        if (!address || !city || !country || minPrice == null || maxPrice == null || !apartmentType || !description) {
            return res.status(400).json({ error: "address, city, country, minPrice, maxPrice, apartmentType and description are required" })
        }

        // If not authenticated, customerEmail and customerPhone are required
        if (!requesterId) {
            if (!customerEmail || !customerPhone) {
                return res.status(400).json({ error: "customerEmail and customerPhone are required for anonymous missions" })
            }
        }

        // If agentId is provided, validate that the agent exists and is actually an agent
        if (agentId) {
            const agent = await prisma.user.findUnique({ where: { id: agentId } })
            if (!agent) {
                return res.status(404).json({ error: "Agent not found" })
            }
            if (agent.categoryAccount !== "AGENT" && agent.categoryAccount !== "AGENCE") {
                return res.status(400).json({ error: "Specified user is not an agent" })
            }
        }

        const missionData = {
            address,
            city,
            country,
            minPrice: Number(minPrice),
            maxPrice: Number(maxPrice),
            apartmentType,
            description,
            customerEmail: customerEmail || null,
            customerPhone: customerPhone ? cleanPhoneNumber(customerPhone) : null,
            customerName: customerName || null,
            agentId: agentId || null
        }

        // Link to user if authenticated
        if (requesterId) {
            missionData.userId = requesterId
        }

        const mission = await prisma.mission.create({
            data: missionData
        })

        return res.status(201).json(mission)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const updateMission = async (req, res) => {
    try {
        const { id } = req.params
        const mission = await prisma.mission.findUnique({ where: { id } })
        if (!mission) return res.status(404).json({ error: "Mission not found" })

        const requesterId = req.user?.userId
        if (!requesterId) return res.status(401).json({ error: "Authentication required" })
        const dbUser = await prisma.user.findUnique({ where: { id: requesterId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })

        // owner, assigned agent or admin may update
        if (!(isAdmin(dbUser) || mission.userId === requesterId || mission.agentId === requesterId)) {
            return res.status(403).json({ error: "Forbidden" })
        }

        const data = { ...req.body }
        // ensure nulls for empty city/country
        if (data.city === '') data.city = null
        if (data.country === '') data.country = null
        // numeric conversions
        if (data.minPrice != null) data.minPrice = Number(data.minPrice)
        if (data.maxPrice != null) data.maxPrice = Number(data.maxPrice)
        const updated = await prisma.mission.update({ where: { id }, data })
        return res.status(200).json(updated)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

// agent accepts a mission (assigns self, optional message, sets acceptedAt and notifies owner)
export const acceptMission = async (req, res) => {
    try {
        const { id } = req.params
        const { message } = req.body

        const requesterId = req.user?.userId
        if (!requesterId) return res.status(401).json({ error: "Authentication required" })

        const dbUser = await prisma.user.findUnique({ where: { id: requesterId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })
        if (!isAgent(dbUser) && !isAdmin(dbUser)) {
            return res.status(403).json({ error: "Only agents or admins may accept missions" })
        }

        const mission = await prisma.mission.findUnique({ where: { id }, include: { user: true } })
        if (!mission) return res.status(404).json({ error: "Mission not found" })

        // if already accepted by another agent and requester is not admin, reject
        if (mission.agentId && mission.agentId !== requesterId && !isAdmin(dbUser)) {
            return res.status(409).json({ error: "Mission already accepted by another agent" })
        }

        const updated = await prisma.mission.update({
            where: { id },
            data: {
                agentId: requesterId,
                agentMessage: message || null,
                acceptedAt: new Date()
            },
            include: { user: true }
        })

        // send bilingual email notification to mission owner
        if (updated.user && updated.user.email) {
            const subject = "Votre mission a été prise en charge / Your mission has been accepted"
            const whatsappLink = dbUser.phone ? `https://wa.me/${dbUser.phone.replace(/\D/g, '')}` : null
            
            const fr = `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <h2 style="color: #FF8C00;">Bonne nouvelle ! Votre mission a été prise en charge</h2>
                    <p>Bonjour ${updated.user.firstname || ''},</p>
                    <p>Un agent a accepté votre mission et est intéressé pour vous aider.</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #FF8C00; margin: 20px 0;">
                        <p><strong>Détails de l'agent :</strong></p>
                        <p>📌 <strong>Nom :</strong> ${dbUser.firstname || ''} ${dbUser.lastname || ''}</p>
                        <p>✉️ <strong>Email :</strong> ${dbUser.email}</p>
                        ${dbUser.phone ? `<p>📱 <strong>WhatsApp :</strong> ${dbUser.phone}</p>` : ''}
                        ${message ? `<p>💬 <strong>Message de l'agent :</strong> ${message}</p>` : ''}
                    </div>
                    
                    <div style="background-color: #f0f0f0; padding: 15px; margin: 20px 0;">
                        <p><strong>Adresse de la mission :</strong></p>
                        <p>${updated.address || ''}${updated.city ? ', ' + updated.city : ''}${updated.country ? ', ' + updated.country : ''}</p>
                    </div>
                    
                    ${whatsappLink ? `<p><a href="${whatsappLink}" style="background-color: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">💬 Contacter sur WhatsApp</a></p>` : ''}
                    
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">Cet email a été envoyé par Watome. Veuillez ne pas y répondre.</p>
                </div>
            `
            
            const en = `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd;">
                    <h2 style="color: #FF8C00;">Great news! Your mission has been accepted</h2>
                    <p>Hello ${updated.user.firstname || ''},</p>
                    <p>An agent has accepted your request and is interested in helping you.</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #FF8C00; margin: 20px 0;">
                        <p><strong>Agent details:</strong></p>
                        <p>📌 <strong>Name:</strong> ${dbUser.firstname || ''} ${dbUser.lastname || ''}</p>
                        <p>✉️ <strong>Email:</strong> ${dbUser.email}</p>
                        ${dbUser.phone ? `<p>📱 <strong>WhatsApp:</strong> ${dbUser.phone}</p>` : ''}
                        ${message ? `<p>💬 <strong>Agent's message:</strong> ${message}</p>` : ''}
                    </div>
                    
                    <div style="background-color: #f0f0f0; padding: 15px; margin: 20px 0;">
                        <p><strong>Mission address:</strong></p>
                        <p>${updated.address || ''}${updated.city ? ', ' + updated.city : ''}${updated.country ? ', ' + updated.country : ''}</p>
                    </div>
                    
                    ${whatsappLink ? `<p><a href="${whatsappLink}" style="background-color: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">💬 Contact on WhatsApp</a></p>` : ''}
                    
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">This email was sent by Watome. Please do not reply to this email.</p>
                </div>
            `
            
            await resend.emails.send({
                from: "Watome <noreply@contact.watome.com>",
                to: updated.user.email,
                subject,
                html: fr + en
            })
        }

        return res.status(200).json(updated)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const deleteMission = async (req, res) => {
    try {
        const { id } = req.params
        const mission = await prisma.mission.findUnique({ where: { id } })
        if (!mission) return res.status(404).json({ error: "Mission not found" })

        const requesterId = req.user?.userId
        if (!requesterId) return res.status(401).json({ error: "Authentication required" })
        const dbUser = await prisma.user.findUnique({ where: { id: requesterId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })

        if (mission.userId === requesterId || isAdmin(dbUser)) {
            await prisma.mission.delete({ where: { id } })
            return res.status(204).send()
        }
        return res.status(403).json({ error: "Forbidden" })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}
