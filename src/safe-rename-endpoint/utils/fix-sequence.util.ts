import type { Knex } from "knex";

export async function fixSequence(
  trx: Knex,
  sourceCollection: string,
  targetCollection: string,
): Promise<void> {
  const clientName = trx.client.config.client;

  const isPg = ["pg", "postgres", "postgresql"].includes(clientName);

  const isOracle = ["oracle", "oracledb"].includes(clientName);

  // MySQL, MariaDB, SQLite, CockroachDB - nothing needed, handled automatically

  if (isPg) {
    await trx.raw(`
      DO $$
      DECLARE
        old_seq text := '${sourceCollection}_id_seq';
        new_seq text := '${targetCollection}_id_seq';
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_class
          WHERE relkind = 'S' AND relname = old_seq
        ) THEN
          EXECUTE format('ALTER SEQUENCE %I RENAME TO %I', old_seq, new_seq);
          EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN id SET DEFAULT nextval(%L::regclass)',
            '${targetCollection}',
            new_seq
          );
        END IF;
      END $$;
    `);
  }

  if (isOracle) {
    await trx.raw(`
      DECLARE
        seq_exists INTEGER;
      BEGIN
        SELECT COUNT(*) INTO seq_exists
        FROM user_sequences
        WHERE sequence_name = UPPER('${sourceCollection}_id_seq');

        IF seq_exists > 0 THEN
          EXECUTE IMMEDIATE 'RENAME ${sourceCollection}_id_seq TO ${targetCollection}_id_seq';
        END IF;
      END;
    `);
  }
}
