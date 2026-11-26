import { MessageFlags, PermissionFlagsBits } from "discord.js";
import type { Interaction } from "discord.js";
import { verificarElegibilidade } from "../boosters/eligibility.ts";
import type { ConsultarMembro } from "../boosters/eligibility.ts";
import { exigirAdministrador } from "../boosters/discord.ts";
import { ErroBooster } from "../boosters/types.ts";
import type { EntradaConfigBooster, RepositorioBooster } from "../boosters/types.ts";
import { botoesBooster } from "./booster-panel.ts";
import type { AnexoImagem } from "../boosters/image.ts";
import { diagnosticoBooster } from "../boosters/diagnostics.ts";

type Servicos = {
  consultarMembro: ConsultarMembro;
  configurar: (entrada: EntradaConfigBooster, administradorId: string) => Promise<void>;
  trocarImagem: (servidorId: string, administradorId: string, anexo: AnexoImagem | null) => Promise<void>;
  abrirAtendimento: (servidorId: string, usuarioId: string) => Promise<string>;
};

export class InteracoesBoosters {
  readonly #guildId: string;
  readonly #repo: Pick<RepositorioBooster, "buscar">;
  readonly #servicos: Servicos;
  constructor(guildId: string, repo: Pick<RepositorioBooster, "buscar">, servicos: Servicos) {
    this.#guildId = guildId; this.#repo = repo; this.#servicos = servicos;
  }

  async tratar(interaction: Interaction): Promise<boolean> {
    if (interaction.guildId !== this.#guildId) return false;
    const comando = interaction.isChatInputCommand() && interaction.commandName === "booster";
    const botao = interaction.isButton() && Object.values(botoesBooster).some((id) => id === interaction.customId);
    if (!comando && !botao) return false;
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return false;
    let operacao = "responder à interação";
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (interaction.isChatInputCommand()) {
        exigirAdministrador(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true);
        if (interaction.options.getSubcommand() === "imagem") {
          operacao = "atualizar imagem do painel";
          const arquivo = interaction.options.getAttachment("arquivo");
          await this.#servicos.trocarImagem(interaction.guildId!, interaction.user.id, arquivo);
          await interaction.editReply(arquivo ? "Imagem do painel atualizada. A mensagem e os botões foram preservados." : "Arte padrão restaurada no painel. A mensagem e os botões foram preservados.");
          return true;
        }
        const entrada: EntradaConfigBooster = {
          servidorId: interaction.guildId!,
          canalPainelId: interaction.options.getChannel("painel", true).id,
          categoriaId: interaction.options.getChannel("categoria", true).id,
          equipeId: interaction.options.getRole("equipe", true).id,
          referenciaId: interaction.options.getRole("referencia", true).id,
        };
        operacao = "configurar painel";
        await this.#servicos.configurar(entrada, interaction.user.id);
        await interaction.editReply("Configuração salva. Painel publicado/atualizado e fixado. Boosters podem iniciar ou retomar seu atendimento pelos botões.");
      } else {
        operacao = "consultar configuração do painel";
        const config = await this.#repo.buscar(interaction.guildId!);
        if (!config || config.painelPendente || config.mensagemPainelId !== interaction.message.id || config.canalPainelId !== interaction.channelId) {
          throw new ErroBooster("Este painel não é o painel ativo. Peça à administração que atualize o painel com /booster configurar.");
        }
        if (interaction.customId === botoesBooster.ajuda) {
          await interaction.editReply("O benefício exige boost ativo, independentemente da quantidade de boosts. Criar e editar abrem ou recuperam seu canal privado para escolher nome, cor e ícone quando disponíveis. A confirmação cria e atribui seu cargo ou atualiza o cargo já salvo, sem duplicar. Eventos automáticos de perda de boost ainda serão habilitados em outra entrega. Dúvidas? Procure a equipe do servidor.");
        } else {
          operacao = "verificar boost";
          const elegivel = await verificarElegibilidade(this.#servicos.consultarMembro, interaction.guildId!, interaction.user.id);
          if (elegivel) {
            operacao = "abrir ou retomar atendimento";
            const canalId = await this.#servicos.abrirAtendimento(interaction.guildId!, interaction.user.id);
            await interaction.editReply({ content: `Boost ativo confirmado! Continue no seu atendimento: <#${canalId}>. Se você já possui um cargo deste benefício, ele será reutilizado.`, allowedMentions: { parse: [] } });
          } else await interaction.editReply("O Discord não indica um boost ativo seu neste servidor. O benefício é exclusivo de boosters ativos; se você acabou de impulsionar, aguarde a atualização e tente novamente.");
        }
      }
    } catch (erro) {
      const diagnostico = diagnosticoBooster(erro);
      const content = erro instanceof ErroBooster ? erro.message
        : `Falha ao ${operacao}: ${diagnostico}. Confira a conexão, as permissões e as migrations; referências persistidas serão reutilizadas.`;
      if (!(erro instanceof ErroBooster)) console.error(`Falha na operação booster [${operacao}; ${diagnostico}]. Dados da interação e credenciais não foram registrados.`);
      const resposta = { content, allowedMentions: { parse: [] as never[] } };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(resposta);
        else await interaction.reply({ ...resposta, flags: MessageFlags.Ephemeral });
      } catch { console.error("Não foi possível entregar a resposta privada de boosters."); }
    }
    return true;
  }
}
