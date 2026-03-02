import prisma from "../lib/db.js"

const isAdmin = (user) => user && user.categoryAccount === "ADMIN"

// list bookings with sensible scoping
export const getBookings = async (req, res) => {
    try {
        const { page = 1, limit = 20, propertyId } = req.query
        const where = {}
        if (propertyId) where.propertyId = propertyId

        const requesterId = req.user?.userId
        let dbUser = null
        if (requesterId) dbUser = await prisma.user.findUnique({ where: { id: requesterId } })

        if (!dbUser) {
            return res.status(401).json({ error: "Authentication required to list bookings" })
        }

        if (!isAdmin(dbUser)) {
            // customers see their bookings; agents see their bookings and bookings for their properties
            if (dbUser.categoryAccount === "CUSTOMER") {
                where.customerId = requesterId
            } else if (dbUser.categoryAccount === "AGENT" || dbUser.categoryAccount === "AGENCE") {
                where.OR = [
                    { customerId: requesterId },
                    { property: { userId: requesterId } }
                ]
            }
        }

        const take = Number(limit) || 20
        const skip = (Number(page) - 1) * take
        const bookings = await prisma.booking.findMany({ where, skip, take, include: { property: true, customer: true } })
        const total = await prisma.booking.count({ where })
        return res.status(200).json({ bookings, total, page: Number(page), limit: take })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const getBooking = async (req, res) => {
    try {
        const { id } = req.params
        const booking = await prisma.booking.findUnique({ where: { id }, include: { property: true, customer: true } })
        if (!booking) return res.status(404).json({ error: "Booking not found" })

        const requesterId = req.user?.userId
        let dbUser = null
        if (requesterId) dbUser = await prisma.user.findUnique({ where: { id: requesterId } })
        if (!dbUser) return res.status(401).json({ error: "Authentication required" })

        if (!isAdmin(dbUser) && booking.customerId !== requesterId && booking.property.userId !== requesterId) {
            return res.status(403).json({ error: "Forbidden" })
        }

        return res.status(200).json(booking)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const createBooking = async (req, res) => {
    try {
        const requesterId = req.user?.userId
        if (!requesterId) return res.status(401).json({ error: "Authentication required" })

        const dbUser = await prisma.user.findUnique({ where: { id: requesterId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })

        const { propertyId, startDate, endDate, price } = req.body
        if (!propertyId || !startDate) return res.status(400).json({ error: "propertyId and startDate are required" })

        const property = await prisma.property.findUnique({ where: { id: propertyId } })
        if (!property) return res.status(404).json({ error: "Property not found" })

        // create booking; status defaults to PENDING
        const booking = await prisma.booking.create({
            data: {
                propertyId,
                customerId: requesterId,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                price: price != null ? Number(price) : property.price
            }
        })
        return res.status(201).json(booking)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const updateBooking = async (req, res) => {
    try {
        const { id } = req.params
        const booking = await prisma.booking.findUnique({ where: { id }, include: { property: true } })
        if (!booking) return res.status(404).json({ error: "Booking not found" })

        const requesterId = req.user?.userId
        if (!requesterId) return res.status(401).json({ error: "Authentication required" })
        const dbUser = await prisma.user.findUnique({ where: { id: requesterId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })

        const data = { ...req.body }

        // status changes: only admin or property owner may confirm; customer may cancel
        if (data.status && (data.status === 'CONFIRMED')) {
            if (!(isAdmin(dbUser) || booking.property.userId === requesterId)) {
                return res.status(403).json({ error: 'Only admin or property owner can confirm bookings' })
            }
        }
        if (data.status && (data.status === 'CANCELLED')) {
            // customer, admin or property owner can cancel
            if (!(isAdmin(dbUser) || booking.customerId === requesterId || booking.property.userId === requesterId)) {
                return res.status(403).json({ error: 'Not allowed to cancel this booking' })
            }
        }

        if (data.startDate) data.startDate = new Date(data.startDate)
        if (data.endDate) data.endDate = new Date(data.endDate)
        if (data.price != null) data.price = Number(data.price)

        const updated = await prisma.booking.update({ where: { id }, data })
        return res.status(200).json(updated)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

export const deleteBooking = async (req, res) => {
    try {
        const { id } = req.params
        const booking = await prisma.booking.findUnique({ where: { id }, include: { property: true } })
        if (!booking) return res.status(404).json({ error: "Booking not found" })

        const requesterId = req.user?.userId
        if (!requesterId) return res.status(401).json({ error: "Authentication required" })
        const dbUser = await prisma.user.findUnique({ where: { id: requesterId } })
        if (!dbUser) return res.status(404).json({ error: "User not found" })

        // allow customer to cancel (set status) or admin to delete
        if (booking.customerId === requesterId) {
            const updated = await prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } })
            return res.status(200).json(updated)
        }
        if (isAdmin(dbUser) || booking.property.userId === requesterId) {
            await prisma.booking.delete({ where: { id } })
            return res.status(204).send()
        }
        return res.status(403).json({ error: "Forbidden" })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}
