import express from 'express';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// Webhook pour Freemopay
router.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    console.log("Webhook Freemopay reçu :", JSON.stringify(data, null, 2));

    // Parser l'externalId: format "userId_planId" ou "anon_planId_timestamp"
    const externalId = data.externalId;
    if (!externalId) {
      console.error("Pas d'externalId dans le webhook");
      // 🔥 Toujours retourner 200 OK pour valider la réception
      return res.status(200).json({ message: "Webhook received but missing externalId" });
    }

    const parts = externalId.split('_');
    let userId = null;
    let planId;
    let isAnonymous = false;

    if (parts[0] === 'anon') {
      // Format: anon_planId_timestamp
      planId = parts[1];
      isAnonymous = true;
    } else {
      // Format: userId_planId
      userId = parts[0];
      planId = parts[1];
    }

    if (data.status === "SUCCESS") {
      // 🔥 Paiement réussi - mettre à jour la DB

      if (!userId || isAnonymous) {
        console.log("Paiement anonyme réussi - pas de mise à jour DB nécessaire");
        return res.status(200).json({ message: "Anonymous payment success" });
      }

      try {
        // Récupérer le plan pour connaître la durée
        const plan = await prisma.planSubscription.findUnique({
          where: { id: planId }
        });

        if (!plan) {
          console.error("Plan non trouvé:", planId);
          return res.status(200).json({ message: "Plan not found, but webhook acknowledged" });
        }

        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + plan.monthDuration);

        // Créer la souscription utilisateur
        const userSubscription = await prisma.userSubscription.create({
          data: {
            userId,
            planId,
            startDate,
            endDate,
            paymentMethod: "MOBILE_MONEY",
            amount: plan.price,
            status: "ACTIVE"
          }
        });

        // Mettre à jour le planSubscriptionId de l'utilisateur
        await prisma.user.update({
          where: { id: userId },
          data: { planSubscriptionId: planId }
        });

        // Créer l'historique
        await prisma.subscriptionHistory.create({
          data: {
            userId,
            planId,
            action: "SUBSCRIBE",
            amount: plan.price,
            paymentMethod: "MOBILE_MONEY",
            paymentStatus: "COMPLETED",
            transactionId: data.reference,
            startDate,
            endDate,
            notes: `Paiement Freemopay réussi - Référence: ${data.reference}`
          }
        });

        console.log("✅ Souscription créée pour user:", userId, "plan:", planId);
        return res.status(200).json({ message: "Payment processed successfully" });

      } catch (dbError) {
        console.error("Erreur DB lors du traitement du paiement:", dbError);
        return res.status(200).json({ message: "Database error, but webhook acknowledged" });
      }

    } else if (data.status === "FAILED") {
      // 🔥 Paiement échoué - marquer comme failed dans l'historique si elle existe

      if (userId && !isAnonymous) {
        try {
          // Chercher une entrée PENDING dans l'historique et la marquer comme FAILED
          await prisma.subscriptionHistory.updateMany({
            where: {
              userId,
              planId,
              paymentStatus: "PENDING",
              transactionId: data.reference
            },
            data: {
              paymentStatus: "FAILED",
              notes: `Paiement échoué - Référence: ${data.reference} - ${data.message || 'Unknown error'}`
            }
          });
        } catch (dbError) {
          console.error("Erreur DB lors de la mise à jour de l'échec:", dbError);
        }
      }

      console.log("❌ Paiement échoué pour référence:", data.reference);
      return res.status(200).json({ message: "Payment failed, webhook acknowledged" });
    }

    // Status inconnu
    console.log("⚠️ Status inconnu:", data.status);
    return res.status(200).json({ message: "Unknown status, webhook acknowledged" });

  } catch (error) {
    console.error("Erreur webhook:", error);
    // 🔥 Toujours retourner 200 OK même en cas d'erreur
    return res.status(200).json({ message: "Webhook processing error, but acknowledged" });
  }
});

export default router;