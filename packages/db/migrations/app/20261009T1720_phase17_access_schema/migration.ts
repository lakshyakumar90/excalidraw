#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2da1f891a7d70b25d3ebc3b4a33e059741dfc37b1b9ef51d15bc2d09ebe250eb/contract';
import startContract from '../../snapshots/2da1f891a7d70b25d3ebc3b4a33e059741dfc37b1b9ef51d15bc2d09ebe250eb/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/927cff94348dd565a68e3a832420da893f63aab1e64ba99d3c06b4d4925c4cd0/contract';
import endContract from '../../snapshots/927cff94348dd565a68e3a832420da893f63aab1e64ba99d3c06b4d4925c4cd0/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'inviteClaim',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('inviteId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'inviteClaim_action_check_62175a4a',
            "\"action\" IN ('accepted', 'revoked')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'joinCode',
        columns: [
          col('codeHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('editor'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('roomId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'joinCode_role_check_4e2c8b04',
            "\"role\" IN ('owner', 'editor', 'viewer')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'joinCodeClaim',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('joinCodeId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'joinCodeClaim_action_check_62175a4a',
            "\"action\" IN ('accepted', 'revoked')",
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'invite',
        column: col('deliveryError', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'invite',
        column: col('revokedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'invite',
        column: col('role', 'text', {
          notNull: true,
          default: lit('editor'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'invite',
        column: col('sentAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'invite',
        constraint: 'invite_role_check_4e2c8b04',
        expression: "\"role\" IN ('owner', 'editor', 'viewer')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'inviteClaim',
        constraint: 'inviteClaim_inviteId_key',
        columns: ['inviteId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'joinCode',
        constraint: 'joinCode_codeHash_key',
        columns: ['codeHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'joinCodeClaim',
        constraint: 'joinCodeClaim_joinCodeId_key',
        columns: ['joinCodeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'inviteClaim',
        index: 'inviteClaim_actorId_createdAt_idx_0e9f1adf',
        columns: ['actorId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'joinCode',
        index: 'joinCode_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'joinCode',
        index: 'joinCode_roomId_createdAt_idx_71ac5cd0',
        columns: ['roomId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'joinCode',
        index: 'joinCode_roomId_idx_fe51d647',
        columns: ['roomId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'joinCodeClaim',
        index: 'joinCodeClaim_actorId_createdAt_idx_0e9f1adf',
        columns: ['actorId', 'createdAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'inviteClaim',
        foreignKey: {
          name: 'inviteClaim_inviteId_fkey',
          columns: ['inviteId'],
          references: { schema: 'public', table: 'invite', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'joinCode',
        foreignKey: {
          name: 'joinCode_roomId_fkey',
          columns: ['roomId'],
          references: { schema: 'public', table: 'room', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'joinCodeClaim',
        foreignKey: {
          name: 'joinCodeClaim_joinCodeId_fkey',
          columns: ['joinCodeId'],
          references: { schema: 'public', table: 'joinCode', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
