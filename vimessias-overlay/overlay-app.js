(() => {
  const loginCard = document.querySelector('#loginCard');
  const dashboard = document.querySelector('#dashboard');
  const connectionPill = document.querySelector('#connectionPill');
  const pageFeedback = document.querySelector('#pageFeedback');
  const sourceForm = document.querySelector('#sourceForm');
  const sourceTitle = document.querySelector('#sourceTitle');
  const sourceUrl = document.querySelector('#sourceUrl');
  const authorization = document.querySelector('#authorizedToStream');
  const sourceFeedback = document.querySelector('#sourceFeedback');
  const saveSource = document.querySelector('#saveSource');
  const generateButton = document.querySelector('#generateCode');
  const codeFeedback = document.querySelector('#codeFeedback');
  const codeList = document.querySelector('#codeList');
  const newCodeBox = document.querySelector('#newCodeBox');
  const newCode = document.querySelector('#newCode');
  let hasSource = false;

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  async function api(path,options = {}) {
    const response = await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body ? {'content-type':'application/json'} : {}),...(options.headers || {})}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a solicitação.');
    return data;
  }
  function setSourceState(config) {
    hasSource = Boolean(config?.authorizedToStream && config?.videoUrl);
    generateButton.disabled = !hasSource;
    if (!config) return;
    sourceTitle.value = config.title || '';
    sourceUrl.value = config.videoUrl || '';
    authorization.checked = Boolean(config.authorizedToStream);
    sourceFeedback.textContent = 'Fonte autorizada salva. Gerar um código libera a configuração para a ferramenta do espectador na próxima fase.';
  }
  function renderCodes(codes = []) {
    if (!codes.length) {
      codeList.innerHTML = '<p class="empty-state">Nenhum código criado ainda.</p>';
      return;
    }
    codeList.innerHTML = codes.map(code => `<article class="code-row"><div class="code-row-copy"><strong>VIME-••••-••••-••••-••••-••••-••••-••••-${safe(code.lastFour)}</strong><small>${code.active ? '<span class="active">Ativo</span>' : '<span class="revoked">Revogado</span>'} · criado em ${new Date(code.createdAt).toLocaleString('pt-BR')}</small></div>${code.active ? `<button class="code-revoke" type="button" data-revoke-code="${safe(code.id)}">Revogar</button>` : ''}</article>`).join('');
  }
  async function loadDashboard() {
    try {
      const auth = await api('/api/auth/me');
      if (!auth.authenticated) {
        connectionPill.textContent = auth.configured ? 'Twitch desconectada' : 'Twitch não configurada';
        loginCard.classList.remove('hidden');
        dashboard.classList.add('hidden');
        return;
      }
      const data = await api('/api/overlay/dashboard');
      connectionPill.textContent = `Twitch · ${data.profile.displayName || data.profile.login}`;
      connectionPill.classList.add('connected');
      loginCard.classList.add('hidden');
      dashboard.classList.remove('hidden');
      setSourceState(data.config);
      renderCodes(data.codes);
      const status = new URLSearchParams(location.search).get('twitch');
      if (status === 'connected') pageFeedback.textContent = 'Conta Twitch conectada com sucesso.';
    } catch (error) {
      connectionPill.textContent = 'Não foi possível conectar';
      pageFeedback.textContent = error.message;
    }
  }

  sourceForm.addEventListener('submit',async event => {
    event.preventDefault();
    sourceFeedback.textContent = '';
    saveSource.disabled = true;
    try {
      const data = await api('/api/overlay/config',{method:'POST',body:JSON.stringify({title:sourceTitle.value,videoUrl:sourceUrl.value,authorizedToStream:authorization.checked})});
      setSourceState(data.config);
      sourceFeedback.textContent = 'Fonte salva. Você já pode gerar o código da sessão.';
    } catch (error) { sourceFeedback.textContent = error.message; }
    finally { saveSource.disabled = false; }
  });

  generateButton.addEventListener('click',async () => {
    codeFeedback.textContent = '';
    generateButton.disabled = true;
    try {
      const data = await api('/api/overlay/codes',{method:'POST',body:'{}'});
      newCode.textContent = data.code;
      newCodeBox.classList.remove('hidden');
      codeFeedback.textContent = 'Código gerado. Copie e guarde; o código completo não será mostrado outra vez.';
      await loadDashboard();
      newCodeBox.classList.remove('hidden');
      newCode.textContent = data.code;
    } catch (error) { codeFeedback.textContent = error.message; }
    finally { generateButton.disabled = !hasSource; }
  });

  document.querySelector('#copyCode').addEventListener('click',async () => {
    try { await navigator.clipboard.writeText(newCode.textContent); document.querySelector('#copyCode').textContent = 'Copiado!'; }
    catch { codeFeedback.textContent = 'Selecione o código e copie manualmente.'; }
  });
  codeList.addEventListener('click',async event => {
    const button = event.target.closest('[data-revoke-code]');
    if (!button) return;
    button.disabled = true;
    try {
      await api(`/api/overlay/codes/${encodeURIComponent(button.dataset.revokeCode)}/revoke`,{method:'POST',body:'{}'});
      await loadDashboard();
      codeFeedback.textContent = 'Código revogado.';
    } catch (error) { button.disabled = false; codeFeedback.textContent = error.message; }
  });
  loadDashboard();
})();
