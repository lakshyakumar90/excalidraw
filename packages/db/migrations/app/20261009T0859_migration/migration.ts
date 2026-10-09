#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1573e84c9992c18979af521805a85e6b3b41115e122e37966eac13395197970e/contract';
import startContract from '../../snapshots/1573e84c9992c18979af521805a85e6b3b41115e122e37966eac13395197970e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e35d8a511abb96a9454780f5fbc314322b65393fc83f2c6094dceecb8d8374ed/contract';
import endContract from '../../snapshots/e35d8a511abb96a9454780f5fbc314322b65393fc83f2c6094dceecb8d8374ed/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'scene',
        column: col('syncRevision', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
