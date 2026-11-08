(() => {
  const list = document.querySelector('#adminVicoinsList');
  if (!list) return;
  const feedback = document.querySelector('#adminVicoinsFeedback');
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
        if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar os pedidos da lojinha.');
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
      list.innerHTML = '<p class="admin-vicoins-empty">Nenhum pedido de Vicoins foi recebido.</p>';
      return;
    }
    list.innerHTML = orders.map(order => {
      const pending = order.status === 'pending';
      const status = order.status === 'delivered' ? 'Entregue' : order.status === 'cancelled' ? 'Cancelado · moedas devolvidas' : 'Pendente';
      const actions = pending ? `<div class="admin-vicoins-actions"><button type="button" data-vicoins-action="delivered" data-vicoins-order="${safe(order.id)}">Marcar como entregue</button><button type="button" data-vicoins-action="cancel" data-vicoins-order="${safe(order.id)}">Cancelar e devolver moedas</button></div>` : '';
      return `<article class="admin-vicoins-order"><div class="admin-vicoins-order-copy"><span class="admin-vicoins-order-kind">VALE DE CONTEÚDO</span><h3>Resgate até ${safe(Number(order.contentLimit).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))}</h3>${order.requestedTitle ? `<p>Conteúdo desejado: <strong>${safe(order.requestedTitle)}</strong></p>` : ''}<p>Solicitado por <strong>${safe(order.requester?.displayName || order.requester?.login || 'Usuário Twitch')}</strong>${order.requester?.login ? ` · @${safe(order.requester.login)}` : ''}</p><small>${Number(order.coinCost).toLocaleString('pt-BR')} Vicoins · ${safe(dateLabel(order.createdAt))}</small></div><span class="admin-vicoins-status status-${safe(order.status)}">${status}</span>${actions}</article>`;
    }).join('');
  }

  async function load() {
    if (!window.CardapioAuth?.isAdmin()) {
      orders = [];
      list.replaceChildren();
      feedback.textContent = 'Área exclusiva do administrador.';
      return [];
    }
    feedback.textContent = 'Carregando pedidos da lojinha…';
    try {
      const data = await api('/api/admin/vicoins-orders');
      orders = Array.isArray(data.orders) ? data.orders : [];
      render();
      feedback.textContent = orders.some(item => item.status === 'pending') ? 'Revise os pedidos pendentes e entregue o vale ou cancele para devolver as moedas.' : 'Os novos pedidos da comunidade aparecerão aqui.';
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível carregar os pedidos da lojinha.';
    }
    return orders;
  }

  async function update(id,action,button) {
    const order = orders.find(item => item.id === id);
    if (!order) return;
    if (action === 'cancel' && !window.confirm(`Cancelar o vale de ${Number(order.contentLimit).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} de ${order.requester?.displayName || order.requester?.login || 'este usuário'} e devolver ${order.coinCost} Vicoins?`)) return;
    button.disabled = true;
    feedback.textContent = action === 'delivered' ? 'Marcando vale como entregue…' : 'Cancelando pedido e devolvendo Vicoins…';
    try {
      const data = await api('/api/admin/vicoins-orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,action})});
      orders = Array.isArray(data.orders) ? data.orders : [];
      render();
      feedback.textContent = action === 'delivered' ? 'Vale marcado como entregue.' : 'Pedido cancelado; Vicoins devolvidos ao usuário.';
      window.dispatchEvent(new CustomEvent('cardapio:vicoins-orders-updated'));
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível atualizar este pedido.';
      button.disabled = false;
    }
  }

  list.addEventListener('click',event => {
    const button = event.target.closest('[data-vicoins-action]');
    if (button) update(button.dataset.vicoinsOrder,button.dataset.vicoinsAction,button);
  });
  window.addEventListener('cardapio:auth-updated',event => {
    if (event.detail?.user?.role === 'admin') load();
    else { orders = []; list.replaceChildren(); }
  });
  window.CardapioAdminVicoins = {load};
  window.CardapioAuth?.ready.then(() => { if (window.CardapioAuth?.isAdmin()) load(); });
})();
