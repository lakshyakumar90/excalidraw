#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1f693455ce1da9cbb06683336e68c5994c69e135914302e4d7a432d83cd61381/contract';
import endContract from '../../snapshots/1f693455ce1da9cbb06683336e68c5994c69e135914302e4d7a432d83cd61381/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/927cff94348dd565a68e3a832420da893f63aab1e64ba99d3c06b4d4925c4cd0/contract';
import startContract from '../../snapshots/927cff94348dd565a68e3a832420da893f63aab1e64ba99d3c06b4d4925c4cd0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'libraryItem',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('data', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ownerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'libraryItem',
        index: 'libraryItem_ownerId_idx_e2d0c1ef',
        columns: ['ownerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'libraryItem',
        index: 'libraryItem_ownerId_updatedAt_idx_f0929af1',
        columns: ['ownerId', 'updatedAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'libraryItem',
        foreignKey: {
          name: 'libraryItem_ownerId_fkey',
          columns: ['ownerId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
