(() => {
  const list = document.querySelector('#adminRedemptionsList');
  const feedback = document.querySelector('#adminRedemptionsFeedback');
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let redemptions = [];

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  function localDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0,16);
  }

  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  async function api(path,options = {}) {
    let lastError;
    for (let index = 0; index < apiBases.length; index++) {
      try {
        const response = await fetch(`${apiBases[index]}${path}`,{credentials:'same-origin',...options});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a fila de resgates.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function render() {
    if (!redemptions.length) {
      list.replaceChildren();
      feedback.textContent = 'Nenhum pedido de resgate foi enviado ainda.';
      return;
    }
    feedback.textContent = '';
    list.innerHTML = redemptions.map((item,index) => {
      const removeButton = `<button type="button" class="admin-action delete" data-redemption-id="${safe(item.id)}" data-admin-action="delete">Excluir</button>`;
      const controls = item.status === 'rejected'
        ? `<p class="admin-redemption-final-date">Data do resgate: ${safe(dateLabel(item.scheduledAt))}</p><div class="admin-redemption-edit">${removeButton}</div>`
        : `<form class="admin-redemption-edit" data-admin-edit="${safe(item.id)}"><label>Data e horário<input type="datetime-local" name="scheduledAt" required value="${safe(localDateTime(item.scheduledAt))}"></label><button type="submit" class="admin-action secondary">Salvar data</button>${item.status === 'pending' ? `<button type="button" class="admin-action approve" data-redemption-id="${safe(item.id)}" data-admin-action="approve">Aprovar</button><button type="button" class="admin-action reject" data-redemption-id="${safe(item.id)}" data-admin-action="reject">Rejeitar</button>` : ''}${removeButton}</form>`;
      return `<article class="admin-redemption-card status-${safe(item.status)}" data-redemption-card="${index}">${item.posterUrl ? `<img class="admin-redemption-poster" src="${safe(item.posterUrl)}" alt="Pôster de ${safe(item.title)}" loading="lazy">` : '<span class="admin-redemption-poster admin-no-poster" aria-hidden="true">✦</span>'}<div class="admin-redemption-main"><div class="admin-redemption-title-row"><div><h2>${safe(item.title)}</h2><p>${safe(item.mediaType === 'tv' ? 'Série' : 'Filme')} · ${safe(item.durationLabel || 'Duração não informada')}</p></div><span class="admin-redemption-status status-${safe(item.status)}">${item.status === 'approved' ? 'Aprovado' : item.status === 'rejected' ? 'Rejeitado' : 'Pendente'}</span></div><p class="admin-redemption-requester">Solicitante: <strong>@${safe(item.requester?.login || 'login indisponível')}</strong>${item.requester?.displayName ? ` · ${safe(item.requester.displayName)}` : ''}</p><p class="admin-redemption-requested-date">Solicitado em ${safe(dateLabel(item.createdAt))}</p>${controls}</div></article>`;
    }).join('');
    list.querySelectorAll('[data-admin-edit]').forEach(form => form.addEventListener('submit',event => {
      event.preventDefault();
      const value = new Date(form.elements.scheduledAt.value);
      if (Number.isNaN(value.getTime()) || value <= new Date()) {
        feedback.textContent = 'Escolha uma data e um horário futuros.';
        return;
      }
      update(form.dataset.adminEdit,'edit',value.toISOString(),form);
    }));
    list.querySelectorAll('[data-admin-action]').forEach(button => button.addEventListener('click',() => update(button.dataset.redemptionId,button.dataset.adminAction,'',button.closest('[data-redemption-card]'))));
  }

  async function update(id,action,scheduledAt,control) {
    if (action === 'delete') {
      const title = redemptions.find(item => item.id === id)?.title || 'este resgate';
      if (!window.confirm(`Excluir o resgate de "${title}"? Esta ação não pode ser desfeita.`)) return;
    }
    if (control) control.querySelectorAll('button,input').forEach(element => { element.disabled = true; });
    feedback.textContent = 'Atualizando pedido…';
    try {
      const data = await api('/api/admin/redemptions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,action,scheduledAt})});
      redemptions = Array.isArray(data.redemptions) ? data.redemptions : [];
      render();
      window.dispatchEvent(new CustomEvent('cardapio:redemptions-updated'));
      const awarded = action === 'approve' ? Number(redemptions.find(item => item.id === id)?.vicoinsAwarded) || 0 : 0;
      feedback.textContent = action === 'approve' ? `Resgate aprovado e publicado em Últimos resgates e no calendário.${awarded ? ` ${awarded} Vicoins creditados ao usuário.` : ''}` : action === 'reject' ? 'Solicitação rejeitada.' : action === 'delete' ? 'Resgate excluído.' : 'Data do resgate atualizada.';
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível atualizar este pedido.';
      if (control) control.querySelectorAll('button,input').forEach(element => { element.disabled = false; });
    }
  }

  async function load() {
    if (!window.CardapioAuth?.isAdmin()) {
      redemptions = [];
      list.replaceChildren();
      feedback.textContent = 'Área exclusiva do administrador.';
      return redemptions;
    }
    feedback.textContent = 'Carregando solicitações…';
    try {
      const data = await api('/api/admin/redemptions');
      redemptions = Array.isArray(data.redemptions) ? data.redemptions : [];
      render();
    } catch (error) {
      redemptions = [];
      list.replaceChildren();
      feedback.textContent = error.message || 'Não foi possível carregar as solicitações.';
    }
    return redemptions;
  }

  window.CardapioAdminRedemptions = {load};
  window.addEventListener('cardapio:auth-updated',event => {
    if (event.detail?.user?.role === 'admin' && location.hash === '#admin') load();
  });
})();
