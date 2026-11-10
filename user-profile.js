(() => {
  const grid = document.querySelector('#myFavoritesGrid');
  const feedback = document.querySelector('#myFavoritesFeedback');
  const redemptionsList = document.querySelector('#myRedemptionsList');
  const redemptionsFeedback = document.querySelector('#myRedemptionsFeedback');
  const bases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let items = [];

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  async function api(path,options = {}) {
    let lastError;
    for (let index = 0; index < bases.length; index++) {
      try {
        const response = await fetch(`${bases[index]}${path}`,{credentials:'same-origin',...options});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar sua conta.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function renderFavorites() {
    if (!items.length) {
      grid.replaceChildren();
      feedback.textContent = 'Você ainda não favoritou nenhum filme ou série.';
      return;
    }
    feedback.textContent = '';
    grid.innerHTML = items.map((item,index) => `<article class="community-favorite-card"><button class="community-favorite-open" type="button" data-open-my-favorite="${index}" aria-label="Abrir detalhes de ${safe(item.title)}"><span class="community-favorite-poster">${item.posterUrl ? `<img src="${safe(item.posterUrl)}" alt="Pôster de ${safe(item.title)}" loading="lazy">` : '<span class="community-favorite-no-poster" aria-hidden="true">✦</span>'}</span><span class="community-favorite-title">${safe(item.title)}</span></button><div class="account-favorite-actions"><span>${safe(item.year || (item.mediaType === 'tv' ? 'Série' : 'Filme'))}</span><button type="button" data-remove-my-favorite="${index}" aria-label="Remover ${safe(item.title)} dos favoritos">Remover</button></div></article>`).join('');
    grid.querySelectorAll('[data-open-my-favorite]').forEach(button => button.addEventListener('click',async () => {
      const item = items[Number(button.dataset.openMyFavorite)];
      if (!item) return;
      button.disabled = true;
      try { window.openCatalogTitle(await window.CardapioFavorites.getTitle(item)); }
      catch (error) { feedback.textContent = error.message || 'Não foi possível abrir este título.'; }
      finally { button.disabled = false; }
    }));
    grid.querySelectorAll('[data-remove-my-favorite]').forEach(button => button.addEventListener('click',async () => {
      const item = items[Number(button.dataset.removeMyFavorite)];
      if (!item) return;
      button.disabled = true;
      try {
        await window.CardapioFavorites.toggle(item);
        await loadFavorites();
      } catch (error) {
        feedback.textContent = error.message || 'Não foi possível remover o favorito.';
        button.disabled = false;
      }
    }));
  }

  async function loadFavorites() {
    if (!window.CardapioAuth?.isAuthenticated()) {
      items = [];
      renderFavorites();
      return items;
    }
    feedback.textContent = 'Carregando seus favoritos…';
    try {
      const data = await api('/api/account/favorites');
      items = Array.isArray(data.favorites) ? data.favorites : [];
      renderFavorites();
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível carregar seus favoritos.';
    }
    return items;
  }

  function redemptionDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  async function loadRedemptions() {
    if (!window.CardapioAuth?.isAuthenticated()) {
      redemptionsList.replaceChildren();
      redemptionsFeedback.textContent = 'Entre com a Twitch para consultar seus resgates.';
      return [];
    }
    redemptionsFeedback.textContent = 'Carregando seus resgates…';
    try {
      const data = await api('/api/account/redemptions');
      const redemptions = Array.isArray(data.redemptions) ? data.redemptions : [];
      if (!redemptions.length) {
        redemptionsFeedback.textContent = 'Você ainda não solicitou um resgate.';
        redemptionsList.replaceChildren();
        return redemptions;
      }
      redemptionsFeedback.textContent = '';
      redemptionsList.innerHTML = redemptions.map(item => `<article class="account-redemption-item">${item.posterUrl ? `<img src="${safe(item.posterUrl)}" alt="Pôster de ${safe(item.title)}" loading="lazy">` : '<span class="account-redemption-no-poster" aria-hidden="true">✦</span>'}<div><strong>${safe(item.title)}</strong><small>${safe(item.mediaType === 'tv' ? 'Série' : item.mediaType === 'other' ? 'Outro' : 'Filme')} · ${safe(item.durationLabel || 'Duração não informada')}</small><small>Data solicitada: ${safe(redemptionDate(item.scheduledAt))}</small></div><span class="account-redemption-status status-${safe(item.status)}">${item.status === 'approved' ? 'Aprovado' : item.status === 'completed' ? 'Finalizado' : item.status === 'rejected' ? 'Rejeitado' : 'Aguardando aprovação'}</span></article>`).join('');
      return redemptions;
    } catch (error) {
      redemptionsFeedback.textContent = error.message || 'Não foi possível carregar seus resgates.';
      return [];
    }
  }

  document.addEventListener('click',event => {
    const gameTrigger = event.target.closest('[data-emoji-game],#trooveGameOpen');
    if (!gameTrigger || window.CardapioAuth?.isAuthenticated()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.CardapioAuth?.requireLogin('Entre com a Twitch para jogar todos os jogos do site.');
  },true);

  window.CardapioUserProfile = {loadFavorites,loadRedemptions};
  window.addEventListener('cardapio:auth-updated',event => {
    if ((!event.detail?.user || (location.hash === '#admin' && event.detail.user.role !== 'admin')) && ['#favoritos','#resgatados','#admin'].includes(location.hash)) {
      window.CardapioNavigation?.showPage('home');
    } else if (location.hash === '#favoritos') loadFavorites();
    else if (location.hash === '#resgatados') loadRedemptions();
  });
  (async () => {
    await window.CardapioAuth?.ready;
    if (location.hash === '#favoritos' || location.hash === '#resgatados' || location.hash === '#admin') {
      if (!window.CardapioAuth?.isAuthenticated() || (location.hash === '#admin' && !window.CardapioAuth?.isAdmin())) window.CardapioNavigation?.showPage('home');
      else if (location.hash === '#favoritos') loadFavorites();
      else if (location.hash === '#resgatados') loadRedemptions();
      else window.CardapioAdminRedemptions?.load();
    }
  })();
})();
