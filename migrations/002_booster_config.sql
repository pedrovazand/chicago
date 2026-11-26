CREATE TABLE IF NOT EXISTS booster_config (
    servidor_id TEXT PRIMARY KEY,
    canal_painel_id TEXT NOT NULL,
    categoria_id TEXT NOT NULL,
    equipe_id TEXT NOT NULL,
    referencia_id TEXT NOT NULL,
    mensagem_painel_id TEXT,
    painel_pendente BOOLEAN NOT NULL DEFAULT FALSE,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (servidor_id ~ '^[1-9][0-9]{0,19}$'),
    CHECK (canal_painel_id ~ '^[1-9][0-9]{0,19}$'),
    CHECK (categoria_id ~ '^[1-9][0-9]{0,19}$'),
    CHECK (equipe_id ~ '^[1-9][0-9]{0,19}$'),
    CHECK (referencia_id ~ '^[1-9][0-9]{0,19}$'),
    CHECK (mensagem_painel_id IS NULL OR mensagem_painel_id ~ '^[1-9][0-9]{0,19}$'),
    CHECK (NOT painel_pendente OR mensagem_painel_id IS NULL)
);
