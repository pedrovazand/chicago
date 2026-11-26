import { ChannelType, DiscordAPIError, OverwriteType, PermissionFlagsBits as P, REST, Routes } from "discord.js";
import type { Client, Guild, GuildMember, Role, TextChannel } from "discord.js";
import type { Beneficio, DiscordBeneficio } from "./benefit-types.ts";
import type { ConfigBooster } from "./types.ts";
import { ErroBooster } from "./types.ts";
import { mensagemAtendimento } from "../discord/booster-wizard.ts";
import type { ConsultarMembro } from "./eligibility.ts";
import { verificarElegibilidade } from "./eligibility.ts";
import { validarPreferencias } from "./preferences.ts";
import { posicaoAbaixoDaReferencia, validarReferenciaCargo } from "./role-position.ts";

const permitidasMembro = P.ViewChannel | P.SendMessages | P.ReadMessageHistory | P.AttachFiles;
const permitidasBot = permitidasMembro | P.EmbedLinks | P.ManageChannels | P.ManageRoles;

export function permissoesAtendimento(guildId: string, usuarioId: string, botId: string, equipeId: string, fechado: boolean) {
  return [
    { id: guildId, type: OverwriteType.Role, allow: "0", deny: String(P.ViewChannel) },
    { id: equipeId, type: OverwriteType.Role, allow: String(permitidasMembro), deny: "0" },
    { id: usuarioId, type: OverwriteType.Member, allow: String(fechado ? permitidasMembro & ~P.SendMessages : permitidasMembro), deny: String(fechado ? P.SendMessages : 0n) },
    { id: botId, type: OverwriteType.Member, allow: String(permitidasBot), deny: "0" },
  ];
}

export class AdaptadorBeneficios implements DiscordBeneficio {
  readonly #client: Client;
  readonly #consultar: ConsultarMembro;
  constructor(client: Client, consultar: ConsultarMembro) { this.#client = client; this.#consultar = consultar; }

  elegivel(guildId: string, userId: string) { return verificarElegibilidade(this.#consultar, guildId, userId); }

  async recursos(guildId: string) {
    const guild = await (await this.#client.guilds.fetch(guildId)).fetch();
    return { gradiente: guild.features.includes("ENHANCED_ROLE_COLORS"), icone: guild.features.includes("ROLE_ICONS") };
  }

  // POSTs de criação não têm retry automático: a resposta pode se perder após criar.
  private rest(): REST { return new REST({ version: "10", retries: 0 }).setToken(this.#client.token!); }
  private marcador(b: Beneficio) { return `chicago-beneficio:${b.servidorId}:${b.usuarioId}`; }

  private async criar(recurso: "canal" | "cargo", operacao: () => Promise<unknown>): Promise<string> {
    try {
      const resultado = await operacao();
      if (typeof resultado !== "object" || resultado === null || !("id" in resultado)
        || typeof resultado.id !== "string" || !/^[1-9][0-9]{0,19}$/.test(resultado.id)) {
        throw new Error("Referência de criação não confirmada");
      }
      return resultado.id;
    } catch (erro) {
      if (erro instanceof DiscordAPIError && [400, 403, 404].includes(erro.status)) {
        throw new ErroBooster(`O Discord recusou criar o ${recurso} (HTTP ${erro.status}, código ${erro.code}). Confira permissões, configuração e limites do servidor e tente novamente.`);
      }
      throw erro;
    }
  }

  private async validarConfig(config: ConfigBooster): Promise<{ guild: Guild; bot: GuildMember; referencia: Role }> {
    const guild = await this.#client.guilds.fetch(config.servidorId);
    const [bot, cargos] = await Promise.all([
      guild.members.fetch({ user: this.#client.user!.id, force: true }), guild.roles.fetch(),
    ]);
    if (!bot.permissions.has([P.ManageChannels, P.ManageRoles])) throw new ErroBooster("O bot precisa de Gerenciar canais e Gerenciar cargos para este benefício.");
    const referencia = cargos.get(config.referenciaId);
    const equipe = cargos.get(config.equipeId);
    if (!referencia || !equipe || referencia.id === guild.id || equipe.id === guild.id || equipe.id === bot.roles.highest.id) throw new ErroBooster("A equipe ou o cargo de referência está inválido. Peça à administração para revisar a configuração.");
    validarReferenciaCargo(guild.id, bot.roles.highest, equipe, referencia);
    return { guild, bot, referencia };
  }

  async criarCanal(config: ConfigBooster, b: Beneficio): Promise<string> {
    const { guild, bot } = await this.validarConfig(config);
    const categoria = await guild.channels.fetch(config.categoriaId, { force: true });
    if (categoria?.type !== ChannelType.GuildCategory) throw new ErroBooster("Categoria de atendimentos indisponível. Peça à equipe para reconfigurar.");
    if (!categoria.permissionsFor(bot)?.has([P.ManageChannels, P.ManageRoles, P.ViewChannel])) throw new ErroBooster("Faltam permissões do bot na categoria: Ver canal, Gerenciar canais e Gerenciar cargos/permissões.");
    return this.criar("canal", () => this.rest().post(Routes.guildChannels(guild.id), { body: {
      name: `booster-${b.usuarioId}`, type: ChannelType.GuildText, parent_id: categoria.id,
      topic: this.marcador(b), permission_overwrites: permissoesAtendimento(guild.id, b.usuarioId, bot.id, config.equipeId, false),
    }, reason: `Benefício booster: ${b.sessao}` }));
  }

  async recuperarCanal(config: ConfigBooster, b: Beneficio): Promise<string | null> {
    const guild = await this.#client.guilds.fetch(config.servidorId);
    const canais = await guild.channels.fetch();
    const encontrados = canais.filter(c => c?.type === ChannelType.GuildText && c.topic === this.marcador(b));
    if (encontrados.size > 1) throw new ErroBooster("Mais de um atendimento foi encontrado. A equipe precisa revisar antes de continuar.");
    return encontrados.first()?.id ?? null;
  }

  private async canal(b: Beneficio): Promise<TextChannel> {
    const guild = await this.#client.guilds.fetch(b.servidorId);
    const canal = b.canalId ? await guild.channels.fetch(b.canalId, { force: true }) : null;
    if (canal?.type !== ChannelType.GuildText || canal.topic !== this.marcador(b)) throw new ErroBooster("O canal registrado não está disponível ou seu marcador foi alterado. A equipe deve revisar o atendimento; não criarei outro automaticamente.");
    return canal;
  }

  async canalExiste(b: Beneficio): Promise<boolean> {
    try { await this.canal(b); return true; }
    catch (erro) {
      // Só a resposta específica de canal inexistente autoriza substituir a referência.
      if (erro instanceof DiscordAPIError && erro.status === 404 && erro.code === 10003) return false;
      throw erro;
    }
  }

  async apagarCanal(b: Beneficio): Promise<void> {
    try {
      // Confere o marcador de propriedade antes de excluir qualquer canal.
      const canal = await this.canal(b);
      await canal.delete("Atendimento booster encerrado pelo solicitante");
    } catch (erro) {
      // DELETE pode ter sido concluído mesmo se a resposta anterior se perdeu.
      if (erro instanceof DiscordAPIError && erro.status === 404 && erro.code === 10003) return;
      throw new ErroBooster("Não foi possível apagar o canal do atendimento. Confira a permissão Gerenciar canais e tente encerrar novamente. Seu cargo e suas preferências foram preservados.");
    }
  }

  async prepararCanal(config: ConfigBooster, b: Beneficio, fechado: boolean): Promise<void> {
    await this.validarConfig(config);
    const canal = await this.canal(b);
    // Lista explícita: não herda permissões públicas da categoria.
    await this.rest().patch(Routes.channel(canal.id), { body: {
      permission_overwrites: permissoesAtendimento(b.servidorId, b.usuarioId, this.#client.user!.id, config.equipeId, fechado),
    } });
    const bot = await canal.guild.members.fetch({ user: this.#client.user!.id, force: true });
    const atual = await canal.guild.channels.fetch(canal.id, { force: true });
    if (!atual?.permissionsFor(bot)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory])) throw new ErroBooster("Faltam permissões do bot no atendimento: Ver canal, Enviar mensagens, Inserir links, Anexar arquivos ou Ler histórico.");
  }

  async apresentar(b: Beneficio, recursos: Awaited<ReturnType<AdaptadorBeneficios["recursos"]>>): Promise<string> {
    const canal = await this.canal(b);
    const payload = mensagemAtendimento(b, recursos);
    if (b.mensagemId) {
      try {
        const mensagem = await canal.messages.fetch({ message: b.mensagemId, force: true });
        if (mensagem.author.id !== this.#client.user!.id) throw new ErroBooster("A mensagem do atendimento não pertence ao bot.");
        return (await mensagem.edit(payload)).id;
      } catch (erro) { if (!(erro instanceof DiscordAPIError && erro.code === 10008)) throw erro; }
    }
    return (await canal.send({ ...payload, nonce: `${b.sessao.slice(0, 12)}${b.revisao}`, enforceNonce: true })).id;
  }

  async criarCargo(config: ConfigBooster, b: Beneficio): Promise<string> {
    await this.validarConfig(config);
    return this.criar("cargo", () => this.rest().post(Routes.guildRoles(config.servidorId), { body: {
      name: `booster-${b.sessao}`, permissions: "0", mentionable: false, hoist: false,
    }, reason: `Benefício booster: ${b.usuarioId}; operação ${b.sessao}` }));
  }

  async aplicarCargo(config: ConfigBooster, b: Beneficio): Promise<void> {
    const { guild, referencia } = await this.validarConfig(config);
    const recursos = await this.recursos(guild.id);
    validarPreferencias(b, recursos);
    if (!b.cargoId) throw new ErroBooster("Referência do cargo ausente.");
    const cargo = await guild.roles.fetch(b.cargoId, { force: true });
    if (!cargo || cargo.managed || !cargo.editable) throw new ErroBooster("O cargo registrado foi removido ou não pode ser editado pelo bot. A equipe deve revisar; nenhum outro cargo será criado.");
    const posicao = posicaoAbaixoDaReferencia(cargo, referencia);
    // Só recebe IDs guardados após POST do próprio bot, nunca um cargo escolhido pelo usuário.
    await this.etapaCargo("editar o cargo", () => cargo.edit({ name: b.nome, permissions: 0n, mentionable: false, hoist: false,
      colors: { primaryColor: parseInt(b.corPrimaria!.slice(1), 16), secondaryColor: b.estilo === "gradiente" ? parseInt(b.corSecundaria!.slice(1), 16) : null, tertiaryColor: null },
      icon: b.icone, unicodeEmoji: null,
      reason: `Configuração cosmética do benefício de ${b.usuarioId}` }));
    // Role.edit retorna um clone. O gerenciador precisa resolver o objeto em cache
    // pelo ID para ordenar a coleção correta, sem reposicionar outra instância.
    await this.etapaCargo("posicionar o cargo", () => guild.roles.setPosition(cargo.id, posicao));
    const atual = await guild.roles.fetch(cargo.id, { force: true });
    if (!atual || atual.comparePositionTo(referencia) >= 0 || atual.permissions.bitfield !== 0n || atual.mentionable) throw new ErroBooster("A posição ou as permissões do cargo não ficaram seguras. A atribuição foi interrompida; peça à equipe para revisar a faixa de cargos.");
    // Nova consulta junto à atribuição reduz a janela entre validação e efeito externo.
    if (!await this.elegivel(b.servidorId, b.usuarioId)) throw new ErroBooster("Seu boost deixou de estar ativo. O cargo foi preservado sem uma nova atribuição.");
    const membro = await guild.members.fetch({ user: b.usuarioId, force: true });
    await this.etapaCargo("atribuir o cargo", () => membro.roles.add(atual, "Benefício cosmético de booster confirmado"));
  }

  private async etapaCargo<T>(etapa: string, tarefa: () => Promise<T>): Promise<T> {
    try { return await tarefa(); }
    catch (erro) {
      const detalhe = erro instanceof DiscordAPIError ? ` (HTTP ${erro.status}, código ${erro.code})` : "";
      throw new ErroBooster(`Não foi possível ${etapa}${detalhe}. O cargo já salvo será reutilizado. Confira as permissões e a hierarquia; se o erro ocorrer ao editar, confira também as cores e a imagem, e tente Confirmar novamente.`);
    }
  }
}
