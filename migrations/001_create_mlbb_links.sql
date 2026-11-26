CREATE TABLE IF NOT EXISTS mlbb_links (
    discord_id TEXT CONSTRAINT mlbb_links_pkey PRIMARY KEY,
    role_id TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    jwt_cifrado TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mlbb_links_game_account_key UNIQUE (role_id, zone_id),
    CONSTRAINT mlbb_links_discord_id_check CHECK (discord_id ~ '^[1-9][0-9]{0,19}$'),
    CONSTRAINT mlbb_links_role_id_check CHECK (role_id ~ '^[1-9][0-9]*$'),
    CONSTRAINT mlbb_links_zone_id_check CHECK (zone_id ~ '^[1-9][0-9]*$'),
    CONSTRAINT mlbb_links_jwt_check CHECK (jwt_cifrado LIKE 'v1.%')
);
