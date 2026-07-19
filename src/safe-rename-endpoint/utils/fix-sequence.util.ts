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
    // Find the sequence(s) actually owned by the (already renamed) table via the
    // catalog dependency link, so we use the real primary-key column name even
    // if it was renamed (e.g. id -> id_test) and don't assume an "id"/"_id_seq"
    // naming that may no longer hold.
    await trx.raw(`
      DO $$
      DECLARE
        rec RECORD;
        new_seq text;
      BEGIN
        FOR rec IN
          SELECT s.relname AS seq_name, a.attname AS col_name
          FROM pg_class t
          JOIN pg_depend d    ON d.refobjid = t.oid AND d.deptype = 'a'
          JOIN pg_class s     ON s.oid = d.objid AND s.relkind = 'S'
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
          WHERE t.relname = '${targetCollection}'
            AND t.relkind = 'r'
            AND pg_table_is_visible(t.oid)
        LOOP
          new_seq := '${targetCollection}_' || rec.col_name || '_seq';
          IF rec.seq_name <> new_seq THEN
            EXECUTE format('ALTER SEQUENCE %I RENAME TO %I', rec.seq_name, new_seq);
          END IF;
          EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT nextval(%L::regclass)',
            '${targetCollection}',
            rec.col_name,
            new_seq
          );
        END LOOP;
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
