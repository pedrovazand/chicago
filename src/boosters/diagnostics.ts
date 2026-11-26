import { DiscordAPIError } from "discord.js";

// Não usa message, stack, cause, URL, body ou a própria interação como diagnóstico.
export function diagnosticoBooster(erro: unknown): string {
  if (erro instanceof DiscordAPIError) {
    const codigo = typeof erro.code === "number" && Number.isSafeInteger(erro.code) ? String(erro.code) : "indisponível";
    return `Discord HTTP ${erro.status}, código ${codigo}`;
  }
  if (typeof erro === "object" && erro !== null && "code" in erro) {
    const codigo = erro.code;
    if (typeof codigo === "string" && ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"].includes(codigo)) return `Conexão indisponível (${codigo})`;
    if (codigo === "42P01") return "Tabela PostgreSQL ausente; execute npm run db:migrate";
    if (codigo === "23505") return "Conflito de unicidade no PostgreSQL";
    if (codigo === "23503") return "Referência PostgreSQL inexistente";
  }
  if (erro instanceof TypeError) return "TypeError interno";
  return "Erro não classificado";
}
