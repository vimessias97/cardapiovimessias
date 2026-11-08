(() => {
  const form = document.querySelector('#adminVicoinsAdjustmentForm');
  const feedback = document.querySelector('#adminVicoinsAdjustmentFeedback');
  if (!form || !feedback) return;
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];

  async function api(path,options = {}) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível ajustar os Vicoins.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (!window.CardapioAuth?.isAdmin()) {
      feedback.textContent = 'Área exclusiva do administrador.';
      return;
    }
    const values = new FormData(form);
    const action = String(values.get('action') || '');
    const amount = Number(values.get('amount'));
    const login = String(values.get('login') || '').trim().replace(/^@/,'');
    if (!login || !Number.isSafeInteger(amount) || amount < 1) {
      feedback.textContent = 'Informe o usuário Twitch e uma quantidade inteira positiva.';
      return;
    }
    const verb = action === 'add' ? 'Adicionar' : 'Remover';
    if (!window.confirm(`${verb} ${amount.toLocaleString('pt-BR')} Vicoins ${action === 'add' ? 'para' : 'de'} @${login}?`)) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Salvando ajuste…';
    try {
      const data = await api('/api/admin/vicoins-adjustments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login,amount,action,reason:String(values.get('reason') || '').trim()})});
      const label = action === 'add' ? 'adicionados' : 'removidos';
      feedback.textContent = `${amount.toLocaleString('pt-BR')} Vicoins ${label} ${action === 'add' ? 'para' : 'de'} ${data.displayName} (@${data.login}). Novo saldo: ${Number(data.balance).toLocaleString('pt-BR')} Vicoins.`;
      form.reset();
      form.elements.action.value = 'add';
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível ajustar os Vicoins.';
    } finally { submit.disabled = false; }
  });

  function updateAccess() {
    const enabled = Boolean(window.CardapioAuth?.isAdmin());
    form.hidden = !enabled;
    feedback.textContent = enabled ? '' : 'Área exclusiva do administrador.';
  }
  window.addEventListener('cardapio:auth-updated',updateAccess);
  window.CardapioAuth?.ready.then(updateAccess);
})();
