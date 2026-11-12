(() => {
  const form = document.querySelector('#adminPatreonForm');
  const search = document.querySelector('#adminPatreonSearch');
  const results = document.querySelector('#adminPatreonSearchResults');
  const feedback = document.querySelector('#adminPatreonFeedback');
  if (!form || !search || !results || !feedback) return;
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let timer;
  let searchSequence = 0;
  let resultItems = [];
  let nextCursor = null;
  let currentQuery = '';
  const safe = value => String(value ?? '').replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  async function api(path,options = {}) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a busca TMDB.');
        return data;
      } catch (error) { if (!(error instanceof TypeError)) throw error; lastError = error; }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }
  function renderResults() {
    const items = resultItems.map((item,index) => `<button type="button" class="admin-promotion-search-result admin-patreon-result" data-result-index="${index}"><strong class="admin-patreon-result-title">${safe(item.title)}</strong><small>${safe(item.kind)}${item.year ? ` · ${safe(item.year)}` : ''} · TMDB ${safe(item.id)}</small></button>`).join('');
    const more = nextCursor ? '<button type="button" class="admin-patreon-more" data-more-results>Ver mais resultados</button>' : '<p class="admin-patreon-end">Fim dos resultados.</p>';
    results.innerHTML = `${items}${more}`;
  }
  async function fetchPage(query,sequence,append = false) {
    if (!append) { resultItems = []; nextCursor = null; results.innerHTML = '<p>Buscando títulos…</p>'; }
    else { const button = results.querySelector('[data-more-results]'); if (button) button.disabled = true; }
    try {
      const cursor = append && nextCursor ? `&page=${nextCursor.page}&offset=${nextCursor.offset}` : '';
      const data = await api(`/api/catalog/search-tmdb?q=${encodeURIComponent(query)}${cursor}`);
      if (sequence !== searchSequence) return;
      resultItems = append ? [...resultItems,...(data.results || [])] : (data.results || []);
      nextCursor = data.nextCursor || null;
      renderResults();
      if (!resultItems.length) results.innerHTML = '<p>Nenhum resultado encontrado.</p>';
    } catch (error) { if (sequence === searchSequence) results.innerHTML = `<p>${safe(error.message)}</p>`; }
  }
  search.addEventListener('input',() => {
    clearTimeout(timer);
    const query = search.value.trim();
    const sequence = ++searchSequence;
    currentQuery = query;
    if (query.length < 2) { results.replaceChildren(); resultItems = []; nextCursor = null; return; }
    timer = setTimeout(() => fetchPage(query,sequence),300);
  });
  results.addEventListener('click',event => {
    const more = event.target.closest('[data-more-results]');
    if (more) { if (nextCursor) fetchPage(currentQuery,searchSequence,true); return; }
    const button = event.target.closest('[data-result-index]');
    if (!button) return;
    const item = resultItems[Number(button.dataset.resultIndex)];
    if (!item) return;
    form.elements.namedItem('title').value = item.title;
    form.elements.namedItem('mediaType').value = item.mediaType;
    form.elements.namedItem('id').value = item.id;
    results.innerHTML = `<p>Título selecionado: <strong>${safe(item.title)}</strong> · ${safe(item.kind)} · TMDB ${safe(item.id)}</p>`;
  });
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (!window.CardapioAuth?.isAdmin()) { feedback.textContent = 'Área exclusiva do administrador.'; return; }
    const values = new FormData(form);
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Salvando associação…';
    try {
      await api('/api/admin/patreon-mappings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:values.get('title'),mediaType:values.get('mediaType'),id:values.get('id'),url:values.get('url')})});
      feedback.textContent = values.get('url') ? 'React associado a este título específico.' : 'Associação automática bloqueada para este título.';
      form.reset();
    } catch (error) { feedback.textContent = error.message; }
    finally { submit.disabled = false; }
  });
})();
