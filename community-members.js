(() => {
  const list = document.querySelector('#communityMembersList');
  const vicoinsRankingList = document.querySelector('#communityVicoinsRankList');
  const redeemersRankingList = document.querySelector('#communityRedeemersRankList');
  const favoritesRankingList = document.querySelector('#communityFavoritesRankList');
  const ratingsRankingList = document.querySelector('#communityRatingsRankList');
  const fullRankingList = document.querySelector('#communityFullRankingList');
  const fullRankingHeading = document.querySelector('#communityFullRankingHeading');
  const fullRankingDescription = document.querySelector('#communityFullRankingDescription');
  const membersMoreButton = document.querySelector('#communityMembersMore');
  const allMembersList = document.querySelector('#allCommunityMembersList');
  const profilePage = document.querySelector('#perfil');
  const profileHero = document.querySelector('#communityProfileHero');
  const profileBannerSettings = document.querySelector('#communityProfileBannerSettings');
  const avatar = document.querySelector('#communityMemberAvatar');
  const name = document.querySelector('#communityMemberName');
  const memberSince = document.querySelector('#communityMemberSince');
  const activityList = document.querySelector('#communityMemberActivity');
  const profileClubCrown = document.querySelector('#communityProfileClubCrown');
  const friendButton = document.querySelector('#communityFriendButton');
  const feedback = document.querySelector('#communityMemberFeedback');
  const redemptions = document.querySelector('#communityMemberRedemptions');
  const favorites = document.querySelector('#communityMemberFavorites');
  const ratedTitles = document.querySelector('#communityMemberRatings');
  const achievementsRoot = document.querySelector('#communityAchievementList');
  const sidebarVicoinsCount = document.querySelector('#sidebarVicoinsCount');
  const shopVicoinsCount = document.querySelector('#shopVicoinsCount');
  const profileVicoinsCount = document.querySelector('#communityMemberVicoinsCount');
  const sidebarVicoinsLink = document.querySelector('#sidebarVicoinsLink');
  const profileVicoinsLink = document.querySelector('#communityMemberVicoinsLink');
  const sidebarProfileButton = document.querySelector('#sidebarUserOpenProfile');
  const profileBannerImages = {};
  const bases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let activeProfilePath = '';
  let currentProfileId = '';
  let profileBannerPaletteRequest = 0;
  let membersExpanded = false;
  let currentFullRanking = 'vicoins';
  let rankingsData = null;
  const rankingCategories = {
    redemptions:{key:'redemptionSpenders',type:'redemptions',title:'Valor resgatado',description:'Pessoas com maior valor acumulado em resgates aprovados.'},
    vicoins:{key:'vicoins',type:'vicoins',title:'Vicoins',description:'Pessoas com maior saldo de Vicoins.'},
    favorites:{key:'favoriteLeaders',type:'favorites',title:'Maiores favoritos',description:'Pessoas que mais favoritaram títulos.'},
    ratings:{key:'ratingLeaders',type:'ratings',title:'Maiores avaliadores',description:'Pessoas que mais avaliaram títulos.'}
  };
  let profileTitles = {redemptions:[],favorites:[],ratings:[]};
  let profileTotals = {redemptions:0,favorites:0,ratings:0};
  const profileContainers = {redemptions,favorites,ratings:ratedTitles};

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  function setVicoins(value,profileOnly = false,infinite = false) {
    const balance = Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
    const counters = profileOnly ? [profileVicoinsCount] : [sidebarVicoinsCount,shopVicoinsCount];
    const links = profileOnly ? [profileVicoinsLink] : [sidebarVicoinsLink];
    const label = infinite ? '∞' : balance.toLocaleString('pt-BR');
    for (const counter of counters) if (counter) counter.textContent = label;
    for (const link of links) if (link) link.setAttribute('aria-label',`${infinite ? 'Vicoins ilimitados' : `Vicoins: ${balance.toLocaleString('pt-BR')}`}. Abrir lojinha`);
    return balance;
  }

  function setProfileBanner(banner) {
    const suppliedUrl = String(banner?.imageUrl || '');
    const imageUrl = profileBannerImages[banner?.id] || (/^\/api\/profile-banners\/[a-f0-9-]{36}\.(?:png|jpg)$/i.test(suppliedUrl) ? suppliedUrl : '');
    if (!imageUrl) {
      profileBannerPaletteRequest += 1;
      profileHero.classList.remove('has-profile-banner');
      profileHero.style.removeProperty('--community-profile-banner');
      profilePage.style.removeProperty('--profile-accent');
      profilePage.style.removeProperty('--profile-accent-soft');
      profilePage.style.removeProperty('--profile-accent-glow');
      return;
    }
    profileHero.style.setProperty('--community-profile-banner',`url("${imageUrl}")`);
    profileHero.classList.add('has-profile-banner');
    loadProfileBannerPalette(imageUrl);
  }

  function loadProfileBannerPalette(imageUrl) {
    const requestId = ++profileBannerPaletteRequest;
    const image = new Image();
    image.onload = () => {
      if (requestId !== profileBannerPaletteRequest || !profileHero.isConnected) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d',{willReadFrequently:true});
        if (!context) return;
        context.drawImage(image,0,0,32,32);
        const pixels = context.getImageData(0,0,32,32).data;
        const colors = new Map();
        for (let index = 0; index < pixels.length; index += 16) {
          const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
          const high = Math.max(red,green,blue), low = Math.min(red,green,blue);
          if (pixels[index + 3] < 180 || high < 48 || high - low < 28) continue;
          const key = `${red >> 4},${green >> 4},${blue >> 4}`;
          const bucket = colors.get(key) || {red:0,green:0,blue:0,count:0,saturation:0};
          bucket.red += red; bucket.green += green; bucket.blue += blue; bucket.count += 1;
          bucket.saturation += (high - low) / high;
          colors.set(key,bucket);
        }
        const dominant = [...colors.values()].sort((a,b) => (b.count * (1 + b.saturation / b.count)) - (a.count * (1 + a.saturation / a.count)))[0];
        if (!dominant) return;
        const red = dominant.red / dominant.count / 255;
        const green = dominant.green / dominant.count / 255;
        const blue = dominant.blue / dominant.count / 255;
        const max = Math.max(red,green,blue), min = Math.min(red,green,blue), delta = max - min;
        let hue = 0;
        if (delta) hue = max === red ? 60 * (((green - blue) / delta) % 6) : max === green ? 60 * ((blue - red) / delta + 2) : 60 * ((red - green) / delta + 4);
        hue = (hue + 360) % 360;
        const saturation = Math.round(Math.min(78,Math.max(48,dominant.saturation / dominant.count * 100)));
        profilePage.style.setProperty('--profile-accent',`hsl(${Math.round(hue)} ${saturation}% 62%)`);
        profilePage.style.setProperty('--profile-accent-soft',`hsl(${Math.round(hue)} 34% 18%)`);
        profilePage.style.setProperty('--profile-accent-glow',`hsl(${Math.round(hue)} ${saturation}% 58% / .42)`);
      } catch {
        // Mantém o roxo padrão se o navegador não permitir ler a imagem.
      }
    };
    image.src = imageUrl;
  }

  function renderProfileMembership(profile = {}) {
    if (memberSince) {
      const joinedAt = Date.parse(profile.joinedAt || '');
      const joinedDate = Number.isFinite(joinedAt)
        ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(joinedAt))
        : '';
      memberSince.textContent = joinedDate ? `MEMBRO DESDE ${joinedDate}` : 'MEMBRO DA COMUNIDADE';
    }
  }

  function renderProfileActivity(items = []) {
    if (!activityList) return;
    const icons = {favorite:'♥',rating:'★',redemption:'🎬',list:'▤',comment:'💬','list-like':'♥'};
    const verbs = {favorite:'Favoritou',rating:'Avaliou',redemption:'Resgatou',list:'Criou a lista',comment:'Comentou na lista','list-like':'Curtiu a lista'};
    const activities = Array.isArray(items) ? items.slice(0,12) : [];
    activityList.innerHTML = activities.length ? activities.map(item => {
      const date = Date.parse(item.createdAt || '');
      const when = Number.isFinite(date) ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(date)) : '';
      return `<li class="community-profile-activity-item"><span class="community-profile-activity-icon" aria-hidden="true">${icons[item.type] || '•'}</span><span class="community-profile-activity-copy"><strong>${safe(verbs[item.type] || 'Interagiu')}</strong><span>${safe(item.title || 'Conteúdo')}${item.detail ? ` · ${safe(item.detail)}` : ''}</span><time>${safe(when)}</time></span></li>`;
    }).join('') : '<li class="community-profile-activity-empty">Ainda não há atividades recentes.</li>';
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
      placeMoreButtonInRail(container);
      updateCarouselControls(container);
      return;
    }
    container.innerHTML = items.map(item => `<article class="community-member-title-card">${item.posterUrl ? `<img src="${safe(item.posterUrl)}" alt="Pôster de ${safe(item.title)}" loading="lazy">` : '<span class="community-member-title-poster" aria-hidden="true">✦</span>'}<div class="community-member-title-copy"><strong>${safe(item.title)}</strong><small>${safe(item.mediaType === 'tv' ? 'Série' : item.mediaType === 'other' ? 'Outro' : 'Filme')}${item.durationLabel ? ` · ${safe(item.durationLabel)}` : ''}</small>${showDate && item.scheduledAt ? `<small>Agendado: ${safe(new Date(item.scheduledAt).toLocaleDateString('pt-BR'))}</small>` : ''}</div></article>`).join('');
    placeMoreButtonInRail(container);
    requestAnimationFrame(() => updateCarouselControls(container));
  }

  function placeMoreButtonInRail(container) {
    const button = profilePage.querySelector(`[data-profile-more="${container.id === 'communityMemberRedemptions' ? 'redemptions' : container.id === 'communityMemberFavorites' ? 'favorites' : 'ratings'}"]`);
    if (button && button.parentElement !== container) container.append(button);
  }

  function renderRatedTitles(items = []) {
    if (!items.length) {
      ratedTitles.innerHTML = '<p class="community-members-empty">Ainda não há filmes ou séries avaliados.</p>';
      placeMoreButtonInRail(ratedTitles);
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
    placeMoreButtonInRail(ratedTitles);
    requestAnimationFrame(() => updateCarouselControls(ratedTitles));
  }

  function updateCarouselControls(container) {
    const maxScroll = Math.max(0,container.scrollWidth - container.clientWidth);
    document.querySelectorAll(`[data-carousel-target="${container.id}"]`).forEach(button => {
      const direction = Number(button.dataset.carouselDirection);
      button.disabled = maxScroll < 2 || (direction < 0 ? container.scrollLeft < 2 : container.scrollLeft >= maxScroll - 2);
    });
  }

  function updateMoreButtons() {
    for (const key of Object.keys(profileContainers)) {
      const button = profilePage.querySelector(`[data-profile-more="${key}"]`);
      if (!button) continue;
      const remaining = Math.max(0,profileTotals[key] - profileTitles[key].length);
      button.classList.toggle('hidden',remaining === 0);
      button.disabled = false;
      button.textContent = `Ver mais (${Math.min(5,remaining)})`;
      button.setAttribute('aria-label',`Ver mais títulos nesta categoria. ${remaining} restantes.`);
    }
  }

  function moveCarousel(container,direction) {
    container.scrollBy({left:direction * Math.max(130,container.clientWidth * 0.82),behavior:'smooth'});
  }

  async function openProfile(memberId,{updateHistory = true} = {}) {
    if (!memberId) return;
    currentProfileId = String(memberId);
    window.CardapioNavigation?.showPage('perfil',null,updateHistory,currentProfileId);
    avatar.removeAttribute('src');
    avatar.alt = '';
    name.textContent = 'Carregando perfil…';
    if (memberSince) memberSince.textContent = 'Carregando…';
    profileClubCrown?.classList.add('hidden');
    friendButton?.classList.add('hidden');
    setProfileBanner(null);
    profileBannerSettings?.classList.add('hidden');
    setVicoins(0,true);
    feedback.textContent = '';
    renderProfileActivity([]);
    renderAchievements();
    activeProfilePath = '';
    profileTitles = {redemptions:[],favorites:[],ratings:[]};
    profileTotals = {redemptions:0,favorites:0,ratings:0};
    renderProfileMembership();
    profilePage.querySelectorAll('[data-profile-more]').forEach(button => button.classList.add('hidden'));
    redemptions.replaceChildren();
    favorites.replaceChildren();
    ratedTitles.replaceChildren();
    updateCarouselControls(redemptions);
    updateCarouselControls(favorites);
    updateCarouselControls(ratedTitles);
    profilePage.scrollIntoView({block:'start',behavior:'smooth'});
    try {
      const ownProfile = String(window.CardapioAuth?.getUser()?.id || '') === String(memberId);
      activeProfilePath = ownProfile ? '/api/account/profile' : `/api/community/members/${encodeURIComponent(memberId)}`;
      const data = await api(activeProfilePath);
      const profile = data.profile || {};
      window.CardapioSocial?.showProfile(profile,ownProfile);
      name.innerHTML = window.CardapioClubVime?.name(profile.displayName || profile.login || 'Perfil Twitch',profile.isClubVime,profile.clubVimeExpiresAt) || safe(profile.displayName || profile.login || 'Perfil Twitch');
      name.querySelector('.club-vime-crown')?.remove();
      profileClubCrown?.classList.toggle('hidden',!profile.isClubVime);
      setVicoins(profile.vicoins,true,profile.vicoinsInfinite);
      setProfileBanner(profile.banner);
      profileBannerSettings?.classList.toggle('hidden',!ownProfile);
      renderProfileActivity(data.activities || []);
      window.CardapioLists?.renderProfileLists(memberId,data.lists || []);
      renderAchievements(data.achievements || {});
      if (profile.profileImageUrl) {
        avatar.src = profile.profileImageUrl;
        avatar.alt = `Foto de perfil de ${profile.displayName || profile.login || 'usuário'}`;
      }
      profileTitles = {redemptions:Array.isArray(data.redemptions) ? data.redemptions : [],favorites:Array.isArray(data.favorites) ? data.favorites : [],ratings:Array.isArray(data.ratings) ? data.ratings : []};
      profileTotals = {...profileTotals,...(data.totals || {})};
      renderProfileMembership(profile);
      renderTitles(redemptions,profileTitles.redemptions,'Ainda não há resgates aprovados.',true);
      renderTitles(favorites,profileTitles.favorites,'Ainda não há filmes ou séries favoritos.');
      renderRatedTitles(profileTitles.ratings);
      updateMoreButtons();
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível carregar este perfil.';
    }
  }

  profileBannerSettings?.addEventListener('click',event => {
    event.preventDefault();
    window.CardapioVicoinsShop?.openBanners();
  });

  async function fetchMembers(all = false) {
    const response = await api(`/api/community/members${all ? '?all=1' : ''}`);
    return Array.isArray(response.members) ? response.members : [];
  }

  function memberButtonMarkup(member,index = 0,extraClass = '') {
    const label = member.displayName || member.login || 'Usuário Twitch';
    const avatarMarkup = member.profileImageUrl ? `<img src="${safe(member.profileImageUrl)}" alt="" loading="lazy">` : '<span class="community-member-avatar-fallback" aria-hidden="true">✦</span>';
    const display = window.CardapioClubVime?.name(label,member.clubVime,member.clubVimeExpiresAt) || safe(label);
    return `<button class="community-member-link ${extraClass}" type="button" data-member-id="${safe(member.id)}" aria-label="Ver perfil de ${safe(label)}">${avatarMarkup}<span>${display}</span></button>`;
  }

  async function loadMembers() {
    try {
      const members = await fetchMembers(false);
      if (!members.length) {
        list.innerHTML = '<p class="community-members-empty">Os novos membros aparecerão aqui após entrarem com a Twitch.</p>';
        return;
      }
      membersExpanded = false;
      list.innerHTML = members.slice(0,3).map((member,index) => memberButtonMarkup(member,index,index >= 3 ? 'community-member-extra hidden' : '')).join('');
    } catch (error) {
      list.innerHTML = `<p class="community-members-empty">${safe(error.message || 'Não foi possível carregar os membros.')}</p>`;
    }
  }

  async function loadAllMembers() {
    if (!allMembersList) return;
    allMembersList.innerHTML = '<p class="community-ranking-empty">Carregando membros…</p>';
    try {
      const members = await fetchMembers(true);
      allMembersList.innerHTML = members.length ? members.map((member,index) => memberButtonMarkup(member,index,'all-community-member-link')).join('') : '<p class="community-ranking-empty">Ainda não há membros cadastrados.</p>';
    } catch (error) { allMembersList.innerHTML = `<p class="community-ranking-empty">${safe(error.message || 'Não foi possível carregar os membros.')}</p>`; }
  }

  function renderRanking(target,items,type,limit = Infinity) {
    if (!Array.isArray(items) || !items.length) {
      target.innerHTML = '<li class="community-ranking-empty">Ainda não há dados para este ranking.</li>';
      return;
    }
    target.innerHTML = items.slice(0,limit).map((member,index) => {
      const avatarMarkup = member.profileImageUrl ? `<img src="${safe(member.profileImageUrl)}" alt="" loading="lazy">` : '<span class="community-ranking-avatar-fallback" aria-hidden="true">✦</span>';
      const activityCount = type === 'favorites' ? member.favoriteCount : member.ratingCount;
      const value = type === 'vicoins'
        ? `<span class="community-ranking-value is-vicoins"><img src="assets/vicoins-coin-optimized.png" alt=""><strong>${Number(member.balance || 0).toLocaleString('pt-BR')}</strong></span>`
        : type === 'redemptions'
          ? `<span class="community-ranking-value"><strong>${Number(member.totalValue || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong><small>${Number(member.redemptionCount || 0)} ${Number(member.redemptionCount) === 1 ? 'resgate' : 'resgates'}</small></span>`
          : `<span class="community-ranking-value"><strong>${Number(activityCount || 0).toLocaleString('pt-BR')}</strong><small>${type === 'favorites' ? 'favoritos' : 'avaliações'}</small></span>`;
      return `<li class="community-ranking-row"><span class="community-ranking-position">${index + 1}</span><button type="button" class="community-ranking-profile" data-profile-id="${safe(member.id)}">${avatarMarkup}<span>${window.CardapioClubVime?.name(member.displayName || 'Usuário Twitch',member.clubVime,member.clubVimeExpiresAt) || safe(member.displayName || 'Usuário Twitch')}</span></button>${value}</li>`;
    }).join('');
  }

  function showFullRanking(category = 'vicoins') {
    const config = rankingCategories[category] || rankingCategories.vicoins;
    currentFullRanking = rankingCategories[category] ? category : 'vicoins';
    fullRankingHeading.textContent = config.title;
    fullRankingDescription.textContent = config.description;
    if (rankingsData) renderRanking(fullRankingList,rankingsData[config.key],config.type);
    else fullRankingList.innerHTML = '<li class="community-ranking-empty">Carregando ranking…</li>';
  }

  async function loadRankings() {
    try {
      const data = await api('/api/community/rankings');
      rankingsData = data;
      renderRanking(vicoinsRankingList,data.vicoins,'vicoins',3);
      renderRanking(redeemersRankingList,data.redemptionSpenders,'redemptions',3);
      renderRanking(favoritesRankingList,data.favoriteLeaders,'favorites',3);
      renderRanking(ratingsRankingList,data.ratingLeaders,'ratings',3);
      if (!document.querySelector('#ranking')?.classList.contains('hidden')) showFullRanking(currentFullRanking);
    } catch (error) {
      const message = safe(error.message || 'Não foi possível carregar este ranking.');
      vicoinsRankingList.innerHTML = `<li class="community-ranking-empty">${message}</li>`;
      redeemersRankingList.innerHTML = `<li class="community-ranking-empty">${message}</li>`;
      favoritesRankingList.innerHTML = `<li class="community-ranking-empty">${message}</li>`;
      ratingsRankingList.innerHTML = `<li class="community-ranking-empty">${message}</li>`;
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
  allMembersList?.addEventListener('click',event => {
    const button = event.target.closest('[data-member-id]');
    if (button) openProfile(button.dataset.memberId);
  });
  for (const ranking of [vicoinsRankingList,redeemersRankingList,favoritesRankingList,ratingsRankingList,fullRankingList]) ranking.addEventListener('click',event => {
    const button = event.target.closest('[data-profile-id]');
    if (button) openProfile(button.dataset.profileId);
  });
  membersMoreButton?.addEventListener('click',() => {
    membersExpanded = !membersExpanded;
    list.querySelectorAll('.community-member-extra').forEach(item => item.classList.toggle('hidden',!membersExpanded));
    membersMoreButton.textContent = membersExpanded ? 'Ver menos' : 'Ver mais';
    membersMoreButton.setAttribute('aria-expanded',String(membersExpanded));
  });
  profilePage.addEventListener('click',event => {
    const moreButton = event.target.closest('[data-profile-more]');
    if (moreButton) {
      const key = moreButton.dataset.profileMore;
      const offset = profileTitles[key]?.length || 0;
      if (!activeProfilePath || offset >= (profileTotals[key] || 0)) return;
      moreButton.disabled = true;
      moreButton.textContent = 'Carregando…';
      const query = new URLSearchParams({[`${key}Offset`]:String(offset)});
      api(`${activeProfilePath}?${query}`).then(data => {
        const incoming = Array.isArray(data[key]) ? data[key] : [];
        profileTitles[key] = [...profileTitles[key],...incoming];
        profileTotals[key] = Number(data.totals?.[key] ?? profileTotals[key]) || 0;
        if (key === 'ratings') renderRatedTitles(profileTitles.ratings);
        else renderTitles(profileContainers[key],profileTitles[key],key === 'redemptions' ? 'Ainda não há resgates aprovados.' : 'Ainda não há filmes ou séries favoritos.',key === 'redemptions');
        updateMoreButtons();
      }).catch(error => {
        moreButton.disabled = false;
        moreButton.textContent = error.message || 'Tentar novamente';
      });
      return;
    }
    const button = event.target.closest('[data-carousel-target]');
    if (!button) return;
    const container = document.getElementById(button.dataset.carouselTarget);
    if (container) moveCarousel(container,Number(button.dataset.carouselDirection));
  });
  for (const container of [redemptions,favorites,ratedTitles]) {
    container.addEventListener('scroll',() => updateCarouselControls(container),{passive:true});
    window.addEventListener('resize',() => updateCarouselControls(container));
  }
  sidebarProfileButton.addEventListener('click',() => openProfile(window.CardapioAuth?.getUser()?.id));
  window.addEventListener('cardapio:auth-updated',event => loadMyVicoins(event.detail?.user || null));
  window.addEventListener('cardapio:vicoins-updated',event => { setVicoins(event.detail?.balance,false,event.detail?.infinite); loadRankings(); });
  window.addEventListener('cardapio:redemptions-updated',loadRankings);
  window.CardapioCommunityProfiles = {open:openProfile,getCurrentId:() => currentProfileId,loadAllMembers};
  window.CardapioCommunityRankings = {show:showFullRanking,refresh:loadRankings};
  loadMembers();
  loadRankings();
  window.setInterval(() => { if (!document.hidden) loadRankings(); },60000);
  window.CardapioAuth?.ready.then(user => loadMyVicoins(user));
})();
