import { test } from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";
import type { Interaction } from "discord.js";
import { InteracoesRone } from "./rone-interactions.ts";
import { comandos, comandosDescontinuados } from "./commands.ts";
import { TentativasVinculo } from "../vinculos/pending.ts";
import { ErroRone } from "../rone/types.ts";
import type { ClienteRone } from "../rone/client.ts";
import type { RepositorioVinculos } from "../vinculos/repository.ts";
import type { Vinculo } from "../vinculos/types.ts";

const usuario = "100000000000000001";
const conta = { jogadorId: "123", servidorId: "456" };
const sessao = { ...conta, jwt: "sessao-ficticia-nao-real" };
const perfil = { ...conta, nome: "Teste", nivel: 1, avatar: null };

// Objetos simulados: nenhum método chama o Discord ou a Rone Arena.
function interacao(tipo: "comando" | "botao" | "modal", nome: string, opcoes: { usuario?: string; guild?: string; codigo?: string; nome?: string; temporada?: number; quantidade?: number } = {}) {
  const respostas: { metodo: string; dados: unknown }[] = [];
  const fake = {
    guildId: opcoes.guild ?? "guild", user: { id: opcoes.usuario ?? usuario },
    commandName: nome, customId: nome, deferred: false, replied: false,
    options: {
      getString: (campo: string) => campo === "nome" ? opcoes.nome ?? "Miya" : campo === "jogador" ? conta.jogadorId : conta.servidorId,
      getInteger: (campo: string) => campo === "temporada" ? opcoes.temporada ?? null : opcoes.quantidade ?? null,
    },
    fields: { getTextInputValue: () => opcoes.codigo ?? "4321" },
    isChatInputCommand: () => tipo === "comando", isButton: () => tipo === "botao", isModalSubmit: () => tipo === "modal",
    deferReply: async (dados: unknown) => { fake.deferred = true; respostas.push({ metodo: "deferReply", dados }); },
    editReply: async (dados: unknown) => { respostas.push({ metodo: "editReply", dados }); },
    followUp: async (dados: unknown) => { respostas.push({ metodo: "followUp", dados }); },
    deleteReply: async () => { respostas.push({ metodo: "deleteReply", dados: null }); },
    reply: async (dados: unknown) => { fake.replied = true; respostas.push({ metodo: "reply", dados }); },
    showModal: async (dados: unknown) => { fake.replied = true; respostas.push({ metodo: "showModal", dados }); },
  };
  return { interaction: fake as unknown as Interaction, respostas, texto: () => JSON.stringify(respostas) };
}

function ambiente(tentativas = new TentativasVinculo()) {
  const chamadas = { envios: 0, logins: 0, perfis: 0, insercoes: 0, logouts: 0 };
  let salvo: Vinculo | null = null;
  const api: Pick<ClienteRone, "solicitarCodigo" | "autenticar" | "consultarPerfil" | "encerrarSessao" | "consultarHeroi" | "consultarTemporadas" | "consultarHistorico" | "consultarEstatisticas"> = {
    solicitarCodigo: async () => { chamadas.envios++; },
    autenticar: async () => { chamadas.logins++; return sessao; },
    consultarPerfil: async () => { chamadas.perfis++; return perfil; },
    encerrarSessao: async () => { chamadas.logouts++; },
    consultarHeroi: async () => ({ nome: "Miya", funcoes: ["Marksman"], rotas: ["Gold Lane"], imagem: "https://example.com/miya.png" }),
    consultarTemporadas: async () => [40, 39],
    consultarHistorico: async (_jwt, temporada) => ({ temporada, partidas: [], temMais: false }),
    consultarEstatisticas: async () => ({ partidas: 10, vitorias: 6, winrate: 60, notaMedia: 7.5, mvps: 2 }),
  };
  const repo: Pick<RepositorioVinculos, "verificarDisponibilidade" | "inserir" | "buscar" | "remover"> = {
    verificarDisponibilidade: async () => {},
    inserir: async (vinculo) => { chamadas.insercoes++; salvo = vinculo; },
    buscar: async () => salvo,
    remover: async () => { const existia = salvo !== null; salvo = null; return existia; },
  };
  return { chamadas, api, repo, controlador: new InteracoesRone("guild", api, repo, tentativas) };
}

async function iniciar(controlador: InteracoesRone): Promise<string> {
  const comando = interacao("comando", "vincular");
  await controlador.tratar(comando.interaction);
  assert.deepEqual(comando.respostas[0], { metodo: "deferReply", dados: { flags: MessageFlags.Ephemeral } });
  const resposta = JSON.parse(comando.texto()) as { metodo: string; dados: { components?: { components: { custom_id: string }[] }[] } }[];
  const customId = resposta.find((item) => item.metodo === "editReply")?.dados.components?.[0].components[0].custom_id;
  assert.equal(typeof customId, "string");
  assert.ok(customId);
  assert.ok(customId.startsWith("rone:codigo:"));
  return customId.slice("rone:codigo:".length);
}

test("registro preserva os comandos existentes, inclui boosters e exclui os descontinuados", () => {
  assert.deepEqual(comandos.map((comando) => comando.name), ["booster", "ping", "vincular", "perfil", "desvincular", "heroi"]);
});

for (const nome of comandosDescontinuados) {
  test(`/${nome} em cache responde em privado sem consultar serviços nem alterar o vínculo`, async () => {
    const { controlador, api, repo } = ambiente();
    const vinculo = { discordId: usuario, ...sessao };
    await repo.inserir(vinculo);
    const buscarOriginal = repo.buscar;
    let acessos = 0;
    const proibido = async (): Promise<never> => { acessos++; throw new Error("Acesso inesperado"); };
    for (const chave of Object.keys(api) as (keyof typeof api)[]) api[chave] = proibido;
    for (const chave of Object.keys(repo) as (keyof typeof repo)[]) repo[chave] = proibido;
    const comando = interacao("comando", nome);
    await controlador.tratar(comando.interaction);
    assert.deepEqual(comando.respostas[0], { metodo: "deferReply", dados: { flags: MessageFlags.Ephemeral } });
    assert.match(comando.texto(), /descontinuado/);
    assert.ok(!comando.texto().includes(sessao.jwt));
    assert.equal(acessos, 0);
    assert.deepEqual(await buscarOriginal(usuario), vinculo);
  });
}

test("vínculo completo é privado, confirma perfil e impede segundo login pelo mesmo modal", async () => {
  const { controlador, chamadas } = ambiente();
  const id = await iniciar(controlador);
  assert.equal(chamadas.envios, 1);
  const botao = interacao("botao", `rone:codigo:${id}`);
  await controlador.tratar(botao.interaction);
  assert.equal(botao.respostas[0].metodo, "showModal");
  const modal = interacao("modal", `rone:login:${id}`);
  await controlador.tratar(modal.interaction);
  assert.deepEqual(modal.respostas[0], { metodo: "deferReply", dados: { flags: MessageFlags.Ephemeral } });
  assert.match(modal.texto(), /vínculo salvo/);
  assert.ok(!modal.texto().includes("4321"));
  assert.ok(!modal.texto().includes(sessao.jwt));
  const repetido = interacao("modal", `rone:login:${id}`);
  await controlador.tratar(repetido.interaction);
  assert.match(repetido.texto(), /expirada, já utilizada/);
  assert.equal(chamadas.logins, 1);
  assert.equal(chamadas.perfis, 1);
  assert.equal(chamadas.insercoes, 1);
});

test("outro usuário não abre modal nem consome tentativa; outro servidor é ignorado", async () => {
  const { controlador, chamadas } = ambiente();
  const id = await iniciar(controlador);
  const alheio = interacao("botao", `rone:codigo:${id}`, { usuario: "100000000000000002" });
  await controlador.tratar(alheio.interaction);
  assert.equal(alheio.respostas[0].metodo, "reply");
  assert.match(alheio.texto(), /indisponível para este usuário/);
  assert.ok(!alheio.texto().includes("showModal"));
  const outraGuild = interacao("modal", `rone:login:${id}`, { guild: "outra" });
  await controlador.tratar(outraGuild.interaction);
  assert.equal(outraGuild.respostas.length, 0);
  assert.equal(chamadas.logins, 0);
});

test("tentativa expirada ou código inválido não tenta login", async () => {
  let agora = 0;
  const { controlador, chamadas } = ambiente(new TentativasVinculo(() => agora));
  const id = await iniciar(controlador);
  const invalido = interacao("modal", `rone:login:${id}`, { codigo: "abcd" });
  await controlador.tratar(invalido.interaction);
  assert.match(invalido.texto(), /quatro dígitos/);
  agora = 300_000;
  await controlador.tratar(interacao("modal", `rone:login:${id}`).interaction);
  assert.equal(chamadas.logins, 0);
  assert.equal(chamadas.insercoes, 0);
});

test("vincular repetido não duplica envio, e erro de envio não provoca retry", async () => {
  const { controlador, chamadas } = ambiente();
  await iniciar(controlador);
  await controlador.tratar(interacao("comando", "vincular").interaction);
  assert.equal(chamadas.envios, 1);
  const outro = ambiente();
  let tentativas = 0;
  outro.api.solicitarCodigo = async () => { tentativas++; throw new ErroRone("timeout", "A operação pode ter sido recebida; não foi repetida."); };
  const falha = interacao("comando", "vincular");
  await outro.controlador.tratar(falha.interaction);
  assert.match(falha.texto(), /não foi repetida/);
  assert.equal(tentativas, 1);
});

test("operações concorrentes do mesmo usuário não duplicam solicitações", async () => {
  const { controlador, api } = ambiente();
  let liberar!: () => void;
  const bloqueio = new Promise<void>((resolve) => { liberar = resolve; });
  let chamadas = 0;
  api.solicitarCodigo = async () => { chamadas++; await bloqueio; };
  const primeiro = controlador.tratar(interacao("comando", "vincular").interaction);
  // A primeira operação começa após deferReply e a verificação de disponibilidade.
  await new Promise<void>((resolve) => setImmediate(resolve));
  const segundo = interacao("comando", "vincular");
  await controlador.tratar(segundo.interaction);
  assert.match(segundo.texto(), /operação em andamento/);
  liberar();
  await primeiro;
  assert.equal(chamadas, 1);
});

test("perfil distingue ausência de vínculo de sessão expirada e fica privado", async () => {
  const { controlador, api, repo } = ambiente();
  const ausente = interacao("comando", "perfil");
  await controlador.tratar(ausente.interaction);
  assert.match(ausente.texto(), /ainda não tem uma conta vinculada/);
  await repo.inserir({ discordId: usuario, ...sessao });
  api.consultarPerfil = async () => { throw new ErroRone("nao_autenticado", "Falha simulada"); };
  const expirado = interacao("comando", "perfil");
  await controlador.tratar(expirado.interaction);
  assert.deepEqual(expirado.respostas[0], { metodo: "deferReply", dados: { flags: MessageFlags.Ephemeral } });
  assert.match(expirado.texto(), /sessão expirou/);
  assert.ok(!expirado.texto().includes(sessao.jwt));
});

test("perfil divergente não exibe dados de outra conta", async () => {
  const { controlador, api, repo } = ambiente();
  await repo.inserir({ discordId: usuario, ...sessao });
  api.consultarPerfil = async () => ({ ...perfil, jogadorId: "999", nome: "NaoExibir" });
  const comando = interacao("comando", "perfil");
  await controlador.tratar(comando.interaction);
  assert.match(comando.texto(), /não corresponde/);
  assert.ok(!comando.texto().includes("NaoExibir"));
});

test("desvincular cancela tentativa e reporta falha de revogação sem reter vínculo", async () => {
  const { controlador, api, repo } = ambiente();
  const id = await iniciar(controlador);
  const cancelar = interacao("comando", "desvincular");
  await controlador.tratar(cancelar.interaction);
  assert.match(cancelar.texto(), /tentativa pendente foi cancelada/);
  const modalAntigo = interacao("modal", `rone:login:${id}`);
  await controlador.tratar(modalAntigo.interaction);
  assert.match(modalAntigo.texto(), /expirada, já utilizada/);
  await repo.inserir({ discordId: usuario, ...sessao });
  api.encerrarSessao = async () => { throw new ErroRone("indisponivel", "Falha simulada"); };
  const remover = interacao("comando", "desvincular");
  await controlador.tratar(remover.interaction);
  assert.match(remover.texto(), /revogação da sessão na API não pôde ser confirmada/);
  assert.equal(await repo.buscar(usuario), null);
});

test("heroi adia resposta em privado antes de consultar e não acessa conta vinculada", async () => {
  const { controlador, api, repo } = ambiente();
  const comando = interacao("comando", "heroi", { nome: "Luo Yi" });
  repo.buscar = async () => { throw new Error("Consulta pública não deve acessar vínculo"); };
  api.consultarHeroi = async (nome) => {
    assert.equal(comando.respostas[0].metodo, "deferReply");
    assert.equal(nome, "Luo Yi");
    return { nome, funcoes: ["Mage"], rotas: ["Mid Lane"], imagem: "https://example.com/luoyi.png" };
  };
  await controlador.tratar(comando.interaction);
  assert.match(comando.texto(), /Luo Yi/);
  assert.match(comando.texto(), /Mage/);
  assert.match(comando.texto(), /Mid Lane/);
  assert.match(comando.texto(), /luoyi.png/);
  assert.match(comando.texto(), /Rone Arena/);
  assert.ok(!comando.texto().includes(sessao.jwt));
});

test("heroi sem campos opcionais não inventa função, rota ou imagem", async () => {
  const { controlador, api } = ambiente();
  api.consultarHeroi = async () => ({ nome: "Miya", funcoes: [], rotas: [], imagem: null });
  const comando = interacao("comando", "heroi");
  await controlador.tratar(comando.interaction);
  assert.match(comando.texto(), /Não informada/);
  assert.ok(!comando.texto().includes("thumbnail"));
});

test("heroi inexistente ou indisponível mostra erro sem alterar vínculos", async () => {
  for (const tipo of ["nao_encontrado", "timeout", "indisponivel"] as const) {
    const { controlador, api, chamadas } = ambiente();
    api.consultarHeroi = async () => { throw new ErroRone(tipo, "Erro público simulado"); };
    const comando = interacao("comando", "heroi");
    await controlador.tratar(comando.interaction);
    assert.match(comando.texto(), /Erro público simulado/);
    assert.equal(chamadas.logins, 0);
    assert.equal(chamadas.insercoes, 0);
  }
});












test("perfil confirmado publica ficha no canal sem credenciais e limpa resposta privada", async () => {
  const { controlador, repo } = ambiente();
  await repo.inserir({ discordId: usuario, ...sessao });
  const comando = interacao("comando", "perfil");
  await controlador.tratar(comando.interaction);
  assert.deepEqual(comando.respostas.map(r => r.metodo), ["deferReply", "editReply", "followUp", "deleteReply"]);
  const publica = comando.respostas[2].dados as { flags?: number; embeds: unknown[] };
  assert.equal(publica.flags, undefined);
  assert.equal(publica.embeds.length, 1);
  assert.ok(!JSON.stringify(publica).includes(sessao.jwt));
});
