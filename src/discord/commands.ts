import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

// Mantidos apenas para remover definições antigas e responder a interações em cache.
export const comandosDescontinuados = ["historico", "estatisticas"] as const;

export const comandos = [
  new SlashCommandBuilder().setName("booster").setDescription("Configura o autoatendimento de boosters.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("imagem").setDescription("Troca a imagem do painel; sem arquivo, restaura a arte padrão.")
      .addAttachmentOption((o) => o.setName("arquivo").setDescription("Imagem PNG, JPEG, GIF ou WebP de até 5 MiB").setRequired(false)))
    .addSubcommand((sub) => sub.setName("configurar").setDescription("Salva a configuração e publica ou atualiza o painel permanente.")
      .addChannelOption((o) => o.setName("painel").setDescription("Canal de texto para publicar o painel").addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addChannelOption((o) => o.setName("categoria").setDescription("Categoria dos futuros atendimentos privados").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addRoleOption((o) => o.setName("equipe").setDescription("Equipe autorizada a acessar os futuros atendimentos").setRequired(true))
      .addRoleOption((o) => o.setName("referencia").setDescription("Limite superior dos cargos personalizados; selecione Equipe para ficarem logo abaixo dela").setRequired(true))),
  new SlashCommandBuilder().setName("ping").setDescription("Verifica se o bot está respondendo."),
  new SlashCommandBuilder().setName("vincular").setDescription("Inicia a verificação da sua própria conta do Mobile Legends.")
    .addStringOption((opcao) => opcao.setName("jogador").setDescription("ID da sua conta no Mobile Legends").setRequired(true).setMaxLength(16))
    .addStringOption((opcao) => opcao.setName("servidor").setDescription("ID do servidor da sua conta no Mobile Legends").setRequired(true).setMaxLength(16)),
  new SlashCommandBuilder().setName("perfil").setDescription("Consulta o perfil da sua conta vinculada."),
  new SlashCommandBuilder().setName("desvincular").setDescription("Remove seu vínculo e tenta revogar a sessão do jogo."),
  new SlashCommandBuilder().setName("heroi").setDescription("Consulta nome, função, rota e imagem de um herói.")
    .addStringOption((opcao) => opcao.setName("nome").setDescription("Nome do herói, por exemplo Miya ou Luo Yi").setRequired(true).setMaxLength(100)),
];
