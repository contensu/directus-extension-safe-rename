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
    // PRAGMA foreign_keys cannot be changed inside a transaction in SQLite.
    // It must be run on the raw database connection before the transaction starts.
    // We return null here so the inside-transaction call is a no-op.
    return { disable: null, enable: null };
  }

  // CockroachDB, Oracle, unknown — no-op
  return { disable: null, enable: null };
}

/**
 * Disables foreign key checks.
 * For SQLite, must be called with the raw database connection (before transaction).
 * For all other DBs, called inside the transaction via trx.
 */
export async function disableFkChecks(
  trx: Knex.Transaction<any, any[]>,
  database?: Knex,
): Promise<void> {
  const clientName = trx.client.config.client;

  // SQLite: PRAGMA must run outside the transaction on the raw connection
  if (["sqlite3", "sqlite"].includes(clientName)) {
    if (database) await database.raw("PRAGMA foreign_keys = OFF");
    return;
  }

  const { disable } = getFkCheckStatements(clientName);
  if (disable) await trx.raw(disable);
}

/**
 * Re-enables foreign key checks.
 * For SQLite, must be called with the raw database connection (after transaction).
 * For all other DBs, called inside the transaction via trx.
 */
export async function enableFkChecks(
  trx: Knex.Transaction<any, any[]>,
  database?: Knex,
): Promise<void> {
  const clientName = trx.client.config.client;

  // SQLite: PRAGMA must run outside the transaction on the raw connection
  if (["sqlite3", "sqlite"].includes(clientName)) {
    if (database) await database.raw("PRAGMA foreign_keys = ON");
    return;
  }

  const { enable } = getFkCheckStatements(clientName);
  if (enable) await trx.raw(enable);
}
