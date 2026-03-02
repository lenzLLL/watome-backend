import { PrismaClient } from '@prisma/client';

// single shared Prisma client instance
export const prisma = new PrismaClient();
