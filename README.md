# Ranking Promo Moto

Aplicação estática para consulta do ranking e administração de importações Excel.

## Rotas

- `/`: ranking público com busca por nome.
- `/admin/`: importação de planilhas Excel e lista de IDs Elite.

## Configuração do Supabase

1. No SQL Editor do Supabase, execute `supabase/schema.sql`.
2. Para desenvolvimento local, copie `site/config.example.js` para `site/config.js` e preencha a URL e a chave `anon public`.
3. Para publicar, informe `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` ao comando de build. Elas geram `dist/config.js`, que não é versionado.

O modelo de planilha precisa conter `id_da_pessoa_entregadora`, `pessoa_entregadora` e `numero_de_pedidos_aceitos_e_concluidos`. As demais colunas do modelo são preservadas no campo `payload`.

> A política incluída no SQL deixa o `/admin/` operacional sem autenticação, conforme o escopo inicial. Antes de expor a área administrativa publicamente, proteja as políticas RLS com autenticação.
