import { test } from "node:test";
import assert from "node:assert/strict";
import { DiscordAPIError } from "discord.js";
import { diagnosticoBooster } from "./diagnostics.ts";

test("diagnóstico usa apenas metadados conhecidos, sem mensagens, URLs ou corpos", () => {
  const erro = new DiscordAPIError({ message: "SEGREDO_NO_CORPO", code: 10003 }, 10003, 404, "GET", "https://example.com/SEGREDO_URL", { body: "SEGREDO_REQUISICAO", files: undefined });
  assert.equal(diagnosticoBooster(erro), "Discord HTTP 404, código 10003");
  assert.equal(diagnosticoBooster({ code: "ECONNREFUSED", message: "SEGREDO" }), "Conexão indisponível (ECONNREFUSED)");
  assert.equal(diagnosticoBooster({ code: "42P01", query: "SEGREDO" }), "Tabela PostgreSQL ausente; execute npm run db:migrate");
  assert.equal(diagnosticoBooster({ code: "SEGREDO", message: "SEGREDO" }), "Erro não classificado");
  assert.equal(diagnosticoBooster(new TypeError("SEGREDO")), "TypeError interno");
});
