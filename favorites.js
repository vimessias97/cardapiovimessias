(() => {
  const grid = document.querySelector('#communityFavoritesGrid');
  const feedback = document.querySelector('#communityFavoritesFeedback');
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let favorites = [];
  let refreshInProgress = false;

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function api(path, options = {}) {
    let lastError;
    for (let index = 0; index < apiBases.length; index++) {
      try {
        const response = await fetch(`${apiBases[index]}${path}`, options);
        if (response.status === 404 && index < apiBases.length - 1) continue;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar os favoritos.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function getFavorites() { return favorites; }
  function find(item) { return favorites.find(favorite => favorite.mediaType === item.mediaType && Number(favorite.id) === Number(item.id)); }
  function isLiked(item) { return Boolean(find(item)?.liked); }
  function count(item) { return find(item)?.voteCount || 0; }

  async function refresh() {
    if (refreshInProgress) return favorites;
    refreshInProgress = true;
    try {
      const data = await api('/api/catalog/favorites');
      favorites = Array.isArray(data.favorites) ? data.favorites : [];
      renderPage();
      window.dispatchEvent(new CustomEvent('cardapio:favorites-updated'));
      return favorites;
    } catch (error) {
      if (feedback) feedback.textContent = error.message || 'Não foi possível carregar as sugestões.';
      return favorites;
    } finally {
      refreshInProgress = false;
    }
  }

  async function toggle(item) {
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para favoritar filmes e séries.')) throw new Error('É necessário entrar com a Twitch para favoritar.');
    const action = isLiked(item) ? 'remove' : 'add';
    const data = await api('/api/catalog/favorites', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({action,item:{id:item.id,mediaType:item.mediaType,title:item.title,posterUrl:item.posterUrl || '',year:item.year || ''}})
    });
    favorites = Array.isArray(data.favorites) ? data.favorites : [];
    renderPage();
    window.dispatchEvent(new CustomEvent('cardapio:favorites-updated'));
    if (action === 'add' && Number(data.vicoinsAwarded) > 0) window.dispatchEvent(new CustomEvent('cardapio:vicoins-updated',{detail:{balance:data.vicoinsBalance,earned:Number(data.vicoinsAwarded),source:'favorite'}}));
    return isLiked(item);
  }

  async function getTitle(item) {
    const data = await api(`/api/catalog/title?type=${encodeURIComponent(item.mediaType)}&id=${encodeURIComponent(item.id)}`);
    return data.result;
  }

  function renderPage() {
    if (!grid || !feedback) return;
    const ranked = favorites.filter(item => item.voteCount > 0);
    if (!ranked.length) {
      grid.innerHTML = '';
      feedback.textContent = 'Ainda não há títulos favoritados. Pesquise um filme ou série e toque no coração ao lado do nome.';
      return;
    }
    feedback.textContent = '';
    grid.innerHTML = ranked.map((item,index) => `<article class="community-favorite-card"><button class="community-favorite-open" type="button" data-open-favorite="${index}" aria-label="Abrir detalhes de ${safe(item.title)}"><span class="community-favorite-poster">${item.posterUrl ? `<img src="${safe(item.posterUrl)}" alt="Pôster de ${safe(item.title)}" loading="lazy">` : '<span class="community-favorite-no-poster" aria-hidden="true">✦</span>'}</span><span class="community-favorite-title">${safe(item.title)}</span></button><div class="community-favorite-votes" aria-label="${item.voteCount} corações"><span aria-hidden="true">♥</span><span>${item.voteCount}</span></div></article>`).join('');
    grid.querySelectorAll('[data-open-favorite]').forEach(button => button.addEventListener('click', async () => {
      const item = ranked[Number(button.dataset.openFavorite)];
      if (!item) return;
      button.disabled = true;
      try {
        const details = await getTitle(item);
        if (typeof window.openCatalogTitle === 'function') window.openCatalogTitle(details);
        else throw new Error('A janela de detalhes não está disponível.');
      } catch (error) { feedback.textContent = error.message || 'Não foi possível carregar os detalhes deste título.'; }
      finally { button.disabled = false; }
    }));
  }

  window.CardapioFavorites = {ready:refresh(),refresh,getFavorites,isLiked,count,toggle,getTitle};
  window.addEventListener('cardapio:auth-updated',refresh);
  window.setInterval(refresh, 120000);
})();
