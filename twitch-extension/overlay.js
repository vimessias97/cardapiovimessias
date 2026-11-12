(() => {
  const root = document.getElementById('content');
  const media = document.getElementById('media');
  const placeholder = document.getElementById('placeholder');
  const title = document.getElementById('videoTitle');
  const message = document.getElementById('message');
  const playButton = document.getElementById('play');
  const soundButton = document.getElementById('sound');
  let loadedSource = '';

  function safeConfig(raw) {
    try {
      const data = JSON.parse(raw || '{}');
      const source = new URL(String(data.source || ''));
      if (source.protocol !== 'https:' || !/\.(mp4|webm)$/i.test(source.pathname)) return null;
      const bounded = (value,min,max,fallback) => Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback;
      return {
        source:source.href,
        title:String(data.title || 'Conteúdo da live').slice(0,90),
        left:bounded(data.left,0,100,0),top:bounded(data.top,0,100,12),
        width:bounded(data.width,10,100,77),height:bounded(data.height,10,100,77)
      };
    } catch { return null; }
  }

  function applyConfig(raw) {
    const config = safeConfig(raw);
    if (!config) {
      root.classList.remove('is-configured','is-playing');
      media.pause();
      media.removeAttribute('src');
      media.load();
      loadedSource = '';
      title.textContent = 'Overlay ViMessias Play';
      message.textContent = 'O criador ainda não configurou um vídeo autorizado.';
      playButton.hidden = true;
      soundButton.hidden = true;
      return;
    }
    root.style.setProperty('--screen-left',`${config.left}%`);
    root.style.setProperty('--screen-top',`${config.top}%`);
    root.style.setProperty('--screen-width',`${config.width}%`);
    root.style.setProperty('--screen-height',`${config.height}%`);
    root.classList.add('is-configured');
    title.textContent = config.title;
    message.textContent = 'Clique para iniciar. Este vídeo é reproduzido no seu player.';
    playButton.hidden = false;
    soundButton.hidden = true;
    if (loadedSource !== config.source) {
      media.pause();
      media.src = config.source;
      media.load();
      loadedSource = config.source;
    }
  }

  playButton.addEventListener('click',async () => {
    try {
      media.muted = false;
      await media.play();
      placeholder.classList.add('is-hidden');
      root.classList.add('is-playing');
      soundButton.hidden = false;
      soundButton.textContent = '♪ Som';
      soundButton.setAttribute('aria-label','Silenciar vídeo');
    } catch {
      message.textContent = 'Não foi possível reproduzir. Confira o link e a permissão de mídia da extensão.';
    }
  });

  soundButton.addEventListener('click',() => {
    media.muted = !media.muted;
    soundButton.textContent = media.muted ? '♪ Sem som' : '♪ Som';
    soundButton.setAttribute('aria-label',media.muted ? 'Ativar som' : 'Silenciar vídeo');
  });

  media.addEventListener('ended',() => {
    placeholder.classList.remove('is-hidden');
    root.classList.remove('is-playing');
    soundButton.hidden = true;
  });

  if (window.Twitch?.ext) {
    window.Twitch.ext.configuration.onChanged(() => {
      applyConfig(window.Twitch.ext.configuration.broadcaster?.content || '');
    });
  } else {
    message.textContent = 'Prévia: configure o overlay pelo painel da extensão na Twitch.';
  }
})();
