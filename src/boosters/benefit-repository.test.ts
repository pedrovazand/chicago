import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { criarPool } from "../db/pool.ts";
import { aplicarMigrations } from "../db/migrations.ts";
import { RepositorioBoosters } from "./repository.ts";
import { RepositorioBeneficios } from "./benefit-repository.ts";
import { AtendimentoBooster, novoBeneficio } from "./benefit-service.ts";
import type { DiscordBeneficio, ReferenciaAtendimento } from "./benefit-types.ts";
import { ErroBooster } from "./types.ts";

const connectionString = process.env.TEST_DATABASE_URL;
test("benefício persistido em PostgreSQL real, sem Discord real", { skip: !connectionString }, async (t) => {
  const admin = criarPool(connectionString);
  const schema = `test_benefit_${randomBytes(8).toString("hex")}`;
  const novoPool = () => new pg.Pool({ connectionString, options: `-c search_path=${schema}`, statement_timeout: 10000 });
  let pool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`); pool = novoPool();
    await aplicarMigrations(pool);
    let configs = new RepositorioBoosters(pool);
    await configs.exclusivo("1", async db => db.salvar({ servidorId: "1", canalPainelId: "2", categoriaId: "3", equipeId: "4", referenciaId: "5", mensagemPainelId: "6", painelPendente: false, imagemPainel: null }));
    let repo = new RepositorioBeneficios(pool);
    let criacoes = 0;
    const discord: DiscordBeneficio = {
      elegivel: async () => true, recursos: async () => ({ gradiente: true, icone: false }),
      canalExiste: async () => true,
    apagarCanal: async () => {},
    criarCanal: async () => "10", recuperarCanal: async () => "10", prepararCanal: async () => {}, apresentar: async () => "11",
      criarCargo: async () => { criacoes++; return "12"; },
      aplicarCargo: async () => { throw new Error("Falha fictícia de atribuição"); },
    };
    let service = new AtendimentoBooster(repo, configs, discord);
    const ref = async (): Promise<ReferenciaAtendimento> => repo.exclusivo("1", "100", async db => {
      const b = (await db.buscar())!;
      return { servidorId: "1", usuarioId: "100", canalId: b.canalId!, sessao: b.sessao, revisao: b.revisao };
    });
    await t.test("falha de atribuição mantém cargo, proprietário, canal e resumo", async () => {
      await service.abrir("1", "100");
      await service.alterar(await ref(), "nome", { nome: "Persistido" });
      await service.alterar(await ref(), "gradiente");
      await service.alterar(await ref(), "cores", { primaria: "#AD75FF", secundaria: "#112233" });
      await service.alterar(await ref(), "icone", { icone: null });
      await assert.rejects(service.alterar(await ref(), "confirmar"));
      await repo.exclusivo("1", "100", async db => {
        const b = (await db.buscar())!;
        assert.equal(b.cargoId, "12"); assert.equal(b.cargoEstado, "pendente");
        assert.equal(b.etapa, "resumo"); assert.equal(b.nome, "Persistido"); assert.equal(b.canalId, "10");
      });
    });
    await t.test("reconexão permite concluir sem criar outro cargo", async () => {
      await pool!.end(); pool = novoPool();
      repo = new RepositorioBeneficios(pool); configs = new RepositorioBoosters(pool);
      discord.aplicarCargo = async () => {};
      service = new AtendimentoBooster(repo, configs, discord);
      await service.alterar(await ref(), "confirmar");
      assert.equal(criacoes, 1);
      await repo.exclusivo("1", "100", async db => { assert.equal((await db.buscar())?.cargoEstado, "ativo"); });
    });
    await t.test("banco não permite atribuir referência do mesmo cargo a outro proprietário", async () => {
      await assert.rejects(repo.exclusivo("1", "200", async db => {
        await db.salvar({ ...novoBeneficio("1", "200"), cargoId: "12", cargoEstado: "ativo" });
      }));
      await assert.rejects(repo.exclusivo("1", "200", async db => {
        await db.salvar({ ...novoBeneficio("1", "200"), canalId: "10" });
      }));
    });
    await t.test("duas instâncias não processam o mesmo membro simultaneamente", async () => {
      const outra = new RepositorioBeneficios(pool!);
      let entrou!: () => void; let liberar!: () => void;
      const iniciou = new Promise<void>(r => { entrou = r; });
      const espera = new Promise<void>(r => { liberar = r; });
      const primeira = repo.exclusivo("1", "100", async () => { entrou(); await espera; });
      await iniciou;
      try { await assert.rejects(outra.exclusivo("1", "100", async () => {}), ErroBooster); }
      finally { liberar(); await primeira; }
      await outra.exclusivo("1", "100", async () => {});
    });
  } finally {
    await pool?.end(); await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end();
  }
});
