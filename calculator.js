const input = document.querySelector('#titleSearch');
const resultBox = document.querySelector('#searchResults');
const searchMoreButton = document.querySelector('#searchMoreButton');
const feedback = document.querySelector('#searchFeedback');
const selectedBox = document.querySelector('#selectedTitle');
const catalogTitleDialog = document.querySelector('#catalogTitleDialog');
const dialogTitleBox = document.querySelector('#dialogTitle');
const catalogTitleDialogClose = document.querySelector('#catalogTitleDialogClose');
const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
let debounce;
let selectedItem = null;
let dialogItem = null;
let lastQueryActivity = 0;
let currentSearchResults = [];
let currentSearchCursor = null;
let searchRequestId = 0;
let searchMoreLoading = false;

function safe(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function estimatedPrice(minutes) {
  return Math.ceil(Number(minutes) / 30) * 5;
}

function money(value) {
  return Number(value).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
}

async function fetchCatalogApi(path, options = {}) {
  let lastError;
  for (const base of apiBases) {
    try {
      const response = await fetch(`${base}${path}`, options);
      if (response.status === 404 && base !== apiBases.at(-1)) continue;
      return response;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Não foi possível conectar ao servidor local.');
}

input.addEventListener('input', () => {
  lastQueryActivity = Date.now();
  searchRequestId++;
  currentSearchResults = [];
  currentSearchCursor = null;
  searchMoreButton.classList.add('hidden');
  clearTimeout(debounce);
  selectedBox.classList.add('hidden');
  const query = input.value.trim();
  resultBox.innerHTML = '';
  if (query.length < 2) {
    feedback.textContent = 'Digite pelo menos 2 letras para buscar.';
    return;
  }
  feedback.textContent = 'Buscando títulos…';
  debounce = setTimeout(() => search(query), 350);
});

async function search(query, cursor = null, append = false) {
  const requestId = ++searchRequestId;
  if (!append) {
    currentSearchResults = [];
    currentSearchCursor = null;
    resultBox.innerHTML = '';
    selectedBox.classList.add('hidden');
    searchMoreButton.classList.add('hidden');
  }
  try {
    const cursorQuery = cursor ? `&page=${encodeURIComponent(cursor.page)}&offset=${encodeURIComponent(cursor.offset)}` : '';
    const response = await fetchCatalogApi(`/api/catalog/search-tmdb?q=${encodeURIComponent(query)}${cursorQuery}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível buscar no TMDB.');
    await window.CardapioFavorites?.ready;
    if (requestId !== searchRequestId) return null;
    const pageResults = data.results || [];
    renderResults(pageResults,append);
    currentSearchCursor = data.nextCursor || null;
    if (!append && !pageResults.length) currentSearchCursor = null;
    searchMoreButton.classList.toggle('hidden',!currentSearchCursor);
    searchMoreButton.disabled = false;
    searchMoreButton.textContent = 'Ver mais';
    const totalVisible = currentSearchResults.length;
    feedback.textContent = totalVisible
      ? `${totalVisible} resultado(s) do TMDB${currentSearchCursor ? ' · há mais títulos' : ''}`
      : 'Não encontrei filmes ou séries com esse título. Tente outra busca.';
    return currentSearchResults;
  } catch (error) {
    if (requestId !== searchRequestId) return null;
    feedback.textContent = error.message || 'Não foi possível consultar agora. Tente novamente em instantes.';
    if (!append) searchMoreButton.classList.add('hidden');
    return null;
  }
}

function renderResults(items, append = false) {
  if (!items.length && !append) {
    feedback.textContent = 'Não encontrei títulos com informações disponíveis. Tente outro nome.';
    return;
  }
  const startIndex = append ? currentSearchResults.length : 0;
  if (!append) { currentSearchResults = []; resultBox.innerHTML = ''; }
  currentSearchResults.push(...items);
  resultBox.insertAdjacentHTML('beforeend',items.map((item, i) => {
    const index = startIndex + i;
    return `<article class="search-result"><button class="search-result-select" data-result="${index}">${item.posterUrl ? `<img class="result-poster" src="${safe(item.posterUrl)}" alt="Pôster de ${safe(item.title)}" loading="lazy">` : '<span class="result-poster no-poster" aria-hidden="true">✦</span>'}<span class="result-copy"><strong>${safe(item.title)}</strong><small>${safe(item.kind)} · ${item.year || 'Ano não informado'} · ${item.durationLabel ? safe(item.durationLabel) : 'Duração não informada'}</small></span><span class="result-arrow">›</span></button>${favoriteMarkup(item, index)}${item.reactUrl ? `<a class="result-react-link" href="${safe(item.reactUrl)}" target="_blank" rel="noopener noreferrer">Conteúdo já assistido,<br>veja no Patreon ↗</a>` : `<span class="result-estimate">${item.durationMinutes ? money(estimatedPrice(item.durationMinutes)) : '—'}</span>`}</article>`;
  }).join(''));
  [...resultBox.querySelectorAll('[data-result]')].filter(button => Number(button.dataset.result) >= startIndex).forEach(button => {
    const item = currentSearchResults[Number(button.dataset.result)];
    button.__catalogItem = item;
    button.dataset.key = `${item.mediaType}:${item.id}`;
    button.addEventListener('click', () => showTitle(item, button));
  });
  bindFavoriteButtons(resultBox,currentSearchResults,startIndex);
}

searchMoreButton.addEventListener('click', async () => {
  if (searchMoreLoading || !currentSearchCursor) return;
  searchMoreLoading = true;
  searchMoreButton.disabled = true;
  searchMoreButton.textContent = 'Carregando…';
  try { await search(input.value.trim(),currentSearchCursor,true); }
  finally { searchMoreLoading = false; if (!currentSearchCursor) searchMoreButton.classList.add('hidden'); else { searchMoreButton.disabled = false; searchMoreButton.textContent = 'Ver mais'; } }
});

function favoriteMarkup(item, index = '') {
  if (item.reactUrl) return '';
  const liked = window.CardapioFavorites?.isLiked(item) || false;
  const count = window.CardapioFavorites?.count(item) || 0;
  const data = index === '' ? 'data-selected-favorite="true"' : `data-favorite-index="${index}"`;
  return `<button class="favorite-toggle${liked ? ' is-favorite' : ''}" type="button" ${data} aria-pressed="${liked}" aria-label="${liked ? 'Remover' : 'Adicionar'} ${safe(item.title)} ${liked ? 'dos' : 'aos'} favoritos" title="${liked ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}"><span aria-hidden="true">${liked ? '♥' : '♡'}</span><small>${count}</small></button>`;
}

function updateFavoriteButton(button, item) {
  const liked = window.CardapioFavorites?.isLiked(item) || false;
  const count = window.CardapioFavorites?.count(item) || 0;
  button.classList.toggle('is-favorite', liked);
  button.setAttribute('aria-pressed', String(liked));
  button.setAttribute('aria-label', `${liked ? 'Remover' : 'Adicionar'} ${item.title} ${liked ? 'dos' : 'aos'} favoritos`);
  button.title = liked ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
  button.innerHTML = `<span aria-hidden="true">${liked ? '♥' : '♡'}</span><small>${count}</small>`;
}

function bindFavoriteButtons(container, items = [], fromIndex = 0) {
  container.querySelectorAll('[data-favorite-index]').forEach(button => {
    if (Number(button.dataset.favoriteIndex) < fromIndex) return;
    button.addEventListener('click', async () => {
    const item = items[Number(button.dataset.favoriteIndex)];
    if (!item || !window.CardapioFavorites) return;
    button.disabled = true;
    try { await window.CardapioFavorites.toggle(item); syncFavoriteButtons(item); }
    catch (error) { feedback.textContent = error.message || 'Não foi possível salvar o coração.'; }
    finally { button.disabled = false; }
    });
  });
}

function syncFavoriteButtons(item) {
  const key = `${item.mediaType}:${item.id}`;
  resultBox.querySelectorAll('[data-favorite-index]').forEach(button => {
    const title = resultBox.querySelector(`[data-result="${button.dataset.favoriteIndex}"]`);
    if (title?.dataset.key === key) updateFavoriteButton(button,item);
  });
  if (selectedItem && `${selectedItem.mediaType}:${selectedItem.id}` === key) {
    const selectedFavoriteButton = selectedBox.querySelector('[data-selected-favorite]');
    if (selectedFavoriteButton) updateFavoriteButton(selectedFavoriteButton,item);
  }
  if (dialogItem && `${dialogItem.mediaType}:${dialogItem.id}` === key) {
    const dialogFavoriteButton = dialogTitleBox.querySelector('[data-selected-favorite]');
    if (dialogFavoriteButton) updateFavoriteButton(dialogFavoriteButton,item);
  }
}

window.addEventListener('cardapio:favorites-updated', () => {
  resultBox.querySelectorAll('[data-favorite-index]').forEach(button => {
    const title = resultBox.querySelector(`[data-result="${button.dataset.favoriteIndex}"]`);
    if (title?.__catalogItem) updateFavoriteButton(button,title.__catalogItem);
  });
  if (selectedItem) {
    const button = selectedBox.querySelector('[data-selected-favorite]');
    if (button) updateFavoriteButton(button,selectedItem);
  }
  if (dialogItem) {
    const button = dialogTitleBox.querySelector('[data-selected-favorite]');
    if (button) updateFavoriteButton(button,dialogItem);
  }
});

function titleDetailsMarkup(item) {
  const duration = Number(item.durationMinutes);
  const durationText = Number.isFinite(duration) && duration > 0 ? safe(item.durationLabel || `${duration} min`) : 'Não cadastrada';
  const hasDuration = Number.isFinite(duration) && duration > 0;
  const price = hasDuration ? money(estimatedPrice(duration)) : '';
  const seriesEstimate = item.mediaType === 'tv' && hasDuration;
  return `${item.posterUrl ? `<img class="selected-poster" src="${safe(item.posterUrl)}" alt="Pôster de ${safe(item.title)}">` : '<div class="selected-poster no-poster" aria-hidden="true">✦</div>'}<div class="selected-copy"><span class="badge">${safe(item.kind)}</span><div class="selected-title-heading"><h3>${safe(item.title)}</h3>${favoriteMarkup(item)}</div><small class="selected-meta">${item.year || 'Ano não informado'} · Duração: ${durationText}</small><p>${safe(item.overview || 'Sinopse não informada.')}</p><div class="title-trailer-slot" data-title-trailer-key="${safe(`${item.mediaType}:${item.id}`)}">${trailerMarkup(item)}</div>${item.reactUrl ? `<a class="matched-react-link" href="${safe(item.reactUrl)}" target="_blank" rel="noopener noreferrer">Conteúdo já assistido, veja no Patreon ↗</a><div class="title-rating-widget" data-title-rating><p>Carregando avaliação…</p></div>` : `<div class="informational-estimate"><span>Estimativa informativa</span><strong>${hasDuration ? price : 'Duração indisponível'}</strong><small>${hasDuration ? `R$ 5 por bloco iniciado de 30 minutos${seriesEstimate ? ' · baseada na duração total estimada da série' : ''}.` : 'Não foi possível calcular sem uma duração cadastrada.'}</small></div>`}${item.reactUrl ? '' : `<form class="redemption-request-form" data-redemption-form><div class="redemption-form-heading"><strong>Agende o resgate</strong><span>Informe a data e o horário desejados.</span></div><div class="redemption-schedule-fields"><label>Dia / mês / ano<input type="date" name="date" required></label><label>Horário<input type="time" name="time" step="60" required></label></div><p class="redemption-request-feedback" aria-live="polite">O pedido ficará pendente de aprovação. O pagamento é concluído no LivePix.</p><button class="redemption-link" type="submit" aria-label="Registrar o resgate de ${safe(item.title)} e continuar no LivePix">Resgate pelo LivePix <span aria-hidden="true">↗</span></button></form>`}</div>`;
}

function bindRedemptionForm(target,item) {
  const form = target.querySelector('[data-redemption-form]');
  if (!form) return;
  const dateInput = form.querySelector('[name="date"]');
  const timeInput = form.querySelector('[name="time"]');
  const feedbackText = form.querySelector('.redemption-request-feedback');
  const submitButton = form.querySelector('[type="submit"]');
  const now = new Date();
  dateInput.min = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para solicitar um resgate.')) return;
    if (!form.reportValidity()) return;
    const scheduledAt = new Date(`${dateInput.value}T${timeInput.value}:00`);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      feedbackText.textContent = 'Escolha uma data e um horário futuros.';
      return;
    }
    const livepixTab = window.open('about:blank','_blank');
    if (livepixTab) {
      livepixTab.opener = null;
      livepixTab.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Abrindo LivePix</title><body style="margin:0;padding:32px;background:#100d14;color:#f4eafa;font:16px system-ui">Registrando o resgate e abrindo o LivePix…</body></html>');
      livepixTab.document.close();
    }
    submitButton.disabled = true;
    feedbackText.textContent = 'Registrando sua solicitação…';
    try {
      const response = await fetchCatalogApi('/api/redemptions',{
        method:'POST',
        credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({mediaType:item.mediaType,id:item.id,scheduledAt:scheduledAt.toISOString()})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar o resgate.');
      window.dispatchEvent(new CustomEvent('cardapio:redemptions-updated'));
      if (livepixTab && !livepixTab.closed) {
        livepixTab.location.replace('https://livepix.gg/vimessias');
        feedbackText.textContent = 'Solicitação registrada. O LivePix foi aberto em outra guia.';
      } else {
        feedbackText.innerHTML = 'Solicitação registrada. <a href="https://livepix.gg/vimessias" target="_blank" rel="noopener noreferrer">Clique aqui para abrir o LivePix em outra guia</a>.';
      }
    } catch (error) {
      if (livepixTab && !livepixTab.closed) livepixTab.close();
      feedbackText.textContent = error.message || 'Não foi possível registrar o pedido.';
      submitButton.disabled = false;
    }
  });
}

function trailerMarkup(item) {
  if (!item.trailer?.key) return '';
  return `<button class="title-trailer-button" type="button" data-trailer-key="${safe(item.trailer.key)}" data-trailer-name="${safe(item.trailer.name || `Trailer de ${item.title}`)}" aria-expanded="false"><span aria-hidden="true">▶</span> Reproduzir trailer</button><div class="title-trailer-frame" hidden></div>`;
}

function bindTrailerPlayer(target, item) {
  const slot = target.querySelector('[data-title-trailer-key]');
  if (!slot || !item.trailer?.key) return;
  slot.innerHTML = trailerMarkup(item);
  const button = slot.querySelector('[data-trailer-key]');
  const frame = slot.querySelector('.title-trailer-frame');
  button?.addEventListener('click', () => {
    const isPlaying = button.getAttribute('aria-expanded') === 'true';
    frame.replaceChildren();
    frame.hidden = isPlaying;
    button.setAttribute('aria-expanded', String(!isPlaying));
    button.innerHTML = isPlaying ? '<span aria-hidden="true">▶</span> Reproduzir trailer' : '<span aria-hidden="true">×</span> Fechar trailer';
    if (isPlaying) return;
    const player = document.createElement('iframe');
    player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(button.dataset.trailerKey)}?autoplay=1&rel=0`;
    player.title = button.dataset.trailerName;
    player.loading = 'lazy';
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    player.allow = 'autoplay; encrypted-media; picture-in-picture; web-share; fullscreen';
    player.allowFullscreen = true;
    frame.append(player);
  });
}

async function loadTitleTrailer(item, target) {
  if (item.trailer?.key) return;
  const titleKey = `${item.mediaType}:${item.id}`;
  const slot = target.querySelector('[data-title-trailer-key]');
  if (!slot || slot.dataset.titleTrailerKey !== titleKey) return;
  try {
    const response = await fetchCatalogApi(`/api/catalog/title?type=${encodeURIComponent(item.mediaType)}&id=${encodeURIComponent(item.id)}`);
    if (!response.ok) return;
    const data = await response.json();
    if (slot.dataset.titleTrailerKey !== titleKey || !data.result?.trailer?.key) return;
    item.trailer = data.result.trailer;
    slot.innerHTML = trailerMarkup(item);
    bindTrailerPlayer(target,item);
  } catch {}
}

function ratingLabel(value) {
  return Number(value).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
}

function paintRatingStars(container, value) {
  container.querySelectorAll('.rating-star-fill').forEach((fill,index) => {
    const percent = Math.max(0,Math.min(100,(Number(value) - index) * 100));
    fill.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
  });
}

function renderRatingWidget(container, item, stats) {
  if (!container || !stats.eligible) { container?.remove(); return; }
  const displayRating = stats.myRating ?? stats.averageRating ?? 0;
  const stars = Array.from({length:5},(_,index) => `<span class="rating-star"><span class="rating-star-base" aria-hidden="true">★</span><span class="rating-star-fill" aria-hidden="true">★</span><button class="rating-half-hit left" type="button" data-rating="${index + 0.5}" aria-label="Avaliar ${ratingLabel(index + 0.5)} estrelas" title="${ratingLabel(index + 0.5)} estrelas"></button><button class="rating-half-hit right" type="button" data-rating="${index + 1}" aria-label="Avaliar ${ratingLabel(index + 1)} estrelas" title="${ratingLabel(index + 1)} estrelas"></button></span>`).join('');
  container.innerHTML = `<div class="title-rating-heading"><strong>Avalie este react</strong><small>Somente títulos com react no Patreon</small></div><div class="rating-stars" role="group" aria-label="Escolha uma nota de meia em meia estrela">${stars}</div><p class="rating-summary"></p><p class="rating-feedback" aria-live="polite"></p>`;
  const summary = container.querySelector('.rating-summary');
  const feedbackText = container.querySelector('.rating-feedback');
  const starButtons = [...container.querySelectorAll('[data-rating]')];
  const showSummary = value => {
    const average = stats.ratingCount ? `${ratingLabel(stats.averageRating)}/5, ${stats.ratingCount} avaliação(ões)` : 'ainda sem avaliações';
    summary.textContent = value ? `Sua nota: ${ratingLabel(value)} · média: ${average}` : `Média: ${average} · clique nas estrelas para avaliar`;
  };
  paintRatingStars(container,displayRating);
  showSummary(stats.myRating);
  starButtons.forEach(button => {
    button.addEventListener('mouseenter',() => paintRatingStars(container,Number(button.dataset.rating)));
    button.addEventListener('focus',() => paintRatingStars(container,Number(button.dataset.rating)));
    button.addEventListener('click',async () => {
      const rating = Number(button.dataset.rating);
      starButtons.forEach(item => { item.disabled = true; });
      feedbackText.textContent = 'Salvando sua avaliação…';
      try {
        stats = await window.CardapioRatings.rate(item,rating);
        paintRatingStars(container,stats.myRating || stats.averageRating);
        showSummary(stats.myRating);
        feedbackText.textContent = 'Sua avaliação foi registrada.';
      } catch (error) { feedbackText.textContent = error.message || 'Não foi possível registrar a avaliação.'; }
      finally { starButtons.forEach(item => { item.disabled = false; }); }
    });
  });
  container.querySelector('.rating-stars').addEventListener('mouseleave',() => paintRatingStars(container,stats.myRating ?? stats.averageRating ?? 0));
}

async function loadTitleRating(item, target) {
  const container = target.querySelector('[data-title-rating]');
  if (!container) return;
  try {
    await window.CardapioRatings?.ready;
    const stats = await window.CardapioRatings.get(item);
    renderRatingWidget(container,item,stats);
  } catch (error) { container.innerHTML = `<p class="rating-feedback">${safe(error.message || 'Não foi possível carregar as avaliações.')}</p>`; }
}

function bindExpandedFavorite(target, item) {
  target.querySelectorAll('[data-selected-favorite]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await window.CardapioFavorites.toggle(item); syncFavoriteButtons(item); }
    catch (error) { feedback.textContent = error.message || 'Não foi possível salvar o coração.'; }
    finally { button.disabled = false; }
  }));
}

function showTitle(item, resultButton) {
  selectedItem = item;
  const resultCard = resultButton?.closest('.search-result');
  if (resultCard) resultCard.insertAdjacentElement('afterend', selectedBox);
  selectedBox.classList.remove('hidden');
  selectedBox.innerHTML = titleDetailsMarkup(item);
  bindExpandedFavorite(selectedBox,item);
  bindRedemptionForm(selectedBox,item);
  bindTrailerPlayer(selectedBox,item);
  loadTitleTrailer(item,selectedBox);
  loadTitleRating(item,selectedBox);
}

async function refreshVisibleConsultation() {
  if (!selectedItem || selectedBox.classList.contains('hidden')) return false;
  try {
    const response = await fetchCatalogApi(`/api/catalog/title?type=${encodeURIComponent(selectedItem.mediaType)}&id=${encodeURIComponent(selectedItem.id)}`);
    if (!response.ok) return false;
    const data = await response.json();
    const latest = data.result;
    if (!latest?.reactUrl || selectedItem.reactUrl) return false;
    const key = `${latest.mediaType}:${latest.id}`;
    const refreshedResults = await search(input.value.trim());
    if (!Array.isArray(refreshedResults)) return false;
    const currentButton = [...resultBox.querySelectorAll('[data-result]')].find(button => button.dataset.key === key);
    const currentItem = refreshedResults.find(item => `${item.mediaType}:${item.id}` === key) || latest;
    showTitle(currentItem,currentButton);
    return true;
  } catch { return false; }
}

window.setInterval(async () => {
  if (document.visibilityState !== 'visible' || Date.now() - lastQueryActivity < 30000) return;
  const query = input.value.trim();
  if (query.length < 2) return;
  if (await refreshVisibleConsultation()) return;
  if (selectedBox.classList.contains('hidden')) search(query);
}, 120000);

function openCatalogTitle(item) {
  dialogItem = item;
  dialogTitleBox.innerHTML = titleDetailsMarkup(item);
  bindExpandedFavorite(dialogTitleBox,item);
  bindRedemptionForm(dialogTitleBox,item);
  bindTrailerPlayer(dialogTitleBox,item);
  loadTitleTrailer(item,dialogTitleBox);
  loadTitleRating(item,dialogTitleBox);
  if (!catalogTitleDialog.open) catalogTitleDialog.showModal();
}

window.openCatalogTitle = openCatalogTitle;
async function openRecentTitle(recentItem) {
  const mediaType = recentItem?.mediaType;
  const catalogId = Number(recentItem?.catalogId);
  let item = null;
  try {
    if (['movie','tv'].includes(mediaType) && Number.isSafeInteger(catalogId) && catalogId > 0) {
      const response = await fetchCatalogApi(`/api/catalog/title?type=${encodeURIComponent(mediaType)}&id=${catalogId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível abrir as informações do título.');
      item = data.result;
    } else if (['movie','tv'].includes(mediaType) && recentItem?.title) {
      const response = await fetchCatalogApi(`/api/catalog/search-tmdb?q=${encodeURIComponent(recentItem.title)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível localizar o título no catálogo.');
      const normalizedTitle = recentItem.title.toLocaleLowerCase('pt-BR');
      const matches = (data.results || []).filter(result => result.mediaType === mediaType);
      const exactMatches = matches.filter(result => String(result.title || '').toLocaleLowerCase('pt-BR') === normalizedTitle);
      const posterMatches = recentItem.posterUrl ? matches.filter(result => result.posterUrl === recentItem.posterUrl) : [];
      item = posterMatches.length === 1 ? posterMatches[0] : exactMatches.length === 1 ? exactMatches[0] : matches.length === 1 ? matches[0] : null;
      if (item) {
        const detailsResponse = await fetchCatalogApi(`/api/catalog/title?type=${encodeURIComponent(mediaType)}&id=${Number(item.id)}`);
        const detailsData = await detailsResponse.json();
        if (detailsResponse.ok) item = detailsData.result;
      }
    }
  } catch (error) {
    feedback.textContent = error.message || 'Não foi possível abrir as informações do título.';
    feedback.classList.add('is-visible');
    return false;
  }
  if (!item) return false;
  openCatalogTitle(item);
  return true;
}
window.CardapioCalculator = {bindRedemptionForm,openRecentTitle};
catalogTitleDialogClose.addEventListener('click', () => catalogTitleDialog.close());
catalogTitleDialog.addEventListener('click', event => {
  if (event.target === catalogTitleDialog) catalogTitleDialog.close();
});
catalogTitleDialog.addEventListener('close', () => dialogTitleBox.querySelectorAll('.title-trailer-frame iframe').forEach(player => player.remove()));

const manualEstimateTitle = document.querySelector('#manualEstimateTitle');
const manualEstimateHours = document.querySelector('#manualEstimateHours');
const manualEstimateMinutes = document.querySelector('#manualEstimateMinutes');
const manualEstimateType = document.querySelector('#manualEstimateType');
const manualEstimateLabel = document.querySelector('#manualEstimateLabel');
const manualEstimatePrice = document.querySelector('#manualEstimatePrice');
const manualRedemptionForm = document.querySelector('#manualRedemptionForm');
const manualEstimateDate = document.querySelector('#manualEstimateDate');
const manualEstimateTime = document.querySelector('#manualEstimateTime');
const manualRedemptionFeedback = document.querySelector('#manualRedemptionFeedback');

function updateManualEstimate() {
  const title = manualEstimateTitle.value.trim();
  const hours = manualEstimateHours.value === '' ? 0 : Number(manualEstimateHours.value);
  const minutes = manualEstimateMinutes.value === '' ? 0 : Number(manualEstimateMinutes.value);
  manualEstimatePrice.textContent = '—';
  if (!title) {
    manualEstimateLabel.textContent = 'Informe o título e a duração para calcular.';
    return;
  }
  if (!Number.isInteger(hours) || hours < 0 || hours > 999 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    manualEstimateLabel.textContent = 'Informe horas válidas e minutos entre 0 e 59.';
    return;
  }
  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes <= 0) {
    manualEstimateLabel.textContent = `Informe a duração de ${title} para calcular.`;
    return;
  }
  manualEstimateLabel.textContent = `Estimativa para ${title}`;
  manualEstimatePrice.textContent = money(estimatedPrice(totalMinutes));
}

[manualEstimateTitle,manualEstimateHours,manualEstimateMinutes].forEach(field => field.addEventListener('input',updateManualEstimate));

const manualToday = new Date();
manualEstimateDate.min = `${manualToday.getFullYear()}-${String(manualToday.getMonth()+1).padStart(2,'0')}-${String(manualToday.getDate()).padStart(2,'0')}`;
manualRedemptionForm.addEventListener('submit',async event => {
  event.preventDefault();
  if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para solicitar um resgate.')) return;
  if (!manualRedemptionForm.reportValidity()) return;
  const title = manualEstimateTitle.value.trim();
  const hours = manualEstimateHours.value === '' ? 0 : Number(manualEstimateHours.value);
  const minutes = manualEstimateMinutes.value === '' ? 0 : Number(manualEstimateMinutes.value);
  const durationMinutes = hours * 60 + minutes;
  if (!title || !Number.isInteger(hours) || hours < 0 || hours > 999 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59 || durationMinutes <= 0) {
    manualRedemptionFeedback.textContent = 'Informe um título e uma duração válida antes de continuar.';
    return;
  }
  const scheduledAt = new Date(`${manualEstimateDate.value}T${manualEstimateTime.value}:00`);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    manualRedemptionFeedback.textContent = 'Escolha uma data e um horário futuros.';
    return;
  }
  const submitButton = manualRedemptionForm.querySelector('[type="submit"]');
  const livepixTab = window.open('about:blank','_blank');
  if (livepixTab) {
    livepixTab.opener = null;
    livepixTab.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Abrindo LivePix</title><body style="margin:0;padding:32px;background:#100d14;color:#f4eafa;font:16px system-ui">Registrando o resgate e abrindo o LivePix…</body></html>');
    livepixTab.document.close();
  }
  submitButton.disabled = true;
  manualRedemptionFeedback.textContent = 'Registrando sua solicitação…';
  try {
    const response = await fetchCatalogApi('/api/redemptions',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({mediaType:manualEstimateType.value,manual:{title,durationMinutes},scheduledAt:scheduledAt.toISOString()})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível registrar o resgate.');
    window.dispatchEvent(new CustomEvent('cardapio:redemptions-updated'));
    if (livepixTab && !livepixTab.closed) {
      livepixTab.location.replace('https://livepix.gg/vimessias');
      manualRedemptionFeedback.textContent = 'Solicitação registrada. O LivePix foi aberto em outra guia.';
    } else {
      manualRedemptionFeedback.innerHTML = 'Solicitação registrada. <a href="https://livepix.gg/vimessias" target="_blank" rel="noopener noreferrer">Clique aqui para abrir o LivePix em outra guia</a>.';
    }
  } catch (error) {
    if (livepixTab && !livepixTab.closed) livepixTab.close();
    manualRedemptionFeedback.textContent = error.message || 'Não foi possível registrar o resgate.';
    submitButton.disabled = false;
  }
});
