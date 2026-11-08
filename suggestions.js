const suggestionsGrid = document.querySelector('#suggestionsGrid');
const suggestionsFeedback = document.querySelector('#suggestionsFeedback');
const periodButtons = [...document.querySelectorAll('.trending-period')];
const suggestionsApiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
let activePeriod = 'day';
let requestId = 0;

function suggestionSafe(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function suggestionPrice(minutes) {
  return (Math.ceil(Number(minutes) / 30) * 5).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
}

function formatReleaseDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (![year, month, day].every(Number.isFinite) || !year || !month || !day) return 'Data não informada';
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

async function fetchSuggestionsApi(path) {
  let lastError;
  for (const base of suggestionsApiBases) {
    try {
      const response = await fetch(`${base}${path}`);
      if (response.status === 404 && base !== suggestionsApiBases.at(-1)) continue;
      return response;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Não foi possível conectar ao servidor local.');
}

periodButtons.forEach(button => button.addEventListener('click', () => {
  const period = button.dataset.period;
  if (!['day','week'].includes(period) || period === activePeriod) return;
  activePeriod = period;
  periodButtons.forEach(item => {
    const selected = item === button;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  loadSuggestions(period);
}));

async function loadSuggestions(period = activePeriod) {
  const thisRequest = ++requestId;
  suggestionsFeedback.textContent = 'Carregando tendências…';
  suggestionsGrid.innerHTML = '';
  try {
    const response = await fetchSuggestionsApi(`/api/catalog/suggestions?period=${period}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as sugestões.');
    if (thisRequest === requestId) renderSuggestions(data.results || []);
  } catch (error) {
    if (thisRequest === requestId) suggestionsFeedback.textContent = `${error.message || 'Falha ao consultar o TMDB.'} Verifique se o servidor e a conexão com o TMDB estão disponíveis.`;
  }
}

function renderSuggestions(items) {
  if (!items.length) {
    suggestionsFeedback.textContent = 'Nenhum título em alta com pôster e data de estreia disponíveis agora.';
    return;
  }
  suggestionsFeedback.textContent = '';
  suggestionsGrid.innerHTML = items.map((item, index) => {
    const hasDuration = Number(item.durationMinutes) > 0;
    const duration = hasDuration ? suggestionSafe(item.durationLabel || `${item.durationMinutes} min`) : 'Duração não informada';
    const price = hasDuration ? suggestionPrice(item.durationMinutes) : 'Indisponível';
    const reacted = item.reactUrl
      ? `<a class="suggestion-react" href="${suggestionSafe(item.reactUrl)}" target="_blank" rel="noopener noreferrer">Conteúdo já assistido · ver no Patreon ↗</a>`
      : `<div class="suggestion-price"><small>Estimativa</small><strong>${price}</strong></div>`;
    return `<article class="suggestion-card"><a class="suggestion-poster-link" href="${suggestionSafe(item.sourceUrl)}" target="_blank" rel="noreferrer" aria-label="Ver ${suggestionSafe(item.title)} no TMDB"><img class="suggestion-poster" src="${suggestionSafe(item.posterUrl)}" alt="Pôster de ${suggestionSafe(item.title)}" loading="lazy"></a><div class="suggestion-copy"><span class="suggestion-kind">${suggestionSafe(item.kind)}</span><h3 title="${suggestionSafe(item.title)}">${suggestionSafe(item.title)}</h3><p class="suggestion-date">Estreia · ${formatReleaseDate(item.releaseDate)}</p><p class="suggestion-duration">◷ ${duration}</p>${reacted}<button class="suggestion-consult" type="button" data-consult="${index}">Consultar título</button></div></article>`;
  }).join('');
  suggestionsGrid.querySelectorAll('[data-consult]').forEach(button => button.addEventListener('click', () => {
    const item = items[Number(button.dataset.consult)];
    const input = document.querySelector('#titleSearch');
    if (input) {
      input.value = item.title;
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.scrollIntoView({behavior:'smooth',block:'center'});
    }
  }));
}

loadSuggestions();
