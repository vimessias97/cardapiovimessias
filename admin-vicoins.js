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

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
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

  function statusLabel(order) {
    if (order.orderType === 'paid-banner') return ({pending:'Aguardando pagamento',approved:'Aprovado · banner liberado',completed:'Finalizado',rejected:'Rejeitado',deleted:'Excluído'})[order.status] || 'Pendente';
    if (order.orderType === 'game-key') return ({pending:'Aguardando entrega da key',delivered:'Finalizado · key entregue',deleted:'Excluído'})[order.status] || 'Pendente';
    return ({pending:'Pendente',delivered:'Finalizado',cancelled:'Cancelado · Vicoins devolvidos',deleted:'Excluído'})[order.status] || 'Pendente';
  }

  function actionMarkup(order) {
    const finishLabel = order.orderType === 'paid-banner' ? 'Finalizar' : order.orderType === 'game-key' ? 'Finalizar após entregar a key' : 'Finalizar';
    const canFinish = order.status === 'pending' && order.orderType !== 'paid-banner' || order.status === 'approved' && order.orderType === 'paid-banner';
    const approve = order.orderType === 'paid-banner' && order.status === 'pending' ? `<button type="button" data-shop-order-action="approve" data-order-type="${safe(order.orderType)}" data-order-id="${safe(order.id)}">Confirmar pagamento e liberar</button>` : '';
    const finish = canFinish ? `<button type="button" data-shop-order-action="finish" data-order-type="${safe(order.orderType)}" data-order-id="${safe(order.id)}">${finishLabel}</button>` : '';
    const deleteLabel = order.status === 'pending' && order.orderType !== 'paid-banner' ? 'Excluir e devolver Vicoins' : 'Excluir pedido';
    return `<div class="admin-vicoins-actions">${approve}${finish}<button type="button" class="is-delete" data-shop-order-action="delete" data-order-type="${safe(order.orderType)}" data-order-id="${safe(order.id)}">${deleteLabel}</button></div>`;
  }

  function orderCopy(order) {
    const requester = order.requester?.displayName || order.requester?.login || 'Usuário Twitch';
    const login = order.requester?.login ? ` · @${safe(order.requester.login)}` : '';
    if (order.orderType === 'paid-banner') return `<span class="admin-vicoins-order-kind">BANNER · LIVEPIX</span><h3>${safe(order.bannerName || 'Banner ViMessias')}</h3><p>Solicitado por <strong>${safe(requester)}</strong>${login}</p><small>${money(order.amount)} via LivePix · ${safe(dateLabel(order.createdAt))}</small>${order.status === 'pending' ? `<p><a class="admin-banner-livepix" href="${safe(order.paymentUrl || 'https://livepix.gg/vimessias')}" target="_blank" rel="noopener noreferrer">Abrir LivePix ↗</a></p>` : ''}`;
    if (order.orderType === 'game-key') return `<span class="admin-vicoins-order-kind">KEY DE JOGO</span><h3>${safe(order.gameTitle || 'Jogo')}</h3><p>Solicitado por <strong>${safe(requester)}</strong>${login}</p><p><a href="${safe(order.steamUrl || 'https://store.steampowered.com/')}" target="_blank" rel="noopener noreferrer">Página do jogo na Steam ↗</a></p><small>${Number(order.coinCost || 0).toLocaleString('pt-BR')} Vicoins · ${safe(dateLabel(order.createdAt))}</small>`;
    return `<span class="admin-vicoins-order-kind">VALE DE CONTEÚDO</span><h3>Resgate até ${money(order.contentLimit)}</h3>${order.requestedTitle ? `<p>Conteúdo desejado: <strong>${safe(order.requestedTitle)}</strong></p>` : ''}<p>Solicitado por <strong>${safe(requester)}</strong>${login}</p><small>${Number(order.coinCost || 0).toLocaleString('pt-BR')} Vicoins · ${safe(dateLabel(order.createdAt))}</small>`;
  }

  function render() {
    if (!orders.length) {
      list.innerHTML = '<p class="admin-vicoins-empty">Nenhum pedido da lojinha foi recebido.</p>';
      return;
    }
    list.innerHTML = orders.map(order => `<article class="admin-vicoins-order admin-shop-order-row" data-order-type="${safe(order.orderType)}"><div class="admin-vicoins-order-copy">${orderCopy(order)}</div><span class="admin-vicoins-status status-${safe(order.status)}">${safe(statusLabel(order))}</span>${actionMarkup(order)}</article>`).join('');
  }

  async function load() {
    if (!window.CardapioAuth?.isAdmin()) {
      orders = [];
      list.replaceChildren();
      feedback.textContent = 'Área exclusiva do administrador.';
      return [];
    }
    feedback.textContent = 'Carregando todos os pedidos da lojinha…';
    try {
      const data = await api('/api/admin/shop-orders');
      orders = Array.isArray(data.orders) ? data.orders : [];
      render();
      const awaiting = orders.filter(order => order.status === 'pending' || order.status === 'approved').length;
      feedback.textContent = awaiting ? `${awaiting} pedido(s) aguardando análise, entrega ou finalização.` : 'Os novos pedidos de vales, banners e jogos aparecerão aqui.';
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível carregar os pedidos da lojinha.';
    }
    return orders;
  }

  async function update(id,orderType,action,button) {
    const order = orders.find(item => item.id === id && item.orderType === orderType);
    if (!order) return;
    const person = order.requester?.displayName || order.requester?.login || 'este usuário';
    if (action === 'approve' && !window.confirm(`Confirma que recebeu ${money(order.amount)} no LivePix de ${person} e quer liberar o banner?`)) return;
    if (action === 'finish' && !window.confirm(orderType === 'game-key' ? `Confirma que entregou a key de “${order.gameTitle}” para ${person}?` : 'Finalizar este pedido da lojinha?')) return;
    if (action === 'delete') {
      const message = orderType === 'paid-banner'
        ? `Excluir o pedido de banner de ${person} da lista? Isso não estorna eventual pagamento feito no LivePix.`
        : order.status === 'pending'
          ? `Excluir o pedido de ${person}? Os ${Number(order.coinCost || 0).toLocaleString('pt-BR')} Vicoins serão devolvidos.`
          : `Excluir este pedido de ${person} da lista?`;
      if (!window.confirm(message)) return;
    }
    button.disabled = true;
    feedback.textContent = action === 'approve' ? 'Confirmando o pagamento e liberando o banner…' : action === 'finish' ? 'Finalizando pedido…' : 'Excluindo pedido…';
    try {
      const data = await api('/api/admin/shop-orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,orderType,action})});
      orders = Array.isArray(data.orders) ? data.orders : [];
      render();
      feedback.textContent = action === 'approve' ? 'Pagamento confirmado e banner liberado no perfil.' : action === 'finish' ? 'Pedido finalizado.' : orderType !== 'paid-banner' && order.status === 'pending' ? 'Pedido excluído e Vicoins devolvidos.' : 'Pedido excluído da lista.';
      window.dispatchEvent(new CustomEvent('cardapio:vicoins-orders-updated'));
      window.CardapioVicoinsShop?.load();
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível atualizar este pedido.';
      button.disabled = false;
    }
  }

  list.addEventListener('click',event => {
    const button = event.target.closest('[data-shop-order-action]');
    if (button) update(button.dataset.orderId,button.dataset.orderType,button.dataset.shopOrderAction,button);
  });
  window.addEventListener('cardapio:auth-updated',event => {
    if (event.detail?.user?.role === 'admin') load();
    else { orders = []; list.replaceChildren(); }
  });
  window.CardapioAdminVicoins = {load};
  window.CardapioAuth?.ready.then(() => { if (window.CardapioAuth?.isAdmin()) load(); });
})();
