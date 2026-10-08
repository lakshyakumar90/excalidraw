#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/83cf6d869558224f70157924fec71b447284dda77f1edda30985610eaf38b7cd/contract';
import endContract from '../../snapshots/83cf6d869558224f70157924fec71b447284dda77f1edda30985610eaf38b7cd/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/eca42237ac8b417a985bdff192cc136968227fab442dabf040362b10c46329d4/contract';
import startContract from '../../snapshots/eca42237ac8b417a985bdff192cc136968227fab442dabf040362b10c46329d4/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  rawSql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'account',
        columns: [
          col('accessToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('accessTokenExpiresAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('accountId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('idToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('password', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('providerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('refreshToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('refreshTokenExpiresAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('scope', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      rawSql({
        id: 'auth.backfill-credential-passwords',
        label: 'Move existing password hashes into Better Auth accounts',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [
          {
            description: 'Legacy password hashes still need credential accounts',
            sql: 'SELECT EXISTS (SELECT 1 FROM "public"."user" AS legacy WHERE legacy."password" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "public"."account" AS credential WHERE credential."userId" = legacy."id" AND credential."providerId" = \'credential\' AND credential."accountId" = legacy."id" AND credential."password" IS NOT NULL))',
          },
        ],
        execute: [
          {
            description: 'Copy existing bcrypt hashes into credential accounts',
            sql: 'INSERT INTO "public"."account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt") SELECT gen_random_uuid()::text, legacy."id", \'credential\', legacy."id", legacy."password", now(), now() FROM "public"."user" AS legacy WHERE legacy."password" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "public"."account" AS credential WHERE credential."userId" = legacy."id" AND credential."providerId" = \'credential\' AND credential."accountId" = legacy."id" AND credential."password" IS NOT NULL)',
          },
          {
            description: 'Allow legacy password hashes to be cleared from the user table',
            sql: 'ALTER TABLE "public"."user" ALTER COLUMN "password" DROP NOT NULL',
          },
          {
            description: 'Clear old password hashes after the credential copy',
            sql: 'UPDATE "public"."user" AS legacy SET "password" = NULL WHERE legacy."password" IS NOT NULL AND EXISTS (SELECT 1 FROM "public"."account" AS credential WHERE credential."userId" = legacy."id" AND credential."providerId" = \'credential\' AND credential."accountId" = legacy."id" AND credential."password" = legacy."password")',
          },
        ],
        postcheck: [
          {
            description: 'Every prior password hash has a credential account and is cleared from user',
            sql: 'SELECT NOT EXISTS (SELECT 1 FROM "public"."user" AS legacy WHERE legacy."password" IS NOT NULL)',
          },
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'session',
        columns: [
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
          col('ipAddress', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('token', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userAgent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'verification',
        columns: [
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
          col('identifier', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('value', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('emailVerified', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      rawSql({
        id: 'auth.backfill-user-name',
        label: 'Fill missing names for Better Auth users',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [
          {
            description: 'Existing users with a null name',
            sql: 'SELECT EXISTS (SELECT 1 FROM "public"."user" WHERE "name" IS NULL)',
          },
        ],
        execute: [
          {
            description: 'Use a safe display name for existing records without one',
            sql: 'UPDATE "public"."user" SET "name" = \'User\' WHERE "name" IS NULL',
          },
        ],
        postcheck: [
          {
            description: 'No user names are null',
            sql: 'SELECT NOT EXISTS (SELECT 1 FROM "public"."user" WHERE "name" IS NULL)',
          },
        ],
      }),
      this.setNotNull({ schema: 'public', table: 'user', column: 'name' }),
      this.setDefault({
        schema: 'public',
        table: 'user',
        column: 'name',
        defaultSql: "DEFAULT 'User'",
      }),
      this.dropNotNull({ schema: 'public', table: 'user', column: 'password' }),
      this.addUnique({
        schema: 'public',
        table: 'session',
        constraint: 'session_token_key',
        columns: ['token'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'account',
        index: 'account_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'session',
        index: 'session_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'verification',
        index: 'verification_identifier_idx_79a0dbb3',
        columns: ['identifier'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'account',
        foreignKey: {
          name: 'account_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'session',
        foreignKey: {
          name: 'session_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
