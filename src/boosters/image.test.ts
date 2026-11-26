import { test } from "node:test";
import assert from "node:assert/strict";
import { baixarImagemPainel, lerImagemPainel, limiteImagemPainel, validarImagemPainel } from "./image.ts";
import { conteudoPainel } from "../discord/booster-panel.ts";

const url = "https://cdn.discordapp.com/attachments/1/2/imagem.png?ex=ficticio";

test("arte padrão é anexada dentro do embed e edição substitui anexos anteriores", async () => {
  const imagem = await lerImagemPainel();
  assert.equal(imagem.tipo, "image/png");
  const mensagem = conteudoPainel("1", imagem);
  assert.equal(mensagem.embeds[0].toJSON().image?.url, `attachment://${imagem.nome}`);
  assert.equal(mensagem.files.length, 1);
  assert.deepEqual(mensagem.attachments, []);
  assert.equal(mensagem.components[0].components.length, 3);
});

test("imagem do comando é baixada do CDN, validada e preservada como bytes", async () => {
  const { dados } = await lerImagemPainel();
  let chamadas = 0;
  const requisitar: typeof fetch = async (_url, opcoes) => {
    chamadas++;
    assert.equal(opcoes?.redirect, "error");
    assert.ok(opcoes?.signal);
    return new Response(new Uint8Array(dados));
  };
  assert.deepEqual(await baixarImagemPainel({ url, size: dados.length, contentType: "image/png" }, requisitar), dados);
  assert.equal(chamadas, 1);
});

test("arquivo vazio, disfarçado ou grande demais é recusado", async () => {
  for (const dados of [Buffer.alloc(0), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), Buffer.from("texto.png"), Buffer.alloc(limiteImagemPainel + 1)]) {
    assert.throws(() => validarImagemPainel(dados));
  }
  let chamadas = 0;
  const requisitar: typeof fetch = async () => { chamadas++; throw new Error("Não deve chamar"); };
  await assert.rejects(baixarImagemPainel({ url, size: limiteImagemPainel + 1, contentType: "image/png" }, requisitar));
  await assert.rejects(baixarImagemPainel({ url: "https://example.com/attachments/1/2/x.png", size: 50, contentType: "image/png" }, requisitar));
  assert.equal(chamadas, 0);
});

test("limite também é imposto ao corpo baixado, independentemente do tamanho declarado", async () => {
  const requisitar: typeof fetch = async () => new Response(new Uint8Array(limiteImagemPainel + 1));
  await assert.rejects(baixarImagemPainel({ url, size: 100, contentType: "image/png" }, requisitar), /excede 5 MiB/);
});

test("MIME divergente e download com erro não viram imagem válida", async () => {
  const { dados } = await lerImagemPainel();
  await assert.rejects(baixarImagemPainel({ url, size: dados.length, contentType: "image/jpeg" }, async () => new Response(new Uint8Array(dados))), /não corresponde/);
  await assert.rejects(baixarImagemPainel({ url, size: 100, contentType: "image/png" }, async () => new Response(null, { status: 404 })), /Anexe o arquivo novamente/);
  await assert.rejects(baixarImagemPainel({ url, size: 100, contentType: "image/png" }, async () => { throw new Error("Detalhes internos"); }), /download da imagem falhou/);
});
