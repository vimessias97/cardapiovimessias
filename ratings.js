(() => {
  const topRatedList = document.querySelector('#topRatedList');
  const topRatedFeedback = document.querySelector('#topRatedFeedback');
  const topRatedMore = document.querySelector('#topRatedMore');
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let topRatedExpanded = false;

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
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as avaliações.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function renderTopRated(items = []) {
    if (!topRatedList || !topRatedFeedback) return;
    if (!items.length) {
      topRatedList.innerHTML = '';
      topRatedMore?.classList.add('hidden');
      topRatedFeedback.textContent = 'Ainda não há avaliações de títulos com react no Patreon.';
      return;
    }
    topRatedFeedback.textContent = '';
    topRatedList.innerHTML = items.map((item,index) => `<li class="top-rated-item${index >= 3 && !topRatedExpanded ? ' hidden' : ''}"${index >= 3 ? ' data-top-rated-extra="true"' : ''}><span class="top-rated-rank">${String(index + 1).padStart(2,'0')}</span><button type="button" class="top-rated-open" data-open-top-rated="${index}" aria-label="Abrir e avaliar ${safe(item.title)}">${item.posterUrl ? `<img class="top-rated-poster" src="${safe(item.posterUrl)}" alt="" loading="lazy">` : '<span class="top-rated-poster top-rated-no-poster" aria-hidden="true">✦</span>'}<span class="top-rated-copy"><strong>${safe(item.title)}</strong><span class="top-rated-score"><span aria-hidden="true">★</span> ${Number(item.averageRating).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} <small>(${item.ratingCount})</small></span></span></button></li>`).join('');
    topRatedMore?.classList.toggle('hidden',items.length <= 3);
    if (topRatedMore) {
      topRatedMore.textContent = topRatedExpanded ? 'Ver menos' : 'Ver mais';
      topRatedMore.setAttribute('aria-expanded',String(topRatedExpanded));
    }
    topRatedList.querySelectorAll('[data-open-top-rated]').forEach(button => button.addEventListener('click',async () => {
      const item = items[Number(button.dataset.openTopRated)];
      if (!item || !window.CardapioFavorites?.getTitle || !window.openCatalogTitle) return;
      button.disabled = true;
      try { window.openCatalogTitle(await window.CardapioFavorites.getTitle(item)); }
      catch (error) { topRatedFeedback.textContent = error.message || 'Não foi possível abrir este título.'; }
      finally { button.disabled = false; }
    }));
  }

  async function refresh() {
    try {
      const data = await api('/api/catalog/ratings');
      renderTopRated(data.topRated || []);
      return data.topRated || [];
    } catch (error) {
      if (topRatedFeedback) topRatedFeedback.textContent = error.message || 'Não foi possível carregar o ranking.';
      return [];
    }
  }

  topRatedMore?.addEventListener('click',() => {
    topRatedExpanded = !topRatedExpanded;
    topRatedList.querySelectorAll('[data-top-rated-extra]').forEach(item => item.classList.toggle('hidden',!topRatedExpanded));
    topRatedMore.textContent = topRatedExpanded ? 'Ver menos' : 'Ver mais';
    topRatedMore.setAttribute('aria-expanded',String(topRatedExpanded));
  });

  async function get(item) {
    return api(`/api/catalog/rating?type=${encodeURIComponent(item.mediaType)}&id=${encodeURIComponent(item.id)}`);
  }

  async function rate(item, rating) {
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para avaliar filmes e séries com react no Patreon.')) throw new Error('É necessário entrar com a Twitch para avaliar.');
    const data = await api('/api/catalog/rating', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({rating,item:{id:item.id,mediaType:item.mediaType}})
    });
    renderTopRated(data.topRated || []);
    window.dispatchEvent(new CustomEvent('cardapio:rating-updated'));
    if (Number(data.vicoinsAwarded) > 0) window.dispatchEvent(new CustomEvent('cardapio:vicoins-updated',{detail:{balance:data.vicoinsBalance,earned:Number(data.vicoinsAwarded),source:'rating'}}));
    return data;
  }

  window.CardapioRatings = {ready:refresh(),refresh,get,rate,renderTopRated};
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
