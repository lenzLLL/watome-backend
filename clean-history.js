import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanAndRecreateHistory() {
  try {
    console.log('Nettoyage et recréation de l\'historique...');

    // Supprimer toutes les entrées de migration
    const deletedMigrations = await prisma.subscriptionHistory.deleteMany({
      where: {
        notes: {
          contains: 'Migration'
        }
      }
    });

    console.log(`Supprimé ${deletedMigrations.count} entrées de migration`);

    // Récupérer tous les abonnements actifs
    const activeSubscriptions = await prisma.userSubscription.findMany({
      include: { plan: true }
    });

    console.log(`Création de l'historique pour ${activeSubscriptions.length} abonnements actifs`);

    for (const subscription of activeSubscriptions) {
      // Créer une entrée d'historique pour chaque abonnement actif
      await prisma.subscriptionHistory.create({
        data: {
          userId: subscription.userId,
          planId: subscription.planId,
          action: 'SUBSCRIBE',
          amount: subscription.amount,
          paymentMethod: subscription.paymentMethod,
          paymentStatus: subscription.amount === 0 ? 'COMPLETED' : 'COMPLETED',
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          notes: null // Pas de notes pour les vrais abonnements
        }
      });

      console.log(`Créé historique pour ${subscription.userId} - ${subscription.plan.name}`);
    }

    console.log('Historique recréé avec succès !');

  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanAndRecreateHistory();