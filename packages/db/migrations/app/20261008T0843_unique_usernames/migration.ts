#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1573e84c9992c18979af521805a85e6b3b41115e122e37966eac13395197970e/contract';
import endContract from '../../snapshots/1573e84c9992c18979af521805a85e6b3b41115e122e37966eac13395197970e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/83cf6d869558224f70157924fec71b447284dda77f1edda30985610eaf38b7cd/contract';
import startContract from '../../snapshots/83cf6d869558224f70157924fec71b447284dda77f1edda30985610eaf38b7cd/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_username_key',
        columns: ['username'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
