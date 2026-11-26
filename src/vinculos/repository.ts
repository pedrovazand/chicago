import type { Pool } from "pg";
import { ProtecaoTokens } from "./tokens.ts";
import { ErroVinculo, validarDiscordId, validarIdentidade } from "./types.ts";
import type { Vinculo } from "./types.ts";
import type { ContaJogo } from "../rone/types.ts";

type LinhaVinculo = { discord_id: string; role_id: string; zone_id: string; jwt_cifrado: string };

function traduzirErro(erro: unknown): never {
  if (erro instanceof ErroVinculo) throw erro;
  if (typeof erro === "object" && erro !== null && "code" in erro && erro.code === "23505" && "constraint" in erro) {
    if (erro.constraint === "mlbb_links_pkey") {
      throw new ErroVinculo("discord_ja_vinculado", "Este usuário do Discord já possui uma conta vinculada.");
    }
    if (erro.constraint === "mlbb_links_game_account_key") {
      throw new ErroVinculo("conta_ja_vinculada", "Esta conta do jogo já está vinculada a outro usuário.");
    }
  }
  // Não repassar detail, query ou causa do PostgreSQL: podem conter dados sensíveis.
  throw new ErroVinculo("banco_indisponivel", "Não foi possível concluir a operação no banco de dados.");
}

export class RepositorioVinculos {
  readonly #pool: Pool;
  readonly #tokens: ProtecaoTokens;

  constructor(pool: Pool, tokens: ProtecaoTokens) {
    this.#pool = pool;
    this.#tokens = tokens;
  }

  async inserir(vinculo: Vinculo): Promise<void> {
    validarIdentidade(vinculo);
    const cifrado = this.#tokens.cifrar(vinculo.jwt, vinculo);
    try {
      // INSERT, sem upsert: nunca transferir ou substituir silenciosamente um vínculo.
      await this.#pool.query(
        "INSERT INTO mlbb_links (discord_id, role_id, zone_id, jwt_cifrado) VALUES ($1, $2, $3, $4)",
        [vinculo.discordId, vinculo.jogadorId, vinculo.servidorId, cifrado],
      );
    } catch (erro) { traduzirErro(erro); }
  }

  async verificarDisponibilidade(discordId: string, conta: ContaJogo): Promise<void> {
    validarIdentidade({ discordId, ...conta });
    try {
      const resultado = await this.#pool.query<{ discord_id: string }>(
        "SELECT discord_id FROM mlbb_links WHERE discord_id = $1 OR (role_id = $2 AND zone_id = $3)",
        [discordId, conta.jogadorId, conta.servidorId],
      );
      if (resultado.rows.some((linha) => linha.discord_id === discordId)) {
        throw new ErroVinculo("discord_ja_vinculado", "Você já tem uma conta vinculada. Consulte /perfil ou use /desvincular antes de trocar.");
      }
      if (resultado.rows.length) throw new ErroVinculo("conta_ja_vinculada", "Esta conta do jogo já está vinculada a outro usuário.");
    } catch (erro) { traduzirErro(erro); }
  }

  async buscar(discordId: string): Promise<Vinculo | null> {
    validarDiscordId(discordId);
    try {
      const resultado = await this.#pool.query<LinhaVinculo>(
        "SELECT discord_id, role_id, zone_id, jwt_cifrado FROM mlbb_links WHERE discord_id = $1", [discordId],
      );
      const linha = resultado.rows[0];
      if (!linha) return null;
      const identidade = { discordId: linha.discord_id, jogadorId: linha.role_id, servidorId: linha.zone_id };
      return { ...identidade, jwt: this.#tokens.decifrar(linha.jwt_cifrado, identidade) };
    } catch (erro) { traduzirErro(erro); }
  }

  async remover(discordId: string): Promise<boolean> {
    validarDiscordId(discordId);
    try {
      // Remover não depende de decifrar: até uma credencial danificada pode ser apagada.
      const resultado = await this.#pool.query("DELETE FROM mlbb_links WHERE discord_id = $1", [discordId]);
      return resultado.rowCount === 1;
    } catch (erro) { traduzirErro(erro); }
  }
}
