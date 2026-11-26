export type ConsultarMembro = (servidorId: string, usuarioId: string) => Promise<{ premiumSinceTimestamp: number | null }>;

// A configuração do cargo não precisa conhecer como a elegibilidade é obtida.
// Erros de rede são propagados: não equivalem a perder o benefício.
export async function verificarElegibilidade(consultar: ConsultarMembro, servidorId: string, usuarioId: string): Promise<boolean> {
  const membro = await consultar(servidorId, usuarioId);
  return membro.premiumSinceTimestamp !== null;
}
