# ViMessias Play · Twitch Video Overlay

MVP de extensão para sobrepor um vídeo próprio/autorizado à área da captura da live, preservando a câmera que já aparece no vídeo transmitido. O overlay é renderizado no player de cada espectador; ele não altera o sinal do OBS, as gravações/VODs ou a live para quem não ativar a extensão.

## Arquivos para o Twitch Developer Console

- **Extension type:** Video Overlay
- **Video Overlay Viewer Path:** `overlay.html`
- **Config Path:** `config.html`
- **Local Test:** sirva os arquivos por HTTPS ou use o Twitch Extension RIG para desenvolvimento local.
- Faça o upload do conteúdo desta pasta como os assets da extensão. Não inclua a pasta externa dentro do ZIP.

## Configuração de mídia

O canal define título, URL HTTPS direta de `.mp4`/`.webm` ou link compartilhável do Google Drive e a posição/tamanho em porcentagem do player. Links do Drive são convertidos para `drive.google.com/uc?export=download&id=...`. O arquivo deve estar público para leitura; em **Capabilities → Media Domain Allowlist**, autorize `drive.google.com`. O valor inicial (0%, 12%, 77%, 77%) é apenas uma aproximação baseada na imagem enviada; ajuste conforme o player. Twitch Extensions usam uma política de segurança que bloqueia mídia de domínios não autorizados.

O vídeo espera um clique de cada espectador para iniciar, por causa das regras de reprodução automática do navegador. O som é individual do player da extensão. Se a captura original também tiver o áudio do mesmo vídeo, silencie essa fonte no OBS para evitar áudio duplicado.

Use apenas mídia que você possui ou tem autorização para exibir. Uma extensão não substitui a fonte no OBS, não remove a imagem original para espectadores sem a extensão e não torna permitido retransmitir material protegido.

## Limitações do MVP

- Sem backend, votação ou estado compartilhado entre espectadores; a configuração é armazenada no segmento do broadcaster da Twitch (limite de configuração da plataforma).
- Drive funciona apenas se o link público entregar o conteúdo de vídeo sem tela intermediária; confirmação de download, limite de tráfego e bloqueios do Google podem impedir a reprodução. HLS, embeds de serviços de streaming e autenticação de provedores não estão implementados.
- A extensão ainda precisa ser criada, configurada e revisada no console Twitch. O projeto não foi publicado nem conectado a credenciais.
