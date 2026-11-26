import { criarPool } from "./pool.ts";
import { aplicarMigrations } from "./migrations.ts";

let pool: ReturnType<typeof criarPool> | undefined;
try {
  pool = criarPool();
  const aplicadas = await aplicarMigrations(pool);
  console.log(aplicadas.length ? `Migrations aplicadas: ${aplicadas.join(", ")}.` : "Banco atualizado; nenhuma migration pendente.");
} catch {
  console.error("Migration falhou. Confira DATABASE_URL, o container e as permissões de criação de tabela.");
  process.exitCode = 1;
} finally { await pool?.end(); }
