import prisma from "./lib/db.js";

async function checkPayment() {
    try {
        const plans = await prisma.planSubscription.findMany();
        console.log("Plans disponibles:");
        plans.forEach(p => console.log(`- ${p.name}: ${p.price} FCFA`));
        
        const history = await prisma.subscriptionHistory.findMany({ 
            include: { plan: true, user: { select: { firstname: true, lastname: true, email: true } } },
            orderBy: { createdAt: 'desc' }
        });
        console.log("\nHistorique des paiements:");
        history.forEach(h => console.log(`- ${h.user.firstname} ${h.user.lastname}: ${h.plan.name} (${h.amount} FCFA) - ${h.action} - ${h.paymentStatus} - ${new Date(h.createdAt).toLocaleString('fr-FR')}`));
        
        const subscriptions = await prisma.userSubscription.findMany({
            include: { plan: true, user: { select: { firstname: true, lastname: true, email: true } } },
            orderBy: { updatedAt: 'desc' }
        });
        console.log("\nAbonnements actifs:");
        subscriptions.forEach(s => console.log(`- ${s.user.firstname} ${s.user.lastname}: ${s.plan.name} - ${s.amount} FCFA`));
    } catch (error) {
        console.error("Erreur:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkPayment();
