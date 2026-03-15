import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAgentProperties() {
  try {
    // Find agent named "lenz"
    const agent = await prisma.user.findFirst({
      where: {
        firstname: {
          contains: 'lenz',
          mode: 'insensitive'
        },
        categoryAccount: { in: ["AGENT", "AGENCE"] }
      }
    });

    if (!agent) {
      console.log('Agent "lenz" not found');
      return;
    }

    console.log('Agent found:', {
      id: agent.id,
      name: `${agent.firstname} ${agent.lastname}`,
      categoryAccount: agent.categoryAccount,
      isActive: agent.isActive
    });

    // Check what the API returns for this agent
    console.log('API endpoint would be: /users/agents/' + agent.id);

    // Get all properties for this agent
    const allProperties = await prisma.property.findMany({
      where: { userId: agent.id },
      select: {
        id: true,
        title: true,
        isVisible: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log('All properties for agent:', allProperties);

    // Get visible properties count
    const visibleCount = await prisma.property.count({
      where: {
        userId: agent.id,
        isVisible: true
      }
    });

    console.log('Visible properties count:', visibleCount);

    // Test the exact query used in the API
    const visibleProperties = await prisma.property.findMany({
      where: {
        userId: agent.id,
        isVisible: true
      },
      skip: 0,
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        price: true,
        location: true,
        bedrooms: true,
        bathrooms: true,
        surface: true,
        images: true,
        createdAt: true
      }
    });

    console.log('Visible properties query result:', visibleProperties);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAgentProperties();