import type { Knex } from "knex";

export function getFkCheckStatements(clientName: string): {
  disable: string | null;
  enable: string | null;
} {
  if (["pg", "postgres", "postgresql"].includes(clientName)) {
    return {
      disable: `SET session_replication_role = 'replica'`,
      enable: `SET session_replication_role = 'origin'`,
    };
  }

  if (["mysql", "mysql2", "mariasql"].includes(clientName)) {
    return {
      disable: `SET FOREIGN_KEY_CHECKS = 0`,
      enable: `SET FOREIGN_KEY_CHECKS = 1`,
    };
  }

  if (["sqlite3", "sqlite"].includes(clientName)) {
    return {
      disable: `PRAGMA defer_foreign_keys = ON`,
      enable: null, // auto-resets at end of transaction
    };
  }

  return { disable: null, enable: null };
}

export async function disableFkChecks(
  trx: Knex.Transaction<any, any[]>,
): Promise<void> {
  const { disable } = getFkCheckStatements(trx.client.config.client);
  if (disable) await trx.raw(disable);
}

export async function enableFkChecks(
  trx: Knex.Transaction<any, any[]>,
): Promise<void> {
  const { enable } = getFkCheckStatements(trx.client.config.client);
  if (enable) await trx.raw(enable);
}
