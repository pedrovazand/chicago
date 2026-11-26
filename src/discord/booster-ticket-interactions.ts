import { FileUploadBuilder, LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { Interaction } from "discord.js";
import { AtendimentoBooster } from "../boosters/benefit-service.ts";
import type { ReferenciaAtendimento } from "../boosters/benefit-types.ts";
import { controleBeneficio } from "./booster-wizard.ts";
import { ErroBooster } from "../boosters/types.ts";
import { baixarImagemPainel } from "../boosters/image.ts";

export class InteracoesAtendimento {
  readonly #guildId: string;
  readonly #atendimento: AtendimentoBooster;
  constructor(guildId: string, atendimento: AtendimentoBooster) { this.#guildId = guildId; this.#atendimento = atendimento; }

  async tratar(interaction: Interaction): Promise<boolean> {
    if (interaction.guildId !== this.#guildId || (!interaction.isButton() && !interaction.isModalSubmit()) || !interaction.customId.startsWith("beneficio:")) return false;
    try {
      const partes = /^beneficio:([a-z_]+):([a-f0-9]{32}):(\d{1,10})$/.exec(interaction.customId);
      if (!partes) throw new ErroBooster("Controle de atendimento inválido. Reabra pelo painel.");
      const [, acao, sessao, numero] = partes;
      const ref: ReferenciaAtendimento = { servidorId: interaction.guildId!, usuarioId: interaction.user.id,
        canalId: interaction.channelId!, sessao, revisao: Number(numero) };
      if (interaction.isButton() && ["abrir_nome", "abrir_cores", "abrir_icone"].includes(acao)) {
        // showModal precisa ser a primeira resposta, sem deferReply antes.
        const b = await this.#atendimento.consultar(ref);
        const esperado = { abrir_nome: "nome", abrir_cores: "cores", abrir_icone: "icone" }[acao];
        if (b.etapa !== esperado) throw new ErroBooster("Este formulário não corresponde à etapa atual.");
        const campo = (id: string, label: string, maximo: number, valor: string | null) => {
          const input = new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short).setMaxLength(maximo).setRequired(true);
          if (valor) input.setValue(valor);
          return new LabelBuilder().setLabel(label).setTextInputComponent(input);
        };
        const modal = new ModalBuilder().setTitle("Configurar meu cargo");
        if (acao === "abrir_nome") {
          modal.setCustomId(controleBeneficio(b, "nome")).addLabelComponents(campo("nome", "Nome do cargo", 100, b.nome));
        } else if (acao === "abrir_cores") {
          modal.setCustomId(controleBeneficio(b, "cores")).addLabelComponents(campo("primaria", "Cor HEX: #AD75FF", 7, b.corPrimaria));
          if (b.estilo === "gradiente") modal.addLabelComponents(campo("secundaria", "Segundo HEX do gradiente", 7, b.corSecundaria));
        } else {
          modal.setCustomId(controleBeneficio(b, "icone")).addLabelComponents(new LabelBuilder().setLabel("Imagem PNG, JPEG ou WebP, até 256 KiB")
            .setFileUploadComponent(new FileUploadBuilder().setCustomId("icone").setMaxValues(1).setMinValues(0).setRequired(false)));
        }
        await interaction.showModal(modal);
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      // Autoriza antes de ler/baixar qualquer anexo enviado pelo formulário.
      const b = await this.#atendimento.consultar(ref);
      if (interaction.isModalSubmit()) {
        if (acao === "nome") await this.#atendimento.alterar(ref, acao, { nome: interaction.fields.getTextInputValue("nome") });
        else if (acao === "cores") await this.#atendimento.alterar(ref, acao, {
          primaria: interaction.fields.getTextInputValue("primaria"),
          secundaria: b.estilo === "gradiente" ? interaction.fields.getTextInputValue("secundaria") : undefined,
        });
        else if (acao === "icone") {
          const arquivo = interaction.fields.getUploadedFiles("icone")?.first();
          if (arquivo && (arquivo.size > 256 * 1024 || (arquivo.contentType !== null && !["image/png", "image/jpeg", "image/webp"].includes(arquivo.contentType)))) {
            throw new ErroBooster("Envie PNG, JPEG ou WebP de até 256 KiB, sem exigência de resolução, ou continue sem ícone.");
          }
          await this.#atendimento.alterar(ref, acao, { icone: arquivo ? await baixarImagemPainel(arquivo) : null });
        } else throw new ErroBooster("Formulário desconhecido.");
      } else {
        const acoes = ["solida", "gradiente", "sem_icone", "voltar", "cancelar", "confirmar", "fechar"];
        if (!acoes.includes(acao)) throw new ErroBooster("Ação desconhecida.");
        // Responda antes da exclusão: o webhook da interação pertence a esse canal.
        if (acao === "fechar") await interaction.editReply("Encerrando e apagando este canal. Seu cargo e suas preferências serão mantidos; use o painel para editar novamente.");
        await this.#atendimento.alterar(ref, acao === "sem_icone" ? "icone" : acao, { icone: null });
      }
      if (acao === "fechar") return true;
      await interaction.editReply(acao === "confirmar" ? "Cargo configurado e atribuído! O resultado está na mensagem do atendimento."
        : "Etapa salva. Continue pela mensagem atualizada do atendimento.");
    } catch (erro) {
      if (!(erro instanceof ErroBooster)) console.error("Falha no atendimento booster. Nenhum dado da interação ou credencial foi registrado.");
      const resposta = { content: erro instanceof ErroBooster ? erro.message
        : "A operação não foi confirmada. Suas referências salvas serão reutilizadas. Confira as permissões e tente novamente pelo atendimento; se a criação ficou pendente, peça à equipe para revisar.",
        allowedMentions: { parse: [] as never[] } };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(resposta);
        else await interaction.reply({ ...resposta, flags: MessageFlags.Ephemeral });
      } catch { console.error("Falha ao entregar resposta privada do atendimento."); }
    }
    return true;
  }
}
