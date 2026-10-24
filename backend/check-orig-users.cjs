const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Find the original users specifically
  const origEmails = ['tf@gmail.com', 'tf1@gmail.com', 'developer@codeeditor.io'];
  
  console.log('=== Original Users ===');
  for (const email of origEmails) {
    const u = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, createdAt: true, passwordHash: true },
    });
    if (!u) {
      console.log('NOT FOUND: ' + email);
      continue;
    }
    console.log('email: ' + u.email + ' | name: ' + u.name + ' | hash: ' + (u.passwordHash ? u.passwordHash.substring(0, 10) + '...' : 'NULL') + ' | created: ' + u.createdAt.toISOString().split('T')[0]);
    
    const passwords = ['Password123!', 'password123', 'test123', '123456', 'tofa', 'tf', 'Password1!'];
    for (const p of passwords) {
      try {
        const ok = await bcrypt.compare(p, u.passwordHash || '');
        if (ok) console.log('  => Password match: "' + p + '"');
      } catch(e) {}
    }
  }
  
  // Count total users
  const total = await prisma.user.count();
  console.log('\nTotal users in DB:', total);
}

main().catch(console.error).finally(function() { prisma.$disconnect(); });

