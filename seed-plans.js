import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const plans = [
  {
    name: 'Starter',
    price: 15000, // 15,000 FCFA
    monthDuration: 1,
    infos: [
      'Jusqu\'à 5 propriétés visibles',
      'Support par email',
      'Statistiques de base',
      'Durée: 1 mois'
    ],
    visiblePropertiesLimit: 5
  },
  {
    name: 'Professional',
    price: 25000, // 25,000 FCFA
    monthDuration: 3,
    infos: [
      'Jusqu\'à 20 propriétés visibles',
      'Support prioritaire',
      'Statistiques avancées',
      'Missions incluses',
      'Durée: 3 mois'
    ],
    visiblePropertiesLimit: 20
  },
  {
    name: 'Premium',
    price: 50000, // 50,000 FCFA
    monthDuration: 6,
    infos: [
      'Propriétés illimitées',
      'Support 24/7',
      'Statistiques complètes',
      'Missions prioritaires',
      'Badge Premium',
      'Durée: 6 mois'
    ],
    visiblePropertiesLimit: 999 // Illimité
  },
  {
    name: 'Gratuit',
    price: 0,
    monthDuration: 1,
    infos: [
      '1 propriété visible',
      'Support limité',
      'Fonctionnalités de base'
    ],
    visiblePropertiesLimit: 1
  }
];

async function main() {
  console.log('🌱 Seeding plans...');

  // Supprimer tous les plans existants
  await prisma.planSubscription.deleteMany();

  for (const plan of plans) {
    const createdPlan = await prisma.planSubscription.create({
      data: plan
    });
    console.log(`✅ Created plan: ${createdPlan.name} - ${createdPlan.price} FCFA`);
  }

  console.log('🎉 All plans seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding plans:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });