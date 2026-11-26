import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown,
} from "discord.js";
import type { Interaction, ChatInputCommandInteraction, ModalSubmitInteraction } from "discord.js";
import type { ClienteRone } from "../rone/client.ts";
import { ErroRone } from "../rone/types.ts";
import type { EstatisticasRone, HeroiRone, HistoricoRone, PerfilRone } from "../rone/types.ts";
import type { RepositorioVinculos } from "../vinculos/repository.ts";
import { concluirVinculo, desvincularConta } from "../vinculos/service.ts";
import { ErroTentativa, TentativasVinculo } from "../vinculos/pending.ts";
import { ErroVinculo } from "../vinculos/types.ts";
import { comandosDescontinuados } from "./commands.ts";

type Api = Pick<ClienteRone, "solicitarCodigo" | "autenticar" | "consultarPerfil" | "encerrarSessao" | "consultarHeroi" | "consultarTemporadas" | "consultarHistorico" | "consultarEstatisticas">;
type Repositorio = Pick<RepositorioVinculos, "verificarDisponibilidade" | "inserir" | "buscar" | "remover">;
const prefixoBotao = "rone:codigo:";
const prefixoModal = "rone:login:";

function mensagemErro(erro: unknown): string {
  if (erro instanceof ErroRone || erro instanceof ErroVinculo || erro instanceof ErroTentativa) return erro.message;
  return "Não foi possível concluir esta interação. Confira o terminal e tente novamente por uma nova ação.";
}

function fichaPerfil(perfil: PerfilRone): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle("Sua conta Mobile Legends")
    .addFields(
      { name: "Nome", value: escapeMarkdown((perfil.nome ?? "Não informado").slice(0, 200)) },
      { name: "Jogador", value: perfil.jogadorId, inline: true },
      { name: "Servidor", value: perfil.servidorId, inline: true },
      { name: "Nível", value: perfil.nivel === null ? "Não informado" : String(perfil.nivel), inline: true },
    )
    .setFooter({ text: "Rone Arena · ridwaanhall / RoneAI · Dados do jogo © Moonton" });
  if (perfil.avatar && perfil.avatar.length <= 2048) embed.setThumbnail(perfil.avatar);
  return embed;
}

function fichaHeroi(heroi: HeroiRone): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(escapeMarkdown(heroi.nome).slice(0, 256))
    .addFields(
      { name: "Função", value: escapeMarkdown(heroi.funcoes.join(", ").slice(0, 450)) || "Não informada", inline: true },
      { name: "Rota", value: escapeMarkdown(heroi.rotas.join(", ").slice(0, 450)) || "Não informada", inline: true },
    )
    .setFooter({ text: "Rone Arena · ridwaanhall / RoneAI · Dados do jogo © Moonton" });
  if (heroi.imagem && heroi.imagem.length <= 2048) embed.setThumbnail(heroi.imagem);
  return embed;
}

function fichaHistorico(historico: HistoricoRone): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(`Seu histórico · Temporada ${historico.temporada}`)
    .setDescription("Partidas retornadas pela API para esta temporada. Fonte marcada como descontinuada; pode ficar indisponível.")
    .setFooter({ text: "Rone Arena · ridwaanhall / RoneAI · Dados do jogo © Moonton" });
  for (const [indice, partida] of historico.partidas.entries()) {
    const nome = partida.heroi ?? (partida.heroiId ? `Herói ID ${partida.heroiId}` : "Herói não informado");
    const resultado = partida.resultado === "vitoria" ? "Vitória" : partida.resultado === "derrota" ? "Derrota" : "Resultado não informado";
    const data = partida.ocorridaEm === null ? "Data não informada" : `<t:${partida.ocorridaEm}:f>`;
    embed.addFields({
      name: `${indice + 1}. ${escapeMarkdown(nome).slice(0, 150)} · ${resultado}`,
      value: `K/D/A: ${partida.abates ?? "—"}/${partida.mortes ?? "—"}/${partida.assistencias ?? "—"}\n${data}`,
    });
  }
  if (historico.temMais) embed.addFields({ name: "Mais partidas", value: "A API informou mais registros; esta entrega mostra somente a primeira página." });
  return embed;
}

function fichaEstatisticas(dados: EstatisticasRone): EmbedBuilder {
  const decimal = (valor: number) => valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const winrate = dados.winrate !== null ? `${decimal(dados.winrate)}%`
    : dados.partidas === 0 ? "Não calculado: zero partidas" : "Não calculado: totais incompletos";
  return new EmbedBuilder().setTitle("Estatísticas da sua conta")
    .setDescription("Totais disponibilizados pela API; período não informado. A fonte está marcada como descontinuada e pode ficar indisponível.")
    .addFields(
      { name: "Partidas", value: dados.partidas === null ? "Não informado" : String(dados.partidas), inline: true },
      { name: "Vitórias", value: dados.vitorias === null ? "Não informado" : String(dados.vitorias), inline: true },
      { name: "Winrate geral", value: winrate, inline: true },
      { name: "Média de nota", value: dados.notaMedia === null ? "Não informada" : decimal(dados.notaMedia), inline: true },
      { name: "MVPs", value: dados.mvps === null ? "Não informado" : String(dados.mvps), inline: true },
    )
    .setFooter({ text: "Rone Arena · ridwaanhall / RoneAI · Dados do jogo © Moonton" });
}

export class InteracoesRone {
  readonly #api: Api;
  readonly #repositorio: Repositorio;
  readonly #tentativas: TentativasVinculo;
  readonly #guildId: string;
  readonly #ocupados = new Set<string>();

  constructor(guildId: string, api: Api, repositorio: Repositorio, tentativas = new TentativasVinculo()) {
    this.#guildId = guildId;
    this.#api = api;
    this.#repositorio = repositorio;
    this.#tentativas = tentativas;
  }

  private async exclusivo(discordId: string, tarefa: () => Promise<void>): Promise<void> {
    if (this.#ocupados.has(discordId)) throw new ErroTentativa("Você já tem uma operação em andamento. Aguarde a resposta antes de continuar.");
    this.#ocupados.add(discordId);
    try { await tarefa(); } finally { this.#ocupados.delete(discordId); }
  }

  async tratar(interaction: Interaction): Promise<void> {
    if (interaction.guildId !== this.#guildId) return;
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;
    if (interaction.isChatInputCommand() && !["vincular", "perfil", "desvincular", "heroi", "historico", "estatisticas"].includes(interaction.commandName)) return;
    if (interaction.isButton() && !interaction.customId.startsWith(prefixoBotao)) return;
    if (interaction.isModalSubmit() && !interaction.customId.startsWith(prefixoModal)) return;

    try {
      if (interaction.isButton()) {
        const id = interaction.customId.slice(prefixoBotao.length);
        this.#tentativas.consultar(id, interaction.user.id, interaction.guildId!);
        const codigo = new TextInputBuilder().setCustomId("codigo").setLabel("Código recebido no jogo")
          .setStyle(TextInputStyle.Short).setMinLength(4).setMaxLength(4).setRequired(true);
        const modal = new ModalBuilder().setCustomId(`${prefixoModal}${id}`).setTitle("Verificar sua conta")
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(codigo));
        await interaction.showModal(modal);
        return;
      }

      // A privacidade é definida ANTES de qualquer consulta externa.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (interaction.isChatInputCommand() && comandosDescontinuados.some((nome) => nome === interaction.commandName)) {
        await interaction.editReply("Este comando foi descontinuado devido às limitações da fonte de dados. Seu vínculo foi preservado; /perfil continua disponível.");
        return;
      }
      await this.exclusivo(interaction.user.id, async () => {
        if (interaction.isModalSubmit()) await this.confirmar(interaction);
        else if (interaction.isChatInputCommand()) await this.comando(interaction);
      });
    } catch (erro) {
      // Somente categorias conhecidas, jamais a interação, corpo, código ou credencial.
      if (!(erro instanceof ErroRone || erro instanceof ErroVinculo || erro instanceof ErroTentativa)) {
        console.error("Falha inesperada ao tratar uma interação Rone. Nenhum dado da interação foi registrado.");
      }
      try {
        const resposta = { content: mensagemErro(erro), components: [], embeds: [], allowedMentions: { parse: [] as never[] } };
        if (interaction.deferred || interaction.replied) await interaction.editReply(resposta);
        else await interaction.reply({ ...resposta, flags: MessageFlags.Ephemeral });
      } catch { console.error("Não foi possível entregar a resposta privada da interação Rone."); }
    }
  }

  private async comando(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id;
    if (interaction.commandName === "heroi") {
      // Dados públicos: a consulta não exige vínculo ou acesso ao token do jogador.
      const heroi = await this.#api.consultarHeroi(interaction.options.getString("nome", true));
      await interaction.editReply({ embeds: [fichaHeroi(heroi)], allowedMentions: { parse: [] } });
      return;
    }
    if (interaction.commandName === "vincular") {
      const conta = {
        jogadorId: interaction.options.getString("jogador", true).trim(),
        servidorId: interaction.options.getString("servidor", true).trim(),
      };
      await this.#repositorio.verificarDisponibilidade(discordId, conta);
      const id = this.#tentativas.iniciar(discordId, interaction.guildId!, conta);
      try {
        await this.#api.solicitarCodigo(conta);
        this.#tentativas.confirmarEnvio(id);
        const botao = new ButtonBuilder().setCustomId(`${prefixoBotao}${id}`).setLabel("Informar código").setStyle(ButtonStyle.Primary);
        await interaction.editReply({
          content: "Código solicitado para sua conta. Confira o correio dentro do Mobile Legends e clique abaixo para informá-lo em privado. A tentativa expira em 5 minutos. Não envie o código no chat.",
          components: [new ActionRowBuilder<ButtonBuilder>().addComponents(botao)], allowedMentions: { parse: [] },
        });
      } catch (erro) { this.#tentativas.finalizar(id); throw erro; }
      return;
    }

    if (interaction.commandName === "perfil") {
      const vinculo = await this.#repositorio.buscar(discordId);
      if (!vinculo) { await interaction.editReply("Você ainda não tem uma conta vinculada. Use /vincular para começar."); return; }
      let perfil: PerfilRone;
      try { perfil = await this.#api.consultarPerfil(vinculo.jwt); } catch (erro) {
        if (erro instanceof ErroRone && erro.tipo === "nao_autenticado") {
          await interaction.editReply("Sua sessão expirou ou foi recusada pela API. Use /desvincular e depois /vincular para autenticar novamente.");
          return;
        }
        throw erro;
      }
      if (perfil.jogadorId !== vinculo.jogadorId || perfil.servidorId !== vinculo.servidorId) {
        throw new ErroVinculo("conta_divergente", "O perfil não corresponde à conta vinculada. Use /desvincular para remover o vínculo.");
      }
      // Conclui a resposta privada antes do follow-up para não herdar sua visibilidade.
      // Somente o perfil confirmado é público; erros de sessão continuam privados.
      await interaction.editReply("Perfil consultado. Publicando no canal…");
      await interaction.followUp({ embeds: [fichaPerfil(perfil)], allowedMentions: { parse: [] } });
      try { await interaction.deleteReply(); }
      catch { /* A ficha já foi publicada; falha de limpeza não deve repetir a consulta. */ }
      return;
    }

    const cancelada = this.#tentativas.cancelar(discordId);
    const resultado = await desvincularConta(discordId, this.#api, this.#repositorio);
    let mensagem = resultado.removido ? "Vínculo e credencial removidos do banco." : "Você não tem vínculo salvo.";
    if (cancelada) mensagem += " A tentativa pendente foi cancelada.";
    if (resultado.revogacao === "confirmada") mensagem += " A API confirmou o logout da sessão.";
    if (resultado.revogacao === "nao_confirmada") mensagem += " A revogação da sessão na API não pôde ser confirmada; a remoção local foi concluída.";
    await interaction.editReply(mensagem);
  }

  private async confirmar(interaction: ModalSubmitInteraction): Promise<void> {
    const codigo = interaction.fields.getTextInputValue("codigo").trim();
    if (!/^\d{4}$/.test(codigo)) throw new ErroRone("entrada_invalida", "Informe quatro dígitos. Você pode abrir o botão novamente enquanto a tentativa estiver válida.");
    const id = interaction.customId.slice(prefixoModal.length);
    const conta = this.#tentativas.consumir(id, interaction.user.id, interaction.guildId!);
    try {
      const perfil = await concluirVinculo(interaction.user.id, conta, codigo, this.#api, this.#repositorio);
      await interaction.editReply({ content: "Conta autenticada, perfil confirmado e vínculo salvo!", embeds: [fichaPerfil(perfil)], allowedMentions: { parse: [] } });
    } finally { this.#tentativas.finalizar(id); }
  }

  /** @deprecated Referência da integração antiga; não é chamado por comandos ativos. */
  private async historico(interaction: ChatInputCommandInteraction): Promise<void> {
    const vinculo = await this.#repositorio.buscar(interaction.user.id);
    if (!vinculo) { await interaction.editReply("Você ainda não tem uma conta vinculada. Use /vincular para começar."); return; }
    try {
      const temporadas = await this.#api.consultarTemporadas(vinculo.jwt);
      if (!temporadas.length) { await interaction.editReply("A API não retornou temporadas para sua conta. Não há histórico disponível para consultar."); return; }
      const temporada = interaction.options.getInteger("temporada") ?? temporadas[0];
      if (!temporadas.includes(temporada)) {
        await interaction.editReply(`Temporada não disponível para sua conta. IDs retornados pela API: ${temporadas.slice(0, 20).join(", ")}.`);
        return;
      }
      const quantidade = interaction.options.getInteger("quantidade") ?? 5;
      const historico = await this.#api.consultarHistorico(vinculo.jwt, temporada, quantidade);
      if (!historico.partidas.length) {
        await interaction.editReply(`Nenhuma partida retornada para a temporada ${temporada}. Isso não comprova ausência de partidas fora desse recorte.`);
        return;
      }
      await interaction.editReply({ embeds: [fichaHistorico(historico)], allowedMentions: { parse: [] } });
    } catch (erro) {
      if (erro instanceof ErroRone && erro.tipo === "nao_autenticado") {
        await interaction.editReply("Sua sessão expirou ou foi recusada pela API. Use /desvincular e depois /vincular para autenticar novamente.");
        return;
      }
      if (erro instanceof ErroRone) {
        if (erro.diagnostico) {
          const { operacao, statusHttp, codigoApi } = erro.diagnostico;
          await interaction.editReply(`A API recusou a consulta de ${operacao} (HTTP ${statusHttp}, código de resultado ${codigoApi}). O histórico não pôde ser confirmado. Esse endpoint está marcado como descontinuado. Se /perfil funcionar, mantenha o vínculo enquanto investigamos esta consulta.`);
          return;
        }
        await interaction.editReply(`${erro.message} A consulta de histórico depende de endpoints marcados como descontinuados; não foi possível confirmar o histórico agora.`);
        return;
      }
      throw erro;
    }
  }

  /** @deprecated Referência da integração antiga; não é chamado por comandos ativos. */
  private async estatisticas(interaction: ChatInputCommandInteraction): Promise<void> {
    const vinculo = await this.#repositorio.buscar(interaction.user.id);
    if (!vinculo) { await interaction.editReply("Você ainda não tem uma conta vinculada. Use /vincular para começar."); return; }
    try {
      const dados = await this.#api.consultarEstatisticas(vinculo.jwt);
      await interaction.editReply({ embeds: [fichaEstatisticas(dados)], allowedMentions: { parse: [] } });
    } catch (erro) {
      if (erro instanceof ErroRone && erro.tipo === "nao_autenticado") {
        await interaction.editReply("A consulta de estatísticas recusou a autenticação desta sessão. Confira /perfil antes de refazer o vínculo; o acesso ao perfil e às estatísticas pode ter resultados diferentes.");
        return;
      }
      if (erro instanceof ErroRone) {
        const diagnostico = erro.diagnostico;
        const mensagem = diagnostico
          ? `A API recusou a consulta de estatísticas (HTTP ${diagnostico.statusHttp}, código de resultado ${diagnostico.codigoApi}).`
          : erro.message;
        await interaction.editReply(`${mensagem} As estatísticas não puderam ser confirmadas. Esse endpoint está marcado como descontinuado. Seu vínculo foi preservado.`);
        return;
      }
      throw erro;
    }
  }
}
