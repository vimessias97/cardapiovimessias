(() => {
  const page = document.querySelector('#listas');
  const createForm = document.querySelector('#communityListCreateForm');
  const createPanel = document.querySelector('#communityListCreatePanel');
  const createHint = createPanel.querySelector(':scope > p');
  const createSearch = document.querySelector('#communityListCreateSearch');
  const createSearchResults = document.querySelector('#communityListCreateSearchResults');
  const createSelected = document.querySelector('#communityListCreateSelected');
  const feedback = document.querySelector('#communityListFeedback');
  const grid = document.querySelector('#communityListsGrid');
  const sectionHeading = document.querySelector('#communityListSectionHeading');
  const backButton = document.querySelector('#communityListsBack');
  const profileLists = document.querySelector('#communityProfileLists');
  const homeTeaser = document.querySelector('#homeListsTeaser');
  const homeTeaserGrid = document.querySelector('#homeListsTeaserGrid');
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let currentListId = '';
  let currentList = null;
  let searchTimer = 0;
  let createSearchTimer = 0;
  let creatingItems = [];
  let draftListItems = null;
  let listEditing = false;
  let listOpenRequest = 0;
  let publicListsCache = null;
  let publicListsPromise = null;
  let publicListsRevision = 0;
  let pendingListId = '';
  const listDetailsCache = new Map();

  const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(path,options = {}) {
    let lastError;
    for (const base of apiBases) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(),12000);
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options,signal:controller.signal,headers:{'content-type':'application/json',...(options.headers || {})}});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as listas.');
        return data;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('O servidor demorou para abrir esta lista. Tente novamente.');
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      } finally {
        window.clearTimeout(timer);
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }
  function setFeedback(message = '',isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle('is-error',isError);
    const actionFeedback = document.querySelector('#communityListActionFeedback');
    if (actionFeedback) { actionFeedback.textContent = message; actionFeedback.classList.toggle('is-error',isError); }
  }
  function ownerMarkup(owner = {}) {
    const label = owner.displayName || owner.login || 'Membro da comunidade';
    return `<a class="community-list-card-owner" href="#perfil/${encodeURIComponent(owner.id || '')}" data-list-owner="${esc(owner.id || '')}">${owner.profileImageUrl ? `<img src="${esc(owner.profileImageUrl)}" alt="" loading="lazy">` : ''}<span>${esc(label)}</span></a>`;
  }
  function renderPosterStack(list, className = 'community-list-poster-stack') {
    const posters = Array.isArray(list.posterUrls) ? list.posterUrls.filter(Boolean).slice(0,5) : (list.posterUrl ? [list.posterUrl] : []);
    return `<div class="${className}" aria-label="Pôsteres dos títulos desta lista">${posters.length ? posters.map((url,index) => `<img src="${esc(url)}" alt="" loading="lazy" style="--poster-index:${index}">`).join('') : '<span class="community-list-poster-stack-empty" aria-hidden="true">▤</span>'}</div>`;
  }
  function renderCards(lists = []) {
    createPanel.classList.remove('hidden');
    sectionHeading.textContent = 'Listas da comunidade';
    backButton.classList.add('hidden');
    if (!lists.length) {
      grid.innerHTML = '<p class="community-list-empty">Ainda não há listas. Entre com a Twitch e crie a primeira.</p>';
      return;
    }
    const userId = String(window.CardapioAuth?.getUser()?.id || '');
    grid.innerHTML = lists.map(list => {
      const isOwner = userId && String(list.owner?.id) === userId;
      return `<article class="community-list-card">${renderPosterStack(list)}<h3>${esc(list.title)}</h3><div class="community-list-card-meta"><span class="community-list-byline">Por: ${ownerMarkup(list.owner)}</span><span>${Number(list.itemCount ?? list.items?.length) || 0} títulos</span></div>${list.description ? `<p>${esc(list.description)}</p>` : ''}<div class="community-list-card-social">♥ ${Number(list.likeCount) || 0} · Comentários ${Number(list.commentCount) || 0}</div><a class="community-list-primary community-list-open" href="#listas/${encodeURIComponent(list.id)}" data-open-list="${esc(list.id)}">Ver lista <span aria-hidden="true">→</span></a></article>`;
    }).join('');
  }
  async function fetchPublicLists() {
    if (publicListsCache) return publicListsCache;
    if (publicListsPromise) return publicListsPromise;
    const revision = publicListsRevision;
    const request = api('/api/lists').then(data => {
      const lists = Array.isArray(data.lists) ? data.lists : [];
      if (revision === publicListsRevision) publicListsCache = lists;
      return lists;
    }).finally(() => { if (publicListsPromise === request) publicListsPromise = null; });
    publicListsPromise = request;
    return request;
  }
  function renderItems(list) {
    const items = Array.isArray(list.items) ? list.items : [];
    if (!items.length) return '<p class="community-list-empty">Esta lista ainda não tem títulos. Busque um filme ou uma série para adicionar.</p>';
    const isOwner = listEditing && String(window.CardapioAuth?.getUser()?.id || '') === String(list.owner?.id || '');
    const displayItems = Array.isArray(draftListItems) && listEditing ? draftListItems : items;
    return `<div class="community-list-items">${displayItems.map(item => `<article class="community-list-item"><button type="button" class="community-list-poster-open" data-list-title-popup="${Number(item.id)}" data-media-type="${esc(item.mediaType)}" aria-label="Abrir detalhes de ${esc(item.title)}">${item.posterUrl ? `<img src="${esc(item.posterUrl)}" alt="Pôster de ${esc(item.title)}" loading="lazy">` : '<span class="community-list-item-placeholder" aria-hidden="true">✦</span>'}</button><strong title="${esc(item.title)}">${esc(item.title)}</strong><small>${esc(item.kind || (item.mediaType === 'tv' ? 'Série' : 'Filme'))}${item.year ? ` · ${esc(item.year)}` : ''}</small>${isOwner ? `<button type="button" class="community-list-item-remove" data-remove-title="${Number(item.id)}" data-media-type="${esc(item.mediaType)}" aria-label="Remover ${esc(item.title)} da lista">×</button>` : ''}</article>`).join('')}</div>`;
  }
  function renderDetail(list) {
    currentList = list;
    currentListId = list.id;
    draftListItems = null;
    listEditing = false;
    const isOwner = String(window.CardapioAuth?.getUser()?.id || '') === String(list.owner?.id || '');
    createPanel.classList.add('hidden');
    sectionHeading.textContent = list.title;
    backButton.classList.remove('hidden');
    const editing = isOwner ? `<div class="community-list-owner-controls"><button type="button" class="community-list-secondary" data-toggle-list-editor>Editar lista</button><button type="button" class="community-list-secondary" data-delete-list>Excluir lista</button></div><div class="community-list-editor hidden"><form class="community-list-edit-form" id="communityListEditForm"><label>Nome<input name="title" maxlength="80" required value="${esc(list.title)}"></label><label>Descrição<textarea name="description" maxlength="240" rows="2">${esc(list.description || '')}</textarea></label><button class="community-list-primary" type="submit">Salvar alterações</button></form><form class="community-list-search" id="communityListSearchForm"><input name="q" type="search" minlength="2" placeholder="Adicionar filme ou série…" autocomplete="off" required><button class="community-list-secondary" type="submit">Buscar</button></form><div class="community-list-search-results" id="communityListSearchResults"></div></div>` : '';
    const comments = Array.isArray(list.comments) ? list.comments : [];
    const liked = Boolean(list.likedByMe);
    grid.innerHTML = `<div class="community-list-detail"><div class="community-list-detail-head"><div><p>${esc(list.description || '')}</p><div class="community-list-card-meta">${ownerMarkup(list.owner)}<span>${(list.items || []).length} títulos</span></div></div></div><div class="community-list-social"><button type="button" class="community-list-social-button${liked ? ' is-liked' : ''}" data-list-like aria-pressed="${liked}">♥ <span>${Number(list.likeCount) || 0}</span> Curtir</button><button type="button" class="community-list-social-button" data-share-list>↗ Compartilhar</button></div><p class="community-list-feedback" id="communityListActionFeedback" aria-live="polite"></p>${editing}<div class="community-list-items-wrap">${renderItems(list)}</div><section class="community-list-comments"><h4>Comentários <span>${comments.length}</span></h4><div class="community-list-comment-list">${comments.map(comment => `<article class="community-list-comment">${ownerMarkup(comment.author)}<p>${esc(comment.text)}</p><time>${new Date(comment.createdAt).toLocaleString('pt-BR')}</time></article>`).join('') || '<p class="community-list-empty">Ainda não há comentários.</p>'}</div><form class="community-list-comment-form" id="communityListCommentForm"><textarea name="comment" maxlength="1000" rows="2" placeholder="Comente nesta lista…" required></textarea><button class="community-list-primary" type="submit">Comentar</button></form>${window.CardapioAuth?.getUser() ? '' : '<p class="community-list-login-hint">Entre com a Twitch para curtir ou comentar.</p>'}</section></div>`;
  }
  async function loadLists(ownerId = '') {
    if (!ownerId) {
      currentList = null; currentListId = '';
      if (pendingListId) { listOpenRequest++; pendingListId = ''; }
    }
    const query = ownerId ? `?owner=${encodeURIComponent(ownerId)}` : '';
    try {
      const lists = ownerId ? (await api(`/api/lists${query}`)).lists || [] : await fetchPublicLists();
      if (!ownerId && currentListId) return;
      renderCards(lists);
    } catch (error) { grid.innerHTML = `<p class="community-list-empty">${esc(error.message)}</p>`; }
  }
  async function openList(id) {
    if (!id) return;
    if (currentList?.id === String(id)) return;
    if (listDetailsCache.has(String(id))) { listOpenRequest++; pendingListId = ''; renderDetail(listDetailsCache.get(String(id))); return; }
    if (pendingListId === String(id)) return;
    const requestId = ++listOpenRequest;
    currentListId = String(id);
    pendingListId = String(id);
    grid.innerHTML = '<div class="community-list-loading-skeleton" role="status" aria-label="Abrindo lista"><span></span><span></span><span></span></div>';
    try {
      const data = await api(`/api/lists/${encodeURIComponent(id)}`);
      if (requestId === listOpenRequest) { listDetailsCache.set(String(id),data.list); renderDetail(data.list); }
    } catch (error) {
      if (requestId !== listOpenRequest) return;
      currentListId = '';
      grid.innerHTML = `<div class="community-list-empty"><p>${esc(error.message)}</p><button type="button" class="community-list-secondary" data-retry-list="${esc(id)}">Tentar novamente</button></div>`;
    } finally {
      if (requestId === listOpenRequest) pendingListId = '';
    }
  }
  function rememberList(list,{refreshIndex = false} = {}) {
    if (!list?.id) return;
    listDetailsCache.set(String(list.id),list);
    if (refreshIndex) {
      publicListsRevision++;
      publicListsCache = null;
      publicListsPromise = null;
      loadHomeLists();
    }
  }
  async function loadHomeLists() {
    if (!homeTeaserGrid) return;
    try {
      const lists = (await fetchPublicLists()).slice().sort((a,b) => (Number(b.likeCount) || 0) - (Number(a.likeCount) || 0) || (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0)).slice(0,3);
      homeTeaserGrid.innerHTML = lists.length ? lists.map(list => `<a class="home-list-teaser-card" href="#listas/${encodeURIComponent(list.id)}" data-home-open-list="${esc(list.id)}">${renderPosterStack(list,'home-list-poster-stack')}<span class="home-list-teaser-copy"><strong>${esc(list.title)}</strong><span class="home-list-teaser-byline">Por: ${esc(list.owner?.displayName || list.owner?.login || 'Membro da comunidade')} · ${Number(list.itemCount) || 0} títulos</span><span class="home-list-teaser-likes">♥ ${Number(list.likeCount) || 0} curtidas <b aria-hidden="true">→</b></span></span></a>`).join('') : '<p class="home-list-teaser-empty">As listas criadas pela comunidade aparecerão aqui.</p>';
    } catch {
      homeTeaserGrid.innerHTML = '<p class="home-list-teaser-empty">As listas da comunidade serão exibidas aqui.</p>';
    }
  }
  async function searchTitles(query,resultsId = '#communityListSearchResults',createMode = false) {
    const results = document.querySelector(resultsId);
    if (!results) return;
    results.innerHTML = '<p class="community-list-empty">Buscando no catálogo…</p>';
    try {
      const data = await api(`/api/catalog/search-tmdb?q=${encodeURIComponent(query)}`);
      const items = (data.results || []).filter(item => ['movie','tv'].includes(item.mediaType));
      results.innerHTML = items.length ? items.map(item => `<article class="community-list-search-result">${item.posterUrl ? `<img src="${esc(item.posterUrl)}" alt="" loading="lazy">` : '<span></span>'}<span><strong>${esc(item.title)}</strong><small>${esc(item.kind)}${item.year ? ` · ${esc(item.year)}` : ''}</small></span><button type="button" ${createMode ? 'data-create-add-title' : 'data-add-title'}="${Number(item.id)}" data-media-type="${esc(item.mediaType)}" data-title="${esc(item.title)}" data-kind="${esc(item.kind)}" data-year="${esc(item.year || '')}" data-poster="${esc(item.posterUrl || '')}">Adicionar</button></article>`).join('') : '<p class="community-list-empty">Não encontrei filmes ou séries para esse termo.</p>';
    } catch (error) { results.innerHTML = `<p class="community-list-empty">${esc(error.message)}</p>`; }
  }
  async function showAllLists(updateHistory = true) {
    currentList = null; currentListId = '';
    if (updateHistory) history.replaceState(null,'',`${location.pathname}${location.search}#listas`);
    await loadLists();
  }

  function renderCreatingItems() {
    createSelected.innerHTML = creatingItems.length ? `<p>${creatingItems.length} título(s) selecionado(s)</p><div class="community-list-items">${creatingItems.map(item => `<article class="community-list-item">${item.posterUrl ? `<img src="${esc(item.posterUrl)}" alt="Pôster de ${esc(item.title)}" loading="lazy">` : '<span class="community-list-item-placeholder">✦</span>'}<strong>${esc(item.title)}</strong><small>${esc(item.kind)}</small><button type="button" class="community-list-item-remove" data-remove-create-title="${Number(item.id)}" data-media-type="${esc(item.mediaType)}">×</button></article>`).join('')}</div>` : '';
  }
  createSearch?.addEventListener('input',() => {
    clearTimeout(createSearchTimer);
    const query = createSearch.value.trim();
    if (query.length >= 2) createSearchTimer = window.setTimeout(() => searchTitles(query,'#communityListCreateSearchResults',true),350);
    else createSearchResults.innerHTML = '';
  });
  createPanel.addEventListener('click',event => {
    const add = event.target.closest('[data-create-add-title]');
    if (add) {
      const item = {id:Number(add.dataset.createAddTitle),mediaType:add.dataset.mediaType,title:add.dataset.title,kind:add.dataset.kind,year:add.dataset.year,posterUrl:add.dataset.poster};
      if (!creatingItems.some(existing => existing.id === item.id && existing.mediaType === item.mediaType)) creatingItems.push(item);
      renderCreatingItems();
      return;
    }
    const remove = event.target.closest('[data-remove-create-title]');
    if (remove) { creatingItems = creatingItems.filter(item => item.id !== Number(remove.dataset.removeCreateTitle) || item.mediaType !== remove.dataset.mediaType); renderCreatingItems(); }
  });

  createForm.addEventListener('submit',async event => {
    event.preventDefault();
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para criar uma lista.')) return;
    const button = createForm.querySelector('button[type="submit"]');
    button.disabled = true; setFeedback('Criando sua lista…');
    try {
      const fields = new FormData(createForm);
      const data = await api('/api/lists',{method:'POST',body:JSON.stringify({title:fields.get('title'),description:fields.get('description'),items:creatingItems})});
      createForm.reset(); creatingItems = []; renderCreatingItems(); createSearchResults.innerHTML = ''; setFeedback('Lista criada.');
      rememberList(data.list,{refreshIndex:true});
      await openList(data.list.id);
    } catch (error) { setFeedback(error.message,true); }
    finally { button.disabled = false; }
  });
  grid.addEventListener('submit',async event => {
    if (event.target.matches('#communityListCommentForm')) {
      event.preventDefault();
      if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para comentar nesta lista.')) return;
      const form = event.target, button = form.querySelector('button');
      button.disabled = true;
      try {
        const text = new FormData(form).get('comment');
        const data = await api(`/api/lists/${encodeURIComponent(currentListId)}`,{method:'PATCH',body:JSON.stringify({action:'add-comment',text})});
        rememberList(data.list,{refreshIndex:true}); renderDetail(data.list);
      } catch (error) { setFeedback(error.message,true); }
      finally { button.disabled = false; }
      return;
    }
    if (event.target.matches('#communityListEditForm')) {
      event.preventDefault();
      if (!window.CardapioAuth?.requireLogin()) return;
      const form = event.target; const fields = new FormData(form); const button = form.querySelector('button'); button.disabled = true;
      try { const data = await api(`/api/lists/${encodeURIComponent(currentListId)}`,{method:'PATCH',body:JSON.stringify({action:'update',title:fields.get('title'),description:fields.get('description'),items:draftListItems || currentList.items || []})}); rememberList(data.list,{refreshIndex:true}); renderDetail(data.list); }
      catch (error) { setFeedback(error.message,true); } finally { button.disabled = false; }
      return;
    }
    if (event.target.matches('#communityListSearchForm')) {
      event.preventDefault(); const query = new FormData(event.target).get('q'); if (String(query).trim().length >= 2) searchTitles(String(query).trim());
    }
  });
  grid.addEventListener('click',async event => {
    const titlePoster = event.target.closest('[data-list-title-popup]');
    if (titlePoster) {
      titlePoster.disabled = true;
      try {
        const data = await api(`/api/catalog/title?type=${encodeURIComponent(titlePoster.dataset.mediaType)}&id=${encodeURIComponent(titlePoster.dataset.listTitlePopup)}`);
        if (typeof window.openCatalogTitle === 'function') window.openCatalogTitle(data.result);
      } catch (error) { setFeedback(error.message || 'Não foi possível abrir os detalhes deste título.',true); }
      finally { titlePoster.disabled = false; }
      return;
    }
    if (event.target.closest('[data-toggle-list-editor]')) {
      const editor = grid.querySelector('.community-list-editor');
      const opening = editor?.classList.contains('hidden');
      if (opening) { draftListItems = (currentList?.items || []).map(item => ({...item})); listEditing = true; editor.classList.remove('hidden'); }
      else { listEditing = false; draftListItems = null; editor?.classList.add('hidden'); const wrap = grid.querySelector('.community-list-items-wrap'); if (wrap && currentList) wrap.innerHTML = renderItems(currentList); }
      return;
    }
    if (event.target.closest('[data-share-list]')) {
      const url = `${location.origin}${location.pathname}${location.search}#listas/${encodeURIComponent(currentListId)}`;
      try { await navigator.clipboard.writeText(url); setFeedback('Link da lista copiado.'); }
      catch { window.prompt('Copie o link da lista:',url); }
      return;
    }
    if (event.target.closest('[data-list-like]')) {
      if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para curtir esta lista.')) return;
      const button = event.target.closest('[data-list-like]'); button.disabled = true;
      try { const data = await api(`/api/lists/${encodeURIComponent(currentListId)}`,{method:'PATCH',body:JSON.stringify({action:'toggle-like'})}); rememberList(data.list,{refreshIndex:true}); renderDetail(data.list); }
      catch (error) { setFeedback(error.message,true); button.disabled = false; }
      return;
    }
    const retry = event.target.closest('[data-retry-list]');
    if (retry) { openList(retry.dataset.retryList); return; }
    const add = event.target.closest('[data-add-title]');
    if (add) {
      if (!listEditing) return;
      const item = {id:Number(add.dataset.addTitle),mediaType:add.dataset.mediaType,title:add.dataset.title,kind:add.dataset.kind,year:add.dataset.year,posterUrl:add.dataset.poster};
      if (draftListItems.some(existing => Number(existing.id) === item.id && existing.mediaType === item.mediaType)) { setFeedback('Este título já está na lista.',true); return; }
      if (draftListItems.length >= 100) { setFeedback('Cada lista pode ter até 100 títulos.',true); return; }
      draftListItems.push(item);
      add.disabled = true; add.textContent = 'Adicionado';
      const wrap = grid.querySelector('.community-list-items-wrap'); if (wrap) wrap.innerHTML = renderItems(currentList);
      return;
    }
    const remove = event.target.closest('[data-remove-title]');
    if (remove) {
      if (!listEditing) return;
      draftListItems = draftListItems.filter(item => !(Number(item.id) === Number(remove.dataset.removeTitle) && item.mediaType === remove.dataset.mediaType));
      const wrap = grid.querySelector('.community-list-items-wrap'); if (wrap) wrap.innerHTML = renderItems(currentList);
      return;
    }
    if (event.target.closest('[data-delete-list]')) {
      if (!confirm('Excluir esta lista e os títulos organizados nela?')) return;
      try { await api(`/api/lists/${encodeURIComponent(currentListId)}`,{method:'PATCH',body:JSON.stringify({action:'delete-list'})}); listDetailsCache.delete(String(currentListId)); publicListsRevision++; publicListsCache = null; publicListsPromise = null; await showAllLists(); loadHomeLists(); }
      catch (error) { setFeedback(error.message,true); }
    }
  });
  grid.addEventListener('input',event => {
    if (!event.target.matches('#communityListSearchForm input[name="q"]')) return;
    clearTimeout(searchTimer);
    const query = event.target.value.trim();
    if (query.length >= 2) searchTimer = window.setTimeout(() => searchTitles(query),350);
  });
  backButton.addEventListener('click',() => showAllLists());
  page.addEventListener('click',event => {
    const owner = event.target.closest('[data-list-owner]');
    if (owner) {
      event.preventDefault();
      const id = owner.dataset.listOwner;
      if (id) window.CardapioCommunityProfiles?.open(id);
      return;
    }
    const open = event.target.closest('[data-open-list]');
    if (!open) return;
    event.preventDefault();
    window.CardapioNavigation?.showPage('listas',null,true,'',open.dataset.openList);
  });
  homeTeaser?.addEventListener('click',event => {
    const link = event.target.closest('[data-home-open-list]');
    if (!link) return;
    event.preventDefault();
    window.CardapioNavigation?.showPage('listas',null,true,'',link.dataset.homeOpenList);
  });
  profileLists?.addEventListener('click',event => {
    const link = event.target.closest('[data-profile-list]');
    if (!link) return;
    event.preventDefault();
    window.CardapioNavigation?.showPage('listas',null,true,'',link.dataset.profileList);
  });
  function renderProfileLists(memberId,items = []) {
    if (!profileLists) return;
    const lists = Array.isArray(items) ? items : [];
    profileLists.innerHTML = lists.length ? lists.map(list => `<a class="community-profile-list-link" href="#listas/${encodeURIComponent(list.id)}" data-profile-list="${esc(list.id)}"><strong>${esc(list.title)}</strong><span>${Number(list.itemCount) || 0} títulos →</span></a>`).join('') : '<p>Este perfil ainda não tem listas públicas.</p>';
  }
  window.CardapioLists = {load:loadLists,open:openList,renderProfileLists};
  window.CardapioAuth?.ready.then(user => {
    if (createHint) createHint.textContent = user ? 'Crie uma lista e organize seus filmes e séries favoritos.' : 'Entre com a Twitch para montar e editar suas listas.';
    if (user && page && !page.classList.contains('hidden')) loadLists();
    if (!user) setFeedback('Entre com a Twitch para criar listas.');
  });
  window.addEventListener('cardapio:auth-updated',event => {
    const user = event.detail?.user;
    if (createHint) createHint.textContent = user ? 'Crie uma lista e organize seus filmes e séries favoritos.' : 'Entre com a Twitch para montar e editar suas listas.';
    if (!page || page.classList.contains('hidden')) return;
    if (currentList) {
      const ownerSignedIn = String(user?.id || '') === String(currentList.owner?.id || '');
      const editFormExists = Boolean(grid.querySelector('#communityListEditForm'));
      if (ownerSignedIn && !editFormExists && !grid.contains(document.activeElement)) renderDetail(currentList);
      return;
    }
    if (currentListId) openList(currentListId);
    else loadLists();
  });
  loadHomeLists();
})();
