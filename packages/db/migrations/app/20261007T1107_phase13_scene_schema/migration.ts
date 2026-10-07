#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/eca42237ac8b417a985bdff192cc136968227fab442dabf040362b10c46329d4/contract';
import endContract from '../../snapshots/eca42237ac8b417a985bdff192cc136968227fab442dabf040362b10c46329d4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/79cd2f31b1262014970585ef3bdc8cf2c3d81ec69e6424a60d2867a6b901d3ec/contract';
import startContract from '../../snapshots/79cd2f31b1262014970585ef3bdc8cf2c3d81ec69e6424a60d2867a6b901d3ec/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'invite',
        columns: [
          col('codeHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('roomId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('usedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'scene',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('data', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ownerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', {
            notNull: true,
            default: lit('Untitled'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'room',
        column: col('sceneId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'roomMember',
        column: col('role', 'text', {
          notNull: true,
          default: lit('editor'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'invite',
        constraint: 'invite_codeHash_key',
        columns: ['codeHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'room',
        constraint: 'room_sceneId_key',
        columns: ['sceneId'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'roomMember',
        constraint: 'roomMember_role_check_4e2c8b04',
        expression: "\"role\" IN ('owner', 'editor', 'viewer')",
      }),
      rawSql({
        id: 'room-members.backfill-admin-owner-role',
        label: 'Mark existing room admins as owners',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [
          {
            description: 'Existing room admins with memberships are not owners',
            sql: 'SELECT EXISTS (SELECT 1 FROM "public"."roomMember" AS member JOIN "public"."room" AS room ON room."id" = member."roomId" WHERE member."userId" = room."adminId" AND member."role" <> \'owner\')',
          },
        ],
        execute: [
          {
            description: 'Set matching room admin memberships to owner',
            sql: 'UPDATE "public"."roomMember" AS member SET "role" = \'owner\' FROM "public"."room" AS room WHERE room."id" = member."roomId" AND member."userId" = room."adminId" AND member."role" <> \'owner\'',
          },
        ],
        postcheck: [
          {
            description: 'All matching room admin memberships are owners',
            sql: 'SELECT NOT EXISTS (SELECT 1 FROM "public"."roomMember" AS member JOIN "public"."room" AS room ON room."id" = member."roomId" WHERE member."userId" = room."adminId" AND member."role" <> \'owner\')',
          },
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'invite',
        index: 'invite_roomId_email_idx_66382e89',
        columns: ['roomId', 'email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'invite',
        index: 'invite_roomId_idx_fe51d647',
        columns: ['roomId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'scene',
        index: 'scene_ownerId_idx_e2d0c1ef',
        columns: ['ownerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'scene',
        index: 'scene_ownerId_updatedAt_idx_f0929af1',
        columns: ['ownerId', 'updatedAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'invite',
        foreignKey: {
          name: 'invite_roomId_fkey',
          columns: ['roomId'],
          references: { schema: 'public', table: 'room', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'scene',
        foreignKey: {
          name: 'scene_ownerId_fkey',
          columns: ['ownerId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'room',
        foreignKey: {
          name: 'room_sceneId_fkey',
          columns: ['sceneId'],
          references: { schema: 'public', table: 'scene', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
