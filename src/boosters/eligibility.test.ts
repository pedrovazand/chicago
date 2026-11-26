import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "discord.js";
import { verificarElegibilidade } from "./eligibility.ts";
import { DiscordBoosters, exigirAdministrador } from "./discord.ts";
import { ErroBooster } from "./types.ts";

test("boost ativo é elegível, sem calcular quantidade ou duração", async () => {
  for (const timestamp of [0, 1, Date.now()]) {
    assert.equal(await verificarElegibilidade(async () => ({ premiumSinceTimestamp: timestamp }), "1", "2"), true);
  }
  assert.equal(await verificarElegibilidade(async () => ({ premiumSinceTimestamp: null }), "1", "2"), false);
});

test("falha de consulta não é tratada como perda de elegibilidade", async () => {
  await assert.rejects(verificarElegibilidade(async () => { throw new Error("Rede indisponível"); }, "1", "2"), /Rede indisponível/);
});

test("adaptador consulta o solicitante com force:true mesmo que haja cache", async () => {
  const chamadas: unknown[] = [];
  const membro = { premiumSinceTimestamp: 123 };
  const client = { guilds: { fetch: async (id: string) => {
    chamadas.push(id);
    return { members: { fetch: async (opcoes: unknown) => { chamadas.push(opcoes); return membro; } } };
  } } } as unknown as Client;
  const discord = new DiscordBoosters(client, {
    buscar: async () => null, exclusivo: async () => { throw new Error("Não deve acessar o banco"); },
  });
  assert.equal(await discord.consultarMembro("1", "2"), membro);
  assert.deepEqual(chamadas, ["1", { user: "2", force: true }]);
});

test("configuração administrativa exige administrador", () => {
  assert.throws(() => exigirAdministrador(false), ErroBooster);
  assert.doesNotThrow(() => exigirAdministrador(true));
});
