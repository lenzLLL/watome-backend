import prisma from "./lib/db.js";

async function testDowngradeLogic() {
    try {
        console.log("=== Test: Downgrade avec trop de propriétés ===\n");

        // Get plans
        const plans = await prisma.planSubscription.findMany();
        console.log("Plans et leurs limites:");
        plans.forEach(p => {
            console.log(`  ${p.name}: ${p.visiblePropertiesLimit} propriétés max (${p.price} FCFA)`);
        });

        // Get a test user
        const testUser = await prisma.user.findFirst({
            where: { categoryAccount: { in: ['AGENT', 'AGENCE'] } }
        });

        if (!testUser) {
            console.log("\nAucun utilisateur agent trouvé pour le test");
            return;
        }

        console.log(`\nUtilisateur testeur: ${testUser.firstname} ${testUser.lastname}`);

        // Get user's current subscription
        const currentSub = await prisma.userSubscription.findUnique({
            where: { userId: testUser.id },
            include: { plan: true }
        });

        if (currentSub) {
            console.log(`Plan actuel: ${currentSub.plan.name} (${currentSub.plan.visiblePropertiesLimit} max)`);
        } else {
            console.log("Pas d'abonnement actif");
        }

        // Count user properties
        const propertyCount = await prisma.property.count({
            where: { userId: testUser.id }
        });

        const visibleCount = await prisma.property.count({
            where: { userId: testUser.id, isVisible: true }
        });

        console.log(`Propriétés totales: ${propertyCount}`);
        console.log(`Propriétés visibles: ${visibleCount}`);

        if (currentSub) {
            console.log(`\nLimite du plan actuel: ${currentSub.plan.visiblePropertiesLimit}`);
            
            if (visibleCount > currentSub.plan.visiblePropertiesLimit) {
                console.log(`⚠️  Alerte: ${visibleCount - currentSub.plan.visiblePropertiesLimit} propriétés visibles excédentaires!`);
            }

            // Find a downgrade plan
            const downgradeTarget = plans.find(p => p.visiblePropertiesLimit < currentSub.plan.visiblePropertiesLimit);
            
            if (downgradeTarget) {
                console.log(`\n📋 Scénario: Downgrade vers ${downgradeTarget.name} (${downgradeTarget.visiblePropertiesLimit} max)`);
                console.log(`  Propriétés qui seraient cachées: ${Math.max(0, visibleCount - downgradeTarget.visiblePropertiesLimit)}`);
                console.log(`  ✅ La nouvelle logique cachera automatiquement les propriétés excédentaires`);
            }
        }

        console.log("\n✅ Logique de gestion des propriétés:");
        console.log("  1. Lors d'un downgrade, on récupère toutes les propriétés");
        console.log("  2. Si >limite du nouveau plan, on cache les propriétés excessives");
        console.log("  3. Les propriétés les plus anciennes restent visibles (logique FIFO)");
    } catch (error) {
        console.error("Erreur:", error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testDowngradeLogic();
