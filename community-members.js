(() => {
  const list = document.querySelector('#communityMembersList');
  const vicoinsRankingList = document.querySelector('#communityVicoinsRankList');
  const redeemersRankingList = document.querySelector('#communityRedeemersRankList');
  const dialog = document.querySelector('#communityMemberDialog');
  const close = document.querySelector('#communityMemberClose');
  const avatar = document.querySelector('#communityMemberAvatar');
  const name = document.querySelector('#communityMemberName');
  const profileBadges = document.querySelector('#communityMemberBadges');
  const feedback = document.querySelector('#communityMemberFeedback');
  const redemptions = document.querySelector('#communityMemberRedemptions');
  const favorites = document.querySelector('#communityMemberFavorites');
  const ratedTitles = document.querySelector('#communityMemberRatings');
  const achievementsRoot = document.querySelector('#communityAchievementList');
  const sidebarVicoinsCount = document.querySelector('#sidebarVicoinsCount');
  const shopVicoinsCount = document.querySelector('#shopVicoinsCount');
  const dialogVicoinsCount = document.querySelector('#communityMemberVicoinsCount');
  const sidebarVicoinsLink = document.querySelector('#sidebarVicoinsLink');
  const dialogVicoinsLink = document.querySelector('#communityMemberVicoinsLink');
  const sidebarProfileButton = document.querySelector('#sidebarUserOpenProfile');
  const dialogHead = document.querySelector('.community-member-dialog-head');
  const profileBannerImages = {'vimessias':'/assets/profile-banners/vimessias-1600x240.png?v=1'};
  const bases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  function setVicoins(value,dialogOnly = false,infinite = false) {
    const balance = Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
    const counters = dialogOnly ? [dialogVicoinsCount] : [sidebarVicoinsCount,shopVicoinsCount];
    const links = dialogOnly ? [dialogVicoinsLink] : [sidebarVicoinsLink];
    const label = infinite ? '∞' : balance.toLocaleString('pt-BR');
    for (const counter of counters) if (counter) counter.textContent = label;
    for (const link of links) if (link) link.setAttribute('aria-label',`${infinite ? 'Vicoins ilimitados' : `Vicoins: ${balance.toLocaleString('pt-BR')}`}. Abrir lojinha`);
    return balance;
  }

  function setProfileBanner(banner) {
    const suppliedUrl = String(banner?.imageUrl || '');
    const imageUrl = profileBannerImages[banner?.id] || (/^\/api\/profile-banners\/[a-f0-9-]{36}\.(?:png|jpg)$/i.test(suppliedUrl) ? suppliedUrl : '');
    if (!imageUrl) {
      dialogHead.classList.remove('has-profile-banner');
      dialogHead.style.removeProperty('--community-profile-banner');
      return;
    }
    dialogHead.style.setProperty('--community-profile-banner',`url("${imageUrl}")`);
    dialogHead.classList.add('has-profile-banner');
  }

  function renderProfileBadges(badges = []) {
    const items = Array.isArray(badges) ? badges : [];
    profileBadges.hidden = !items.length;
    profileBadges.innerHTML = items.map(badge => `<span class="community-profile-badge" role="img" tabindex="0" title="${safe(badge.name)}" aria-label="Insígnia: ${safe(badge.name)}" data-badge-name="${safe(badge.name)}">${safe(badge.symbol)}</span>`).join('');
  }

  function renderAchievements(achievements = {}) {
    const favoriteCount = Math.max(0,Number(achievements.favorites) || 0);
    const ratingCount = Math.max(0,Number(achievements.ratings) || 0);
    const redemptionCount = Math.max(0,Number(achievements.redemptions) || 0);
    const rows = [
      {id:'heart',icon:'♥',name:'Coração',value:favoriteCount,label:'favoritos'},
      {id:'star',icon:'★',name:'Estrela',value:ratingCount,label:'avaliações'},
      {id:'clapper',icon:'🎬',name:'Claquete',value:redemptionCount,label:'resgates'}
    ];
    achievementsRoot.innerHTML = rows.map(item => {
      const unlocked = item.value > 0;
      const description = `${item.value} ${item.label}`;
      const badgeCount = item.value;
      return `<article class="community-achievement${unlocked ? ' is-unlocked' : ''}" aria-label="${safe(item.name)}: ${safe(description)}"><span class="community-achievement-icon" aria-hidden="true"><span>${item.icon}</span><small>${badgeCount}</small></span><span class="community-achievement-copy"><strong>${safe(item.name)}</strong><span>${safe(description)}</span></span></article>`;
    }).join('');
  }

  async function api(path) {
    let lastError;
    for (const base of bases) {
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin'});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o perfil.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function renderTitles(container,items,emptyText,showDate = false) {
    if (!items.length) {
      container.innerHTML = `<p class="community-members-empty">${safe(emptyText)}</p>`;
      updateCarouselControls(container);
      return;
    }
    container.innerHTML = items.map(item => `<article class="community-member-title-card">${item.posterUrl ? `<img src="${safe(item.posterUrl)}" alt="Pôster de ${safe(item.title)}" loading="lazy">` : '<span class="community-member-title-poster" aria-hidden="true">✦</span>'}<div class="community-member-title-copy"><strong>${safe(item.title)}</strong><small>${safe(item.mediaType === 'tv' ? 'Série' : item.mediaType === 'other' ? 'Outro' : 'Filme')}${item.durationLabel ? ` · ${safe(item.durationLabel)}` : ''}</small>${showDate && item.scheduledAt ? `<small>Agendado: ${safe(new Date(item.scheduledAt).toLocaleDateString('pt-BR'))}</small>` : ''}</div></article>`).join('');
    requestAnimationFrame(() => updateCarouselControls(container));
  }

  function renderRatedTitles(items = []) {
    if (!items.length) {
      ratedTitles.innerHTML = '<p class="community-members-empty">Ainda não há filmes ou séries avaliados.</p>';
      updateCarouselControls(ratedTitles);
      return;
    }
    ratedTitles.innerHTML = items.map(item => {
      const rating = Math.max(0,Math.min(5,Number(item.rating) || 0));
      const stars = Array.from({length:5},(_,index) => {
        const value = index + 1;
        const state = rating >= value ? 'is-full' : rating >= value - .5 ? 'is-half' : 'is-empty';
        return `<span class="community-rating-star ${state}" aria-hidden="true">★</span>`;
      }).join('');
      return `<article class="community-member-title-card community-rated-title-card">${item.posterUrl ? `<img src="${safe(item.posterUrl)}" alt="Pôster de ${safe(item.title)}" loading="lazy">` : '<span class="community-member-title-poster" aria-hidden="true">✦</span>'}<div class="community-member-title-copy"><strong>${safe(item.title)}</strong><small>${safe(item.mediaType === 'tv' ? 'Série' : 'Filme')}</small><span class="community-rating-stars" aria-label="Nota ${rating.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} de 5">${stars}<small>${rating.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} / 5</small></span></div></article>`;
    }).join('');
    requestAnimationFrame(() => updateCarouselControls(ratedTitles));
  }

  function updateCarouselControls(container) {
    const maxScroll = Math.max(0,container.scrollWidth - container.clientWidth);
    document.querySelectorAll(`[data-carousel-target="${container.id}"]`).forEach(button => {
      const direction = Number(button.dataset.carouselDirection);
      button.disabled = maxScroll < 2 || (direction < 0 ? container.scrollLeft < 2 : container.scrollLeft >= maxScroll - 2);
    });
  }

  function moveCarousel(container,direction) {
    container.scrollBy({left:direction * Math.max(130,container.clientWidth * 0.82),behavior:'smooth'});
  }

  async function openProfile(memberId) {
    if (!memberId) return;
    if (!dialog.open) dialog.showModal();
    avatar.removeAttribute('src');
    avatar.alt = '';
    name.textContent = 'Carregando perfil…';
    setProfileBanner(null);
    setVicoins(0,true);
    feedback.textContent = '';
    renderAchievements();
    renderProfileBadges([]);
    redemptions.replaceChildren();
    favorites.replaceChildren();
    ratedTitles.replaceChildren();
    updateCarouselControls(redemptions);
    updateCarouselControls(favorites);
    updateCarouselControls(ratedTitles);
    try {
      const ownProfile = String(window.CardapioAuth?.getUser()?.id || '') === String(memberId);
      const data = await api(ownProfile ? '/api/account/profile' : `/api/community/members/${encodeURIComponent(memberId)}`);
      const profile = data.profile || {};
      name.textContent = profile.displayName || profile.login || 'Perfil Twitch';
      setVicoins(profile.vicoins,true,profile.vicoinsInfinite);
      setProfileBanner(profile.banner);
      renderProfileBadges(data.badges || []);
      renderAchievements(data.achievements || {});
      if (profile.profileImageUrl) {
        avatar.src = profile.profileImageUrl;
        avatar.alt = `Foto de perfil de ${profile.displayName || profile.login || 'usuário'}`;
      }
      renderTitles(redemptions,Array.isArray(data.redemptions) ? data.redemptions : [],'Ainda não há resgates aprovados.',true);
      renderTitles(favorites,Array.isArray(data.favorites) ? data.favorites : [],'Ainda não há filmes ou séries favoritos.');
    renderRatedTitles(Array.isArray(data.ratings) ? data.ratings : []);
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível carregar este perfil.';
    }
  }

  async function loadMembers() {
    try {
      const data = await api('/api/community/members');
      const members = Array.isArray(data.members) ? data.members : [];
      if (!members.length) {
        list.innerHTML = '<p class="community-members-empty">Os novos membros aparecerão aqui após entrarem com a Twitch.</p>';
        return;
      }
      list.innerHTML = members.map(member => `<button class="community-member-link" type="button" data-member-id="${safe(member.id)}" aria-label="Ver perfil de ${safe(member.displayName || member.login)}">${member.profileImageUrl ? `<img src="${safe(member.profileImageUrl)}" alt="" loading="lazy">` : '<span class="community-member-avatar-fallback" aria-hidden="true">✦</span>'}<span>${safe(member.displayName || member.login)}</span></button>`).join('');
    } catch (error) {
      list.innerHTML = `<p class="community-members-empty">${safe(error.message || 'Não foi possível carregar os membros.')}</p>`;
    }
  }

  function renderRanking(target,items,type) {
    if (!Array.isArray(items) || !items.length) {
      target.innerHTML = '<li class="community-ranking-empty">Ainda não há dados para este ranking.</li>';
      return;
    }
    target.innerHTML = items.map((member,index) => {
      const avatarMarkup = member.profileImageUrl ? `<img src="${safe(member.profileImageUrl)}" alt="" loading="lazy">` : '<span class="community-ranking-avatar-fallback" aria-hidden="true">✦</span>';
      const value = type === 'vicoins'
        ? `<span class="community-ranking-value is-vicoins"><img src="assets/vicoins-coin.png?v=2" alt=""><strong>${Number(member.balance || 0).toLocaleString('pt-BR')}</strong></span>`
        : `<span class="community-ranking-value"><strong>${Number(member.totalValue || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong><small>${Number(member.redemptionCount || 0)} ${Number(member.redemptionCount) === 1 ? 'resgate' : 'resgates'}</small></span>`;
      return `<li class="community-ranking-row"><span class="community-ranking-position">${index + 1}</span><button type="button" class="community-ranking-profile" data-profile-id="${safe(member.id)}">${avatarMarkup}<span>${safe(member.displayName || 'Usuário Twitch')}</span></button>${value}</li>`;
    }).join('');
  }

  async function loadRankings() {
    try {
      const data = await api('/api/community/rankings');
      renderRanking(vicoinsRankingList,data.vicoins,'vicoins');
      renderRanking(redeemersRankingList,data.redemptionSpenders,'redemptions');
    } catch (error) {
      const message = safe(error.message || 'Não foi possível carregar este ranking.');
      vicoinsRankingList.innerHTML = `<li class="community-ranking-empty">${message}</li>`;
      redeemersRankingList.innerHTML = `<li class="community-ranking-empty">${message}</li>`;
    }
  }

  async function loadMyVicoins(user) {
    if (!user) {
      setVicoins(0);
      return;
    }
    try {
      const data = await api('/api/account/vicoins');
      setVicoins(data.balance,false,data.infinite);
    } catch { setVicoins(0); }
  }

  list.addEventListener('click',event => {
    const button = event.target.closest('[data-member-id]');
    if (button) openProfile(button.dataset.memberId);
  });
  for (const ranking of [vicoinsRankingList,redeemersRankingList]) ranking.addEventListener('click',event => {
    const button = event.target.closest('[data-profile-id]');
    if (button) openProfile(button.dataset.profileId);
  });
  close.addEventListener('click',() => dialog.close());
  dialog.addEventListener('click',event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('click',event => {
    const button = event.target.closest('[data-carousel-target]');
    if (!button) return;
    const container = document.getElementById(button.dataset.carouselTarget);
    if (container) moveCarousel(container,Number(button.dataset.carouselDirection));
  });
  for (const container of [redemptions,favorites,ratedTitles]) {
    container.addEventListener('scroll',() => updateCarouselControls(container),{passive:true});
    window.addEventListener('resize',() => updateCarouselControls(container));
  }
  dialogVicoinsLink.addEventListener('click',() => dialog.close());
  sidebarProfileButton.addEventListener('click',() => openProfile(window.CardapioAuth?.getUser()?.id));
  window.addEventListener('cardapio:auth-updated',event => loadMyVicoins(event.detail?.user || null));
  window.addEventListener('cardapio:vicoins-updated',event => { setVicoins(event.detail?.balance,false,event.detail?.infinite); loadRankings(); });
  window.addEventListener('cardapio:redemptions-updated',loadRankings);
  window.CardapioCommunityProfiles = {open:openProfile};
  loadMembers();
  loadRankings();
  window.setInterval(() => { if (!document.hidden) loadRankings(); },60000);
  window.CardapioAuth?.ready.then(user => loadMyVicoins(user));
})();
