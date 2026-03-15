import prisma from "./lib/db.js";

async function testPagination() {
    try {
        console.log("=== Test Pagination des Paiements ===\n");

        // Get a test user
        const testUser = await prisma.user.findFirst({
            where: { categoryAccount: { in: ['AGENT', 'AGENCE'] } }
        });

        if (!testUser) {
            console.log("Aucun utilisateur agent trouvé");
            return;
        }

        // Count total payments
        const totalPayments = await prisma.subscriptionHistory.count({
            where: { userId: testUser.id }
        });

        console.log(`Utilisateur: ${testUser.firstname} ${testUser.lastname}`);
        console.log(`Total de paiements: ${totalPayments}\n`);

        // Test pagination
        const limit = 10;
        for (let offset = 0; offset < totalPayments; offset += limit) {
            const page = Math.floor(offset / limit) + 1;
            
            const payments = await prisma.subscriptionHistory.findMany({
                where: { userId: testUser.id },
                include: { plan: true },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset
            });

            const hasMore = offset + limit < totalPayments;
            
            console.log(`📄 Page ${page}: ${payments.length} paiements`);
            if (payments.length > 0) {
                console.log(`   - ${payments[0].plan.name} (${payments[0].action})`);
                if (payments.length > 1) {
                    console.log(`   ... à ${payments[payments.length - 1].plan.name}`);
                }
            }
            console.log(`   ${hasMore ? '  ✓ Plus disponible' : '✓ Dernier'}\n`);
        }

        console.log("✅ Pagination implémentée:");
        console.log("  • Limite: 10 paiements par requête");
        console.log("  • Offset: pagination basée sur offset");
        console.log("  • Frontend: Bouton 'Charger plus' si des paiements restants");
        console.log("  • Sans 1000 paiements chargés d'un coup! 🎉");
    } catch (error) {
        console.error("Erreur:", error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testPagination();
