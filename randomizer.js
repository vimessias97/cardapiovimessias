const randomPage = document.querySelector('#sorteador');
const homePage = document.querySelector('#inicio');
const randomizeButton = document.querySelector('#randomizeButton');
const randomFeedback = document.querySelector('#randomizerFeedback');
const randomResult = document.querySelector('#randomResult');
const suggestionsPage = document.querySelector('#sugestoes');
const gamesPage = document.querySelector('#jogos');
const forumPage = document.querySelector('#forum');
const promotionsPage = document.querySelector('#promocoes');
const shopPage = document.querySelector('#lojinha');
const calendarPage = document.querySelector('#calendario');
const profileFavoritesPage = document.querySelector('#favoritos');
const profileRedemptionsPage = document.querySelector('#resgatados');
const adminPage = document.querySelector('#admin');
const communityProfilePage = document.querySelector('#perfil');
const communityListsPage = document.querySelector('#listas');
const communityRankingPage = document.querySelector('#ranking');
const randomTypeButtons = [...document.querySelectorAll('.random-type')];
const genreOptions = document.querySelector('#genreOptions');
const pageButtons = [...document.querySelectorAll('[data-page]')];
const randomApiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
let selectedType = 'movie';
let selectedGenre = 'all';
let genreRequestId = 0;

function randomSafe(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function randomMoney(minutes) {
  const value = Math.ceil(Number(minutes) / 30) * 5;
  return value.toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
}

async function fetchRandomApi(path) {
  let lastError;
  for (let index = 0; index < randomApiBases.length; index++) {
    try {
      const response = await fetch(`${randomApiBases[index]}${path}`);
      if (response.status === 404 && index < randomApiBases.length - 1) continue;
      return response;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Não foi possível conectar ao servidor local.');
}

function showPage(view, link = null, updateHistory = true, profileId = '', listId = '', rankingCategory = '') {
  if (!['home','sorteador','sugestoes','jogos','forum','promocoes','lojinha','calendario','listas','favoritos','resgatados','admin','perfil','ranking'].includes(view)) return;
  homePage.classList.toggle('hidden', view !== 'home');
  randomPage.classList.toggle('hidden', view !== 'sorteador');
  suggestionsPage.classList.toggle('hidden', view !== 'sugestoes');
  gamesPage.classList.toggle('hidden', view !== 'jogos');
  forumPage.classList.toggle('hidden', view !== 'forum');
  promotionsPage.classList.toggle('hidden', view !== 'promocoes');
  shopPage.classList.toggle('hidden', view !== 'lojinha');
  calendarPage.classList.toggle('hidden', view !== 'calendario');
  profileFavoritesPage.classList.toggle('hidden', view !== 'favoritos');
  profileRedemptionsPage.classList.toggle('hidden', view !== 'resgatados');
  adminPage.classList.toggle('hidden', view !== 'admin');
  communityProfilePage.classList.toggle('hidden', view !== 'perfil');
  communityListsPage.classList.toggle('hidden', view !== 'listas');
  communityRankingPage.classList.toggle('hidden', view !== 'ranking');
  pageButtons.forEach(item => item.classList.toggle('selected', item === link || (!link && item.dataset.page === view)));
  if (updateHistory) {
    const target = view === 'home' ? 'inicio' : view === 'perfil' ? `perfil/${encodeURIComponent(profileId || window.CardapioCommunityProfiles?.getCurrentId?.() || '')}` : view === 'listas' && listId ? `listas/${encodeURIComponent(listId)}` : view === 'ranking' ? `ranking/${encodeURIComponent(rankingCategory || 'vicoins')}` : view;
    history.replaceState(null, '', `#${target}`);
  }
  if (view === 'sugestoes') window.CardapioFavorites?.refresh();
  if (view === 'favoritos') window.CardapioUserProfile?.loadFavorites();
  if (view === 'resgatados') window.CardapioUserProfile?.loadRedemptions();
  if (view === 'admin') window.CardapioAdminRedemptions?.load();
  if (view === 'admin') window.CardapioAdminVicoins?.load();
  if (view === 'admin') window.CardapioAdminGameKeys?.load();
  if (view === 'admin') window.CardapioAdminShopBanners?.load();
  if (view === 'lojinha') window.CardapioVicoinsShop?.load();
  if (view === 'forum') window.CardapioForum?.load();
  if (view === 'listas') listId ? window.CardapioLists?.open(listId) : window.CardapioLists?.load();
  if (view === 'ranking') window.CardapioCommunityRankings?.show(rankingCategory || 'vicoins');
  window.scrollTo({top:0,behavior:'smooth'});
}
window.CardapioNavigation = {showPage};

pageButtons.forEach(link => link.addEventListener('click', event => {
  const view = link.dataset.page;
  if (!['home','sorteador','sugestoes','jogos','forum','promocoes','lojinha','calendario','listas','favoritos','resgatados','admin','perfil'].includes(view)) return;
  event.preventDefault();
  if (['favoritos','resgatados'].includes(view) && !window.CardapioAuth?.requireLogin()) return;
  if (view === 'admin' && !window.CardapioAuth?.isAdmin()) {
    window.CardapioAuth?.requireLogin('O painel administrativo é exclusivo da conta administradora.');
    return;
  }
  showPage(view,link);
}));

document.addEventListener('click',event => {
  const categoryLink = event.target.closest('[data-ranking-category]');
  if (categoryLink) {
    event.preventDefault();
    showPage('ranking',null,true,'','',categoryLink.dataset.rankingCategory);
    return;
  }
  if (event.target.closest('[data-ranking-back]')) { showPage('home'); }
});

randomTypeButtons.forEach(button => button.addEventListener('click', () => {
  selectedType = button.dataset.type;
  selectedGenre = 'all';
  randomTypeButtons.forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  loadGenres();
}));

async function loadGenres() {
  const thisRequest = ++genreRequestId;
  genreOptions.innerHTML = '<span class="genre-loading">Carregando gêneros…</span>';
  try {
    const response = await fetchRandomApi(`/api/catalog/genres?type=${selectedType}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os gêneros.');
    if (thisRequest === genreRequestId) renderGenres(data.genres || []);
  } catch {
    if (thisRequest === genreRequestId) renderGenres([], 'Gêneros indisponíveis; você ainda pode sortear em Geral.');
  }
}

function renderGenres(genres, message = '') {
  const options = [{id:'all',name:'Geral (todos os gêneros)'}, ...genres];
  genreOptions.innerHTML = `${message ? `<span class="genre-loading">${randomSafe(message)}</span>` : ''}${options.map(genre => `<button type="button" class="genre-chip${String(genre.id) === selectedGenre ? ' active' : ''}" data-genre="${randomSafe(genre.id)}" aria-pressed="${String(genre.id) === selectedGenre}">${randomSafe(genre.name)}</button>`).join('')}`;
  genreOptions.querySelectorAll('[data-genre]').forEach(button => button.addEventListener('click', () => {
    selectedGenre = button.dataset.genre;
    genreOptions.querySelectorAll('[data-genre]').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
  }));
}

randomizeButton.addEventListener('click', async () => {
  randomizeButton.disabled = true;
  randomFeedback.textContent = 'Sorteando um título…';
  randomResult.classList.add('hidden');
  randomResult.innerHTML = '';
  try {
    const response = await fetchRandomApi(`/api/catalog/random?type=${selectedType}&genre=${encodeURIComponent(selectedGenre)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível sortear um título.');
    renderRandomTitle(data.result);
    randomFeedback.textContent = 'Sugestão aleatória do TMDB';
  } catch (error) {
    randomFeedback.textContent = error.message || 'Não foi possível sortear agora. Tente novamente.';
  } finally { randomizeButton.disabled = false; }
});

function randomRedemptionMarkup(item) {
  if (item.reactUrl) return '';
  return `<form class="redemption-request-form random-redemption-form" data-redemption-form><div class="redemption-form-heading"><strong>Agende o resgate</strong><span>Informe a data e o horário desejados.</span></div><div class="redemption-schedule-fields"><label>Dia / mês / ano<input type="date" name="date" required></label><label>Horário<input type="text" name="time" inputmode="numeric" autocomplete="off" maxlength="5" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" placeholder="HH:MM" title="Digite a hora no formato 24 horas, como 20:30" required></label></div><p class="redemption-request-feedback" aria-live="polite">O pedido ficará pendente de aprovação. O pagamento é concluído no LivePix.</p><button class="redemption-link" type="submit">Resgate pelo LivePix <span aria-hidden="true">↗</span></button></form>`;
}

function renderRandomTitle(item) {
  if (!item) throw new Error('O sorteio não retornou um título. Tente novamente.');
  const minutes = Number(item.durationMinutes);
  const hasDuration = Number.isFinite(minutes) && minutes > 0;
  const duration = hasDuration ? (item.durationLabel || `${minutes} min`) : 'Não informada';
  const estimate = item.reactUrl
    ? `<a class="random-react-link" href="${randomSafe(item.reactUrl)}" target="_blank" rel="noopener noreferrer">Conteúdo já assistido, veja no Patreon ↗</a>`
    : `<div class="random-estimate"><span>Estimativa informativa</span><strong>${hasDuration ? randomMoney(minutes) : 'Duração indisponível'}</strong><small>${hasDuration ? `R$ 5 por bloco iniciado de 30 minutos${item.mediaType === 'tv' ? ' · total aproximado da série' : ''}. Sem pagamento pelo site.` : 'Não foi possível calcular sem duração cadastrada.'}</small></div>`;
  const genres = Array.isArray(item.genres) && item.genres.length ? `${item.genres.map(randomSafe).join(' · ')} · ` : '';
  randomResult.innerHTML = `${item.posterUrl ? `<img class="random-poster" src="${randomSafe(item.posterUrl)}" alt="Pôster de ${randomSafe(item.title)}">` : '<div class="random-poster random-no-poster" aria-hidden="true">✦</div>'}<div class="random-result-copy"><span class="random-kind">${randomSafe(item.kind)}</span><h2>${randomSafe(item.title)}</h2><p class="random-meta">${item.year || 'Ano não informado'} · ${genres}Duração: ${randomSafe(duration)}</p><p class="random-synopsis">${randomSafe(item.overview || 'Sinopse não informada.')}</p>${estimate}${randomRedemptionMarkup(item)}<a class="random-source-link" href="${randomSafe(item.sourceUrl)}" target="_blank" rel="noreferrer">Ver no TMDB ↗</a></div>`;
  randomResult.classList.remove('hidden');
  window.CardapioCalculator?.bindRedemptionForm(randomResult,item);
}

loadGenres();

if (location.hash === '#sorteador') {
  homePage.classList.add('hidden');
  randomPage.classList.remove('hidden');
  pageButtons.forEach(item => item.classList.toggle('selected', item.dataset.page === 'sorteador'));
} else if (location.hash === '#sugestoes') {
  homePage.classList.add('hidden');
  suggestionsPage.classList.remove('hidden');
  pageButtons.forEach(item => item.classList.toggle('selected', item.dataset.page === 'sugestoes'));
} else if (location.hash === '#jogos') {
  homePage.classList.add('hidden');
  gamesPage.classList.remove('hidden');
  pageButtons.forEach(item => item.classList.toggle('selected', item.dataset.page === 'jogos'));
} else if (location.hash === '#forum') {
  showPage('forum',null,false);
} else if (location.hash === '#lojinha') {
  showPage('lojinha',null,false);
} else if (location.hash === '#calendario') {
  showPage('calendario',null,false);
} else if (location.hash === '#listas') {
  showPage('listas',null,false);
} else if (location.hash.startsWith('#ranking/')) {
  let category = '';
  try { category = decodeURIComponent(location.hash.slice('#ranking/'.length)); } catch {}
  showPage('ranking',null,false,'','',category);
} else if (location.hash.startsWith('#listas/')) {
  let listId = '';
  try { listId = decodeURIComponent(location.hash.slice('#listas/'.length)); } catch {}
  if (listId) showPage('listas',null,false,'',listId);
} else if (location.hash === '#favoritos') {
  showPage('favoritos',null,false);
} else if (location.hash === '#resgatados') {
  showPage('resgatados',null,false);
} else if (location.hash === '#admin') {
  showPage('admin',null,false);
} else if (location.hash.startsWith('#perfil/')) {
  let profileId = '';
  try { profileId = decodeURIComponent(location.hash.slice('#perfil/'.length)); } catch {}
  if (profileId) {
    showPage('perfil',null,false,profileId);
    window.CardapioCommunityProfiles?.open(profileId,{updateHistory:false});
  }
}
