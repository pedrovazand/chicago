// Diagnóstico público: nenhum token, código de verificação ou conta de jogador.
const base = (process.env.RONE_API_BASE_URL ?? "https://arena.fastapicloud.dev/api").replace(/\/$/, "");

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

async function consultar(caminho: string) {
  const resposta = await fetch(`${base}${caminho}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "ChicagoDiscordBot/0.1 (+https://github.com/pedrovazand/chicago; public connectivity check)",
    },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!resposta.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`HTTP ${resposta.status}: resposta não JSON; pode ser bloqueio do provedor.`);
  }
  const dados: unknown = await resposta.json();
  return { status: resposta.status, dados };
}

try {
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api") {
    throw new Error("RONE_API_BASE_URL deve ser uma URL HTTPS terminada em /api, sem credenciais ou parâmetros.");
  }
  const schema = await consultar("/openapi.json");
  if (schema.status !== 200 || !objeto(schema.dados) || !objeto(schema.dados.paths)) {
    throw new Error("OpenAPI indisponível ou com formato inesperado.");
  }
  for (const [caminho, metodo] of [
    ["/api/user/auth/send-vc", "post"],
    ["/api/user/auth/login", "post"],
    ["/api/user/auth/logout", "post"],
    ["/api/user/info", "get"],
  ] as const) {
    const rota = schema.dados.paths[caminho];
    const operacao = objeto(rota) ? rota[metodo] : undefined;
    if (!objeto(operacao)) throw new Error(`Contrato ausente: ${metodo.toUpperCase()} ${caminho}.`);
    if (operacao.deprecated === true) throw new Error(`Contrato descontinuado: ${caminho}.`);
    console.log(`Contrato presente, sem marca de descontinuação: ${metodo.toUpperCase()} ${caminho}`);
  }
  const heroi = await consultar("/heroes/Miya?lang=pt&size=1");
  if (heroi.status !== 200 || !objeto(heroi.dados) || heroi.dados.code !== 0 || !objeto(heroi.dados.data)) {
    throw new Error(`Consulta pública de herói falhou (HTTP ${heroi.status}).`);
  }
  const registros = heroi.dados.data.records;
  const registro = Array.isArray(registros) ? registros[0] : undefined;
  const dadosRegistro = objeto(registro) ? registro.data : undefined;
  const hero = objeto(dadosRegistro) ? dadosRegistro.hero : undefined;
  const ficha = objeto(hero) ? hero.data : undefined;
  if (!objeto(ficha) || typeof ficha.name !== "string" || !ficha.name.trim()) {
    throw new Error("Herói vazio ou com formato inesperado.");
  }
  console.log("Consulta pública de herói: HTTP 200, code 0, nome preenchido.");
  const perfil = await consultar("/user/info");
  if (perfil.status !== 401 || !objeto(perfil.dados) || perfil.dados.code !== "UNAUTHORIZED") {
    throw new Error(`Rejeição de perfil sem autenticação diferente da esperada (HTTP ${perfil.status}).`);
  }
  console.log("Perfil sem credencial: HTTP 401 UNAUTHORIZED, como esperado.");
  console.log("Diagnóstico público concluído. Envio de código, login, perfil autenticado e logout NÃO foram testados.");
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : "Falha no diagnóstico público.");
  process.exitCode = 1;
}
