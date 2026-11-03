import { PrismaClient } from '@prisma/client';

// A single shared client: each PrismaClient owns a connection pool.
export const prisma = new PrismaClient();
