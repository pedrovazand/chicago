import { criarPool } from "./pool.ts";
import { ProtecaoTokens } from "../vinculos/tokens.ts";

let pool: ReturnType<typeof criarPool> | undefined;
try {
  new ProtecaoTokens();
  pool = criarPool();
  const resultado = await pool.query<{ existe: boolean }>("SELECT to_regclass('mlbb_links') IS NOT NULL AS existe");
  if (!resultado.rows[0]?.existe) throw new Error();
  console.log("PostgreSQL acessível, tabela de vínculos presente e chave de criptografia com formato válido.");
  console.log("Nenhum vínculo real foi criado ou consultado.");
} catch {
  console.error("Verificação falhou. Confira DATABASE_URL, RONE_TOKEN_ENCRYPTION_KEY e execute a migration.");
  process.exitCode = 1;
} finally { await pool?.end(); }
