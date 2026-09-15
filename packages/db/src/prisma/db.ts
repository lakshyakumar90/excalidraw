import dotenv from 'dotenv';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.js';
import contractJson from './contract.json' with { type: 'json' };

dotenv.config();

export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
});
