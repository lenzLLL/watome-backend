import prisma from "../lib/db.js"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

const isAdmin = (user) => user && user.categoryAccount === "ADMIN"

// Helper functions for BigInt serialization
const serializeProperty = (property) => {
    if (!property) return property
    return {
        ...property,
        views: property.views ? Number(property.views) : 0
    }
}

const serializeBooking = (booking) => {
    if (!booking) return booking
    return {
        ...booking,
        property: serializeProperty(booking.property)
    }
}

const serializeBookings = (bookings) => {
    return bookings.map(serializeBooking)
}

// Helper function to send booking notification emails
const sendBookingNotification = async (booking, action) => {
    try {
        const customer = await prisma.user.findUnique({ where: { id: booking.customerId } })
        const agent = await prisma.user.findUnique({ where: { id: booking.property.userId } })

        if (!customer || !agent) return

        const property = booking.property
        const startDate = new Date(booking.startDate).toLocaleDateString('fr-FR')
        const endDate = booking.endDate ? new Date(booking.endDate).toLocaleDateString('fr-FR') : 'Non spécifiée'

        let subject, htmlContent

        if (action === 'CONFIRMED') {
            subject = "Votre réservation a été confirmée / Your booking has been confirmed"
            htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <!-- FRENCH VERSION -->
                    <div style="margin-bottom: 50px;">
                        <h1 style="color: #FF8C42; margin-bottom: 20px;">Réservation confirmée!</h1>
                        <p style="color: #333; line-height: 1.6;">Bonjour ${customer.firstname || ""},</p>
                        <p style="color: #333; line-height: 1.6;">Votre réservation pour la propriété <strong>${property.title}</strong> a été confirmée par l'agent ${agent.firstname || ""} ${agent.lastname || ""}.</p>

                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="color: #FF8C42; margin-bottom: 10px;">Détails de la réservation:</h3>
                            <p><strong>Propriété:</strong> ${property.title}</p>
                            <p><strong>Adresse:</strong> ${property.address}</p>
                            <p><strong>Date d'arrivée:</strong> ${startDate}</p>
                            <p><strong>Date de départ:</strong> ${endDate}</p>
                            <p><strong>Prix:</strong> ${booking.price} FCFA</p>
                        </div>

                        <p style="color: #333; line-height: 1.6;">Vous pouvez contacter l'agent directement pour toute question supplémentaire.</p>
                        <p style="color: #666; font-size: 12px;">Email de l'agent: ${agent.email}</p>
                    </div>

                    <hr style="border: none; border-top: 2px solid #eee; margin: 30px 0;">

                    <!-- ENGLISH VERSION -->
                    <div>
                        <h1 style="color: #FF8C42; margin-bottom: 20px;">Booking Confirmed!</h1>
                        <p style="color: #333; line-height: 1.6;">Hello ${customer.firstname || ""},</p>
                        <p style="color: #333; line-height: 1.6;">Your booking for the property <strong>${property.title}</strong> has been confirmed by agent ${agent.firstname || ""} ${agent.lastname || ""}.</p>

                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="color: #FF8C42; margin-bottom: 10px;">Booking Details:</h3>
                            <p><strong>Property:</strong> ${property.title}</p>
                            <p><strong>Address:</strong> ${property.address}</p>
                            <p><strong>Check-in:</strong> ${startDate}</p>
                            <p><strong>Check-out:</strong> ${endDate}</p>
                            <p><strong>Price:</strong> ${booking.price} FCFA</p>
                        </div>

                        <p style="color: #333; line-height: 1.6;">You can contact the agent directly for any additional questions.</p>
                        <p style="color: #666; font-size: 12px;">Agent's email: ${agent.email}</p>
                    </div>

                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #999; font-size: 12px; text-align: center;">© 2026 Watome. All rights reserved.</p>
                </div>
            `
        } else if (action === 'CANCELLED') {
            subject = "Votre réservation a été annulée / Your booking has been cancelled"
            htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <!-- FRENCH VERSION -->
                    <div style="margin-bottom: 50px;">
                        <h1 style="color: #FF8C42; margin-bottom: 20px;">Réservation annulée</h1>
                        <p style="color: #333; line-height: 1.6;">Bonjour ${customer.firstname || ""},</p>
                        <p style="color: #333; line-height: 1.6;">Votre réservation pour la propriété <strong>${property.title}</strong> a été annulée.</p>

                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="color: #FF8C42; margin-bottom: 10px;">Détails de la réservation annulée:</h3>
                            <p><strong>Propriété:</strong> ${property.title}</p>
                            <p><strong>Adresse:</strong> ${property.address}</p>
                            <p><strong>Date d'arrivée:</strong> ${startDate}</p>
                            <p><strong>Date de départ:</strong> ${endDate}</p>
                        </div>

                        <p style="color: #333; line-height: 1.6;">Si vous avez des questions, n'hésitez pas à nous contacter.</p>
                    </div>

                    <hr style="border: none; border-top: 2px solid #eee; margin: 30px 0;">

                    <!-- ENGLISH VERSION -->
                    <div>
                        <h1 style="color: #FF8C42; margin-bottom: 20px;">Booking Cancelled</h1>
                        <p style="color: #333; line-height: 1.6;">Hello ${customer.firstname || ""},</p>
                        <p style="color: #333; line-height: 1.6;">Your booking for the property <strong>${property.title}</strong> has been cancelled.</p>

                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="color: #FF8C42; margin-bottom: 10px;">Cancelled Booking Details:</h3>
                            <p><strong>Property:</strong> ${property.title}</p>
                            <p><strong>Address:</strong> ${property.address}</p>
                            <p><strong>Check-in:</strong> ${startDate}</p>
                            <p><strong>Check-out:</strong> ${endDate}</p>
                        </div>

                        <p style="color: #333; line-height: 1.6;">If you have any questions, please don't hesitate to contact us.</p>
                    </div>

                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #999; font-size: 12px; text-align: center;">© 2026 Watome. All rights reserved.</p>
                </div>
            `
        }

        if (subject && htmlContent) {
            const { data, error } = await resend.emails.send({
                from: "Watome <onboarding@resend.dev>",
                to: customer.email,
                subject: subject,
                html: htmlContent
            })

            if (error) {
                console.error("Error sending booking notification email:", error)
            } else {
                console.log("Booking notification email sent successfully")
            }
        }
    } catch (error) {
        console.error("Error in sendBookingNotification:", error)
    }
}

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
        return res.status(200).json({ bookings: serializeBookings(bookings), total, page: Number(page), limit: take })
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

        return res.status(200).json(serializeBooking(booking))
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

        const updated = await prisma.booking.update({ where: { id }, data, include: { property: true } })

        // Send notification email if status changed to CONFIRMED or CANCELLED
        if (data.status && (data.status === 'CONFIRMED' || data.status === 'CANCELLED')) {
            await sendBookingNotification(updated, data.status)
        }

        return res.status(200).json(serializeBooking(updated))
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
