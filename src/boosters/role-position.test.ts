import { test } from "node:test";
import assert from "node:assert/strict";
import { PermissionsBitField, PermissionFlagsBits as P } from "discord.js";
import type { Role } from "discord.js";
import { posicaoAbaixoDaReferencia, validarReferenciaCargo } from "./role-position.ts";

const role = (id: string, position: number, permissions = 0n) => ({ id, position, permissions: new PermissionsBitField(permissions),
  comparePositionTo(outro: { position: number }) { return this.position - outro.position; } }) as Role;

test("posição fica imediatamente abaixo da referência ao subir, descer ou reaplicar", () => {
  const referencia = role("5", 5);
  assert.equal(posicaoAbaixoDaReferencia(role("10", 1), referencia), 4);
  assert.equal(posicaoAbaixoDaReferencia(role("10", 4), referencia), 4);
  assert.equal(posicaoAbaixoDaReferencia(role("10", 8), referencia), 5);
  assert.throws(() => posicaoAbaixoDaReferencia(referencia, referencia));
});

test("Equipe pode ser a referência mesmo tendo permissões de moderação", () => {
  const bot = role("9", 10, P.ManageRoles), equipe = role("5", 8, P.ModerateMembers);
  assert.doesNotThrow(() => validarReferenciaCargo("1", bot, equipe, equipe));
});

test("referência não ultrapassa o bot nem Equipe", () => {
  const bot = role("9", 10), equipe = role("5", 8);
  assert.throws(() => validarReferenciaCargo("1", bot, equipe, role("7", 11)));
  assert.throws(() => validarReferenciaCargo("1", bot, equipe, role("7", 9)));
  assert.throws(() => validarReferenciaCargo("1", role("9", 7), equipe, equipe));
  assert.throws(() => validarReferenciaCargo("1", bot, equipe, role("1", 0)));
  assert.doesNotThrow(() => validarReferenciaCargo("1", bot, equipe, role("7", 5)));
});
