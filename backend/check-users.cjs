const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, createdAt: true, passwordHash: true },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });
  
  console.log('=== Users in DB ===');
  for (const u of users) {
    console.log('email: ' + u.email + ' | name: ' + u.name + ' | hash: ' + (u.passwordHash ? u.passwordHash.substring(0, 10) + '...' : 'NULL') + ' | created: ' + u.createdAt.toISOString().split('T')[0]);
  }

  console.log('\n=== Password checks ===');
  const passwords = ['Password123!', 'password123', 'test123', '123456', 'tofa', 'tf'];
  for (const u of users.slice(0, 6)) {
    for (const p of passwords) {
      try {
        const ok = await bcrypt.compare(p, u.passwordHash || '');
        if (ok) {
          console.log('MATCH: ' + u.email + ' => "' + p + '"');
        }
      } catch(e) {}
    }
  }
  console.log('Password check done.');
}

main().catch(console.error).finally(function() { prisma.$disconnect(); });
