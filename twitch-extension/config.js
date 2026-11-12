(() => {
  const fields = Object.fromEntries(['title','source','left','top','width','height'].map(id => [id,document.getElementById(id)]));
  const status = document.getElementById('status');
  const saveButton = document.getElementById('save');
  let authorized = false;

  function clamp(value,min,max,fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max,Math.max(min,number)) : fallback;
  }

  function directVideoUrl(value) {
    let url;
    try { url = new URL(String(value || '').trim()); } catch { return ''; }
    if (url.protocol !== 'https:' || !/\.(mp4|webm)$/i.test(url.pathname)) return '';
    return url.href;
  }

  function readConfig() {
    const content = window.Twitch?.ext?.configuration?.broadcaster?.content;
    if (!content) return;
    try {
      const config = JSON.parse(content);
      fields.title.value = String(config.title || '');
      fields.source.value = String(config.source || '');
      fields.left.value = clamp(config.left,0,100,0);
      fields.top.value = clamp(config.top,0,100,12);
      fields.width.value = clamp(config.width,10,100,77);
      fields.height.value = clamp(config.height,10,100,77);
      status.textContent = 'Configuração atual carregada.';
    } catch { status.textContent = 'Não consegui ler a configuração salva. Você pode substituí-la.'; }
  }

  saveButton.addEventListener('click',() => {
    if (!authorized || !window.Twitch?.ext?.configuration?.set) {
      status.textContent = 'Abra esta tela pelo painel da extensão na Twitch e tente novamente.';
      return;
    }
    const source = directVideoUrl(fields.source.value);
    if (!source) {
      status.textContent = 'Informe um link HTTPS direto terminado em .mp4 ou .webm.';
      fields.source.focus();
      return;
    }
    const config = {
      title:String(fields.title.value || '').trim().slice(0,90) || 'Conteúdo da live',
      source,
      left:clamp(fields.left.value,0,100,0),
      top:clamp(fields.top.value,0,100,12),
      width:clamp(fields.width.value,10,100,77),
      height:clamp(fields.height.value,10,100,77)
    };
    window.Twitch.ext.configuration.set('broadcaster','1',JSON.stringify(config));
    status.textContent = 'Configuração salva na Twitch. Espectadores podem precisar recarregar o player.';
  });

  if (window.Twitch?.ext) {
    window.Twitch.ext.onAuthorized(() => { authorized = true; status.textContent = 'Conectado à Twitch.'; readConfig(); });
    window.Twitch.ext.configuration.onChanged(readConfig);
  }
})();
