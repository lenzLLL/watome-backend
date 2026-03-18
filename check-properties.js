import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProperties() {
  try {
    console.log('🔍 Vérification des propriétés dans la base de données...');

    // Compter toutes les propriétés
    const totalCount = await prisma.property.count();
    console.log(`📊 Nombre total de propriétés: ${totalCount}`);

    // Compter les propriétés visibles
    const visibleCount = await prisma.property.count({
      where: { isVisible: true }
    });
    console.log(`👁️ Nombre de propriétés visibles: ${visibleCount}`);

    if (visibleCount > 0) {
      // Récupérer quelques propriétés visibles
      const properties = await prisma.property.findMany({
        where: { isVisible: true },
        take: 5,
        select: {
          id: true,
          title: true,
          price: true,
          location: true,
          type: true,
          category: true,
          chambres: true,
          sallesDeBain: true,
          surface: true,
          images: true,
          user: {
            select: {
              firstname: true,
              lastname: true,
              categoryAccount: true
            }
          }
        }
      });

      console.log('🏠 Exemples de propriétés visibles:');
      properties.forEach((prop, index) => {
        console.log(`${index + 1}. ID: ${prop.id}`);
        console.log(`   Titre: ${prop.title}`);
        console.log(`   Prix: ${prop.price} FCFA`);
        console.log(`   Localisation: ${prop.location}`);
        console.log(`   Type: ${prop.type}, Catégorie: ${prop.category}`);
        console.log(`   Chambres: ${prop.chambres}, SDB: ${prop.sallesDeBain}, Surface: ${prop.surface}m²`);
        console.log(`   Images: ${prop.images.length} image(s)`);
        console.log(`   Agent: ${prop.user.firstname} ${prop.user.lastname} (${prop.user.categoryAccount})`);
        console.log('---');
      });
    } else {
      console.log('❌ Aucune propriété visible trouvée');
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProperties();