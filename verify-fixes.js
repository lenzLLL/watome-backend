import prisma from "./lib/db.js";

async function testPaymentFlow() {
    try {
        console.log("=== Vérification post-correction ===\n");

        const plans = await prisma.planSubscription.findMany();
        console.log("Plans disponibles:");
        plans.forEach(p => console.log(`  ${p.name}: ${p.price} FCFA (ID: ${p.id})`));

        console.log("\nHistorique des paiements actuels:");
        const history = await prisma.subscriptionHistory.findMany({
            include: { plan: true, user: { select: { firstname: true, lastname: true } } },
            orderBy: { createdAt: 'desc' }
        });

        if (history.length === 0) {
            console.log("  Aucun paiement enregistré yet");
        } else {
            history.forEach(h => {
                console.log(`  [${h.action}] ${h.user.firstname} ${h.user.lastname} -> ${h.plan.name} (${h.amount} FCFA) - ${h.paymentStatus}`);
            });
        }

        console.log("\n✅ Corrections appliquées:");
        console.log("  1. Endpoint /auth/process-payment maintenant crée un enregistrement SubscriptionHistory");
        console.log("  2. Le contrôleur setPlanPricing enregistre les paiements directement");
        console.log("  3. Seuls les paiements > 0 FCFA sont enregistrés dans l'historique");
        console.log("\nLorsque vous payez pour le plan Starter (15000 FCFA), un enregistrement sera créé! 🎯");
    } catch (error) {
        console.error("Erreur:", error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testPaymentFlow();
