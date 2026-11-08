const reactWeekList = document.querySelector('#reactWeekList');
const reactWeekApiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];

function reactWeekSafe(value = '') {
  return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function reactWeekDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function reactWeekDateLabel(date,index) {
  const weekday = new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(date).replace('.','');
  const dayMonth = new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(date);
  return `${index === 0 ? 'Hoje · ' : ''}${weekday}, ${dayMonth}`;
}

function reactWeekTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--:--' : new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(date);
}

async function loadReactWeek() {
  if (!reactWeekList) return;
  const start = new Date();
  start.setHours(0,0,0,0);
  const days = Array.from({length:7},(_,index) => {
    const date = new Date(start);
    date.setDate(start.getDate()+index);
    return date;
  });
  const end = new Date(start);
  end.setDate(start.getDate()+7);
  const path = `/api/redemptions/week?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`;
  try {
    let response;
    for (let index = 0; index < reactWeekApiBases.length; index++) {
      try {
        const candidate = await fetch(`${reactWeekApiBases[index]}${path}`,{cache:'no-store'});
        if (candidate.status === 404 && index < reactWeekApiBases.length-1) continue;
        response = candidate;
        break;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
    if (!response) throw new Error('Não foi possível conectar ao servidor.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a agenda.');
    const entries = Array.isArray(data.redemptions) ? data.redemptions : [];
    const entriesByDate = new Map();
    for (const entry of entries) {
      const date = new Date(entry.scheduledAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = reactWeekDateKey(date);
      if (!entriesByDate.has(key)) entriesByDate.set(key,[]);
      entriesByDate.get(key).push(entry);
    }
    reactWeekList.innerHTML = days.map((date,index) => {
      const dayEntries = entriesByDate.get(reactWeekDateKey(date)) || [];
      const eventMarkup = dayEntries.length
        ? dayEntries.map(entry => `<div class="react-week-event"><span title="${reactWeekSafe(entry.title)}">${reactWeekSafe(entry.title)}</span><time>${reactWeekTime(entry.scheduledAt)}</time></div>`).join('')
        : '<span class="react-week-empty-day">Sem react agendado</span>';
      return `<div class="react-week-day${index === 0 ? ' is-today' : ''}"><span class="react-week-date">${reactWeekSafe(reactWeekDateLabel(date,index))}</span><div class="react-week-events">${eventMarkup}</div></div>`;
    }).join('');
  } catch (error) {
    reactWeekList.innerHTML = `<p class="rail-empty">${reactWeekSafe(error.message || 'Não foi possível carregar a agenda.')}</p>`;
  }
}

loadReactWeek();
window.addEventListener('cardapio:redemptions-updated',loadReactWeek);
document.addEventListener('visibilitychange',() => { if (!document.hidden) loadReactWeek(); });
window.setInterval(() => { if (!document.hidden) loadReactWeek(); },60000);
