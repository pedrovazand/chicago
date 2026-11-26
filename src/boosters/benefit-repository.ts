import type { Pool } from "pg";
import type { Beneficio, DadosBeneficio, RepositorioBeneficio } from "./benefit-types.ts";
import { ErroBooster } from "./types.ts";

export class RepositorioBeneficios implements RepositorioBeneficio {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async exclusivo<T>(servidorId: string, usuarioId: string, tarefa: (db: DadosBeneficio) => Promise<T>): Promise<T> {
    const db = await this.#pool.connect();
    const chave = `chicago:beneficio:${servidorId}:${usuarioId}`;
    let bloqueado = false;
    let destruir = false;
    try {
      const lock = await db.query<{ ok: boolean }>("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok", [chave]);
      bloqueado = lock.rows[0]?.ok === true;
      if (!bloqueado) throw new ErroBooster("Seu atendimento já está processando uma ação. Aguarde e tente novamente.");
      return await tarefa({
        buscar: async () => {
          const r = await db.query<Beneficio>(`SELECT servidor_id AS "servidorId", usuario_id AS "usuarioId",
            sessao, revisao, canal_id AS "canalId", mensagem_id AS "mensagemId", canal_estado AS "canalEstado",
            cargo_id AS "cargoId", cargo_estado AS "cargoEstado", etapa, nome, estilo,
            cor_primaria AS "corPrimaria", cor_secundaria AS "corSecundaria", icone
            FROM booster_benefits WHERE servidor_id=$1 AND usuario_id=$2`, [servidorId, usuarioId]);
          return r.rows[0] ?? null;
        },
        salvar: async (b) => {
          if (b.servidorId !== servidorId || b.usuarioId !== usuarioId) throw new ErroBooster("Proprietário do atendimento divergente.");
          await db.query(`INSERT INTO booster_benefits (servidor_id,usuario_id,sessao,revisao,canal_id,mensagem_id,
            canal_estado,cargo_id,cargo_estado,etapa,nome,estilo,cor_primaria,cor_secundaria,icone)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (servidor_id,usuario_id) DO UPDATE SET sessao=EXCLUDED.sessao,revisao=EXCLUDED.revisao,
            canal_id=EXCLUDED.canal_id,mensagem_id=EXCLUDED.mensagem_id,canal_estado=EXCLUDED.canal_estado,
            cargo_id=EXCLUDED.cargo_id,cargo_estado=EXCLUDED.cargo_estado,etapa=EXCLUDED.etapa,nome=EXCLUDED.nome,
            estilo=EXCLUDED.estilo,cor_primaria=EXCLUDED.cor_primaria,cor_secundaria=EXCLUDED.cor_secundaria,
            icone=EXCLUDED.icone,atualizado_em=NOW()`, [b.servidorId,b.usuarioId,b.sessao,b.revisao,b.canalId,b.mensagemId,
            b.canalEstado,b.cargoId,b.cargoEstado,b.etapa,b.nome,b.estilo,b.corPrimaria,b.corSecundaria,b.icone]);
        },
      });
    } finally {
      if (bloqueado) {
        try { await db.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [chave]); }
        catch { destruir = true; }
      }
      db.release(destruir);
    }
  }
}
