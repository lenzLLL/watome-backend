import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
  try {
    console.log('Vérification des données...');

    // Compter les enregistrements dans SubscriptionHistory
    const historyCount = await prisma.subscriptionHistory.count();
    console.log(`Nombre d'enregistrements dans SubscriptionHistory: ${historyCount}`);

    // Compter les enregistrements dans UserSubscription
    const subscriptionCount = await prisma.userSubscription.count();
    console.log(`Nombre d'enregistrements dans UserSubscription: ${subscriptionCount}`);

    // Récupérer quelques exemples
    if (historyCount > 0) {
      const history = await prisma.subscriptionHistory.findMany({
        take: 3,
        include: { plan: true, user: { select: { firstname: true, lastname: true, email: true } } }
      });
      console.log('Exemples d\'historique:', JSON.stringify(history, null, 2));
    }

    if (subscriptionCount > 0) {
      const subscriptions = await prisma.userSubscription.findMany({
        take: 3,
        include: { plan: true }
      });
      console.log('Exemples d\'abonnements actifs:', JSON.stringify(subscriptions, null, 2));
    }

  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();