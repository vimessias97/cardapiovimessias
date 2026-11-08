(() => {
  const list = document.querySelector('#communityMembersList');
  const dialog = document.querySelector('#communityMemberDialog');
  const close = document.querySelector('#communityMemberClose');
  const avatar = document.querySelector('#communityMemberAvatar');
  const name = document.querySelector('#communityMemberName');
  const login = document.querySelector('#communityMemberLogin');
  const feedback = document.querySelector('#communityMemberFeedback');
  const redemptions = document.querySelector('#communityMemberRedemptions');
  const favorites = document.querySelector('#communityMemberFavorites');
  const bases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
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
    dialog.showModal();
    avatar.removeAttribute('src');
    avatar.alt = '';
    name.textContent = 'Carregando perfil…';
    login.textContent = '';
    feedback.textContent = '';
    redemptions.replaceChildren();
    favorites.replaceChildren();
    try {
      const data = await api(`/api/community/members/${encodeURIComponent(memberId)}`);
      const profile = data.profile || {};
      name.textContent = profile.displayName || profile.login || 'Perfil Twitch';
      login.textContent = profile.login ? `@${profile.login}` : '';
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

  list.addEventListener('click',event => {
    const button = event.target.closest('[data-member-id]');
    if (button) openProfile(button.dataset.memberId);
  });
  close.addEventListener('click',() => dialog.close());
  dialog.addEventListener('click',event => { if (event.target === dialog) dialog.close(); });
  loadMembers();
})();
