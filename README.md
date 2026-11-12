# Vimessias Play

Página informativa gratuita para consultar filmes, séries e animes. A busca usa a API do TMDB e pode mostrar pôster, sinopse, ano e duração disponíveis na base. O login Twitch identifica os usuários e habilita favoritos, avaliações elegíveis e jogos; não há pagamentos, pedidos ou dados financeiros no site.

## Rodar localmente

Requer Node.js 20 ou superior.

```sh
npm start
```

O painel inicial do **VIMESSIAS OVERLAY** fica em `http://localhost:3000/overlay`. A Fase 1 usa o login Twitch já configurado no site, permite salvar uma fonte HTTPS autorizada MP4/WebM ou um link compartilhável do Google Drive e gerar/revogar códigos exclusivos. Links do Drive são convertidos para `drive.google.com/uc?export=download&id=...`; o arquivo precisa permitir acesso a qualquer pessoa com o link e o domínio precisa ser liberado na lista de mídia da Twitch. O Drive pode bloquear reprodução direta por confirmação, tráfego ou configuração do arquivo. No Supabase, esse recurso usa uma nova chave JSONB em `app_state` (`overlayCodes`), sem migração ou remoção de dados; no modo local, o arquivo `overlay-codes.json` é ignorado pelo Git. A extensão Twitch é configurada separadamente no console; Kick, HLS, sincronização, contagem ao vivo e sessões compartilhadas ainda não estão implementados.

Copie `.env.example` para `.env` e informe seu `TMDB_API_READ_ACCESS_TOKEN` (API Read Access Token do TMDB). Depois, abra `http://localhost:3000`. A chave fica apenas no servidor e não é enviada ao navegador. A API de consulta está disponível em `/api/catalog/search-tmdb?q=...&page=...&offset=...` para paginar os resultados; `/api/catalog/title?type=movie|tv&id=...` carrega os detalhes e os trailers disponíveis do título para o catálogo; `/api/catalog/suggestions?period=day|week` traz filmes e séries em alta hoje ou nesta semana; `/api/catalog/calendar?month=AAAA-MM` lista estreias de cinema no Brasil para o mês informado; `/api/catalog/genres?type=movie|tv` fornece os gêneros usados no sorteador; `/api/catalog/random?type=movie|tv&genre=...` sorteia um filme ou uma série pelo gênero; `/api/catalog/favorites` lê e atualiza o ranking global de corações; `/api/catalog/rating` salva e consulta notas de 0,5 a 5, aceitas somente para títulos com react associado ao Patreon; `/api/catalog/ratings` fornece o ranking da comunidade; `/api/health` informa se o servidor está ativo.

## Conta Twitch, cargos e permissões

Para ativar o botão de login, crie um aplicativo no [Twitch Developer Console](https://dev.twitch.tv/console/apps) e cadastre como OAuth Redirect URL o endereço exato `http://localhost:3000/auth/twitch/callback` (ou a URL e porta usadas no seu ambiente). Copie as credenciais do aplicativo para o `.env`:

```env
TWITCH_CLIENT_ID=seu_client_id
TWITCH_CLIENT_SECRET=seu_client_secret
TWITCH_REDIRECT_URI=http://localhost:3000/auth/twitch/callback
TWITCH_ADMIN_LOGIN=vimessias_
TWITCH_ADMIN_USER_ID=
```

Reinicie o servidor depois de salvar. O site usa o fluxo OAuth de código de autorização no servidor; o segredo e os tokens não são enviados ao navegador. A sessão fica na memória do processo por até sete dias e é encerrada quando o servidor reinicia. O servidor valida o token da Twitch periodicamente e atualiza a sessão quando necessário.

O cargo **admin** é atribuído à conta **vimessias_** por padrão. O servidor também reconhece o ID definido em **TWITCH_ADMIN_USER_ID**; assim, o ID continua sendo uma opção estável, e o login configurado em **TWITCH_ADMIN_LOGIN** permanece válido. As demais contas autenticadas recebem o cargo **user**. Favoritos e avaliações usam o ID verificado da Twitch, e o servidor exige uma sessão válida para gravar essas ações. Usuários precisam entrar para jogar. Visitantes continuam podendo consultar o catálogo e ver os rankings públicos. A lista pessoal está em **/api/account/favorites**.

Ao solicitar um resgate no detalhe de um título ou pela estimativa manual, a pessoa precisa escolher data futura e horário. O servidor cria uma solicitação pendente, vinculada à conta Twitch; depois de registrar, o navegador segue para o LivePix. O painel administrativo só é exibido para a conta administradora e permite alterar datas, aprovar, rejeitar ou excluir solicitações canceladas. Somente aprovados são publicados em **Últimos resgates** e no calendário de reacts; o usuário vê o estado em **Filmes que resgatei**. O LivePix ainda não envia confirmação ao servidor, então confirme o pagamento no LivePix antes de aprovar.

Para produção, cadastre a URL HTTPS pública exata como redirect e use HTTPS. As rotas são **/auth/twitch/start**, **/auth/twitch/callback**, **/api/auth/me** e **/api/auth/logout**.

## Hospedagem

O projeto precisa de um serviço Node.js (não é somente um site estático). No Render, conecte um repositório GitHub privado, escolha um Web Service, use `npm install` como build command, `npm start` como start command e `/api/health` como health check. O servidor escuta a porta `PORT` fornecida pela hospedagem.

## Persistência no Supabase

O servidor pode usar o Supabase para manter favoritos, avaliações, solicitações de resgate, promoções, Vicoins, fórum, membros, cache do YouTube e imagens/anexos entre reinicializações e deploys. O estado dos recursos é salvo em `public.app_state` como JSONB versionado; as imagens ficam nos buckets privados `forum-uploads` e `profile-banners`. O servidor faz as leituras e gravações usando a chave secreta, sem expô-la ao navegador.

1. Crie um projeto Supabase e abra o **SQL Editor**.
2. Execute o conteúdo de `supabase/migrations/202611090001_persistent_site_data.sql`.
3. Copie o **Project URL** e a chave secreta do servidor (**Secret key**, `sb_secret_…`; em projetos antigos, `service_role`) para o `.env` local ou para as variáveis protegidas do serviço de hospedagem. Nunca coloque essa chave em JavaScript do navegador nem a envie ao GitHub.
4. Defina `DATA_STORE=supabase`, `SUPABASE_URL` e `SUPABASE_SECRET_KEY`. O servidor também aceita `SUPABASE_SERVICE_ROLE_KEY` como nome legado. Em produção, ele encerra a inicialização se o Supabase não estiver configurado, para não continuar gravando silenciosamente em disco temporário.
5. Reinicie o servidor e confirme em `/api/health` que a resposta contém `"persistence":"supabase"` e `"persistent":true`.

O modo local continua disponível para desenvolvimento sem credenciais (`DATA_STORE=local`). Como o projeto está sendo iniciado sem conteúdo para preservar, os registros começam vazios; promoções padrão aparecem quando o estado inicial de promoções é criado. Imagens enviadas depois da configuração são armazenadas no Supabase Storage.

Antes de publicar, configure também as credenciais do TMDB e da Twitch no painel do serviço. O redirect da Twitch deve usar a URL HTTPS pública exata, por exemplo **https://seu-site.onrender.com/auth/twitch/callback**.

Não envie o arquivo **.env** nem a chave de serviço ao GitHub. Os arquivos JSON locais são ignorados pelo Git; no modo Supabase, o servidor passa a usar o banco e os buckets configurados na migração SQL.

Ao buscar um título, o servidor também consulta o mapa público de posts do Patreon Vimessias, em cache por cerca de dois minutos. Quando o título original ou localizado do TMDB coincide com um post, a interface troca a estimativa por um link direto ao react. A correspondência é por título exato normalizado para evitar links para reacts errados.

Para corrigir uma correspondência ou adicionar uma associação manual, edite `patreon-links.json`. Cada item aceita `title`, `url` e `aliases`; o título ou um alias precisa corresponder ao título localizado ou original do TMDB. Exemplo:

```json
[
  {
    "title": "Em Ritmo de Fuga",
    "aliases": ["Baby Driver"],
    "url": "https://www.patreon.com/vimessias/posts/filme-baby-174481868"
  }
]
```

Salve o arquivo e pesquise o título novamente. As associações manuais têm prioridade sobre o mapa público do Patreon.

## Fonte e limitações

O TMDB disponibiliza sua API gratuitamente para usos não comerciais, com atribuição. O TMDB exige que o aplicativo use seu logo aprovado e mostre o aviso “This product uses the TMDB API but is not endorsed or certified by TMDB.” O projeto exibe o logo e o aviso no rodapé. O TMDB informa que um projeto cujo objetivo principal seja gerar receita é comercial; nesse caso é necessário procurar o TMDB sobre uma licença comercial. A busca depende de uma chave de leitura pessoal e da disponibilidade dos registros. Para séries, a duração total é uma estimativa baseada na duração média de episódio multiplicada pelo número de episódios.

- [Documentação oficial da API do TMDB](https://developer.themoviedb.org/docs/getting-started)
- [Autenticação do TMDB](https://developer.themoviedb.org/docs/authentication-application)
- [Atribuição e licença de uso](https://developer.themoviedb.org/docs/faq)

## Estrutura

- `index.html`, `styles.css`, `home-only.css`, `calculator.css`: página e apresentação visual.
- `calculator.js`: busca e exibição dos dados encontrados.
- `suggestions.js`, `suggestions.css`: faixa de tendências e cards de recomendação na página inicial.
- `randomizer.js`, `randomizer.css`: página Sorteador na navegação lateral.
- `calendar.js`, `calendar.css`: calendário mensal de estreias de cinema no Brasil, com dados do TMDB.
- `emoji-game.js`, `games.css`: página Jogos e o desafio Adivinhe por emoji.
- `promotions.js`, `promotions.css`: página Promoções, com coleções e cálculo do desconto sobre as estimativas dos títulos.
- `youtube-latest.js`, `youtube-latest.css`: lista lateral dos últimos vídeos públicos do canal ViMessiasReacts.
- **favorites.js**, **favorites.css**: favoritos e página Sugestões ordenada pelos votos; votos autenticados são associados ao ID verificado da Twitch.
- `favorites.json`: arquivo local criado pelo servidor para persistir os votos compartilhados; para hospedagem com múltiplas instâncias, substituir por armazenamento compartilhado durável.
- `ratings.js`, `ratings.css`: avaliação por meia estrela nos detalhes de reacts e ranking lateral.
- `ratings.json`: arquivo local de notas comunitárias, aceitas pelo servidor somente para títulos vinculados ao Patreon.
- **twitch-auth.js**, **twitch-auth.css**, **user-profile.js**, **user-profile.css**: login Twitch, cargos admin/user, perfil fixo, favoritos da conta e acesso aos jogos.
- **admin-redemptions.js**, **redemption-flow.css**, **redemptions.json**: fila privada de pedidos, ações administrativas e publicação de resgates aprovados.
- `server.mjs`: servidor estático, proxy de consulta ao TMDB, feed público do YouTube e correspondência com posts públicos do Patreon, com cache em memória.
- `patreon-links.json`: associações manuais de título ou apelido a post do Patreon.

O servidor não expõe rotas de checkout, PIX, webhook ou fila de OBS.
