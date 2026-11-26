import { test } from "node:test";
import assert from "node:assert/strict";
import { validarIcone } from "./preferences.ts";

// PNG 1×1: arquivo real minúsculo, sem necessidade de 64×64.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=", "base64");

test("ícone PNG é aceito sem resolução obrigatória de 64×64", () => {
  assert.equal(png.readUInt32BE(16), 1);
  assert.equal(png.readUInt32BE(20), 1);
  assert.equal(validarIcone(png), png);
});

test("limite de tamanho e validação de conteúdo continuam aplicados", () => {
  const grande = Buffer.alloc(256 * 1024 + 1);
  png.copy(grande);
  assert.throws(() => validarIcone(grande), /256 KiB/);
  assert.throws(() => validarIcone(Buffer.from("imagem.png")), /Formato de imagem inválido/);
});
