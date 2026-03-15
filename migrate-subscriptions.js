import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateSubscriptionData() {
  try {
    console.log('Migration des données d\'abonnement...');

    // Récupérer tous les abonnements existants
    const existingSubscriptions = await prisma.userSubscription.findMany({
      include: { plan: true }
    });

    console.log(`Trouvé ${existingSubscriptions.length} abonnements à migrer`);

    for (const subscription of existingSubscriptions) {
      // Créer une entrée dans SubscriptionHistory
      await prisma.subscriptionHistory.create({
        data: {
          userId: subscription.userId,
          planId: subscription.planId,
          action: 'SUBSCRIBE', // Action par défaut pour les données existantes
          amount: subscription.amount,
          paymentMethod: subscription.paymentMethod,
          paymentStatus: subscription.amount === 0 ? 'COMPLETED' : 'COMPLETED', // On suppose que les paiements existants sont complétés
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          notes: 'Migration depuis l\'ancien système'
        }
      });

      console.log(`Migré l'abonnement pour l'utilisateur ${subscription.userId}`);
    }

    console.log('Migration terminée avec succès !');

  } catch (error) {
    console.error('Erreur lors de la migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateSubscriptionData();