import { test } from "node:test";
import assert from "node:assert/strict";
import { Collection, DiscordAPIError, PermissionsBitField } from "discord.js";
import type { Client } from "discord.js";
import { AdaptadorBeneficios } from "./benefit-discord.ts";
import { novoBeneficio } from "./benefit-service.ts";

function ambiente(falha?: string) {
  const erro = new DiscordAPIError({ message: "CONTEUDO_EXTERNO_NAO_EXIBIR", code: 50013 }, 50013, 403, "PATCH", "https://discord.com/api/v10/teste", { body: undefined, files: undefined });
  const chamadas: string[] = [];
  const criarRole = (id: string, position: number) => ({
    id, position, managed: false, editable: true, mentionable: false, permissions: new PermissionsBitField(0n),
    comparePositionTo(outro: { position: number }) { return this.position - outro.position; },
  });
  const cargo = {
    ...criarRole("12", 1),
    edit: async () => {
      chamadas.push("editar");
      if (falha === "editar") throw erro;
      // Contrato do SDK: retorna uma cópia, não o objeto presente no cache.
      return { ...cargo, setPosition: async () => { throw new Error("Não posicionar a cópia do cargo"); } };
    },
  };
  const referencia = criarRole("5", 3);
  const equipe = criarRole("4", 9);
  const maior = criarRole("999", 10);
  const cargos = new Collection([[cargo.id, cargo], [referencia.id, referencia], [equipe.id, equipe], [maior.id, maior]]);
  const bot = { id: "999", permissions: new PermissionsBitField(["ManageChannels", "ManageRoles"]), roles: { highest: maior } };
  const membro = { roles: { add: async (atribuido: typeof cargo) => { if (falha === "atribuir") throw erro; assert.equal(atribuido.id, "12"); chamadas.push("atribuir"); } } };
  const guild = {
    id: "1", features: ["ENHANCED_ROLE_COLORS", "ROLE_ICONS"],
    fetch: async () => guild,
    members: { fetch: async ({ user }: { user: string }) => user === "999" ? bot : membro },
    roles: {
      fetch: async (id?: string) => id ? cargos.get(id) ?? null : cargos,
      setPosition: async (id: string, posicao: number) => {
        if (falha === "posicionar") throw erro;
        assert.equal(id, "12"); cargo.position = posicao; chamadas.push("posicionar"); return cargo;
      },
    },
  };
  const client = { user: { id: "999" }, guilds: { fetch: async () => guild } } as unknown as Client;
  const adaptador = new AdaptadorBeneficios(client, async () => ({ premiumSinceTimestamp: 123 }));
  const b = { ...novoBeneficio("1", "100"), nome: "Teste", corPrimaria: "#AD75FF", cargoId: "12" };
  const aplicar = () => adaptador.aplicarCargo({ servidorId: "1", canalPainelId: "2", categoriaId: "3", equipeId: "4", referenciaId: "5", mensagemPainelId: "6", painelPendente: false, imagemPainel: null }, b);
  return { aplicar, chamadas };
}

test("confirmação posiciona o cargo salvo pelo ID, sem usar a cópia devolvida pela edição", async () => {
  const a = ambiente(); await a.aplicar();
  assert.deepEqual(a.chamadas, ["editar", "posicionar", "atribuir"]);
});

for (const etapa of ["editar", "posicionar", "atribuir"]) {
  test(`falha ao ${etapa} informa operação e código sem expor o corpo da API`, async () => {
    await assert.rejects(ambiente(etapa).aplicar(), (erro: unknown) => {
      assert.ok(erro instanceof Error);
      assert.match(erro.message, new RegExp(etapa));
      assert.match(erro.message, /HTTP 403, código 50013/);
      assert.doesNotMatch(erro.message, /CONTEUDO_EXTERNO_NAO_EXIBIR/);
      return true;
    });
  });
}

test("somente Unknown Channel HTTP 404 é considerado canal excluído", async () => {
  const b = { ...novoBeneficio("1", "100"), canalId: "10" };
  for (const [codigo, status] of [[10003, 404], [50001, 403], [10004, 404], [10003, 500]]) {
    const erro = new DiscordAPIError({ message: "Detalhes externos", code: codigo }, codigo, status, "GET", "https://discord.com/api/v10/teste", { body: undefined, files: undefined });
    const client = { guilds: { fetch: async () => ({ channels: { fetch: async () => { throw erro; } } }) } } as unknown as Client;
    const adaptador = new AdaptadorBeneficios(client, async () => ({ premiumSinceTimestamp: 1 }));
    if (codigo === 10003 && status === 404) assert.equal(await adaptador.canalExiste(b), false);
    else await assert.rejects(adaptador.canalExiste(b), e => e === erro);
  }
});

test("exclusão confere marcador do atendimento e não apaga outro canal", async () => {
  for (const proprio of [true, false]) {
    let exclusoes = 0;
    const client = { guilds: { fetch: async () => ({ channels: { fetch: async () => ({
      type: 0, topic: proprio ? "chicago-beneficio:1:100" : "outro-canal",
      delete: async () => { exclusoes++; },
    }) } }) } } as unknown as Client;
    const adaptador = new AdaptadorBeneficios(client, async () => ({ premiumSinceTimestamp: 1 }));
    const tarefa = () => adaptador.apagarCanal({ ...novoBeneficio("1", "100"), canalId: "10" });
    if (proprio) await tarefa();
    else await assert.rejects(tarefa(), /Não foi possível apagar/);
    assert.equal(exclusoes, proprio ? 1 : 0);
  }
});

test("exclusão já concluída é idempotente; falta de permissão não é sucesso", async () => {
  for (const [codigo, status] of [[10003, 404], [50013, 403]]) {
    const erro = new DiscordAPIError({ message: "EXTERNO_PRIVADO", code: codigo }, codigo, status, "DELETE", "https://discord.com/api/v10/teste", { body: undefined, files: undefined });
    const client = { guilds: { fetch: async () => ({ channels: { fetch: async () => ({
      type: 0, topic: "chicago-beneficio:1:100", delete: async () => { throw erro; },
    }) } }) } } as unknown as Client;
    const adaptador = new AdaptadorBeneficios(client, async () => ({ premiumSinceTimestamp: 1 }));
    const tarefa = () => adaptador.apagarCanal({ ...novoBeneficio("1", "100"), canalId: "10" });
    if (status === 404) await tarefa();
    else await assert.rejects(tarefa(), /Gerenciar canais/);
  }
});
