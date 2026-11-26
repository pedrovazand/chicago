import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { criarPool } from "../db/pool.ts";
import { aplicarMigrations } from "../db/migrations.ts";
import { RepositorioBoosters } from "./repository.ts";
import { ErroBooster } from "./types.ts";

const connectionString = process.env.TEST_DATABASE_URL;

test("boosters em PostgreSQL real com schema e dados isolados", { skip: !connectionString }, async (t) => {
  const admin = criarPool(connectionString);
  const schema = `test_booster_${randomBytes(8).toString("hex")}`;
  const novoPool = () => new pg.Pool({ connectionString, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
  let pool: pg.Pool | undefined;
  const config = { servidorId: "100", canalPainelId: "200", categoriaId: "300", equipeId: "400", referenciaId: "500", mensagemPainelId: "600", painelPendente: false, imagemPainel: null };
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = novoPool();
    let repo = new RepositorioBoosters(pool);

    await t.test("migrations adotam banco existente sem apagar vínculos e só aplicam uma vez", async () => {
      await pool!.query(await readFile(new URL("../../migrations/001_create_mlbb_links.sql", import.meta.url), "utf8"));
      await pool!.query("INSERT INTO mlbb_links (discord_id, role_id, zone_id, jwt_cifrado) VALUES ('100', '123', '456', 'v1.ficticio')");
      assert.deepEqual(await aplicarMigrations(pool!), ["001_create_mlbb_links.sql", "002_booster_config.sql", "003_booster_panel_image.sql", "004_booster_benefits.sql"]);
      assert.deepEqual(await aplicarMigrations(pool!), []);
      assert.equal((await pool!.query("SELECT jwt_cifrado FROM mlbb_links WHERE discord_id = '100'")).rows[0].jwt_cifrado, "v1.ficticio");
    });

    await t.test("salva configuração e recupera painel após fechar e reabrir conexões", async () => {
      assert.equal(await repo.buscar(config.servidorId), null);
      await repo.exclusivo(config.servidorId, async (db) => { await db.salvar(config); });
      await pool!.end();
      pool = novoPool();
      repo = new RepositorioBoosters(pool);
      assert.deepEqual(await repo.buscar(config.servidorId), config);
    });

    await t.test("bloqueio funciona entre instâncias e não impede outro servidor", async () => {
      const outraInstancia = new RepositorioBoosters(pool!);
      let liberar!: () => void;
      let entrou!: () => void;
      const iniciou = new Promise<void>((r) => { entrou = r; });
      const espera = new Promise<void>((r) => { liberar = r; });
      const primeira = repo.exclusivo(config.servidorId, async () => { entrou(); await espera; });
      await iniciou;
      try {
        await assert.rejects(outraInstancia.exclusivo(config.servidorId, async () => {}), ErroBooster);
        await outraInstancia.exclusivo("999", async (db) => { await db.salvar({ ...config, servidorId: "999" }); });
      } finally { liberar(); await primeira; }
      await outraInstancia.exclusivo(config.servidorId, async (db) => {
        await db.salvar({ ...config, categoriaId: "301" });
      });
      assert.equal((await repo.buscar(config.servidorId))?.categoriaId, "301");
      assert.equal((await pool!.query("SELECT count(*)::int AS total FROM booster_config WHERE servidor_id = '100'")).rows[0].total, 1);
    });

    await t.test("intenção pendente sobrevive a erro e libera bloqueio para recuperação", async () => {
      await assert.rejects(repo.exclusivo("777", async (db) => {
        await db.salvar({ ...config, servidorId: "777", mensagemPainelId: null, painelPendente: true });
        throw new Error("Falha fictícia após salvar intenção");
      }));
      await new RepositorioBoosters(pool!).exclusivo("777", async (db) => {
        const pendente = await db.buscar("777");
        assert.equal(pendente?.painelPendente, true);
        await db.salvar({ ...config, servidorId: "777" });
      });
      assert.equal((await repo.buscar("777"))?.mensagemPainelId, "600");
    });

    await t.test("imagem persistida em BYTEA sobrevive a reconexão", async () => {
      const imagem = await readFile(new URL("../../assets/booster-panel.png", import.meta.url));
      await repo.exclusivo("100", async (db) => { await db.salvar({ ...config, imagemPainel: imagem }); });
      await pool!.end();
      pool = novoPool();
      repo = new RepositorioBoosters(pool);
      const recuperada = await repo.buscar("100");
      assert.deepEqual(recuperada?.imagemPainel, imagem);
      assert.equal(recuperada?.mensagemPainelId, "600");
    });
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
