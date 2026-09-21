# Ranking Promo Moto

Aplicação estática para consulta do ranking e administração de importações Excel.

## Rotas

- `/`: ranking público com busca por nome.
- `/admin/`: importação de planilhas Excel e lista de IDs Elite.

## Configuração do Supabase

1. No SQL Editor do Supabase, execute `supabase/schema.sql` e depois os arquivos de `supabase/migrations/` em ordem.
2. Em um banco que já possui dados, execute `002_ranking_cache_and_elite_snapshot.sql` **antes** de apagar a lista Elite atual. A migração preserva o multiplicador histórico e cria o cache e os índices do ranking.
3. Depois, execute `003_origin_scoring.sql`. Essa migração recupera a coluna `origem` das importações existentes, aplica peso 2 aos pedidos de origem e atualiza o cache.
4. Para desenvolvimento local, copie `site/config.example.js` para `site/config.js` e preencha a URL e a chave `anon public`.
5. A aplicação já está ligada ao projeto informado. Caso a chave seja substituída no futuro, defina `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no ambiente da hospedagem para sobrescrever a configuração.

## Vercel

O `vercel.json` define `dist` como diretório de saída. Basta fazer novo deploy após o push.

O modelo de planilha precisa conter `id_da_pessoa_entregadora`, `pessoa_entregadora`, `sub_praca`, `origem` e `numero_de_pedidos_aceitos_e_concluidos`. As demais colunas do modelo são preservadas no campo `payload`.

## Pontuação

- Pedido normal (`sub_praca` preenchida): 1 ponto.
- Pedido em origem (`origem` preenchida): 2 pontos.
- Entregador Elite: multiplica os pontos por 1,5. Portanto, um pedido Elite em origem vale 3 pontos.

> A política incluída no SQL deixa o `/admin/` operacional sem autenticação, conforme o escopo inicial. Antes de expor a área administrativa publicamente, proteja as políticas RLS com autenticação.
