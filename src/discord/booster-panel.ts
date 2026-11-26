import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { ImagemPainel } from "../boosters/image.ts";

export const botoesBooster = {
  criar: "booster:v1:criar", editar: "booster:v1:editar", ajuda: "booster:v1:ajuda",
} as const;

export function marcadorPainel(servidorId: string): string { return `Chicago · Benefício booster · ${servidorId}`; }

export function conteudoPainel(servidorId: string, imagem: ImagemPainel) {
  return {
    embeds: [new EmbedBuilder().setTitle("Seu cargo personalizado")
      .setDescription("Impulsiona este servidor? Configure seu cargo cosmético pelo atendimento privado. Escolha nome, cor e ícone quando disponíveis; confira o resumo e confirme.\n\nJá criou seu cargo? Use os botões para editar o mesmo cargo, sem duplicar.")
      .setFooter({ text: marcadorPainel(servidorId) }).setImage(`attachment://${imagem.nome}`)],
    files: [new AttachmentBuilder(imagem.dados, { name: imagem.nome, description: "Arte do painel de benefícios para boosters" })],
    attachments: [],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(botoesBooster.criar).setLabel("Criar meu cargo").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(botoesBooster.editar).setLabel("Editar meu cargo").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(botoesBooster.ajuda).setLabel("Ajuda").setStyle(ButtonStyle.Secondary),
    )],
    allowedMentions: { parse: [] as never[] },
  };
}
