import prisma from "../lib/db.js"
import { genSalt, hash, compare } from "bcrypt"
import jwt from "jsonwebtoken"
import { v4 as uuidv4 } from "uuid"
import { Resend } from "resend"
import { cleanPhoneNumber } from "../lib/utils.js"

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
        from: "Watome <noreply@contact.watome.com>",
        to: user.email,
        subject: "Activez votre compte Watome / Activate your Watome account",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <!-- FRENCH VERSION -->
                <div style="margin-bottom: 50px;">
                    <h1 style="color: #FF8C42; margin-bottom: 20px;">Bienvenue sur Watome!</h1>
                    <p style="color: #333; line-height: 1.6;">Bonjour ${user.firstname || ""},</p>
                    <p style="color: #333; line-height: 1.6;">Merci de vous être inscrit(e) sur Watome. Pour activer votre compte et accéder à nos services, cliquez sur le bouton ci-dessous :</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${link}" style="display: inline-block; background-color: #FF8C42; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Activer mon compte</a>
                    </div>
                    
                    <p style="color: #666; font-size: 12px;">Ou copiez ce lien dans votre navigateur :</p>
                    <p style="color: #666; font-size: 12px; word-break: break-all;"><a href="${link}" style="color: #FF8C42;">${link}</a></p>
                    
                    <p style="color: #999; font-size: 12px; margin-top: 20px;">Ce lien d'activation expire dans 24 heures. Si ce n'est pas vous qui avez créé ce compte, veuillez ignorer cet email.</p>
                </div>

                <hr style="border: none; border-top: 2px solid #eee; margin: 30px 0;">

                <!-- ENGLISH VERSION -->
                <div>
                    <h1 style="color: #FF8C42; margin-bottom: 20px;">Welcome to Watome!</h1>
                    <p style="color: #333; line-height: 1.6;">Hello ${user.firstname || ""},</p>
                    <p style="color: #333; line-height: 1.6;">Thank you for signing up on Watome. To activate your account and access our services, click the button below:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${link}" style="display: inline-block; background-color: #FF8C42; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Activate my account</a>
                    </div>
                    
                    <p style="color: #666; font-size: 12px;">Or copy this link in your browser:</p>
                    <p style="color: #666; font-size: 12px; word-break: break-all;"><a href="${link}" style="color: #FF8C42;">${link}</a></p>
                    
                    <p style="color: #999; font-size: 12px; margin-top: 20px;">This activation link expires in 24 hours. If you did not create this account, please ignore this email.</p>
                </div>

                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px; text-align: center;">© 2026 Watome. All rights reserved.</p>
            </div>
        `
    })
        return error? error:null
}

export const signup = async (req,res,next) => {
    try{
        // shared prisma client
        const {firstName, lastName, firstname, lastname, agence, adresse, address, category, categoryAccount, city, country, email, password, phone} = req.body

        // Support both camelCase and lowercase for firstname/lastname
        const first = firstName || firstname
        const last = lastName || lastname
        const addr = address || adresse

        console.log('Signup data received:', { firstName, lastName, firstname, lastname, first, last, email })

        if(!email || !password) {
            return res.status(400).json({error: "Email et mot de passe requis"})
        }

        if(!first || !last) {
            return res.status(400).json({error: "Prénom et nom requis"})
        }

        const verifyEmail = await prisma.user.findFirst({ where:{ email }})
        if(verifyEmail){
            return res.status(400).json({error: "Cet email est déjà utilisé"})
        }

        // generate activation token
        const activationToken = uuidv4()

        const user = await prisma.user.create({
            data:{
                email,
                password:await generatePassword(password),
                firstname: first,
                lastname: last,
                phone: phone ? cleanPhoneNumber(phone) : null,
                agence,
                address: addr,
                city,
                country,
                categoryAccount: categoryAccount || (category === "agent" ? "AGENT" : category === "agence" ? "AGENCE" : "CUSTOMER"),
                activationToken,
                isActive: false
            }
        })

        // send the initial activation email
        const r = await sendActivationMail(user)
        if(r){
            return res.status(500).json({error: "Error sending activation email", details: r})
        }
        return res.status(201).json({message: "Compte créé. Veuillez vérifier votre email pour activer votre compte"})

    }
    catch(Err){
        console.log(Err)
        return res.status(500).json({error: "Erreur serveur interne"})
    }
}

export const login = async (req, res) => {
    try {
        // shared prisma client
        const { email, password } = req.body
        if(!email || !password) {
            return res.status(400).json({error: "Email et mot de passe requis"})
        }

        const user = await prisma.user.findUnique({ where: { email } })
        if(!user) {
            return res.status(401).json({error: "Identifiants invalides"})
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
            return res.status(403).json({error: "Compte non activé. Un nouveau lien d'activation a été envoyé à votre email."})
        }

        const match = await compare(password, user.password)
        if(!match) {
            return res.status(401).json({error: "Identifiants invalides"})
        }

        const tokenJWT = createToken(user.email, user.id, user.categoryAccount)
        console.log('Login user data:', { id: user.id, email: user.email, firstname: user.firstname, lastname: user.lastname, categoryAccount: user.categoryAccount })
        
        return res.status(200).json({
            token: tokenJWT,
            user: {
                id: user.id,
                email: user.email,
                firstname: user.firstname,
                lastname: user.lastname,
                categoryAccount: user.categoryAccount
            }
        })
    } catch(err) {
        console.error(err)
        return res.status(500).json({error: "Erreur serveur interne"})
    }
}

export const activateAccount = async (req, res) => {
    try {
        // shared prisma client
        const { token } = req.body
        if(!token) return res.status(400).json({error: "Token requis"})

        const user = await prisma.user.findFirst({ where: { activationToken: token } })
        if(!user) return res.status(400).json({error: "Token invalide"})

        await prisma.user.update({
            where: { id: user.id },
            data: { isActive: true, activationToken: null }
        })

        // Generate JWT token for auto-login after activation
        const jwt_token = createToken(user.email, user.id, user.categoryAccount)

        return res.status(200).json({
            message: "Compte activé avec succès",
            categoryAccount: user.categoryAccount,
            jwt: jwt_token,
            user: {
                id: user.id,
                email: user.email,
                firstname: user.firstname,
                lastname: user.lastname,
                categoryAccount: user.categoryAccount
            }
        })
    } catch(err) {
        console.error(err)
        return res.status(500).json({error: "Internal Server Error"})
    }
}

// logout endpoint - pour JWT stateless, il suffit de répondre OK côté API
export const logout = (req, res) => {
    return res.status(200).json({ message: "Déconnecté avec succès" });
}

// request password reset - send token by email
export const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body
        if (!email) return res.status(400).json({ error: "Email requis" })
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) return res.status(200).json({ message: "Si l'email existe, un lien de réinitialisation a été envoyé" })

        const token = uuidv4()
        const expiry = new Date(Date.now() + 1000 * 60 * 60) // 1 hour
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordResetToken: token, passwordResetExpiry: expiry }
        })

        const frontend = process.env.FRONTEND_URL || "http://localhost:3000"
        const link = `${frontend}/reset-password?token=${token}`
        await resend.emails.send({
            from: "Watome <noreply@contact.watome.com>",
            to: user.email,
            subject: "Réinitialisation de mot de passe / Password reset",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <!-- FRENCH VERSION -->
                    <div style="margin-bottom: 50px;">
                        <h1 style="color: #FF8C42; margin-bottom: 20px;">Réinitialisation de mot de passe</h1>
                        <p style="color: #333; line-height: 1.6;">Bonjour,</p>
                        <p style="color: #333; line-height: 1.6;">Vous avez demandé une réinitialisation de mot de passe pour votre compte Watome. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${link}" style="display: inline-block; background-color: #FF8C42; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Réinitialiser mon mot de passe</a>
                        </div>
                        
                        <p style="color: #666; font-size: 12px;">Ou copiez ce lien dans votre navigateur :</p>
                        <p style="color: #666; font-size: 12px; word-break: break-all;"><a href="${link}" style="color: #FF8C42;">${link}</a></p>
                        
                        <p style="color: #999; font-size: 12px; margin-top: 20px;">Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet email et votre mot de passe restera inchangé.</p>
                    </div>

                    <hr style="border: none; border-top: 2px solid #eee; margin: 30px 0;">

                    <!-- ENGLISH VERSION -->
                    <div>
                        <h1 style="color: #FF8C42; margin-bottom: 20px;">Password Reset</h1>
                        <p style="color: #333; line-height: 1.6;">Hello,</p>
                        <p style="color: #333; line-height: 1.6;">You requested a password reset for your Watome account. Click the button below to create a new password:</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${link}" style="display: inline-block; background-color: #FF8C42; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset my password</a>
                        </div>
                        
                        <p style="color: #666; font-size: 12px;">Or copy this link in your browser:</p>
                        <p style="color: #666; font-size: 12px; word-break: break-all;"><a href="${link}" style="color: #FF8C42;">${link}</a></p>
                        
                        <p style="color: #999; font-size: 12px; margin-top: 20px;">This link expires in 1 hour. If you did not request this reset, please ignore this email and your password will remain unchanged.</p>
                    </div>

                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #999; font-size: 12px; text-align: center;">© 2026 Watome. All rights reserved.</p>
                </div>
            `
        })

        return res.status(200).json({ message: "Si l'email existe, un lien de réinitialisation a été envoyé" })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Erreur serveur interne" })
    }
}

// perform password reset using token
export const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body
        if (!token || !newPassword) return res.status(400).json({ error: "Token et nouveau mot de passe requis" })
        const user = await prisma.user.findFirst({ where: { passwordResetToken: token } })
        if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
            return res.status(400).json({ error: "Token invalide ou expiré" })
        }
        const hashed = await generatePassword(newPassword)
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null }
        })
        return res.status(200).json({ message: "Mot de passe réinitialisé avec succès" })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Erreur serveur interne" })
    }
}

// change password for authenticated user
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body
        if (!currentPassword || !newPassword) return res.status(400).json({ error: "Mot de passe actuel et nouveau requis" })
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
        if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" })
        const match = await compare(currentPassword, user.password)
        if (!match) return res.status(401).json({ error: "Mot de passe actuel incorrect" })
        const hashed = await generatePassword(newPassword)
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })
        return res.status(200).json({ message: "Mot de passe modifié avec succès" })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

// register new user (from new registration form)
export const register = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, address, categoryAccount } = req.body

        // Validation
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: "Prénom, nom, email et mot de passe requis" })
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({ where: { email } })
        if (existingUser) {
            // If account exists but not activated, resend activation email
            if (!existingUser.isActive) {
                let token = existingUser.activationToken
                if (!token) {
                    token = uuidv4()
                    await prisma.user.update({
                        where: { id: existingUser.id },
                        data: { activationToken: token }
                    })
                    existingUser.activationToken = token
                }
                await sendActivationMail(existingUser)
                return res.status(403).json({
                    error: "Compte existant mais non activé. Un nouveau lien d'activation a été envoyé à votre email."
                })
            }
            // Account is already active
            return res.status(400).json({ error: "Cet email est déjà utilisé" })
        }

        // Check if phone already exists (only if phone is provided)
        if (phone) {
            const cleanedPhone = cleanPhoneNumber(phone)
            const existingPhoneUser = await prisma.user.findUnique({ where: { phone: cleanedPhone } })
            if (existingPhoneUser) {
                return res.status(400).json({ error: "Ce numéro de téléphone est déjà utilisé" })
            }
        }

        // Generate activation token
        const activationToken = uuidv4()

        // Hash password
        const hashedPassword = await generatePassword(password)

        // Create user
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstname: firstName,
                lastname: lastName,
                phone: phone ? cleanPhoneNumber(phone) : null,
                address,
                categoryAccount: categoryAccount || "CUSTOMER",
                activationToken,
                isActive: false
            }
        })

        // Send activation email
        const emailError = await sendActivationMail(user)
        if (emailError) {
            console.error("Error sending activation email:", emailError)
            // Don't fail the registration if email fails
        }

        return res.status(201).json({
            message: "Compte créé avec succès",
            user: {
                id: user.id,
                email: user.email,
                categoryAccount: user.categoryAccount
            }
        })
    } catch (err) {
        console.error("Registration error:", err)

        // Handle Prisma unique constraint errors
        if (err.code === 'P2002') {
            const field = err.meta?.target?.[0]
            if (field === 'email') {
                return res.status(400).json({ error: "Cet email est déjà utilisé" })
            } else if (field === 'phone') {
                return res.status(400).json({ error: "Ce numéro de téléphone est déjà utilisé" })
            }
            return res.status(400).json({ error: "Une valeur unique est déjà utilisée" })
        }

        // Handle other validation errors
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: "Données invalides fournies" })
        }

        return res.status(500).json({ error: "Erreur lors de la création du compte. Veuillez réessayer." })
    }
}

// process payment and create subscription
export const processPayment = async (req, res) => {
    try {
        const { planId, paymentMethod, amount } = req.body
        const userId = req.user.userId; // From JWT middleware

        if (!planId) {
            return res.status(400).json({ error: "ID du plan requis" })
        }

        // Find user by ID from JWT
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) {
            return res.status(404).json({ error: "Utilisateur non trouvé" })
        }

        // Find plan
        const plan = await prisma.planSubscription.findUnique({ where: { id: planId } })
        if (!plan) {
            return res.status(404).json({ error: "Plan non trouvé" })
        }

        // Check existing subscription to determine action
        const existingSubscription = await prisma.userSubscription.findUnique({
            where: { userId: user.id },
            include: { plan: true }
        })

        let action = 'SUBSCRIBE';
        if (existingSubscription) {
            if (existingSubscription.planId === planId) {
                action = 'RENEW';
            } else if (plan.price > existingSubscription.plan.price) {
                action = 'UPGRADE';
            } else if (plan.price < existingSubscription.plan.price) {
                action = 'DOWNGRADE';
            }
        }

        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + plan.monthDuration);

        // Create or update subscription
        const subscription = await prisma.userSubscription.upsert({
            where: { userId: user.id },
            create: {
                userId: user.id,
                planId,
                startDate: startDate,
                endDate: endDate,
                paymentMethod,
                amount,
                status: "ACTIVE"
            },
            update: {
                planId,
                startDate: startDate,
                endDate: endDate,
                paymentMethod,
                amount,
                status: "ACTIVE"
            }
        })

        // Handle property visibility based on plan limits
        const userProperties = await prisma.property.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' }
        })

        if (userProperties.length > plan.visiblePropertiesLimit) {
            const propertiesToHide = userProperties.slice(plan.visiblePropertiesLimit)
            await prisma.property.updateMany({
                where: { id: { in: propertiesToHide.map(p => p.id) } },
                data: { isVisible: false }
            })
            console.log(`Cached ${propertiesToHide.length} properties due to plan limit (${plan.visiblePropertiesLimit})`)
        }

        // Record payment in subscription history
        await prisma.subscriptionHistory.create({
            data: {
                userId: user.id,
                planId: planId,
                action: action,
                amount: amount,
                paymentMethod: paymentMethod,
                paymentStatus: 'COMPLETED',
                startDate: startDate,
                endDate: endDate,
                notes: existingSubscription ? `Changed from ${existingSubscription.plan.name}` : null
            }
        })

        return res.status(200).json({
            message: "Paiement traité avec succès",
            subscription: {
                id: subscription.id,
                planId: subscription.planId,
                status: subscription.status
            }
        })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}

// resend activation email
export const resendActivation = async (req, res) => {
    try {
        const { email } = req.body

        if (!email) {
            return res.status(400).json({ error: "Email requis" })
        }

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
            return res.status(404).json({ error: "Utilisateur non trouvé" })
        }

        // Generate new activation token if needed
        let activationToken = user.activationToken
        if (!activationToken) {
            activationToken = uuidv4()
            await prisma.user.update({
                where: { id: user.id },
                data: { activationToken }
            })
        }

        // Update user object for email sending
        const userWithToken = { ...user, activationToken }

        const emailError = await sendActivationMail(userWithToken)
        if (emailError) {
            return res.status(500).json({ error: "Erreur lors de l'envoi de l'email d'activation", details: emailError })
        }

        return res.status(200).json({ message: "Email d'activation envoyé avec succès" })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}
