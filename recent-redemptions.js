const recentRedemptionsList = document.querySelector('#recentRedemptionsList');
const allRecentRedemptionsList = document.querySelector('#allRecentRedemptionsList');
let recentRedemptionEntries = [];
const redemptionApiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];

function redemptionSafe(value = '') {
  return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function formatRedemptionDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function recentRedemptionMarkup(item,index,showAll = false) {
  const displayName = item.requester?.displayName || item.requester?.login || 'Usuário Twitch';
  const person = window.CardapioClubVime?.name(displayName,item.requester?.clubVime,item.requester?.clubVimeExpiresAt) || redemptionSafe(displayName);
  const requester = item.requester?.id ? `<button type="button" class="recent-redemption-requester-link" data-member-id="${redemptionSafe(item.requester.id)}">${person}</button>` : `<span class="recent-redemption-requester">${person}</span>`;
  const extraClass = !showAll && index >= 3 ? ' recent-redemption-extra hidden' : '';
  return `<article class="recent-redemption-item${extraClass}">${item.posterUrl ? `<button type="button" class="recent-redemption-poster-button" data-recent-title-index="${index}" aria-label="Ver informações e trailer de ${redemptionSafe(item.title)}"><img class="recent-redemption-poster" src="${redemptionSafe(item.posterUrl)}" alt="Pôster de ${redemptionSafe(item.title)}" loading="lazy"></button>` : '<span class="recent-redemption-poster recent-redemption-no-poster" aria-hidden="true">✦</span>'}<div class="recent-redemption-copy"><strong>${redemptionSafe(item.title)}</strong><small>${redemptionSafe(item.mediaType === 'tv' ? 'Série' : item.mediaType === 'other' ? 'Outro' : 'Filme')} · ${redemptionSafe(item.durationLabel || 'Duração não informada')}</small><span class="recent-redemption-requester">Resgatado por ${requester}</span><span class="recent-redemption-date-status">${redemptionSafe(formatRedemptionDate(item.scheduledAt))}</span></div></article>`;
}

function bindRecentRedemptionClicks(container) {
  container?.addEventListener('click',event => {
    const posterButton = event.target.closest('[data-recent-title-index]');
    if (posterButton) {
      const item = recentRedemptionEntries[Number(posterButton.dataset.recentTitleIndex)];
      if (item) window.CardapioCalculator?.openRecentTitle(item);
      return;
    }
    const button = event.target.closest('.recent-redemption-requester-link[data-member-id]');
    if (button) window.CardapioCommunityProfiles?.open(button.dataset.memberId);
  });
}

async function loadRecentRedemptions() {
  try {
    let response;
    for (let index = 0; index < redemptionApiBases.length; index++) {
      try {
        const candidate = await fetch(`${redemptionApiBases[index]}/api/redemptions/recent`,{cache:'no-store'});
        if (candidate.status === 404 && index < redemptionApiBases.length - 1) continue;
        response = candidate;
        break;
      } catch (error) { if (!(error instanceof TypeError)) throw error; }
    }
    if (!response) throw new Error('Não foi possível conectar ao servidor.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os últimos resgates.');
    recentRedemptionEntries = Array.isArray(data.redemptions) ? data.redemptions : [];
    const entries = recentRedemptionEntries;
    recentRedemptionsList.innerHTML = entries.length ? entries.slice(0,3).map((item,index) => recentRedemptionMarkup(item,index)).join('') : '<p class="rail-empty">Nenhum resgate aprovado ainda.</p>';
    renderAllRecentRedemptions();
  } catch (error) {
    const message = redemptionSafe(error.message || 'Não foi possível carregar os últimos resgates.');
    if (recentRedemptionsList) recentRedemptionsList.innerHTML = `<p class="rail-empty">${message}</p>`;
    if (allRecentRedemptionsList) allRecentRedemptionsList.innerHTML = `<p class="community-ranking-empty">${message}</p>`;
  }
}

function renderAllRecentRedemptions() {
  if (!allRecentRedemptionsList) return;
  allRecentRedemptionsList.innerHTML = recentRedemptionEntries.length
    ? recentRedemptionEntries.map((item,index) => recentRedemptionMarkup(item,index,true)).join('')
    : '<p class="community-ranking-empty">Nenhum resgate aprovado ainda.</p>';
}

async function loadAllRecentRedemptions() {
  if (!recentRedemptionEntries.length) await loadRecentRedemptions();
  else renderAllRecentRedemptions();
}

bindRecentRedemptionClicks(recentRedemptionsList);
bindRecentRedemptionClicks(allRecentRedemptionsList);
window.CardapioRecentRedemptions = {loadAll:loadAllRecentRedemptions,refresh:loadRecentRedemptions};
loadRecentRedemptions();
window.addEventListener('cardapio:redemptions-updated',loadRecentRedemptions);
document.addEventListener('visibilitychange',() => { if (!document.hidden) loadRecentRedemptions(); });
window.setInterval(() => { if (!document.hidden) loadRecentRedemptions(); },60000);
