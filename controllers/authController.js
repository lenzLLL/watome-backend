import prisma from "../lib/db.js"
import { genSalt, hash, compare } from "bcrypt"
import jwt from "jsonwebtoken"
import { v4 as uuidv4 } from "uuid"
import { Resend } from "resend"

// initialize resend client with API key from env
const resend = new Resend(process.env.RESEND_API_KEY)

const generatePassword = async (password) => {
    const salt = await genSalt()
    return await hash(password,salt)
}
const maxAge = 3 * 24 * 60 * 60 * 1000
const createToken = (email,userId,categoryAccount) => {
    return jwt.sign({email,userId,categoryAccount},process.env.JWT_KEY,{ expiresIn: '3d' })    
} 
// helper to construct activation link and send email
const sendActivationMail = async (user) => {
    const frontend = process.env.FRONTEND_URL || "http://localhost:3000"
    const link = `${frontend}/activate-account?token=${user.activationToken}`
    const { data, error } = await resend.emails.send({
        from: "Watome <onboarding@resend.dev>",
        to: user.email,
        subject: "Activate your Watome account / Activez votre compte Watome",
        html: `
            <p>Bonjour ${user.firstname || ""},</p>
            <p>Merci de vous être inscrit(e) sur Watome. Cliquez sur le lien ci-dessous pour activer votre compte :</p>
            <p><a href="${link}">Activer mon compte</a></p>
            <hr/>
            <p>Hello ${user.firstname || ""},</p>
            <p>Thank you for signing up on Watome. Please click the link below to activate your account:</p>
            <p><a href="${link}">Activate my account</a></p>
        `
    })
        return error? error:null
}

export const signup = async (req,res,next) => {
    try{
        // shared prisma client
        const {firstname,lastname,agence,adresse,category,city,country, email,password} = req.body

        if(!email || !password) {
            return res.status(400).json({error: "Email and password are required"})
        }

        const verifyEmail = await prisma.user.findFirst({ where:{ email }})
        if(verifyEmail){
            return res.status(400).json({error: "Email already in use"})
        }

        // generate activation token
        const activationToken = uuidv4()

        const user = await prisma.user.create({
            data:{
                email,
                password:await generatePassword(password),
                firstname,
                lastname,
                agence,
                address:adresse,
                city,
                country,
                category,
                categoryAccount:category==="agent"?"AGENT":category==="agence"?"AGENCE":"CUSTOMER",
                activationToken,
                isActive: false
            }
        })

        // send the initial activation email
        const r = await sendActivationMail(user)
        if(r){
            return res.status(500).json({error: "Error sending activation email", details: r})
        }
        return res.status(201).json({message: "User created, please check your email to activate your account"})

    }
    catch(Err){
        console.log(Err)
        return res.status(500).send("Internal Server Error")
    }
}

export const login = async (req, res) => {
    try {
        // shared prisma client
        const { email, password } = req.body
        if(!email || !password) {
            return res.status(400).json({error: "Email and password are required"})
        }

        const user = await prisma.user.findUnique({ where: { email } })
        if(!user) {
            return res.status(401).json({error: "Invalid credentials"})
        }
        if(!user.isActive) {
            // resend or generate a new activation token if missing
            let token = user.activationToken
            if(!token) {
                token = uuidv4()
                await prisma.user.update({
                    where: { id: user.id },
                    data: { activationToken: token }
                })
                user.activationToken = token
            }
            await sendActivationMail(user)
            return res.status(403).json({error: "Account not activated. A fresh activation link has been sent to your email."})
        }

        const match = await compare(password, user.password)
        if(!match) {
            return res.status(401).json({error: "Invalid credentials"})
        }

        const tokenJWT = createToken(user.email, user.id, user.categoryAccount)
        return res.status(200).json({jwt: tokenJWT, user:{id:user.id,email:user.email,categoryAccount:user.categoryAccount}})
    } catch(err) {
        console.error(err)
        return res.status(500).json({error: "Internal Server Error"})
    }
}

export const activateAccount = async (req, res) => {
    try {
        // shared prisma client
        const { token } = req.body
        if(!token) return res.status(400).json({error: "Token required"})

        const user = await prisma.user.findFirst({ where: { activationToken: token } })
        if(!user) return res.status(400).json({error: "Invalid token"})

        await prisma.user.update({
            where: { id: user.id },
            data: { isActive: true, activationToken: null }
        })

        return res.status(200).json({message: "Account activated"})
    } catch(err) {
        console.error(err)
        return res.status(500).json({error: "Internal Server Error"})
    }
}

// logout endpoint - clears jwt cookie
export const logout = (req, res) => {
    res.clearCookie('jwt');
    return res.status(200).json({ message: "Logged out" });
}

// request password reset - send token by email
export const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body
        if (!email) return res.status(400).json({ error: "Email required" })
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) return res.status(200).json({ message: "If the email exists, a reset link has been sent" })

        const token = uuidv4()
        const expiry = new Date(Date.now() + 1000 * 60 * 60) // 1 hour
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordResetToken: token, passwordResetExpiry: expiry }
        })

        const frontend = process.env.FRONTEND_URL || "http://localhost:3000"
        const link = `${frontend}/reset-password?token=${token}`
        await resend.emails.send({
            from: "Watome <onboarding@resend.dev>",
            to: user.email,
            subject: "Password reset / Réinitialisation du mot de passe",
            html: `
                <p>Bonjour,</p>
                <p>Pour réinitialiser votre mot de passe, cliquez sur le lien suivant :</p>
                <p><a href="${link}">${link}</a></p>
                <hr/>
                <p>Hello,</p>
                <p>To reset your password, click the link below:</p>
                <p><a href="${link}">${link}</a></p>
            `
        })

        return res.status(200).json({ message: "If the email exists, a reset link has been sent" })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

// perform password reset using token
export const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body
        if (!token || !newPassword) return res.status(400).json({ error: "Token and new password required" })
        const user = await prisma.user.findFirst({ where: { passwordResetToken: token } })
        if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
            return res.status(400).json({ error: "Invalid or expired token" })
        }
        const hashed = await generatePassword(newPassword)
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null }
        })
        return res.status(200).json({ message: "Password reset successfully" })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

// change password for authenticated user
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body
        if (!currentPassword || !newPassword) return res.status(400).json({ error: "Current and new passwords required" })
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
        if (!user) return res.status(404).json({ error: "User not found" })
        const match = await compare(currentPassword, user.password)
        if (!match) return res.status(401).json({ error: "Current password incorrect" })
        const hashed = await generatePassword(newPassword)
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })
        return res.status(200).json({ message: "Password changed" })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}
