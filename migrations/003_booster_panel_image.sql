ALTER TABLE booster_config ADD COLUMN imagem_painel BYTEA;
ALTER TABLE booster_config ADD CONSTRAINT booster_panel_image_size
    CHECK (imagem_painel IS NULL OR octet_length(imagem_painel) BETWEEN 1 AND 5242880);
