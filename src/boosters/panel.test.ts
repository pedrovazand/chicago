import { test } from "node:test";
import assert from "node:assert/strict";
import { publicarPainel, trocarImagemPainel } from "./panel.ts";
import { lerImagemPainel } from "./image.ts";
import type { PublicadorPainel } from "./panel.ts";
import { ErroBooster } from "./types.ts";
import type { ConfigBooster, EntradaConfigBooster, RepositorioBooster } from "./types.ts";

const entrada: EntradaConfigBooster = { servidorId: "1", canalPainelId: "2", categoriaId: "3", equipeId: "4", referenciaId: "5" };

function ambiente() {
  let salvo: ConfigBooster | null = null;
  let ocupado = false;
  const repo: RepositorioBooster = {
    buscar: async () => salvo && { ...salvo },
    exclusivo: async (_id, tarefa) => {
      if (ocupado) throw new ErroBooster("Publicação em andamento");
      ocupado = true;
      try { return await tarefa({ buscar: repo.buscar, salvar: async (c) => { salvo = { ...c }; } }); }
      finally { ocupado = false; }
    },
  };
  let enviada = false;
  const chamadas = { envios: 0, edicoes: 0, fixacoes: 0 };
  const discord: PublicadorPainel = {
    existe: async () => enviada,
    recuperar: async () => enviada ? "6" : null,
    enviar: async () => { chamadas.envios++; enviada = true; return "6"; },
    atualizar: async () => { chamadas.edicoes++; },
    fixar: async () => { chamadas.fixacoes++; },
  };
  return { repo, discord, chamadas };
}

test("publicação repetida e retomada reutilizam mensagem persistida", async () => {
  const { repo, discord, chamadas } = ambiente();
  await publicarPainel(repo, discord, entrada);
  // A função é sem estado em memória: nova chamada lê a referência do banco.
  await publicarPainel(repo, discord, { ...entrada, categoriaId: "7" });
  assert.deepEqual(chamadas, { envios: 1, edicoes: 1, fixacoes: 2 });
  assert.deepEqual(await repo.buscar("1"), { ...entrada, categoriaId: "7", mensagemPainelId: "6", painelPendente: false, imagemPainel: null });
});

test("publicações simultâneas não enviam duas mensagens", async () => {
  const { repo, discord, chamadas } = ambiente();
  const resultados = await Promise.allSettled([publicarPainel(repo, discord, entrada), publicarPainel(repo, discord, entrada)]);
  assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(chamadas.envios, 1);
});

test("falha na fixação preserva mensagem para a próxima tentativa", async () => {
  const { repo, discord, chamadas } = ambiente();
  const fixar = discord.fixar;
  discord.fixar = async () => { throw new Error("Sem permissão"); };
  await assert.rejects(publicarPainel(repo, discord, entrada));
  assert.equal((await repo.buscar("1"))?.mensagemPainelId, "6");
  discord.fixar = fixar;
  await publicarPainel(repo, discord, entrada);
  assert.equal(chamadas.envios, 1);
});

test("envio recebido com resposta perdida é recuperado sem novo envio", async () => {
  const { repo, discord, chamadas } = ambiente();
  const enviar = discord.enviar;
  discord.enviar = async (canal) => { await enviar(canal); throw new Error("Conexão perdida"); };
  await assert.rejects(publicarPainel(repo, discord, entrada));
  assert.equal((await repo.buscar("1"))?.painelPendente, true);
  await publicarPainel(repo, discord, entrada);
  assert.equal(chamadas.envios, 1);
  assert.equal((await repo.buscar("1"))?.mensagemPainelId, "6");
  assert.equal((await repo.buscar("1"))?.painelPendente, false);
});

test("publicação ambígua não localizada não provoca novo envio", async () => {
  const { repo, discord, chamadas } = ambiente();
  discord.enviar = async () => { chamadas.envios++; throw new Error("Timeout"); };
  await assert.rejects(publicarPainel(repo, discord, entrada));
  await assert.rejects(publicarPainel(repo, discord, entrada), /Não criarei outro painel/);
  assert.equal(chamadas.envios, 1);
});

test("403 na mensagem existente não vira permissão para recriar", async () => {
  const { repo, discord, chamadas } = ambiente();
  await publicarPainel(repo, discord, entrada);
  discord.existe = async () => { throw new Error("Acesso recusado"); };
  await assert.rejects(publicarPainel(repo, discord, entrada));
  assert.equal(chamadas.envios, 1);
});

test("troca de canal exige remoção confirmada do painel anterior", async () => {
  const { repo, discord, chamadas } = ambiente();
  await publicarPainel(repo, discord, entrada);
  await assert.rejects(publicarPainel(repo, discord, { ...entrada, canalPainelId: "8" }), /outro canal/);
  assert.equal(chamadas.envios, 1);
  discord.existe = async () => false;
  await publicarPainel(repo, discord, { ...entrada, canalPainelId: "8" });
  assert.equal(chamadas.envios, 2);
});

test("troca de imagem mantém painel e preferências, inclusive após reconfigurar", async () => {
  const { repo, discord, chamadas } = ambiente();
  const imagem = (await lerImagemPainel()).dados;
  await publicarPainel(repo, discord, entrada);
  let recebida: Buffer | null | undefined;
  discord.atualizar = async (_canal, id, dados) => { assert.equal(id, "6"); recebida = dados; };
  await trocarImagemPainel(repo, discord, "1", imagem);
  assert.deepEqual(recebida, imagem);
  await publicarPainel(repo, discord, { ...entrada, categoriaId: "7" });
  assert.deepEqual((await repo.buscar("1"))?.imagemPainel, imagem);
  assert.deepEqual(recebida, imagem);
  assert.equal(chamadas.envios, 1);
  await trocarImagemPainel(repo, discord, "1", null);
  assert.equal(recebida, null);
  assert.equal((await repo.buscar("1"))?.imagemPainel, null);
});

test("falha ao editar conserva imagem escolhida para reaplicação, sem duplicar painel", async () => {
  const { repo, discord, chamadas } = ambiente();
  await publicarPainel(repo, discord, entrada);
  const imagem = (await lerImagemPainel()).dados;
  const atualizar = discord.atualizar;
  discord.atualizar = async () => { throw new Error("Falha de rede"); };
  await assert.rejects(trocarImagemPainel(repo, discord, "1", imagem), /imagem foi salva/);
  assert.deepEqual((await repo.buscar("1"))?.imagemPainel, imagem);
  discord.atualizar = atualizar;
  await publicarPainel(repo, discord, entrada);
  assert.equal(chamadas.envios, 1);
});

test("troca de imagem não publica mensagem quando não há painel confirmado", async () => {
  const { repo, discord, chamadas } = ambiente();
  await assert.rejects(trocarImagemPainel(repo, discord, "1", null), /Publique ou recupere/);
  assert.equal(chamadas.envios, 0);
});

test("painel excluído exige republicação antes da troca, sem alterar a imagem salva", async () => {
  const { repo, discord, chamadas } = ambiente();
  await publicarPainel(repo, discord, entrada);
  discord.existe = async () => false;
  await assert.rejects(trocarImagemPainel(repo, discord, "1", (await lerImagemPainel()).dados), /mensagem do painel foi excluída/);
  assert.equal((await repo.buscar("1"))?.imagemPainel, null);
  assert.equal(chamadas.envios, 1);
});
