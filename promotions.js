const promotionCollections = document.querySelector('#promotionCollections');
const promotionApiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
const promotionOffers = [
  {id:'lotr',name:'Trilogia O Senhor dos Anéis',discountPercent:30,titles:[{id:120,mediaType:'movie'},{id:121,mediaType:'movie'},{id:122,mediaType:'movie'}]},
  {id:'hobbit',name:'Trilogia O Hobbit',discountPercent:30,titles:[{id:49051,mediaType:'movie'},{id:57158,mediaType:'movie'},{id:122917,mediaType:'movie'}]},
  {id:'harry-potter',name:'Coleção completa Harry Potter',discountPercent:30,titles:[{id:671,mediaType:'movie'},{id:672,mediaType:'movie'},{id:673,mediaType:'movie'},{id:674,mediaType:'movie'},{id:675,mediaType:'movie'},{id:767,mediaType:'movie'},{id:12444,mediaType:'movie'},{id:12445,mediaType:'movie'}]}
];

function promotionSafe(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function promotionMoney(value) {
  return Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function getPromotionPrice(minutes) {
  return Math.ceil(Number(minutes) / 30) * 5;
}

function promotionShell(offer) {
  const id = promotionSafe(offer.id);
  const name = promotionSafe(offer.name);
  return `<section class="promotion-collection" aria-labelledby="${id}PromotionHeading"><div class="promotion-collection-head"><div><span class="promotion-kicker">COLEÇÃO COMPLETA</span><h2 id="${id}PromotionHeading">${name}</h2><p>Resgate os ${offer.titles.length} filmes juntos e ganhe ${offer.discountPercent}% de desconto sobre a estimativa individual.</p></div><span class="promotion-discount">${offer.discountPercent}% OFF</span></div><p class="promotion-feedback" id="${id}PromotionFeedback" aria-live="polite">Carregando detalhes e duração dos filmes…</p><div class="promotion-titles" id="${id}PromotionTitles"></div><div class="promotion-summary hidden" id="${id}PromotionSummary"></div><a class="promotion-redemption hidden" id="${id}PromotionRedeem" href="https://livepix.gg/vimessias" target="_blank" rel="noopener noreferrer">Consultar resgate pelo LivePix <span aria-hidden="true">↗</span></a><p class="promotion-note">Estimativa informativa baseada na duração do TMDB. O site não processa pagamentos; confirme o pacote e o valor promocional ao resgatar pelo LivePix.</p></section>`;
}

async function getPromotionTitle(item) {
  const path = `/api/catalog/title?type=${encodeURIComponent(item.mediaType)}&id=${encodeURIComponent(item.id)}`;
  let response;
  for (let index = 0; index < promotionApiBases.length; index++) {
    try {
      const candidate = await fetch(`${promotionApiBases[index]}${path}`,{cache:'no-store'});
      if (candidate.status === 404 && index < promotionApiBases.length - 1) continue;
      response = candidate;
      break;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
  }
  if (!response) throw new Error('Não conectou ao servidor local. Abra o site por http://localhost:3002 ou http://localhost:3000 com o servidor Node ligado.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os detalhes da coleção.');
  return data.result;
}

function renderPromotionTitle(item) {
  const hasDuration = Number(item.durationMinutes) > 0;
  const reacted = Boolean(item.reactUrl);
  const price = hasDuration && !reacted ? getPromotionPrice(item.durationMinutes) : null;
  const availability = reacted ? `<a class="promotion-title-status is-reacted" href="${promotionSafe(item.reactUrl)}" target="_blank" rel="noopener noreferrer">React disponível no Patreon ↗</a>` : price !== null ? `<strong class="promotion-title-price">${promotionMoney(price)} <small>estimativa</small></strong>` : '<span class="promotion-title-status">Duração indisponível</span>';
  return `<article class="promotion-title-card">${item.posterUrl ? `<img class="promotion-poster" src="${promotionSafe(item.posterUrl)}" alt="Pôster de ${promotionSafe(item.title)}" loading="lazy">` : '<div class="promotion-poster promotion-no-poster" aria-hidden="true">✦</div>'}<div class="promotion-title-copy"><span class="promotion-title-kind">${promotionSafe(item.kind || 'Filme')} · ${promotionSafe(item.year || 'Ano não informado')}</span><h3>${promotionSafe(item.title)}</h3><p>◷ ${promotionSafe(item.durationLabel || 'Duração não informada')}</p>${availability}</div></article>`;
}

async function loadPromotion(offer) {
  const feedback = document.querySelector(`#${offer.id}PromotionFeedback`);
  const titlesContainer = document.querySelector(`#${offer.id}PromotionTitles`);
  const summary = document.querySelector(`#${offer.id}PromotionSummary`);
  const redeem = document.querySelector(`#${offer.id}PromotionRedeem`);
  try {
    const titles = await Promise.all(offer.titles.map(getPromotionTitle));
    titlesContainer.innerHTML = titles.map(renderPromotionTitle).join('');
    const eligible = titles.every(item => !item.reactUrl && Number(item.durationMinutes) > 0);
    if (!eligible) {
      const available = titles.filter(item => !item.reactUrl && Number(item.durationMinutes) > 0).length;
      feedback.textContent = `A promoção de coleção completa depende de todos os filmes estarem disponíveis para resgate. ${available} de ${titles.length} têm estimativa calculável no momento.`;
      return;
    }
    const subtotal = titles.reduce((sum,item) => sum + getPromotionPrice(item.durationMinutes),0);
    const savings = Math.round(subtotal * offer.discountPercent) / 100;
    const discountedTotal = Math.round((subtotal - savings) * 100) / 100;
    feedback.textContent = 'Promoção válida ao resgatar a coleção completa.';
    summary.innerHTML = `<div><span>Estimativa dos ${titles.length} filmes</span><strong>${promotionMoney(subtotal)}</strong></div><div><span>Desconto da coleção (${offer.discountPercent}%)</span><strong>− ${promotionMoney(savings)}</strong></div><div class="promotion-total"><span>Estimativa promocional</span><strong>${promotionMoney(discountedTotal)}</strong></div>`;
    summary.classList.remove('hidden');
    redeem.classList.remove('hidden');
  } catch (error) {
    feedback.textContent = error.message || 'Não foi possível carregar a promoção agora.';
  }
}

promotionCollections.innerHTML = promotionOffers.map(promotionShell).join('');
promotionOffers.forEach(loadPromotion);
