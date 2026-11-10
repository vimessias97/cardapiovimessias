const calendarGrid = document.querySelector('#calendarGrid');
const calendarFeedback = document.querySelector('#calendarFeedback');
const calendarMonthLabel = document.querySelector('#calendarMonthLabel');
const calendarDayHeading = document.querySelector('#calendarDayHeading');
const calendarDayList = document.querySelector('#calendarDayList');
const calendarPrevious = document.querySelector('#calendarPrevious');
const calendarNext = document.querySelector('#calendarNext');
const calendarToday = document.querySelector('#calendarToday');
const calendarPageLink = document.querySelector('[data-page="calendario"]');
const calendarApiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
const calendarMonthFormatter = new Intl.DateTimeFormat('pt-BR', {month:'long',year:'numeric'});
const calendarDateFormatter = new Intl.DateTimeFormat('pt-BR', {day:'numeric',month:'long',year:'numeric'});
let calendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarSelectedDate = '';
let calendarMoviesByDate = new Map();
let calendarRequestId = 0;

function calendarEscape(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function calendarDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function fetchCalendarMonth(monthKey) {
  let lastError;
  for (let index = 0; index < calendarApiBases.length; index++) {
    try {
      const response = await fetch(`${calendarApiBases[index]}/api/catalog/calendar?month=${encodeURIComponent(monthKey)}`);
      if (response.status === 404 && index < calendarApiBases.length - 1) continue;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar este mês.');
      return data;
    } catch (error) {
      if (error instanceof TypeError && index < calendarApiBases.length - 1) { lastError = error; continue; }
      throw error;
    }
  }
  throw lastError || new Error('Não foi possível conectar ao servidor.');
}

function renderCalendarGrid() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const todayKey = calendarDateKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const cells = [];

  for (let index = 0; index < 42; index++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const inMonth = date.getMonth() === month;
    const key = calendarDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const movies = calendarMoviesByDate.get(key) || [];
    const previews = movies.slice(0, 2).map(movie => `<span class="calendar-cell-movie">${movie.posterUrl ? `<img src="${calendarEscape(movie.posterUrl.replace('/w500/', '/w92/'))}" alt="" loading="lazy">` : '<span class="calendar-cell-poster-placeholder" aria-hidden="true">✦</span>'}<span>${calendarEscape(movie.title)}</span></span>`).join('');
    const extra = movies.length > 2 ? `<span class="calendar-cell-more">+${movies.length - 2} filmes</span>` : '';
    const state = [!inMonth ? 'is-outside' : '', key === todayKey ? 'is-today' : '', key === calendarSelectedDate ? 'is-selected' : ''].filter(Boolean).join(' ');
    cells.push(`<button class="calendar-day-cell ${state}" type="button" data-calendar-date="${key}" ${inMonth ? '' : 'disabled'} aria-label="${calendarEscape(calendarDateFormatter.format(date))}${movies.length ? `, ${movies.length} estreia${movies.length === 1 ? '' : 's'}` : ', sem filmes listados'}" ${key === calendarSelectedDate ? 'aria-pressed="true"' : 'aria-pressed="false"'}><span class="calendar-day-number">${date.getDate()}</span>${previews}${extra}</button>`);
  }
  calendarGrid.innerHTML = cells.join('');
  calendarGrid.querySelectorAll('[data-calendar-date]').forEach(button => button.addEventListener('click', () => {
    calendarSelectedDate = button.dataset.calendarDate;
    renderCalendarGrid();
    renderCalendarDay();
    document.querySelector('.calendar-day-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

function renderCalendarDay() {
  if (!calendarSelectedDate) {
    calendarDayHeading.textContent = 'Selecione uma data';
    calendarDayList.innerHTML = '<p class="calendar-empty-day">Escolha um dia no calendário para ver os filmes previstos.</p>';
    return;
  }
  const date = new Date(`${calendarSelectedDate}T12:00:00`);
  const movies = calendarMoviesByDate.get(calendarSelectedDate) || [];
  calendarDayHeading.textContent = calendarDateFormatter.format(date);
  if (!movies.length) {
    calendarDayList.innerHTML = '<p class="calendar-empty-day">Nenhuma estreia de cinema cadastrada para esta data.</p>';
    return;
  }
  calendarDayList.innerHTML = movies.map((movie,index) => `<button type="button" class="calendar-movie-card" data-calendar-movie="${index}" aria-label="Ver detalhes de ${calendarEscape(movie.title)}">${movie.posterUrl ? `<img src="${calendarEscape(movie.posterUrl)}" alt="Pôster de ${calendarEscape(movie.title)}" loading="lazy">` : '<span class="calendar-movie-placeholder" aria-hidden="true">✦</span>'}<span class="calendar-movie-copy"><span class="calendar-movie-kind">ESTREIA DE CINEMA</span><strong>${calendarEscape(movie.title)}</strong><span class="calendar-movie-date">${calendarEscape(calendarDateFormatter.format(date))}</span><span class="calendar-movie-open">Ver detalhes e trailer ↗</span></span></button>`).join('');
  calendarDayList.querySelectorAll('[data-calendar-movie]').forEach(button => button.addEventListener('click',async () => {
    const movie = movies[Number(button.dataset.calendarMovie)];
    if (!movie || !window.CardapioFavorites?.getTitle || !window.openCatalogTitle) return;
    button.disabled = true;
    try { window.openCatalogTitle(await window.CardapioFavorites.getTitle({...movie,mediaType:'movie'})); }
    catch (error) { calendarFeedback.textContent = error.message || 'Não foi possível abrir os detalhes deste filme.'; }
    finally { button.disabled = false; }
  }));
}

async function loadCalendarMonth() {
  const requestId = ++calendarRequestId;
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  calendarMonthLabel.textContent = calendarMonthFormatter.format(calendarDate);
  calendarFeedback.textContent = 'Carregando estreias…';
  calendarMoviesByDate = new Map();
  renderCalendarGrid();
  renderCalendarDay();
  try {
    const data = await fetchCalendarMonth(monthKey);
    if (requestId !== calendarRequestId) return;
    calendarGrid.dataset.loadedMonth = monthKey;
    for (const movie of data.results || []) {
      const group = calendarMoviesByDate.get(movie.releaseDate) || [];
      group.push(movie);
      calendarMoviesByDate.set(movie.releaseDate, group);
    }
    for (const group of calendarMoviesByDate.values()) group.sort((left, right) => left.title.localeCompare(right.title, 'pt-BR'));
    const count = (data.results || []).length;
    calendarFeedback.textContent = count
      ? `${count} ${count === 1 ? 'filme previsto' : 'filmes previstos'} para estrear no Brasil neste mês.${data.hasMore ? ' Exibindo os primeiros resultados disponíveis.' : ''}`
      : 'Nenhuma estreia de cinema encontrada para este mês no TMDB.';
    if (!calendarSelectedDate || !calendarSelectedDate.startsWith(monthKey)) {
      const now = new Date();
      const todayKey = calendarDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const firstRelease = [...calendarMoviesByDate.keys()].sort()[0];
      calendarSelectedDate = monthKey === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` ? todayKey : firstRelease || `${monthKey}-01`;
    }
    renderCalendarGrid();
    renderCalendarDay();
  } catch (error) {
    if (requestId !== calendarRequestId) return;
    delete calendarGrid.dataset.loadedMonth;
    calendarFeedback.textContent = error.message || 'Não foi possível carregar as estreias. Tente novamente.';
    calendarSelectedDate = `${monthKey}-01`;
    renderCalendarGrid();
    renderCalendarDay();
  }
}

calendarPrevious.addEventListener('click', () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
  calendarSelectedDate = '';
  loadCalendarMonth();
});

calendarNext.addEventListener('click', () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
  calendarSelectedDate = '';
  loadCalendarMonth();
});

calendarToday.addEventListener('click', () => {
  calendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  calendarSelectedDate = '';
  loadCalendarMonth();
});

calendarPageLink.addEventListener('click', () => {
  if (!calendarGrid.dataset.loadedMonth || calendarGrid.dataset.loadedMonth !== `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}`) loadCalendarMonth();
});

if (location.hash === '#calendario') loadCalendarMonth();
