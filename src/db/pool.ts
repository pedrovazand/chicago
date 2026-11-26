import pg from "pg";
import { ErroVinculo } from "../vinculos/types.ts";

export function criarPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new ErroVinculo("configuracao", "Defina DATABASE_URL no ambiente local.");
  const pool = new pg.Pool({
    connectionString, max: 5, connectionTimeoutMillis: 5_000,
    query_timeout: 10_000, statement_timeout: 10_000,
  });
  // Erros de conexão ociosa não podem encerrar o bot nem expor credenciais.
  pool.on("error", () => console.error("Conexão ociosa com PostgreSQL foi interrompida."));
  return pool;
}
