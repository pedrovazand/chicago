import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { randomBytes } from "node:crypto";
import { ProtecaoTokens } from "./tokens.ts";
import { ErroVinculo } from "./types.ts";

const identidade = { discordId: "100000000000000001", jogadorId: "123", servidorId: "456" };
const jwt = "credencial-ficticia-sem-acesso-a-conta";

test("AES-GCM recupera a credencial e gera IV diferente em cada escrita", () => {
  const chave = randomBytes(32).toString("hex");
  const protecao = new ProtecaoTokens(chave);
  const primeiro = protecao.cifrar(jwt, identidade);
  const segundo = protecao.cifrar(jwt, identidade);
  assert.notEqual(primeiro, segundo);
  assert.ok(!primeiro.includes(jwt));
  assert.equal(protecao.decifrar(primeiro, identidade), jwt);
  assert.ok(!inspect(protecao).includes(chave));
});

test("alteração de ciphertext, tag, IV, chave ou identidade impede decifragem", () => {
  const protecao = new ProtecaoTokens(randomBytes(32).toString("hex"));
  const cifrado = protecao.cifrar(jwt, identidade);
  const rejeitado = (erro: unknown) => erro instanceof ErroVinculo && erro.codigo === "credencial_invalida";
  for (const indice of [1, 2, 3]) {
    const partes = cifrado.split(".");
    const bytes = Buffer.from(partes[indice], "base64url");
    bytes[0] ^= 1;
    partes[indice] = bytes.toString("base64url");
    assert.throws(() => protecao.decifrar(partes.join("."), identidade), rejeitado);
  }
  const outraChave = new ProtecaoTokens(randomBytes(32).toString("hex"));
  assert.throws(() => outraChave.decifrar(cifrado, identidade), rejeitado);
  for (const alteracao of [{ discordId: "100000000000000002" }, { jogadorId: "999" }, { servidorId: "999" }]) {
    assert.throws(() => protecao.decifrar(cifrado, { ...identidade, ...alteracao }), rejeitado);
  }
});

test("formatos inválidos falham com erro seguro", () => {
  const protecao = new ProtecaoTokens(randomBytes(32).toString("hex"));
  for (const valor of ["", "texto", "v2.a.b.c", "v1.a.b.c", "v1.!.!.!"]) {
    assert.throws(() => protecao.decifrar(valor, identidade), (erro: unknown) => {
      assert.ok(erro instanceof ErroVinculo);
      assert.equal(erro.codigo, "credencial_invalida");
      assert.equal(erro.cause, undefined);
      return true;
    });
  }
  assert.throws(() => protecao.cifrar("", identidade));
  for (const chave of ["", "a".repeat(63), "z".repeat(64)]) {
    assert.throws(() => new ProtecaoTokens(chave), (erro: unknown) => erro instanceof ErroVinculo && erro.codigo === "configuracao");
  }
});
