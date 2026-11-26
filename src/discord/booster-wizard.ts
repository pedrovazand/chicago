import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { Beneficio, RecursosCargo } from "../boosters/benefit-types.ts";
import { validarImagemPainel } from "../boosters/image.ts";

export function controleBeneficio(b: Beneficio, acao: string): string { return `beneficio:${acao}:${b.sessao}:${b.revisao}`; }

export function mensagemAtendimento(b: Beneficio, recursos: RecursosCargo) {
  const embed = new EmbedBuilder().setTitle("Seu cargo personalizado")
    .setFooter({ text: "Somente você pode operar este atendimento. A equipe pode acompanhar. Cargos superiores podem prevalecer na aparência do nome." });
  const botoes: ButtonBuilder[] = [];
  const botao = (acao: string, texto: string, estilo: ButtonStyle = ButtonStyle.Primary) => {
    botoes.push(new ButtonBuilder().setCustomId(controleBeneficio(b, acao)).setLabel(texto).setStyle(estilo));
  };
  const arquivos: AttachmentBuilder[] = [];
  switch (b.etapa) {
    case "nome":
      embed.setDescription(`1. Escolha o nome do cargo (até 100 caracteres).${b.cargoId ? "\nVocê está editando seu cargo existente; nenhum outro será criado." : ""}`);
      botao("abrir_nome", "Informar nome"); break;
    case "estilo":
      embed.setDescription(`2. Escolha o estilo da cor.${recursos.gradiente ? "" : "\nEste servidor não oferece gradientes. Você pode continuar com cor sólida."}`);
      botao("solida", "Cor sólida"); if (recursos.gradiente) botao("gradiente", "Gradiente"); break;
    case "cores":
      embed.setDescription(`3. Informe ${b.estilo === "gradiente" ? "dois HEX para o gradiente" : "um HEX para a cor sólida"}, por exemplo #AD75FF.`);
      botao("abrir_cores", "Informar cores"); break;
    case "icone":
      embed.setDescription(`4. Ícone opcional.${recursos.icone ? "\nEnvie PNG, JPEG ou WebP de até 256 KiB pelo formulário. Não precisa ser 64×64; não exigimos uma resolução específica." : "\nEste servidor não oferece ícones. Continue sem ícone."}`);
      if (recursos.icone) botao("abrir_icone", "Enviar ícone");
      botao("sem_icone", "Continuar sem ícone", ButtonStyle.Secondary); break;
    case "resumo":
      embed.setDescription("Confira as escolhas antes de aplicar o cargo. Ao confirmar, seu boost será consultado novamente.")
        .addFields({ name: "Nome", value: b.nome }, { name: "Cor", value: `${b.estilo}: ${b.corPrimaria}${b.corSecundaria ? ` → ${b.corSecundaria}` : ""}` },
          { name: "Ícone", value: b.icone ? "Imagem anexada" : "Sem ícone" });
      if (b.icone) {
        const nome = validarImagemPainel(b.icone).nome.replace("booster-panel", "icone");
        arquivos.push(new AttachmentBuilder(b.icone, { name: nome })); embed.setThumbnail(`attachment://${nome}`);
      }
      botao("confirmar", "Confirmar", ButtonStyle.Success); break;
    case "concluido":
      embed.setDescription("Cargo configurado e atribuído a você! Ao encerrar, este canal será apagado. Você pode voltar pelo painel para editar o mesmo cargo.");
      botao("fechar", "Encerrar atendimento", ButtonStyle.Secondary); break;
    case "cancelado":
      embed.setDescription("Configuração cancelada. Nenhuma nova alteração será aplicada ao cargo. Ao encerrar, este canal será apagado. Você pode recomeçar pelo painel.");
      botao("fechar", "Encerrar atendimento", ButtonStyle.Secondary); break;
  }
  if (!["concluido", "cancelado"].includes(b.etapa)) {
    if (b.etapa !== "nome") botao("voltar", "Voltar", ButtonStyle.Secondary);
    botao("cancelar", "Cancelar", ButtonStyle.Danger);
  }
  const components = b.canalEstado === "fechado" ? [] : [new ActionRowBuilder<ButtonBuilder>().addComponents(botoes)];
  return { embeds: [embed], components, files: arquivos, attachments: [], allowedMentions: { parse: [] as never[] } };
}
