(() => {
  const list = document.querySelector('#adminProfileBannersList');
  if (!list) return;
  const feedback = document.querySelector('#adminProfileBannersFeedback');
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let orders = [];

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
  }

  async function api(path,options = {}) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os pedidos de banner.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function render() {
    if (!orders.length) {
      list.innerHTML = '<p class="admin-vicoins-empty">Nenhum pedido de banner foi recebido.</p>';
      return;
    }
    list.innerHTML = orders.map(order => {
      const pending = order.status === 'pending';
      const status = order.status === 'approved' ? 'Aprovado · liberado no perfil' : order.status === 'rejected' ? 'Rejeitado' : 'Pendente';
      const actions = pending ? `<div class="admin-vicoins-actions"><button type="button" data-banner-action="approve" data-banner-order="${safe(order.id)}">Confirmar pagamento e aprovar</button><button type="button" data-banner-action="reject" data-banner-order="${safe(order.id)}">Rejeitar pedido</button><a class="admin-banner-livepix" href="${safe(order.paymentUrl || 'https://livepix.gg/vimessias')}" target="_blank" rel="noopener noreferrer">Abrir LivePix ↗</a></div>` : '';
      const who = order.requester?.displayName || order.requester?.login || 'Usuário Twitch';
      return `<article class="admin-vicoins-order"><div class="admin-vicoins-order-copy"><span class="admin-vicoins-order-kind">BANNER DE PERFIL</span><h3>${safe(order.bannerName || 'ViMessias')}</h3><p>Solicitado por <strong>${safe(who)}</strong>${order.requester?.login ? ` · @${safe(order.requester.login)}` : ''}</p><small>${Number(order.amount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} via LivePix · ${safe(dateLabel(order.createdAt))}</small></div><span class="admin-vicoins-status status-${safe(order.status)}">${status}</span>${actions}</article>`;
    }).join('');
  }

  async function load() {
    if (!window.CardapioAuth?.isAdmin()) {
      orders = [];
      list.replaceChildren();
      feedback.textContent = 'Área exclusiva do administrador.';
      return [];
    }
    try {
      const data = await api('/api/admin/profile-banner-orders');
      orders = Array.isArray(data.orders) ? data.orders : [];
      render();
      feedback.textContent = '';
    } catch (error) { feedback.textContent = error.message || 'Não foi possível carregar os pedidos de banner.'; }
    return orders;
  }

  async function update(id,action,button) {
    const order = orders.find(item => item.id === id);
    if (!order) return;
    if (action === 'approve' && !window.confirm(`Confirma que recebeu R$ 5,00 no LivePix de ${order.requester?.displayName || order.requester?.login || 'este usuário'}? A aprovação libera e aplica o banner ViMessias no perfil.`)) return;
    if (action === 'reject' && !window.confirm('Rejeitar este pedido? O banner não será liberado no perfil.')) return;
    button.disabled = true;
    feedback.textContent = action === 'approve' ? 'Aprovando e aplicando o banner…' : 'Rejeitando pedido…';
    try {
      const data = await api('/api/admin/profile-banner-orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,action})});
      orders = Array.isArray(data.orders) ? data.orders : [];
      render();
      feedback.textContent = action === 'approve' ? 'Pagamento confirmado e banner liberado no perfil.' : 'Pedido rejeitado; banner não liberado.';
      window.dispatchEvent(new CustomEvent('cardapio:vicoins-orders-updated'));
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível atualizar o pedido.';
      button.disabled = false;
    }
  }

  list.addEventListener('click',event => {
    const button = event.target.closest('[data-banner-action]');
    if (button) update(button.dataset.bannerOrder,button.dataset.bannerAction,button);
  });
  window.addEventListener('cardapio:auth-updated',event => {
    if (event.detail?.user?.role === 'admin') load();
    else { orders = []; list.replaceChildren(); }
  });
  window.CardapioAdminProfileBanners = {load};
  window.CardapioAuth?.ready.then(() => { if (window.CardapioAuth?.isAdmin()) load(); });
})();
