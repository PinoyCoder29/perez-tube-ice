/* Safe to run repeatedly: only creates what is missing. Never resets passwords or overwrites data. */
import { PrismaClient, PackageType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SEED_PRODUCTS } from './seed-data';

const prisma = new PrismaClient();

async function main() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const existingAdmin = await prisma.user.findUnique({ where: { username } });
  if (!existingAdmin) {
    const pw = process.env.ADMIN_INITIAL_PASSWORD;
    if (!pw || pw.length < 10) {
      throw new Error('Set ADMIN_INITIAL_PASSWORD (at least 10 characters) in your environment before the first seed.');
    }
    await prisma.user.create({
      data: {
        name: 'Administrator',
        username,
        passwordHash: await bcrypt.hash(pw, 12),
        role: 'ADMIN',
        mustChangePassword: true,
      },
    });
    console.log(`Created admin "${username}" (must change password on first login).`);
  } else {
    console.log(`Admin "${username}" already exists - left unchanged.`);
  }

  // The shared, passwordless Staff identity. It has no password hash and can never log in as Admin.
  const staff = await prisma.user.findUnique({ where: { username: 'staff' } });
  if (!staff) {
    await prisma.user.create({ data: { name: 'Staff', username: 'staff', passwordHash: null, role: 'STAFF' } });
    console.log('Created shared Staff identity.');
  }

  for (const p of SEED_PRODUCTS) {
    const exists = await prisma.product.findUnique({ where: { name: p.name } });
    if (exists) continue;
    await prisma.product.create({
      data: {
        name: p.name,
        description: p.description,
        sortOrder: p.sortOrder,
        priceOptions: {
          create: p.prices.map((x, i) => ({
            label: x.label,
            sellingPrice: x.price,
            packageType: PackageType.RETAIL,
            sortOrder: i + 1,
          })),
        },
      },
    });
    console.log(`Created product ${p.name} with starter price buttons.`);
  }

  const defaults: Record<string, unknown> = {
    businessName: 'PEREZ ICE',
    businessAddress: '',
    businessPhone: '',
    receiptFooter: 'Thank you for your purchase!',
    customPriceMax: '5000',
    allowStaffCustomPrice: 'true',
  };
  for (const [key, value] of Object.entries(defaults)) {
    const s = await prisma.setting.findUnique({ where: { key } });
    if (!s) await prisma.setting.create({ data: { key, value: value as string } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
