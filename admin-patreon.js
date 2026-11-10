(() => {
  const form = document.querySelector('#adminPatreonForm');
  const search = document.querySelector('#adminPatreonSearch');
  const results = document.querySelector('#adminPatreonSearchResults');
  const list = document.querySelector('#adminPatreonMappings');
  const feedback = document.querySelector('#adminPatreonFeedback');
  if (!form || !search || !results || !list || !feedback) return;
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let mappings = [];
  let timer;
  let searchSequence = 0;

  const safe = value => String(value ?? '').replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  async function api(path,options = {}) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar as associações.');
        return data;
      } catch (error) { if (!(error instanceof TypeError)) throw error; lastError = error; }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }
  function render() {
    if (!mappings.length) { list.innerHTML = '<p class="admin-promotion-empty">Nenhuma associação manual ou exceção cadastrada.</p>'; return; }
    list.innerHTML = mappings.map(item => `<article class="admin-promotion-row"><div><strong>${safe(item.title)}</strong><small>${item.mediaType === 'tv' ? 'Série' : 'Filme'} · TMDB ${safe(item.id)} · ${item.blockAutomatic ? 'correspondência automática bloqueada' : `<a href="${safe(item.url)}" target="_blank" rel="noopener noreferrer">abrir post do Patreon ↗</a>`}</small></div><button type="button" data-patreon-delete="${safe(item.key)}">Excluir</button></article>`).join('');
  }
  async function load() {
    if (!window.CardapioAuth?.isAdmin()) return;
    try { mappings = (await api('/api/admin/patreon-mappings')).items || []; render(); }
    catch (error) { feedback.textContent = error.message; }
  }
  search.addEventListener('input',() => {
    clearTimeout(timer);
    const query = search.value.trim();
    const sequence = ++searchSequence;
    if (query.length < 2) { results.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      results.innerHTML = '<p>Buscando títulos…</p>';
      try {
        const data = await api(`/api/catalog/search-tmdb?q=${encodeURIComponent(query)}`);
        if (sequence !== searchSequence) return;
        results.innerHTML = (data.results || []).map((item,index) => `<button type="button" class="admin-promotion-search-result" data-result-index="${index}"><strong>${safe(item.title)}</strong><small>${safe(item.kind)}${item.year ? ` · ${safe(item.year)}` : ''} · TMDB ${safe(item.id)}</small></button>`).join('') || '<p>Nenhum resultado encontrado.</p>';
        results._titles = data.results || [];
      } catch (error) { if (sequence === searchSequence) results.innerHTML = `<p>${safe(error.message)}</p>`; }
    },300);
  });
  results.addEventListener('click',event => {
    const button = event.target.closest('[data-result-index]');
    if (!button) return;
    const item = results._titles?.[Number(button.dataset.resultIndex)];
    if (!item) return;
    form.elements.namedItem('title').value = item.title;
    form.elements.namedItem('mediaType').value = item.mediaType;
    form.elements.namedItem('id').value = item.id;
    results.innerHTML = `<p>Selecionado: <strong>${safe(item.title)}</strong> · ${safe(item.kind)} · TMDB ${safe(item.id)}</p>`;
  });
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (!window.CardapioAuth?.isAdmin()) { feedback.textContent = 'Área exclusiva do administrador.'; return; }
    const values = new FormData(form);
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Salvando associação…';
    try {
      const data = await api('/api/admin/patreon-mappings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:values.get('title'),mediaType:values.get('mediaType'),id:values.get('id'),url:values.get('url')})});
      mappings = data.items || [];
      render();
      feedback.textContent = values.get('url') ? 'React associado a este título específico.' : 'Associação automática bloqueada para este título.';
      form.reset();
    } catch (error) { feedback.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  list.addEventListener('click',async event => {
    const button = event.target.closest('[data-patreon-delete]');
    if (!button) return;
    const [mediaType,id] = button.dataset.patreonDelete.split(':');
    button.disabled = true;
    try {
      const data = await api('/api/admin/patreon-mappings',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({mediaType,id})});
      mappings = data.items || [];
      render();
      feedback.textContent = 'Exceção removida. A correspondência automática poderá voltar a ser usada para este título.';
    } catch (error) { feedback.textContent = error.message; button.disabled = false; }
  });
  window.addEventListener('cardapio:auth-updated',load);
  window.CardapioAuth?.ready?.then(load);
})();
