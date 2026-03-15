import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAndUpdateUsers() {
  console.log('🔍 Checking active users in database...');

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      categoryAccount: true,
      isActive: true
    }
  });

  console.log('📋 Active users found:');
  users.forEach(user => {
    console.log(`- ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.firstname} ${user.lastname}`);
    console.log(`  Category: ${user.categoryAccount}`);
    console.log(`  Firstname null: ${user.firstname === null}`);
    console.log(`  Lastname null: ${user.lastname === null}`);
    console.log('---');
  });

  // Update users with null firstname/lastname
  const usersToUpdate = users.filter(user => !user.firstname || !user.lastname);
  if (usersToUpdate.length > 0) {
    console.log(`\n🔧 Updating ${usersToUpdate.length} users with missing names...`);

    for (const user of usersToUpdate) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          firstname: user.firstname || 'Test',
          lastname: user.lastname || 'User'
        }
      });
      console.log(`✅ Updated user ${user.email}`);
    }
  } else {
    console.log('\n✅ All active users have complete name data');
  }

  console.log('\n🎉 Done!');
}

checkAndUpdateUsers()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });