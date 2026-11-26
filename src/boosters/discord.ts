import { randomBytes } from "node:crypto";
import { ChannelType, DiscordAPIError, PermissionFlagsBits as P } from "discord.js";
import type { Client, Guild, GuildTextBasedChannel } from "discord.js";
import { ErroBooster } from "./types.ts";
import type { EntradaConfigBooster, RepositorioBooster } from "./types.ts";
import { publicarPainel, trocarImagemPainel } from "./panel.ts";
import { baixarImagemPainel, lerImagemPainel } from "./image.ts";
import type { AnexoImagem } from "./image.ts";
import type { PublicadorPainel } from "./panel.ts";
import { conteudoPainel, marcadorPainel } from "../discord/booster-panel.ts";
import { validarReferenciaCargo } from "./role-position.ts";

export function exigirAdministrador(administrador: boolean): void {
  if (!administrador) throw new ErroBooster("Somente administradores do servidor podem configurar o painel.");
}

export class DiscordBoosters {
  readonly #client: Client;
  readonly #repo: RepositorioBooster;
  constructor(client: Client, repo: RepositorioBooster) { this.#client = client; this.#repo = repo; }

  async consultarMembro(servidorId: string, usuarioId: string): Promise<{ premiumSinceTimestamp: number | null }> {
    const guild = await this.#client.guilds.fetch(servidorId);
    try {
      // force:true ignora o cache e faz GET do membro, sem listar todos os membros.
      return await guild.members.fetch({ user: usuarioId, force: true });
    } catch (erro) {
      if (erro instanceof DiscordAPIError && erro.code === 10007) return { premiumSinceTimestamp: null };
      throw new ErroBooster("Não foi possível confirmar seu boost agora. Tente novamente mais tarde; isso não significa perda do benefício.");
    }
  }

  async configurar(entrada: EntradaConfigBooster, usuarioId: string): Promise<void> {
    const guild = await this.#client.guilds.fetch(entrada.servidorId);
    const [canal, categoria, bot, cargos, admin] = await Promise.all([
      guild.channels.fetch(entrada.canalPainelId, { force: true }),
      guild.channels.fetch(entrada.categoriaId, { force: true }),
      guild.members.fetch({ user: this.#client.user!.id, force: true }), guild.roles.fetch(),
      guild.members.fetch({ user: usuarioId, force: true }),
    ]);
    exigirAdministrador(admin.permissions.has(P.Administrator));
    if (canal?.type !== ChannelType.GuildText) throw new ErroBooster("Escolha um canal de texto do servidor para o painel.");
    if (categoria?.type !== ChannelType.GuildCategory) throw new ErroBooster("Escolha uma categoria válida para os atendimentos.");
    const equipe = cargos.get(entrada.equipeId);
    const referencia = cargos.get(entrada.referenciaId);
    if (!equipe || equipe.id === guild.id || !referencia || referencia.id === guild.id) {
      throw new ErroBooster("Equipe e referência devem ser cargos existentes, diferentes de @everyone.");
    }
    validarReferenciaCargo(guild.id, bot.roles.highest, equipe, referencia);
    const permissoes = canal.permissionsFor(bot);
    for (const [flag, nome] of [[P.ViewChannel, "Ver canal"], [P.SendMessages, "Enviar mensagens"],
      [P.EmbedLinks, "Inserir links"], [P.AttachFiles, "Anexar arquivos"], [P.ReadMessageHistory, "Ler histórico de mensagens"], [P.PinMessages, "Fixar mensagens"]] as const) {
      if (!permissoes?.has(flag)) throw new ErroBooster(`Falta a permissão “${nome}” no canal do painel. Ajuste-a e execute o comando novamente.`);
    }
    // As permissões de criar canal/cargo serão verificadas ao habilitar essas etapas.
    await publicarPainel(this.#repo, this.publicador(guild), entrada);
  }

  async trocarImagem(servidorId: string, usuarioId: string, anexo: AnexoImagem | null): Promise<void> {
    const guild = await this.#client.guilds.fetch(servidorId);
    const [admin] = await Promise.all([guild.members.fetch({ user: usuarioId, force: true }), guild.roles.fetch()]);
    exigirAdministrador(admin.permissions.has(P.Administrator));
    const config = await this.#repo.buscar(servidorId);
    if (!config?.mensagemPainelId || config.painelPendente) throw new ErroBooster("Publique ou recupere o painel com /booster configurar antes de trocar a imagem.");
    const [canal, bot] = await Promise.all([
      guild.channels.fetch(config.canalPainelId, { force: true }),
      guild.members.fetch({ user: this.#client.user!.id, force: true }),
    ]);
    if (canal?.type !== ChannelType.GuildText || !canal.permissionsFor(bot)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory])) {
      throw new ErroBooster("Confira as permissões do bot no canal do painel: Ver canal, Enviar mensagens, Inserir links, Anexar arquivos e Ler histórico de mensagens.");
    }
    const imagem = anexo ? await baixarImagemPainel(anexo) : null;
    await trocarImagemPainel(this.#repo, this.publicador(guild), servidorId, imagem);
  }

  private publicador(guild: Guild): PublicadorPainel {
    const obterCanal = async (id: string): Promise<GuildTextBasedChannel> => {
      const canal = await guild.channels.fetch(id, { force: true });
      if (canal?.type !== ChannelType.GuildText) throw new ErroBooster("O canal do painel não está disponível. Confira a configuração e o acesso do bot.");
      return canal;
    };
    const validarMensagem = (mensagem: { author: { id: string }; embeds: { footer: { text: string } | null }[] }) => {
      if (mensagem.author.id !== this.#client.user!.id || !mensagem.embeds.some((e) => e.footer?.text === marcadorPainel(guild.id))) {
        throw new ErroBooster("A mensagem registrada não pertence a este painel. Nenhuma mensagem alheia foi alterada.");
      }
    };
    return {
      existe: async (canalId, mensagemId) => {
        const canal = await obterCanal(canalId);
        try {
          const mensagem = await canal.messages.fetch({ message: mensagemId, force: true });
          validarMensagem(mensagem);
          return true;
        } catch (erro) {
          // Apenas Unknown Message comprova exclusão; 403/timeout não permitem recriar.
          if (erro instanceof DiscordAPIError && erro.code === 10008) return false;
          throw erro;
        }
      },
      recuperar: async (canalId) => {
        const canal = await obterCanal(canalId);
        const mensagens = await canal.messages.fetch({ limit: 100 });
        const candidatos = mensagens.filter((m) => m.author.id === this.#client.user!.id
          && m.embeds.some((e) => e.footer?.text === marcadorPainel(guild.id)));
        if (candidatos.size > 1) throw new ErroBooster("Mais de um painel foi encontrado. Peça à administração que confira as mensagens antes de continuar.");
        return candidatos.first()?.id ?? null;
      },
      enviar: async (canalId, imagem = null) => {
        const canal = await obterCanal(canalId);
        return (await canal.send({ ...conteudoPainel(guild.id, await lerImagemPainel(imagem)), nonce: randomBytes(12).toString("hex"), enforceNonce: true })).id;
      },
      atualizar: async (canalId, mensagemId, imagem = null) => {
        const canal = await obterCanal(canalId);
        const mensagem = await canal.messages.fetch({ message: mensagemId, force: true });
        validarMensagem(mensagem);
        await mensagem.edit(conteudoPainel(guild.id, await lerImagemPainel(imagem)));
      },
      fixar: async (canalId, mensagemId) => {
        const canal = await obterCanal(canalId);
        try { await canal.messages.pin(mensagemId, "Painel permanente de autoatendimento booster"); }
        catch { throw new ErroBooster("O painel foi salvo, mas não foi possível fixá-lo. Confira a permissão “Fixar mensagens” e o limite de mensagens fixadas; execute o comando novamente para reutilizar o painel."); }
      },
    };
  }
}
