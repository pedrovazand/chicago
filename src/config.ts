function lerVariavelObrigatoria(nome: string): string {
  const valor = process.env[nome]?.trim();

  if (!valor) {
    throw new Error(`Defina ${nome} no arquivo .env ou no ambiente.`);
  }

  return valor;
}

export function carregarConfig() {
  return {
    token: lerVariavelObrigatoria("DISCORD_TOKEN"),
    applicationId: lerVariavelObrigatoria("DISCORD_APPLICATION_ID"),
    guildId: lerVariavelObrigatoria("DISCORD_GUILD_ID"),
  };
}
