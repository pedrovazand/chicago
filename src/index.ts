import { Client, DiscordAPIError, Events, GatewayIntentBits } from "discord.js";
import { carregarConfig } from "./config.ts";
import { criarPool } from "./db/pool.ts";
import { ClienteRone } from "./rone/client.ts";
import { ProtecaoTokens } from "./vinculos/tokens.ts";
import { RepositorioVinculos } from "./vinculos/repository.ts";
import { InteracoesRone } from "./discord/rone-interactions.ts";
import { RepositorioBoosters } from "./boosters/repository.ts";
import { DiscordBoosters } from "./boosters/discord.ts";
import { InteracoesBoosters } from "./discord/booster-interactions.ts";
import { RepositorioBeneficios } from "./boosters/benefit-repository.ts";
import { AdaptadorBeneficios } from "./boosters/benefit-discord.ts";
import { AtendimentoBooster } from "./boosters/benefit-service.ts";
import { InteracoesAtendimento } from "./discord/booster-ticket-interactions.ts";

const config = carregarConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const pool = criarPool();
const repositorio = new RepositorioVinculos(pool, new ProtecaoTokens());
const interacoesRone = new InteracoesRone(config.guildId, new ClienteRone(), repositorio);
const repositorioBoosters = new RepositorioBoosters(pool);
const discordBoosters = new DiscordBoosters(client, repositorioBoosters);
const atendimento = new AtendimentoBooster(new RepositorioBeneficios(pool), repositorioBoosters,
  new AdaptadorBeneficios(client, (guildId, usuarioId) => discordBoosters.consultarMembro(guildId, usuarioId)));
const interacoesAtendimento = new InteracoesAtendimento(config.guildId, atendimento);
const interacoesBoosters = new InteracoesBoosters(config.guildId, repositorioBoosters, {
  consultarMembro: (guildId, usuarioId) => discordBoosters.consultarMembro(guildId, usuarioId),
  configurar: (entrada, usuarioId) => discordBoosters.configurar(entrada, usuarioId),
  trocarImagem: (guildId, usuarioId, anexo) => discordBoosters.trocarImagem(guildId, usuarioId, anexo),
  abrirAtendimento: (guildId, usuarioId) => atendimento.abrir(guildId, usuarioId),
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Conectado ao Discord como ${readyClient.user.tag}.`);

  if (readyClient.guilds.cache.has(config.guildId)) {
    console.log("Bot presente no servidor de testes. Aguardando comandos e interações.");
  } else {
    console.log("Bot conectado, mas o servidor de testes não foi encontrado. Confira a instalação e DISCORD_GUILD_ID.");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.guildId !== config.guildId) return;

  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "ping") {
      await interaction.reply("Pong! Estou online.");
    } else if (!await interacoesAtendimento.tratar(interaction) && !await interacoesBoosters.tratar(interaction)) {
      await interacoesRone.tratar(interaction);
    }
  } catch (erro) {
    const detalhe = erro instanceof DiscordAPIError
      ? `Código Discord: ${erro.code}`
      : "Erro inesperado";
    console.error(`Falha ao tratar interação (${detalhe}).`);
  }
});

client.on(Events.Error, (erro) => {
  console.error(`Erro no cliente Discord (${erro.name}). Confira a conexão de rede.`);
});

try {
  // O login é assíncrono: aguardamos a operação antes de seguir.
  await client.login(config.token);
} catch (erro) {
  const nomeErro = erro instanceof Error ? erro.name : "Erro desconhecido";
  console.error(`Não foi possível conectar ao Discord (${nomeErro}). Confira o token local e a conexão de rede.`);
  client.destroy();
  await pool.end();
  process.exitCode = 1;
}

let encerrando = false;
async function encerrar(): Promise<void> {
  if (encerrando) return;
  encerrando = true;
  client.destroy();
  await pool.end();
}
process.on("SIGINT", () => { void encerrar(); });
process.on("SIGTERM", () => { void encerrar(); });
