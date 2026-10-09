#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2da1f891a7d70b25d3ebc3b4a33e059741dfc37b1b9ef51d15bc2d09ebe250eb/contract';
import endContract from '../../snapshots/2da1f891a7d70b25d3ebc3b4a33e059741dfc37b1b9ef51d15bc2d09ebe250eb/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e35d8a511abb96a9454780f5fbc314322b65393fc83f2c6094dceecb8d8374ed/contract';
import startContract from '../../snapshots/e35d8a511abb96a9454780f5fbc314322b65393fc83f2c6094dceecb8d8374ed/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'sceneRevision',
        columns: [
          col('actorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('data', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('revision', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('sceneId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'sceneRevision',
        constraint: 'sceneRevision_sceneId_revision_key',
        columns: ['sceneId', 'revision'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'sceneRevision',
        index: 'sceneRevision_sceneId_idx_9fae5bf5',
        columns: ['sceneId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'sceneRevision',
        foreignKey: {
          name: 'sceneRevision_sceneId_fkey',
          columns: ['sceneId'],
          references: { schema: 'public', table: 'scene', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
