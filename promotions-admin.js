(() => {
  const form = document.querySelector('#adminPromotionForm');
  if (!form) return;
  const list = document.querySelector('#adminPromotionList');
  const feedback = document.querySelector('#adminPromotionFeedback');
  const search = document.querySelector('#adminPromotionSearch');
  const results = document.querySelector('#adminPromotionSearchResults');
  const selectedBox = document.querySelector('#adminPromotionSelected');
  const titleCount = document.querySelector('#adminPromotionTitleCount');
  const formHeading = document.querySelector('#adminPromotionFormHeading');
  const formStatus = document.querySelector('#adminPromotionFormStatus');
  const formSave = form.querySelector('[type="submit"]');
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let promotions = [];
  let selectedTitles = [];
  let searchTimer;
  let searchSequence = 0;

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  async function api(path,options = {}) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(response.status === 404 ? 'O servidor ainda não tem a rota atualizada de promoções. Reinicie o Node ou publique a versão mais recente do backend.' : data.error || 'Não foi possível atualizar as promoções.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function renderList() {
    if (!promotions.length) {
      list.innerHTML = '<p class="admin-promotion-empty">Nenhuma coleção cadastrada.</p>';
      return;
    }
    list.innerHTML = promotions.map(item => `<article class="admin-promotion-row"><div><strong>${safe(item.name)}</strong><small>${item.titles.length} título(s) · ${safe(item.discountPercent)}% OFF</small></div><div><button type="button" data-promotion-edit="${safe(item.id)}">Editar</button><button type="button" data-promotion-delete="${safe(item.id)}">Excluir</button></div></article>`).join('');
  }

  function renderSelected() {
    titleCount.textContent = String(selectedTitles.length);
    if (!selectedTitles.length) {
      selectedBox.innerHTML = '<p>Busque e selecione os títulos da coleção.</p>';
      return;
    }
    selectedBox.innerHTML = selectedTitles.map((item,index) => `<article class="admin-promotion-selected-item">${item.posterUrl ? `<img src="${safe(item.posterUrl)}" alt="" loading="lazy">` : '<span>✦</span>'}<div><strong>${safe(item.title || `Título ${item.id}`)}</strong><small>${safe(item.kind || (item.mediaType === 'tv' ? 'Série' : 'Filme'))}${item.year ? ` · ${safe(item.year)}` : ''}</small></div><button type="button" data-selected-remove="${index}" aria-label="Remover ${safe(item.title || 'título')}">×</button></article>`).join('');
  }

  function setFormStatus(message,type = 'info') {
    formStatus.textContent = message;
    formStatus.className = `admin-promotion-form-status${message ? ` is-${type}` : ''}`;
  }

  function resetForm(keepOpen = false) {
    form.reset();
    form.elements.namedItem('id').value = '';
    form.elements.namedItem('discountPercent').value = '30';
    selectedTitles = [];
    search.value = '';
    results.replaceChildren();
    renderSelected();
    formHeading.textContent = 'Nova promoção';
    formSave.textContent = 'Salvar promoção';
    setFormStatus('');
    form.classList.toggle('hidden',!keepOpen);
  }

  async function loadPromotions() {
    if (!window.CardapioAuth?.isAdmin()) return;
    feedback.textContent = 'Carregando promoções…';
    try {
      const data = await api('/api/promotions');
      promotions = Array.isArray(data.promotions) ? data.promotions : [];
      renderList();
      feedback.textContent = 'Altere as coleções existentes ou crie uma nova.';
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível carregar as promoções.';
    }
  }

  async function searchTitles(query,sequence) {
    results.innerHTML = '<p>Buscando no TMDB…</p>';
    try {
      const data = await api(`/api/catalog/search-tmdb?q=${encodeURIComponent(query)}`);
      if (sequence !== searchSequence) return;
      const items = Array.isArray(data.results) ? data.results : [];
      if (!items.length) {
        results.innerHTML = '<p>Nenhum resultado encontrado.</p>';
        return;
      }
      results.innerHTML = items.map((item,index) => `<button type="button" role="option" data-search-result="${index}">${item.posterUrl ? `<img src="${safe(item.posterUrl)}" alt="" loading="lazy">` : '<span class="admin-promotion-result-no-poster">✦</span>'}<span><strong>${safe(item.title)}</strong><small>${safe(item.kind || (item.mediaType === 'tv' ? 'Série' : 'Filme'))} · ${safe(item.year || 'Ano não informado')}${item.durationLabel ? ` · ${safe(item.durationLabel)}` : ''}</small></span><b>+</b></button>`).join('');
      results.querySelectorAll('[data-search-result]').forEach(button => button.addEventListener('click',() => {
        const item = items[Number(button.dataset.searchResult)];
        if (!item) return;
        if (selectedTitles.some(title => title.mediaType === item.mediaType && Number(title.id) === Number(item.id))) {
          feedback.textContent = 'Esse título já está na coleção.';
          return;
        }
        if (selectedTitles.length >= 30) {
          feedback.textContent = 'Cada promoção pode ter até 30 títulos.';
          return;
        }
        selectedTitles.push(item);
        renderSelected();
        feedback.textContent = `${item.title} adicionado à coleção.`;
      }));
    } catch (error) {
      if (sequence === searchSequence) results.innerHTML = `<p>${safe(error.message || 'Não foi possível buscar títulos.')}</p>`;
    }
  }

  async function editPromotion(id) {
    const offer = promotions.find(item => item.id === id);
    if (!offer) return;
    form.classList.remove('hidden');
    formHeading.textContent = 'Editar promoção';
    formSave.textContent = 'Salvar alterações';
    form.elements.namedItem('id').value = offer.id;
    form.elements.namedItem('name').value = offer.name;
    form.elements.namedItem('discountPercent').value = String(offer.discountPercent);
    form.elements.namedItem('description').value = offer.description || '';
    feedback.textContent = 'Carregando os títulos desta coleção…';
    setFormStatus('Carregando os títulos desta coleção…','info');
    try {
      selectedTitles = await Promise.all((offer.titles || []).map(async title => {
        const data = await api(`/api/catalog/title?type=${encodeURIComponent(title.mediaType)}&id=${encodeURIComponent(title.id)}`);
        return data.result;
      }));
      renderSelected();
      feedback.textContent = 'Edite a coleção e salve as alterações.';
      setFormStatus('Edite a coleção e salve as alterações.','info');
      form.scrollIntoView({behavior:'smooth',block:'start'});
    } catch (error) {
      selectedTitles = [];
      renderSelected();
      feedback.textContent = `Não foi possível carregar algum título para edição: ${error.message}`;
      setFormStatus(`Não foi possível carregar algum título para edição: ${error.message}`,'error');
    }
  }

  async function deletePromotion(id) {
    const offer = promotions.find(item => item.id === id);
    if (!offer || !window.confirm(`Excluir a promoção "${offer.name}"?`)) return;
    feedback.textContent = 'Excluindo promoção…';
    try {
      const data = await api('/api/admin/promotions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'delete',id})});
      promotions = Array.isArray(data.promotions) ? data.promotions : [];
      renderList();
      feedback.textContent = 'Promoção excluída.';
      window.dispatchEvent(new CustomEvent('cardapio:promotions-updated'));
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível excluir a promoção.';
    }
  }

  document.querySelector('#adminPromotionNew').addEventListener('click',() => {
    resetForm();
    form.classList.remove('hidden');
    form.scrollIntoView({behavior:'smooth',block:'start'});
    form.elements.namedItem('name').focus();
  });
  document.querySelector('#adminPromotionCancel').addEventListener('click',resetForm);
  document.querySelector('#adminPromotionCancelBottom').addEventListener('click',resetForm);
  list.addEventListener('click',event => {
    const edit = event.target.closest('[data-promotion-edit]');
    const remove = event.target.closest('[data-promotion-delete]');
    if (edit) editPromotion(edit.dataset.promotionEdit);
    if (remove) deletePromotion(remove.dataset.promotionDelete);
  });
  selectedBox.addEventListener('click',event => {
    const remove = event.target.closest('[data-selected-remove]');
    if (!remove) return;
    selectedTitles.splice(Number(remove.dataset.selectedRemove),1);
    renderSelected();
  });
  search.addEventListener('input',() => {
    clearTimeout(searchTimer);
    const query = search.value.trim();
    results.replaceChildren();
    const sequence = ++searchSequence;
    if (query.length < 2) return;
    searchTimer = setTimeout(() => searchTitles(query,sequence),350);
  });
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (!selectedTitles.length) {
      feedback.textContent = 'Adicione pelo menos um título à coleção.';
      setFormStatus('Adicione pelo menos um filme ou uma série antes de salvar.','error');
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Salvando promoção…';
    setFormStatus('Salvando promoção…','info');
    try {
      const savedName = form.elements.namedItem('name').value.trim();
      const data = await api('/api/admin/promotions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save',id:form.elements.namedItem('id').value || '',name:savedName,description:form.elements.namedItem('description').value,discountPercent:Number(form.elements.namedItem('discountPercent').value),titles:selectedTitles.map(item => ({id:item.id,mediaType:item.mediaType}))})});
      promotions = Array.isArray(data.promotions) ? data.promotions : [];
      renderList();
      resetForm(true);
      feedback.textContent = 'Promoção salva e atualizada na página pública.';
      setFormStatus(`“${savedName}” foi salva. Ela já aparece na página Promoções.`,'success');
      window.dispatchEvent(new CustomEvent('cardapio:promotions-updated'));
    } catch (error) {
      const message = error.message || 'Não foi possível salvar a promoção.';
      feedback.textContent = message;
      setFormStatus(message,'error');
    } finally { submit.disabled = false; }
  });

  window.addEventListener('cardapio:auth-updated',event => {
    if (event.detail?.user?.role === 'admin') loadPromotions();
    else { promotions = []; list.replaceChildren(); }
  });
  (async () => {
    await window.CardapioAuth?.ready;
    if (window.CardapioAuth?.isAdmin()) loadPromotions();
  })();
})();
