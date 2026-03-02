import prisma from "../lib/db.js"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

// register an email for coming soon
export const registerWaitlist = async (req, res) => {
    try {
        const { email } = req.body
        console.log("KEY:", process.env.RESEND_API_KEY)
        if (!email) return res.status(400).json({ error: "Email required" })
        // upsert to avoid duplicates
        const entry = await prisma.waitlistEntry.upsert({
            where: { email },
            update: {},
            create: { email }
        })

        // send bilingual confirmation
        const subject = "Vous êtes sur la liste d'attente / You're on the waitlist"
        const bilingualHtml = `
            <p>Bonjour,</p>
            <p>Votre adresse a bien été ajoutée à la liste d'attente. Nous vous informons dès que l'application est disponible.</p>
            <hr/>
            <p>Hello,</p>
            <p>Your email has been added to the waitlist. We’ll notify you when the app is live.</p>
        `

          const { data, error } = await resend.emails.send({
            from: "Watome <onboarding@resend.dev>",
            to: [email],
            subject,
            html: bilingualHtml,
          });

        if (error) {
           return res.status(400).json({ error });
         }

        return res.status(201).json({ message: "Registered", entry })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

// get all entries (admin)
export const getWaitlist = async (req, res) => {
    try {
        const entries = await prisma.waitlistEntry.findMany({ orderBy: { createdAt: "asc" } })
        return res.status(200).json(entries)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

// send announcement to all waitlist emails
export const announceWaitlist = async (req, res) => {
    try {
        const { subjectFr, subjectEn, htmlFr, htmlEn } = req.body
        if (!subjectFr || !subjectEn || !htmlFr || !htmlEn) {
            return res.status(400).json({ error: "SubjectFr, subjectEn, htmlFr and htmlEn are required" })
        }
        const entries = await prisma.waitlistEntry.findMany({ select: { email: true } })
        const toEmails = entries.map(e => e.email)
        if (toEmails.length === 0) return res.status(200).json({ message: "No waitlist entries" })

        const combinedSubject = `${subjectFr} / ${subjectEn}`
        const combinedHtml = `
            <div>
                ${htmlFr}
                <hr/>
                ${htmlEn}
            </div>
        `
        for (const email of toEmails) {
            await resend.emails.send({
                from: "Watome <onboarding@resend.dev>",
                to: email,
                subject: combinedSubject,
                html: combinedHtml
            })
        }
        return res.status(200).json({ message: "Announcement sent", count: toEmails.length })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}
