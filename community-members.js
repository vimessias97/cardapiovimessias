(() => {
  const list = document.querySelector('#communityMembersList');
  const vicoinsRankingList = document.querySelector('#communityVicoinsRankList');
  const redeemersRankingList = document.querySelector('#communityRedeemersRankList');
  const dialog = document.querySelector('#communityMemberDialog');
  const close = document.querySelector('#communityMemberClose');
  const avatar = document.querySelector('#communityMemberAvatar');
  const name = document.querySelector('#communityMemberName');
  const feedback = document.querySelector('#communityMemberFeedback');
  const redemptions = document.querySelector('#communityMemberRedemptions');
  const favorites = document.querySelector('#communityMemberFavorites');
  const achievementsRoot = document.querySelector('#communityAchievementList');
  const sidebarVicoinsCount = document.querySelector('#sidebarVicoinsCount');
  const shopVicoinsCount = document.querySelector('#shopVicoinsCount');
  const dialogVicoinsCount = document.querySelector('#communityMemberVicoinsCount');
  const sidebarVicoinsLink = document.querySelector('#sidebarVicoinsLink');
  const dialogVicoinsLink = document.querySelector('#communityMemberVicoinsLink');
  const sidebarProfileButton = document.querySelector('#sidebarUserOpenProfile');
  const dialogHead = document.querySelector('.community-member-dialog-head');
  const profileBannerImages = {'vimessias':'/assets/profile-banners/vimessias-1600x240.png?v=1','halloween-michael':'/assets/profile-banners/halloween-michael-1600x240.png?v=2'};
  const bases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  function setVicoins(value,dialogOnly = false) {
    const balance = Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
    const counters = dialogOnly ? [dialogVicoinsCount] : [sidebarVicoinsCount,shopVicoinsCount];
    const links = dialogOnly ? [dialogVicoinsLink] : [sidebarVicoinsLink];
    for (const counter of counters) if (counter) counter.textContent = balance.toLocaleString('pt-BR');
    for (const link of links) if (link) link.setAttribute('aria-label',`Vicoins: ${balance.toLocaleString('pt-BR')}. Abrir lojinha`);
    return balance;
  }

  function setProfileBanner(banner) {
    const imageUrl = profileBannerImages[banner?.id];
    if (!imageUrl) {
      dialogHead.classList.remove('has-profile-banner');
      dialogHead.style.removeProperty('--community-profile-banner');
      return;
    }
    dialogHead.style.setProperty('--community-profile-banner',`url("${imageUrl}")`);
    dialogHead.classList.add('has-profile-banner');
  }

  function renderAchievements(achievements = {}) {
    const favoriteCount = Math.max(0,Number(achievements.favorites) || 0);
    const ratingCount = Math.max(0,Number(achievements.ratings) || 0);
    const redemptionCount = Math.max(0,Number(achievements.redemptions) || 0);
    const rows = [
      {id:'heart',icon:'♥',name:'Coração',value:Math.floor(favoriteCount / 5) * 5,progress:favoriteCount,goal:5,label:'favoritos'},
      {id:'star',icon:'★',name:'Estrela',value:Math.floor(ratingCount / 5) * 5,progress:ratingCount,goal:5,label:'avaliações'},
      {id:'clapper',icon:'🎬',name:'Claquete',value:redemptionCount,progress:redemptionCount,goal:1,label:'resgates'}
    ];
    achievementsRoot.innerHTML = rows.map(item => {
      const unlocked = item.progress >= item.goal;
      const description = item.id === 'clapper'
        ? `${item.progress} ${item.progress === 1 ? 'resgate aprovado' : 'resgates aprovados'}`
        : unlocked ? `${item.value} ${item.label} alcançados` : `${item.progress}/${item.goal} ${item.label}`;
      const badgeCount = item.id === 'clapper' ? item.value : item.value || item.goal;
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
      return;
    }
    container.innerHTML = items.map(item => `<article class="community-member-title-card">${item.posterUrl ? `<img src="${safe(item.posterUrl)}" alt="Pôster de ${safe(item.title)}" loading="lazy">` : '<span class="community-member-title-poster" aria-hidden="true">✦</span>'}<div class="community-member-title-copy"><strong>${safe(item.title)}</strong><small>${safe(item.mediaType === 'tv' ? 'Série' : 'Filme')}${item.durationLabel ? ` · ${safe(item.durationLabel)}` : ''}</small>${showDate && item.scheduledAt ? `<small>Agendado: ${safe(new Date(item.scheduledAt).toLocaleDateString('pt-BR'))}</small>` : ''}</div></article>`).join('');
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
    redemptions.replaceChildren();
    favorites.replaceChildren();
    try {
      const ownProfile = String(window.CardapioAuth?.getUser()?.id || '') === String(memberId);
      const data = await api(ownProfile ? '/api/account/profile' : `/api/community/members/${encodeURIComponent(memberId)}`);
      const profile = data.profile || {};
      name.textContent = profile.displayName || profile.login || 'Perfil Twitch';
      setVicoins(profile.vicoins,true);
      setProfileBanner(profile.banner);
      renderAchievements(data.achievements || {});
      if (profile.profileImageUrl) {
        avatar.src = profile.profileImageUrl;
        avatar.alt = `Foto de perfil de ${profile.displayName || profile.login || 'usuário'}`;
      }
      renderTitles(redemptions,Array.isArray(data.redemptions) ? data.redemptions : [],'Ainda não há resgates aprovados.',true);
      renderTitles(favorites,Array.isArray(data.favorites) ? data.favorites : [],'Ainda não há filmes ou séries favoritos.');
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
        ? `<span class="community-ranking-value is-vicoins"><img src="assets/vicoins-coin.png" alt=""><strong>${Number(member.balance || 0).toLocaleString('pt-BR')}</strong></span>`
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
      setVicoins(data.balance);
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
  dialogVicoinsLink.addEventListener('click',() => dialog.close());
  sidebarProfileButton.addEventListener('click',() => openProfile(window.CardapioAuth?.getUser()?.id));
  window.addEventListener('cardapio:auth-updated',event => loadMyVicoins(event.detail?.user || null));
  window.addEventListener('cardapio:vicoins-updated',event => { setVicoins(event.detail?.balance); loadRankings(); });
  window.addEventListener('cardapio:redemptions-updated',loadRankings);
  window.CardapioCommunityProfiles = {open:openProfile};
  loadMembers();
  loadRankings();
  window.setInterval(() => { if (!document.hidden) loadRankings(); },60000);
  window.CardapioAuth?.ready.then(user => loadMyVicoins(user));
})();
