import { test } from "node:test";
import assert from "node:assert/strict";
import { ErroTentativa, TentativasVinculo } from "./pending.ts";

const usuario = "100000000000000001";
const outro = "100000000000000002";
const conta = { jogadorId: "123", servidorId: "456" };

test("tentativa pertence ao usuário e servidor e só pode ser consumida uma vez", () => {
  const tentativas = new TentativasVinculo();
  const id = tentativas.iniciar(usuario, "guild", conta);
  assert.throws(() => tentativas.consultar(id, usuario, "guild"), ErroTentativa);
  tentativas.confirmarEnvio(id);
  assert.throws(() => tentativas.consultar(id, outro, "guild"), ErroTentativa);
  assert.throws(() => tentativas.consumir(id, usuario, "outro-servidor"), ErroTentativa);
  assert.deepEqual(tentativas.consumir(id, usuario, "guild"), conta);
  assert.throws(() => tentativas.consumir(id, usuario, "guild"), ErroTentativa);
  assert.throws(() => tentativas.cancelar(usuario), ErroTentativa);
  tentativas.finalizar(id);
  assert.throws(() => tentativas.consultar(id, usuario, "guild"), ErroTentativa);
});

test("expira em cinco minutos e libera usuário e conta", () => {
  let agora = 0;
  const tentativas = new TentativasVinculo(() => agora);
  const id = tentativas.iniciar(usuario, "guild", conta);
  tentativas.confirmarEnvio(id);
  agora = 299_999;
  assert.deepEqual(tentativas.consultar(id, usuario, "guild"), conta);
  agora = 300_000;
  assert.throws(() => tentativas.consumir(id, usuario, "guild"), ErroTentativa);
  assert.ok(tentativas.iniciar(usuario, "guild", conta));
});

test("mesmo Discord ou mesma conta não geram tentativas paralelas", () => {
  const tentativas = new TentativasVinculo();
  const id = tentativas.iniciar(usuario, "guild", conta);
  assert.throws(() => tentativas.iniciar(usuario, "guild", { ...conta, jogadorId: "999" }), ErroTentativa);
  assert.throws(() => tentativas.iniciar(outro, "guild", conta), ErroTentativa);
  assert.equal(tentativas.cancelar(outro), false);
  assert.equal(tentativas.cancelar(usuario), true);
  assert.ok(tentativas.iniciar(outro, "guild", conta));
  tentativas.finalizar(id);
});

test("login em processamento não é liberado por expiração ou cliques repetidos", () => {
  let agora = 0;
  const tentativas = new TentativasVinculo(() => agora);
  const id = tentativas.iniciar(usuario, "guild", conta);
  tentativas.confirmarEnvio(id);
  tentativas.consumir(id, usuario, "guild");
  agora = 400_000;
  assert.throws(() => tentativas.iniciar(outro, "guild", conta), ErroTentativa);
  assert.throws(() => tentativas.iniciar(usuario, "guild", conta), ErroTentativa);
  tentativas.finalizar(id);
  assert.ok(tentativas.iniciar(outro, "guild", conta));
});
