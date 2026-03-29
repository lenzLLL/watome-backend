import prisma from "../lib/db.js"
import { PayunitClient } from '@payunit/nodejs-sdk';
import { genSalt, hash, compare } from "bcrypt"
import jwt from "jsonwebtoken"
import { v4 as uuidv4 } from "uuid"
import { Resend } from "resend"
import { cleanPhoneNumber } from "../lib/utils.js"

// Initialize PayUnit client conditionally
let payunitClient = null;
try {
  if (process.env.PAYUNIT_KEY && process.env.API_USERNAME && process.env.API_PASSWORD) {
    payunitClient = new PayunitClient({
      baseURL: process.env.PAYUNIT_BASE_URL || 'https://gateway.payunit.net',
      apiKey: process.env.PAYUNIT_KEY,
      apiUsername: process.env.API_USERNAME,
      apiPassword: process.env.API_PASSWORD,
      mode: process.env.PAYUNIT_MODE || 'test',
    });
  } else {
    console.warn('PayUnit environment variables not configured. Payment features will be disabled.');
  }
} catch (error) {
  console.error('Failed to initialize PayUnit client:', error);
  payunitClient = null;
}

// Helper function to clean phone number for PayUnit (remove country code, keep only local digits)
const cleanPhoneForPayUnit = (phoneNumber) => {
  if (!phoneNumber) return '';

  // Remove all non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');

  // If it starts with country code (237 for Cameroon), remove it
  if (digitsOnly.startsWith('237') && digitsOnly.length > 3) {
    return digitsOnly.substring(3);
  }

  // Return last 8-10 digits (local number format)
  return digitsOnly.slice(-10);
};
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
        if (!payunitClient) {
            return res.status(500).json({ error: "Service de paiement non configuré" });
        }

        const { planId, paymentMethod, amount, phone, returnUrl, notifyUrl } = req.body;
        const userId = req.user.userId; // From JWT middleware

        if (!planId || !paymentMethod || amount === undefined) {
            return res.status(400).json({ error: "planId, paymentMethod et amount sont requis" });
        }

        // Find user by ID from JWT
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: "Utilisateur non trouvé" });
        }

        // Find plan
        const plan = await prisma.planSubscription.findUnique({ where: { id: planId } });
        if (!plan) {
            return res.status(404).json({ error: "Plan non trouvé" });
        }

        // Decide gateway based on payment method
        let gateway = null;
        if (paymentMethod === 'om') gateway = 'CM_ORANGE';
        else if (paymentMethod === 'momo') gateway = 'CM_MTNMOMO';
        else if (paymentMethod === 'card') gateway = 'CARD';
        else gateway = paymentMethod;

        const transactionId = `TXN_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;

        // PayUnit requires HTTPS for webhook URLs - ensure we use HTTPS
        const baseUrl = (process.env.BACKEND_URL || 'https://your-domain.com').replace(/^http:/, 'https:');
        const webhookUrl = notifyUrl || process.env.PAYUNIT_NOTIFY_URL || `${baseUrl}/api/webhooks/payunit`;

        const payunitPayload = {
            total_amount: amount,
            currency: 'XAF',
            transaction_id: transactionId,
            payment_country: 'CM',
            gateway,
            phone_number: cleanPhoneForPayUnit(phone || user.phone || ''),
            return_url: returnUrl || process.env.PAYUNIT_RETURN_URL || `${baseUrl}/payment/success`,
            notify_url: webhookUrl,
            redirect_on_failed: 'yes',
            custom_fields: {
                userId: user.id,
                planId,
                action: 'SUBSCRIBE',
            },
        };

        // Call PayUnit API
        let payunitResult;
        if (paymentMethod === 'om' || paymentMethod === 'momo') {
            payunitResult = await payunitClient.collections.initiateAndMakePaymentMobileMoney(payunitPayload);
        } else {
            payunitResult = await payunitClient.collections.initiatePayment({
                ...payunitPayload,
                pay_with: gateway
            });
        }

        // create pending history entry
        await prisma.subscriptionHistory.create({
            data: {
                userId: user.id,
                planId,
                action: 'SUBSCRIBE',
                amount,
                paymentMethod,
                paymentStatus: 'PENDING',
                transactionId,
                startDate: new Date(),
                endDate: new Date(new Date().setMonth(new Date().getMonth() + plan.monthDuration)),
                notes: 'PayUnit transaction initiated'
            }
        });
        console.log(payunitResult)
        console.log(payunitResult)
        return res.status(200).json({
            message: 'Paiement initié',
            transactionId,
            status: 'PENDING',
            payunitResult
        });
    } catch (err) {
        console.error('Payment error:', err);
        return res.status(500).json({ error: 'Erreur de paiement' });
    }
};

// PayUnit webhook endpoint
export const payunitWebhook = async (req, res) => {
    try {
        console.log('PayUnit Webhook received Lenz');
        console.log('PayUnit Webhook received:', {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body
        });

        const body = req.body || {}
        const transactionId = body.transaction_id || body.transactionId || body.txn_id || body.reference
        const eventStatus = (body.status || body.paymentStatus || body.transaction_status || '').toString().toLowerCase()
        const message = (body.message || '').toString().toLowerCase()

        console.log('Webhook data extracted:', { transactionId, eventStatus, message, body });

        if (!transactionId) {
            console.error('Webhook error: transaction_id missing');
            return res.status(400).json({ error: 'transaction_id requis' })
        }

        const history = await prisma.subscriptionHistory.findFirst({
            where: { transactionId: transactionId }
        });

        console.log('Database lookup result:', { found: !!history, historyId: history?.id });

        if (!history) {
            console.warn(`Webhook: transaction inconnue: ${transactionId}`);
            return res.status(404).json({ error: 'Historique non trouvé' })
        }

        let paymentStatus = 'FAILED'
        if (/success|completed|approved|paid/.test(eventStatus) || /payment completed|transaction successful/.test(message)) {
            paymentStatus = 'COMPLETED'
        } else if (/pending|processing|initiated|in progress/.test(eventStatus) || /payment in progress|transaction initiated/.test(message)) {
            paymentStatus = 'PENDING'
        } else if (/failed|cancelled|declined|error|rejected/.test(eventStatus) || /payment failed|transaction failed|insufficient funds/.test(message)) {
            paymentStatus = 'FAILED'
        }

        console.log('Updating payment status:', { historyId: history.id, oldStatus: history.paymentStatus, newStatus: paymentStatus });

        // Only update if status is actually changing or if it's a final status
        if (history.paymentStatus !== paymentStatus || paymentStatus === 'COMPLETED' || paymentStatus === 'FAILED') {
            await prisma.subscriptionHistory.update({
                where: { id: history.id },
                data: {
                    paymentStatus,
                    notes: `Webhook reçu: ${eventStatus} (${message}) - ${JSON.stringify(body)}`
                }
            })
        } else {
            console.log('Payment status unchanged, skipping update');
        }

        if (paymentStatus === 'COMPLETED' && history.paymentStatus !== 'COMPLETED') {
            console.log('Payment completed, creating/updating subscription for user:', history.userId);

            const plan = await prisma.planSubscription.findUnique({ where: { id: history.planId } })
            if (plan) {
                const startDate = history.startDate || new Date()
                const endDate = history.endDate || new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() + plan.monthDuration))

                console.log('Creating/updating user subscription:', {
                    userId: history.userId,
                    planId: history.planId,
                    startDate,
                    endDate
                });

                await prisma.userSubscription.upsert({
                    where: { userId: history.userId },
                    create: {
                        userId: history.userId,
                        planId: history.planId,
                        startDate,
                        endDate,
                        paymentMethod: history.paymentMethod,
                        amount: history.amount,
                        status: 'ACTIVE'
                    },
                    update: {
                        planId: history.planId,
                        startDate,
                        endDate,
                        paymentMethod: history.paymentMethod,
                        amount: history.amount,
                        status: 'ACTIVE'
                    }
                })

                console.log('User subscription created/updated successfully');
            } else {
                console.error('Plan not found:', history.planId);
            }
        }

        console.log('Webhook processing completed successfully');
        return res.status(200).json({ 
            message: 'Webhook traité avec succès',
            transactionId,
            status: paymentStatus
        })
    } catch (err) {
        console.error('PayUnit webhook error:', err)
        return res.status(500).json({ error: 'Erreur webhook' })
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
