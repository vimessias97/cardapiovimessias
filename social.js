(() => {
  const notificationButton = document.querySelector('#sidebarNotificationsButton');
  const notificationCount = document.querySelector('#sidebarNotificationsCount');
  const socialPanel = document.querySelector('#sidebarSocialPanel');
  const notificationList = document.querySelector('#sidebarNotificationsList');
  const friendsList = document.querySelector('#sidebarFriendsList');
  const closeButton = document.querySelector('#sidebarSocialClose');
  const friendButton = document.querySelector('#communityFriendButton');
  const profileFriends = document.querySelector('#communityProfileFriends');
  const bases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let isOpen = false;
  let currentUser = null;

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  async function api(path,options = {}) {
    let lastError;
    for (let index = 0; index < bases.length; index++) {
      try {
        const response = await fetch(`${bases[index]}${path}`,{credentials:'same-origin',...options,headers:{...(options.body ? {'content-type':'application/json'} : {}),...(options.headers || {})}});
        if (response.status === 404 && index < bases.length - 1) continue;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a ação.');
        return data;
      } catch (error) { if (!(error instanceof TypeError)) throw error; lastError = error; }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function profileName(member) {
    return window.CardapioClubVime?.name(member.displayName || member.login || 'Usuário Twitch',member.clubVime,member.clubVimeExpiresAt) || safe(member.displayName || member.login || 'Usuário Twitch');
  }

  function updateCount(count = 0) {
    const total = Math.max(0,Number(count) || 0);
    notificationCount.textContent = total > 99 ? '99+' : String(total);
    notificationCount.classList.toggle('hidden',total === 0);
    notificationButton.setAttribute('aria-label',total ? `Notificações: ${total} não lidas` : 'Notificações');
  }

  function renderSocial(data = {}) {
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    const requests = new Map((Array.isArray(data.requests) ? data.requests : []).map(request => [request.id,request]));
    notificationList.innerHTML = notifications.length ? notifications.map(item => {
      const request = requests.get(item.requestId);
      const title = item.type === 'friend-request' ? 'enviou um pedido de amizade.' : 'aceitou seu pedido de amizade.';
      const buttons = item.type === 'friend-request' && request
        ? `<span class="sidebar-notification-actions"><button type="button" data-friend-respond="accept" data-request-id="${safe(item.requestId)}">Aceitar</button><button type="button" data-friend-respond="decline" data-request-id="${safe(item.requestId)}">Recusar</button></span>` : '';
      return `<li class="sidebar-notification-item${item.read ? '' : ' is-unread'}"><button type="button" class="sidebar-social-member" data-social-profile="${safe(item.actor.id)}">${item.actor.profileImageUrl ? `<img src="${safe(item.actor.profileImageUrl)}" alt="" loading="lazy">` : '<span class="sidebar-social-avatar">✦</span>'}<span><strong>${profileName(item.actor)}</strong><small>${title}</small></span></button>${buttons}</li>`;
    }).join('') : '<li class="sidebar-social-empty">Nenhuma notificação nova.</li>';
    const friends = Array.isArray(data.friendships) ? data.friendships : [];
    friendsList.innerHTML = friends.length ? friends.map(friend => `<li><button type="button" class="sidebar-social-member" data-social-profile="${safe(friend.id)}">${friend.profileImageUrl ? `<img src="${safe(friend.profileImageUrl)}" alt="" loading="lazy">` : '<span class="sidebar-social-avatar">✦</span>'}<span><strong>${profileName(friend)}</strong><small>Amigo</small></span></button></li>`).join('') : '<li class="sidebar-social-empty">Você ainda não tem amizades.</li>';
    updateCount(data.unreadCount);
  }

  async function refresh() {
    if (!currentUser) return;
    try { renderSocial(await api('/api/account/social',{cache:'no-store'})); }
    catch (error) {
      notificationList.innerHTML = `<li class="sidebar-social-empty">${safe(error.message || 'Não foi possível carregar notificações.')}</li>`;
      friendsList.innerHTML = '<li class="sidebar-social-empty">Não foi possível carregar suas amizades.</li>';
    }
  }

  async function openPanel() {
    if (!currentUser) {
      window.CardapioAuth?.requireLogin('Entre com a Twitch para ver notificações e amizades.');
      return;
    }
    isOpen = !isOpen;
    socialPanel.classList.toggle('hidden',!isOpen);
    notificationButton.setAttribute('aria-expanded',String(isOpen));
    if (isOpen) {
      await refresh();
      try { await api('/api/account/notifications/read',{method:'POST',body:'{}'}); await refresh(); }
      catch {}
    }
  }

  async function respond(requestId,action) {
    await api(`/api/account/friend-requests/${encodeURIComponent(requestId)}/respond`,{method:'POST',body:JSON.stringify({action})});
    await refresh();
  }

  async function showProfile(profile,ownProfile = false) {
    if (!friendButton) return;
    const targetId = String(profile?.id || '');
    friendButton.classList.toggle('hidden',!targetId || ownProfile || String(currentUser?.id || '') === targetId);
    if (friendButton.classList.contains('hidden')) return;
    if (!currentUser) {
      friendButton.disabled = false;
      friendButton.textContent = 'Entrar para adicionar amizade';
      friendButton.dataset.friendship = 'login';
      return;
    }
    friendButton.disabled = true;
    friendButton.textContent = 'Verificando…';
    try {
      const data = await api(`/api/community/friendship/${encodeURIComponent(targetId)}`);
      const status = data.relationship || profile.friendship || 'none';
      friendButton.dataset.targetId = targetId;
      friendButton.dataset.friendship = status;
      friendButton.dataset.requestId = data.requestId || '';
      friendButton.disabled = ['friends','pending-sent'].includes(status);
      friendButton.textContent = status === 'friends' ? '✓ Amigos' : status === 'pending-sent' ? 'Pedido enviado' : status === 'pending-received' ? 'Aceitar pedido de amizade' : 'Adicionar amizade';
    } catch (error) {
      friendButton.disabled = true;
      friendButton.textContent = error.message || 'Amizade indisponível';
    }
  }

  async function loadProfileFriends(memberId) {
    if (!profileFriends || !memberId) return;
    profileFriends.innerHTML = '<span class="community-profile-friends-empty">Carregando amizades…</span>';
    try {
      const data = await api(`/api/community/members/${encodeURIComponent(memberId)}/friends`);
      const friends = Array.isArray(data.friends) ? data.friends : [];
      profileFriends.innerHTML = friends.length ? friends.map(friend => {
        const label = friend.displayName || friend.login || 'Usuário Twitch';
        const markedName = window.CardapioClubVime?.name(label,friend.clubVime,friend.clubVimeExpiresAt) || safe(label);
        return `<button type="button" class="community-profile-friend" data-profile-friend-id="${safe(friend.id)}" title="${safe(label)}" aria-label="Abrir perfil de ${safe(label)}">${friend.profileImageUrl ? `<img src="${safe(friend.profileImageUrl)}" alt="" loading="lazy">` : '<span class="community-profile-friend-fallback" aria-hidden="true">✦</span>'}<span class="community-profile-friend-tooltip">${markedName}</span></button>`;
      }).join('') : '<span class="community-profile-friends-empty">Ainda não há amizades.</span>';
    } catch (error) { profileFriends.innerHTML = `<span class="community-profile-friends-empty">${safe(error.message || 'Não foi possível carregar amizades.')}</span>`; }
  }

  notificationButton?.addEventListener('click',openPanel);
  closeButton?.addEventListener('click',() => { isOpen = false; socialPanel.classList.add('hidden'); notificationButton.setAttribute('aria-expanded','false'); });
  friendButton?.addEventListener('click',async () => {
    if (!currentUser) { window.CardapioAuth?.requireLogin('Entre com a Twitch para adicionar amizades.'); return; }
    const status = friendButton.dataset.friendship;
    try {
      if (status === 'pending-received' && friendButton.dataset.requestId) await respond(friendButton.dataset.requestId,'accept');
      else if (status === 'none') await api('/api/community/friend-requests',{method:'POST',body:JSON.stringify({targetId:friendButton.dataset.targetId})});
      const profileId = friendButton.dataset.targetId;
      await showProfile({id:profileId},false);
    } catch (error) { friendButton.textContent = error.message || 'Não foi possível enviar o pedido.'; }
  });

  socialPanel?.addEventListener('click',async event => {
    const response = event.target.closest('[data-friend-respond]');
    if (response) {
      response.disabled = true;
      try { await respond(response.dataset.requestId,response.dataset.friendRespond); }
      catch (error) { response.disabled = false; response.title = error.message; }
      return;
    }
    const profile = event.target.closest('[data-social-profile]');
    if (profile) window.CardapioCommunityProfiles?.open(profile.dataset.socialProfile);
  });
  profileFriends?.addEventListener('click',event => {
    const friend = event.target.closest('[data-profile-friend-id]');
    if (friend) window.CardapioCommunityProfiles?.open(friend.dataset.profileFriendId);
  });

  document.addEventListener('click',event => {
    if (isOpen && !socialPanel.contains(event.target) && !notificationButton.contains(event.target)) {
      isOpen = false;
      socialPanel.classList.add('hidden');
      notificationButton.setAttribute('aria-expanded','false');
    }
  });
  window.addEventListener('cardapio:auth-updated',event => {
    currentUser = event.detail?.user || null;
    notificationButton?.classList.toggle('hidden',!currentUser);
    if (!currentUser) { isOpen = false; socialPanel?.classList.add('hidden'); updateCount(0); }
    else refresh();
  });
  window.CardapioAuth?.ready.then(user => {
    currentUser = user || null;
    notificationButton?.classList.toggle('hidden',!currentUser);
    if (currentUser) refresh();
  });
  window.setInterval(() => { if (currentUser && !document.hidden) refresh(); },60000);
  window.CardapioSocial = {showProfile,refresh,open:openPanel,loadProfileFriends};
})();
