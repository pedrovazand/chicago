import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { criarPool } from "../db/pool.ts";
import { RepositorioVinculos } from "./repository.ts";
import { ProtecaoTokens } from "./tokens.ts";
import { ErroVinculo } from "./types.ts";
import type { CodigoErroVinculo } from "./types.ts";
import { concluirVinculo } from "./service.ts";
import { ErroRone } from "../rone/types.ts";

const connectionString = process.env.TEST_DATABASE_URL;
const erroDoTipo = (codigo: CodigoErroVinculo) => (erro: unknown) => erro instanceof ErroVinculo && erro.codigo === codigo;

test("persistência em PostgreSQL real com dados fictícios", { skip: !connectionString }, async (t) => {
  const admin = criarPool(connectionString);
  // Identificador gerado internamente, jamais recebido de usuário.
  const schema = `test_mlbb_${randomBytes(8).toString("hex")}`;
  const novoPool = () => new pg.Pool({ connectionString, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
  const tokens = new ProtecaoTokens(randomBytes(32).toString("hex"));
  let pool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = novoPool();
    const sql = await readFile(new URL("../../migrations/001_create_mlbb_links.sql", import.meta.url), "utf8");
    await pool.query(sql);
    let repo = new RepositorioVinculos(pool, tokens);
    const vinculo = { discordId: "100000000000000001", jogadorId: "123", servidorId: "456", jwt: "sessao-ficticia-sem-validade" };

    await t.test("insere cifrado, recupera e preserva dados ao reaplicar a migration", async () => {
      assert.equal(await repo.buscar(vinculo.discordId), null);
      await repo.inserir(vinculo);
      await pool!.query(sql);
      assert.deepEqual(await repo.buscar(vinculo.discordId), vinculo);
      const resultado = await pool!.query<{ jwt_cifrado: string }>("SELECT jwt_cifrado FROM mlbb_links WHERE discord_id = $1", [vinculo.discordId]);
      assert.match(resultado.rows[0].jwt_cifrado, /^v1\./);
      assert.ok(!resultado.rows[0].jwt_cifrado.includes(vinculo.jwt));
    });

    await t.test("recupera vínculo após fechar e reabrir conexões", async () => {
      await pool!.end();
      pool = novoPool();
      repo = new RepositorioVinculos(pool, tokens);
      assert.deepEqual(await repo.buscar(vinculo.discordId), vinculo);
    });

    await t.test("constraints impedem duplicação por Discord ou conta sem sobrescrever", async () => {
      await assert.rejects(repo.verificarDisponibilidade(vinculo.discordId, { jogadorId: "999", servidorId: "456" }), erroDoTipo("discord_ja_vinculado"));
      await assert.rejects(repo.verificarDisponibilidade("100000000000000002", vinculo), erroDoTipo("conta_ja_vinculada"));
      await repo.verificarDisponibilidade("100000000000000099", { jogadorId: "888", servidorId: "456" });
      await assert.rejects(repo.inserir({ ...vinculo, jogadorId: "999" }), erroDoTipo("discord_ja_vinculado"));
      await assert.rejects(repo.inserir({ ...vinculo, discordId: "100000000000000002" }), erroDoTipo("conta_ja_vinculada"));
      assert.deepEqual(await repo.buscar(vinculo.discordId), vinculo);
      await repo.inserir({ ...vinculo, discordId: "100000000000000003", servidorId: "999" });
    });

    await t.test("duas tentativas concorrentes só permitem um dono para a conta", async () => {
      const resultados = await Promise.allSettled([
        repo.inserir({ ...vinculo, discordId: "100000000000000004", jogadorId: "789" }),
        repo.inserir({ ...vinculo, discordId: "100000000000000005", jogadorId: "789" }),
      ]);
      assert.equal(resultados.filter((resultado) => resultado.status === "fulfilled").length, 1);
      const rejeitado = resultados.find((resultado) => resultado.status === "rejected");
      assert.ok(rejeitado?.status === "rejected" && erroDoTipo("conta_ja_vinculada")(rejeitado.reason));
    });

    await t.test("falha de autenticação não persiste e perfil confirmado permite persistir", async () => {
      const discordId = "100000000000000006";
      const conta = { jogadorId: "555", servidorId: "456" };
      const sessao = { ...conta, jwt: "outra-sessao-ficticia" };
      const perfil = { ...conta, nome: null, nivel: null, avatar: null };
      await assert.rejects(concluirVinculo(discordId, conta, "1234", {
        autenticar: async () => sessao,
        consultarPerfil: async () => { throw new ErroRone("nao_autenticado", "Sessão fictícia inválida"); },
      }, repo));
      assert.equal(await repo.buscar(discordId), null);
      await concluirVinculo(discordId, conta, "1234", {
        autenticar: async () => sessao, consultarPerfil: async () => perfil,
      }, repo);
      assert.deepEqual(await repo.buscar(discordId), { discordId, ...sessao });
    });

    await t.test("chave errada não lê; remoção funciona até com credencial danificada", async () => {
      const chaveErrada = new RepositorioVinculos(pool!, new ProtecaoTokens(randomBytes(32).toString("hex")));
      await assert.rejects(chaveErrada.buscar(vinculo.discordId), erroDoTipo("credencial_invalida"));
      await pool!.query("UPDATE mlbb_links SET jwt_cifrado = $1 WHERE discord_id = $2", ["v1.danificado", vinculo.discordId]);
      await assert.rejects(repo.buscar(vinculo.discordId), erroDoTipo("credencial_invalida"));
      assert.equal(await repo.remover(vinculo.discordId), true);
      assert.equal(await repo.buscar(vinculo.discordId), null);
      assert.equal(await repo.remover(vinculo.discordId), false);
    });

    await t.test("falha de banco é traduzida sem propagar detalhes internos", async () => {
      const encerrado = novoPool();
      await encerrado.end();
      const indisponivel = new RepositorioVinculos(encerrado, tokens);
      await assert.rejects(indisponivel.buscar("100000000000000099"), (erro: unknown) => {
        assert.ok(erro instanceof ErroVinculo);
        assert.equal(erro.codigo, "banco_indisponivel");
        assert.equal(erro.cause, undefined);
        return true;
      });
    });
  } finally {
    await pool?.end();
    // Limpeza restrita ao schema criado por este teste, no banco de testes.
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await admin.end(); }
  }
});
