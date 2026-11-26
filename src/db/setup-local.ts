import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";

try {
  let conteudo: string;
  try { conteudo = await readFile(".env", "utf8"); } catch (erro) {
    if (!(erro instanceof Error) || !("code" in erro) || erro.code !== "ENOENT") throw erro;
    conteudo = "";
  }
  function definirSeAusente(nome: string, valor: string): string {
    if (process.env[nome]?.trim()) return process.env[nome]!;
    const padrao = new RegExp(`^${nome}=.*$`, "m");
    conteudo = padrao.test(conteudo) ? conteudo.replace(padrao, `${nome}=${valor}`) : `${conteudo.trimEnd()}\n${nome}=${valor}\n`;
    return valor;
  }
  const senha = definirSeAusente("POSTGRES_PASSWORD", randomBytes(24).toString("hex"));
  const porta = definirSeAusente("POSTGRES_PORT", "5432");
  const conexao = `postgresql://chicago:${encodeURIComponent(senha)}@127.0.0.1:${porta}`;
  definirSeAusente("DATABASE_URL", `${conexao}/chicago`);
  definirSeAusente("TEST_DATABASE_URL", `${conexao}/chicago_test`);
  definirSeAusente("RONE_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  await writeFile(".env", conteudo, { mode: 0o600 });
  await chmod(".env", 0o600);
  console.log("Configuração local preparada. Valores existentes preservados; nenhum segredo foi exibido.");
} catch {
  console.error("Não foi possível preparar a configuração local. Confira o acesso ao arquivo de ambiente.");
  process.exitCode = 1;
}
