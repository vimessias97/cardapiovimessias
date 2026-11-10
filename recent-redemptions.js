const recentRedemptionsList = document.querySelector('#recentRedemptionsList');
const recentRedemptionsMore = document.querySelector('#recentRedemptionsMore');
let recentRedemptionsExpanded = false;
const redemptionApiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];

function redemptionSafe(value = '') {
  return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function formatRedemptionDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data não informada'
    : date.toLocaleString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
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
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
    if (!response) throw new Error('Não foi possível conectar ao servidor.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os últimos resgates.');
    const entries = Array.isArray(data.redemptions) ? data.redemptions : [];
    if (!entries.length) {
      recentRedemptionsList.innerHTML = '<p class="rail-empty">Nenhum resgate aprovado ainda.</p>';
      recentRedemptionsMore?.classList.add('hidden');
      return;
    }
    recentRedemptionsExpanded = false;
    recentRedemptionsList.innerHTML = entries.map((item,index) => {
      const person = redemptionSafe(item.requester?.displayName || item.requester?.login || 'Usuário Twitch');
      const requester = item.requester?.id ? `<button type="button" class="recent-redemption-requester-link" data-member-id="${redemptionSafe(item.requester.id)}">${person}</button>` : `<span class="recent-redemption-requester">${person}</span>`;
      return `<article class="recent-redemption-item${index >= 3 ? ' recent-redemption-extra hidden' : ''}">${item.posterUrl ? `<img class="recent-redemption-poster" src="${redemptionSafe(item.posterUrl)}" alt="Pôster de ${redemptionSafe(item.title)}" loading="lazy">` : '<span class="recent-redemption-poster recent-redemption-no-poster" aria-hidden="true">✦</span>'}<div class="recent-redemption-copy"><strong>${redemptionSafe(item.title)}</strong><small>${redemptionSafe(item.mediaType === 'tv' ? 'Série' : item.mediaType === 'other' ? 'Outro' : 'Filme')} · ${redemptionSafe(item.durationLabel || 'Duração não informada')}</small><span class="recent-redemption-requester">Resgatado por ${requester}</span><span class="recent-redemption-date-status">${redemptionSafe(formatRedemptionDate(item.scheduledAt))}</span></div></article>`;
    }).join('');
    recentRedemptionsMore?.classList.toggle('hidden',entries.length <= 3);
    if (recentRedemptionsMore) recentRedemptionsMore.textContent = 'Ver mais';
  } catch (error) {
    recentRedemptionsList.innerHTML = `<p class="rail-empty">${redemptionSafe(error.message || 'Não foi possível carregar os últimos resgates.')}</p>`;
  }
}

loadRecentRedemptions();
recentRedemptionsMore?.addEventListener('click',() => {
  recentRedemptionsExpanded = !recentRedemptionsExpanded;
  recentRedemptionsList.querySelectorAll('.recent-redemption-extra').forEach(item => item.classList.toggle('hidden',!recentRedemptionsExpanded));
  recentRedemptionsMore.textContent = recentRedemptionsExpanded ? 'Ver menos' : 'Ver mais';
});
recentRedemptionsList.addEventListener('click',event => {
  const button = event.target.closest('.recent-redemption-requester-link[data-member-id]');
  if (button) window.CardapioCommunityProfiles?.open(button.dataset.memberId);
});
window.addEventListener('cardapio:redemptions-updated',loadRecentRedemptions);
document.addEventListener('visibilitychange',() => { if (!document.hidden) loadRecentRedemptions(); });
window.setInterval(() => { if (!document.hidden) loadRecentRedemptions(); },60000);
