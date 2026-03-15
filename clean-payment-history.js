import prisma from "./lib/db.js";

async function cleanPaymentHistory() {
    try {
        console.log("Nettoyage de l'historique des paiements...");

        // Supprimer toutes les entrées avec amount = 0 (plans gratuits)
        const deletedFreePlans = await prisma.subscriptionHistory.deleteMany({
            where: {
                amount: 0
            }
        });

        console.log(`${deletedFreePlans.count} entrées de plans gratuits supprimées`);

        // Compter les enregistrements restants
        const remainingCount = await prisma.subscriptionHistory.count();
        console.log(`${remainingCount} enregistrements de paiements conservés`);

        console.log("Nettoyage terminé avec succès");
    } catch (error) {
        console.error("Erreur lors du nettoyage:", error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanPaymentHistory();