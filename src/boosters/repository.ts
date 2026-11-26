import type { Pool, PoolClient } from "pg";
import { ErroBooster } from "./types.ts";
import type { ArmazenamentoBooster, ConfigBooster, RepositorioBooster } from "./types.ts";

function armazenamento(db: Pick<PoolClient, "query">): ArmazenamentoBooster {
  return {
    async buscar(servidorId) {
      const resultado = await db.query<ConfigBooster>(`SELECT servidor_id AS "servidorId",
        canal_painel_id AS "canalPainelId", categoria_id AS "categoriaId", equipe_id AS "equipeId",
        referencia_id AS "referenciaId", mensagem_painel_id AS "mensagemPainelId",
        painel_pendente AS "painelPendente", imagem_painel AS "imagemPainel" FROM booster_config WHERE servidor_id = $1`, [servidorId]);
      return resultado.rows[0] ?? null;
    },
    async salvar(c) {
      await db.query(`INSERT INTO booster_config
        (servidor_id, canal_painel_id, categoria_id, equipe_id, referencia_id, mensagem_painel_id, painel_pendente, imagem_painel)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (servidor_id) DO UPDATE SET
        canal_painel_id = EXCLUDED.canal_painel_id, categoria_id = EXCLUDED.categoria_id,
        equipe_id = EXCLUDED.equipe_id, referencia_id = EXCLUDED.referencia_id,
        mensagem_painel_id = EXCLUDED.mensagem_painel_id, painel_pendente = EXCLUDED.painel_pendente,
        imagem_painel = EXCLUDED.imagem_painel, atualizado_em = NOW()`, [c.servidorId, c.canalPainelId, c.categoriaId, c.equipeId, c.referenciaId, c.mensagemPainelId, c.painelPendente, c.imagemPainel]);
    },
  };
}

export class RepositorioBoosters implements RepositorioBooster {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async buscar(servidorId: string): Promise<ConfigBooster | null> {
    try { return await armazenamento(this.#pool).buscar(servidorId); }
    catch { throw new ErroBooster("Não foi possível ler a configuração. Confira o PostgreSQL e execute npm run db:migrate."); }
  }

  async exclusivo<T>(servidorId: string, tarefa: (db: ArmazenamentoBooster) => Promise<T>): Promise<T> {
    const db = await this.#pool.connect();
    let bloqueado = false;
    let destruir = false;
    try {
      const resultado = await db.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok", [`chicago:booster:${servidorId}`]);
      bloqueado = resultado.rows[0]?.ok === true;
      if (!bloqueado) throw new ErroBooster("Já existe uma publicação em andamento neste servidor. Aguarde e tente novamente.");
      // Gravações em autocommit: a intenção de publicar sobrevive a um reinício
      // mesmo se o Discord receber a mensagem e a resposta da rede se perder.
      return await tarefa(armazenamento(db));
    } finally {
      if (bloqueado) {
        try { await db.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [`chicago:booster:${servidorId}`]); }
        catch { destruir = true; }
      }
      db.release(destruir);
    }
  }
}
