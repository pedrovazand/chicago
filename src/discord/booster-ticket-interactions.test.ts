import { test } from "node:test";
import assert from "node:assert/strict";
import { MessageFlags, ModalBuilder } from "discord.js";
import type { Interaction } from "discord.js";
import { AtendimentoBooster, novoBeneficio } from "../boosters/benefit-service.ts";
import type { Beneficio } from "../boosters/benefit-types.ts";
import { InteracoesAtendimento } from "./booster-ticket-interactions.ts";
import { controleBeneficio, mensagemAtendimento } from "./booster-wizard.ts";

function ambiente(etapa: Beneficio["etapa"] = "nome") {
  let b: Beneficio = { ...novoBeneficio("1", "100"), canalId: "10", canalEstado: "aberto", etapa };
  const service = new AtendimentoBooster({ exclusivo: async (_g, u, task) => task({
    buscar: async () => u === b.usuarioId ? { ...b } : null, salvar: async (novo) => { b = { ...novo }; },
  }) }, { buscar: async () => ({ servidorId: "1", canalPainelId: "2", categoriaId: "3", equipeId: "4", referenciaId: "5", mensagemPainelId: "6", painelPendente: false, imagemPainel: null }) }, {
    elegivel: async () => true, recursos: async () => ({ gradiente: true, icone: true }),
    canalExiste: async () => true,
    apagarCanal: async () => {},
    criarCanal: async () => "10", recuperarCanal: async () => "10", prepararCanal: async () => {},
    apresentar: async () => "11", criarCargo: async () => "12", aplicarCargo: async () => {},
  });
  const controller = new InteracoesAtendimento("1", service);
  const interacao = (acao: string, modal = false, usuario = "100") => {
    const respostas: { metodo: string; dados: unknown }[] = [];
    const fake = {
      guildId: "1", user: { id: usuario }, channelId: "10", customId: controleBeneficio(b, acao), deferred: false, replied: false,
      isButton: () => !modal, isModalSubmit: () => modal,
      fields: { getTextInputValue: () => "Cargo de teste" },
      showModal: async (dados: ModalBuilder) => { fake.replied = true; respostas.push({ metodo: "showModal", dados: dados.toJSON() }); },
      deferReply: async (dados: unknown) => { fake.deferred = true; respostas.push({ metodo: "deferReply", dados }); },
      editReply: async (dados: unknown) => { respostas.push({ metodo: "editReply", dados }); },
      reply: async (dados: unknown) => { respostas.push({ metodo: "reply", dados }); },
    };
    return { interaction: fake as unknown as Interaction, respostas };
  };
  return { controller, interacao, atual: () => b };
}

test("botão de nome abre modal válido como primeira resposta", async () => {
  const a = ambiente(); const i = a.interacao("abrir_nome");
  await a.controller.tratar(i.interaction);
  assert.equal(i.respostas.length, 1);
  assert.equal(i.respostas[0].metodo, "showModal");
  assert.match(JSON.stringify(i.respostas), /Nome do cargo/);
});

test("upload de ícone usa FileUpload dentro de Label no modal", async () => {
  const a = ambiente("icone"); const i = a.interacao("abrir_icone");
  await a.controller.tratar(i.interaction);
  assert.equal(i.respostas[0].metodo, "showModal");
  const dados = i.respostas[0].dados as { components: { type: number; component: { type: number; max_values: number } }[] };
  assert.equal(dados.components[0].type, 18);
  assert.equal(dados.components[0].component.type, 19);
  assert.equal(dados.components[0].component.max_values, 1);
  assert.match(JSON.stringify(i.respostas), /PNG, JPEG ou WebP/);
  assert.doesNotMatch(JSON.stringify(i.respostas), /64×64/);
});

test("outro usuário não abre o formulário e recebe erro privado", async () => {
  const a = ambiente(); const i = a.interacao("abrir_nome", false, "200");
  await a.controller.tratar(i.interaction);
  assert.equal(i.respostas[0].metodo, "reply");
  assert.equal((i.respostas[0].dados as { flags: number }).flags, MessageFlags.Ephemeral);
  assert.match(JSON.stringify(i.respostas), /não pertence/);
});

test("envio de formulário adia resposta privada e persiste próxima etapa", async () => {
  const a = ambiente(); const i = a.interacao("nome", true);
  await a.controller.tratar(i.interaction);
  assert.deepEqual(i.respostas[0], { metodo: "deferReply", dados: { flags: MessageFlags.Ephemeral } });
  assert.equal(a.atual().etapa, "estilo");
  assert.equal(a.atual().nome, "Cargo de teste");
});

test("resumo oferece Confirmar, Voltar e Cancelar; recursos ausentes não são oferecidos", () => {
  const b: Beneficio = { ...novoBeneficio("1", "100"), etapa: "resumo", nome: "Teste", corPrimaria: "#AD75FF" };
  const resumo = mensagemAtendimento(b, { gradiente: false, icone: false });
  assert.deepEqual(resumo.components[0].components.map(x => { const json = x.toJSON(); return "label" in json ? json.label : null; }), ["Confirmar", "Voltar", "Cancelar"]);
  b.etapa = "estilo";
  assert.doesNotMatch(JSON.stringify(mensagemAtendimento(b, { gradiente: false, icone: false }).components), /"label":"Gradiente"/);
  b.etapa = "icone";
  assert.doesNotMatch(JSON.stringify(mensagemAtendimento(b, { gradiente: false, icone: false }).components), /Enviar ícone/);
});

test("encerramento responde antes de excluir e não responde no canal apagado", async () => {
  const a = ambiente("concluido"); const i = a.interacao("fechar");
  await a.controller.tratar(i.interaction);
  assert.deepEqual(i.respostas.map(x => x.metodo), ["deferReply", "editReply"]);
  assert.match(String(i.respostas[1].dados), /apagando este canal/);
  assert.equal(a.atual().canalId, null);
  assert.equal(a.atual().canalEstado, "fechado");
});
