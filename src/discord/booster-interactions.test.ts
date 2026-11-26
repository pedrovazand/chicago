import { test } from "node:test";
import assert from "node:assert/strict";
import { DiscordAPIError, MessageFlags, PermissionFlagsBits } from "discord.js";
import type { Interaction } from "discord.js";
import { InteracoesBoosters } from "./booster-interactions.ts";
import { botoesBooster } from "./booster-panel.ts";
import { comandos } from "./commands.ts";
import { ErroBooster } from "../boosters/types.ts";

const config = { servidorId: "1", canalPainelId: "2", categoriaId: "3", equipeId: "4", referenciaId: "5", mensagemPainelId: "6", painelPendente: false, imagemPainel: null };

function interacao(nome: string, opcoes: { comando?: boolean; admin?: boolean; subcomando?: string; arquivo?: unknown; usuario?: string; mensagem?: string; guild?: string } = {}) {
  const respostas: { metodo: string; dados: unknown }[] = [];
  const fake = {
    guildId: opcoes.guild ?? "1", channelId: "2", user: { id: opcoes.usuario ?? "10" }, message: { id: opcoes.mensagem ?? "6" },
    commandName: nome, customId: nome, deferred: false, replied: false,
    memberPermissions: { has: () => opcoes.admin ?? false },
    options: { getSubcommand: () => opcoes.subcomando ?? "configurar", getAttachment: () => opcoes.arquivo ?? null, getChannel: (nome: string) => ({ id: nome === "painel" ? "2" : "3" }), getRole: (nome: string) => ({ id: nome === "equipe" ? "4" : "5" }) },
    isChatInputCommand: () => opcoes.comando === true, isButton: () => !opcoes.comando,
    deferReply: async (dados: unknown) => { fake.deferred = true; respostas.push({ metodo: "deferReply", dados }); },
    editReply: async (dados: unknown) => { respostas.push({ metodo: "editReply", dados }); },
    reply: async (dados: unknown) => { respostas.push({ metodo: "reply", dados }); },
  };
  return { interaction: fake as unknown as Interaction, respostas, texto: () => JSON.stringify(respostas) };
}

function ambiente() {
  const consultas: string[][] = [];
  let premium: number | null = 123;
  let publicacoes = 0;
  const repo = { buscar: async () => ({ ...config }) };
  const servicos = {
    consultarMembro: async (guild: string, usuario: string) => { consultas.push([guild, usuario]); return { premiumSinceTimestamp: premium }; },
    configurar: async () => { publicacoes++; },
    trocarImagem: async (..._args: unknown[]) => {},
    abrirAtendimento: async () => "20",
  };
  const novo = () => new InteracoesBoosters("1", repo, servicos);
  return { novo, servicos, consultas, tirarBoost: () => { premium = null; }, publicacoes: () => publicacoes };
}

test("comando administrativo é restrito ao servidor e a administradores", () => {
  const comando = comandos.find((c) => c.name === "booster")!.toJSON();
  assert.equal(comando.default_member_permissions, String(PermissionFlagsBits.Administrator));
  assert.deepEqual(comando.contexts, [0]);
});

test("cada clique consulta o membro atual e responde em privado", async () => {
  const a = ambiente();
  const controlador = a.novo();
  const criar = interacao(botoesBooster.criar);
  await controlador.tratar(criar.interaction);
  assert.deepEqual(criar.respostas[0], { metodo: "deferReply", dados: { flags: MessageFlags.Ephemeral } });
  assert.match(criar.texto(), /Boost ativo confirmado/);
  a.tirarBoost();
  const editar = interacao(botoesBooster.editar);
  await controlador.tratar(editar.interaction);
  assert.match(editar.texto(), /não indica um boost ativo/);
  assert.deepEqual(a.consultas, [["1", "10"], ["1", "10"]]);
});

test("outro usuário é verificado pela própria identidade, sem operar a conta alheia", async () => {
  const a = ambiente();
  await a.novo().tratar(interacao(botoesBooster.criar, { usuario: "11" }).interaction);
  assert.deepEqual(a.consultas, [["1", "11"]]);
});

test("painel persistido funciona em nova instância e cliques duplicados não criam recursos", async () => {
  const a = ambiente();
  await a.novo().tratar(interacao(botoesBooster.criar).interaction);
  const novo = a.novo();
  const cliques = [interacao(botoesBooster.criar), interacao(botoesBooster.criar)];
  await Promise.all(cliques.map((c) => novo.tratar(c.interaction)));
  assert.ok(cliques.every((c) => c.texto().includes("Boost ativo confirmado")));
  assert.equal(a.publicacoes(), 0);
});

test("painel alheio ou antigo e outro servidor não iniciam consulta de membro", async () => {
  const a = ambiente();
  const falso = interacao(botoesBooster.criar, { mensagem: "999" });
  await a.novo().tratar(falso.interaction);
  assert.match(falso.texto(), /não é o painel ativo/);
  const externo = interacao(botoesBooster.criar, { guild: "999" });
  assert.equal(await a.novo().tratar(externo.interaction), false);
  assert.equal(externo.respostas.length, 0);
  assert.equal(a.consultas.length, 0);
});

test("ajuda está disponível sem boost, mas não afirma elegibilidade", async () => {
  const a = ambiente();
  const ajuda = interacao(botoesBooster.ajuda);
  await a.novo().tratar(ajuda.interaction);
  assert.match(ajuda.texto(), /independentemente da quantidade/);
  assert.equal(a.consultas.length, 0);
});

test("membro sem administrador não configura; administrador encaminha opções", async () => {
  const a = ambiente();
  const negado = interacao("booster", { comando: true });
  await a.novo().tratar(negado.interaction);
  assert.match(negado.texto(), /Somente administradores/);
  assert.equal(a.publicacoes(), 0);
  let recebida: unknown;
  a.servicos.configurar = async (...args: unknown[]) => { recebida = args; };
  const admin = interacao("booster", { comando: true, admin: true });
  await a.novo().tratar(admin.interaction);
  const { mensagemPainelId, painelPendente, imagemPainel, ...entrada } = config;
  assert.deepEqual(recebida, [entrada, "10"]);
  assert.match(admin.texto(), /Configuração salva/);
});

test("erro de consulta não é apresentado como ausência de boost", async () => {
  const a = ambiente();
  a.servicos.consultarMembro = async () => { throw new ErroBooster("Discord temporariamente indisponível"); };
  const clique = interacao(botoesBooster.criar);
  await a.novo().tratar(clique.interaction);
  assert.match(clique.texto(), /temporariamente indisponível/);
  assert.doesNotMatch(clique.texto(), /não indica um boost ativo/);
});

test("somente administrador troca a imagem; anexo e restauração são encaminhados em privado", async () => {
  const a = ambiente();
  const trocas: unknown[] = [];
  a.servicos.trocarImagem = async (...args: unknown[]) => { trocas.push(args); };
  await a.novo().tratar(interacao("booster", { comando: true, subcomando: "imagem" }).interaction);
  assert.equal(trocas.length, 0);
  const arquivo = { url: "https://cdn.discordapp.com/attachments/1/2/x.png", size: 100, contentType: "image/png" };
  const editar = interacao("booster", { comando: true, admin: true, subcomando: "imagem", arquivo });
  await a.novo().tratar(editar.interaction);
  assert.deepEqual(editar.respostas[0], { metodo: "deferReply", dados: { flags: MessageFlags.Ephemeral } });
  assert.match(editar.texto(), /Imagem do painel atualizada/);
  const restaurar = interacao("booster", { comando: true, admin: true, subcomando: "imagem" });
  await a.novo().tratar(restaurar.interaction);
  assert.match(restaurar.texto(), /Arte padrão restaurada/);
  assert.deepEqual(trocas, [["1", "10", arquivo], ["1", "10", null]]);
  assert.equal(a.publicacoes(), 0);
});

test("falha inesperada ao retomar mostra operação e código sem vazar dados", async (t) => {
  const a = ambiente();
  a.servicos.abrirAtendimento = async () => {
    throw new DiscordAPIError({ message: "DADO_NAO_REGISTRAR", code: 50001 }, 50001, 403, "GET", "https://example.com/DADO_NAO_REGISTRAR", { body: undefined, files: undefined });
  };
  const logs: string[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args.join(" ")); });
  const clique = interacao(botoesBooster.criar);
  await a.novo().tratar(clique.interaction);
  assert.match(clique.texto(), /abrir ou retomar atendimento/);
  assert.match(clique.texto(), /Discord HTTP 403, código 50001/);
  assert.match(logs.join(" "), /abrir ou retomar atendimento/);
  assert.doesNotMatch(clique.texto() + logs.join(" "), /DADO_NAO_REGISTRAR/);
});
