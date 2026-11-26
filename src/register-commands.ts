import { ApplicationCommandType, DiscordAPIError, REST, Routes } from "discord.js";
import { carregarConfig } from "./config.ts";
import { comandos, comandosDescontinuados } from "./discord/commands.ts";

const config = carregarConfig();
const rest = new REST({ version: "10" }).setToken(config.token);

try {
  // POST por comando: preserva quaisquer outros comandos do servidor.
  for (const comando of comandos) {
    await rest.post(
      Routes.applicationGuildCommands(config.applicationId, config.guildId),
      { body: comando.toJSON() },
    );
    console.log(`Comando /${comando.name} registrado no servidor de testes.`);
  }
  const publicados: unknown = await rest.get(Routes.applicationGuildCommands(config.applicationId, config.guildId));
  if (!Array.isArray(publicados)) throw new Error("Lista de comandos com formato inesperado.");
  for (const publicado of publicados) {
    if (typeof publicado !== "object" || publicado === null) continue;
    if (publicado.type !== ApplicationCommandType.ChatInput || typeof publicado.id !== "string" || !/^\d+$/.test(publicado.id)) continue;
    if (!comandosDescontinuados.some((nome) => nome === publicado.name)) continue;
    // Exclusão direcionada: não substitui a lista inteira nem afeta outras guilds.
    await rest.delete(Routes.applicationGuildCommand(config.applicationId, config.guildId, publicado.id));
    console.log(`Comando /${publicado.name} descontinuado e removido do servidor de testes.`);
  }
} catch (erro) {
  // Não imprimimos o objeto completo: ele pode incluir dados da requisição.
  const detalhe = erro instanceof DiscordAPIError
    ? `Código Discord: ${erro.code}`
    : erro instanceof Error ? erro.name : "Erro desconhecido";
  console.error(`Falha ao registrar comandos (${detalhe}). Confira as credenciais, a instalação e a conexão de rede.`);
  process.exitCode = 1;
}
