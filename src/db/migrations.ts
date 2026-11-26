import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";

export async function aplicarMigrations(pool: Pool): Promise<string[]> {
  const pasta = new URL("../../migrations/", import.meta.url);
  const nomes = (await readdir(pasta)).filter((nome) => /^\d{3}_[a-z0-9_]+\.sql$/.test(nome)).sort();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('chicago:migrations', 0))");
    await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const aplicadas: string[] = [];
    for (const nome of nomes) {
      const existe = await db.query("SELECT 1 FROM schema_migrations WHERE nome = $1", [nome]);
      if (existe.rowCount) continue;
      // A migration inicial já era idempotente: bancos existentes são preservados.
      await db.query(await readFile(new URL(nome, pasta), "utf8"));
      await db.query("INSERT INTO schema_migrations (nome) VALUES ($1)", [nome]);
      aplicadas.push(nome);
    }
    await db.query("COMMIT");
    return aplicadas;
  } catch (erro) {
    await db.query("ROLLBACK");
    throw erro;
  } finally { db.release(); }
}
