#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1f693455ce1da9cbb06683336e68c5994c69e135914302e4d7a432d83cd61381/contract';
import startContract from '../../snapshots/1f693455ce1da9cbb06683336e68c5994c69e135914302e4d7a432d83cd61381/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c05570a7899243f80a738090788647cda835e84f1e4db34adf6faf5c523e61ec/contract';
import endContract from '../../snapshots/c05570a7899243f80a738090788647cda835e84f1e4db34adf6faf5c523e61ec/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'roomApiToken',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('createdById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('label', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('editor'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('roomId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('sceneId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'roomApiToken',
        constraint: 'roomApiToken_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'roomApiToken',
        index: 'roomApiToken_createdById_idx_8bf640ed',
        columns: ['createdById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'roomApiToken',
        index: 'roomApiToken_roomId_idx_fe51d647',
        columns: ['roomId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'roomApiToken',
        foreignKey: {
          name: 'roomApiToken_roomId_fkey',
          columns: ['roomId'],
          references: { schema: 'public', table: 'room', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'roomApiToken',
        foreignKey: {
          name: 'roomApiToken_createdById_fkey',
          columns: ['createdById'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
