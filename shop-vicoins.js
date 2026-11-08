(() => {
  const rewardsRoot = document.querySelector('#shopRewards');
  const feedback = document.querySelector('#shopFeedback');
  const ordersRoot = document.querySelector('#shopOrders');
  const requestedTitleInput = document.querySelector('#shopRequestedTitle');
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  const rewards = [
    {id:'content-15',contentLimit:15,coinCost:500},
    {id:'content-20',contentLimit:20,coinCost:600},
    {id:'content-25',contentLimit:25,coinCost:700},
    {id:'content-30',contentLimit:30,coinCost:800}
  ];
  let balance = 0;
  let orders = [];

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  async function api(path,options = {}) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a lojinha.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function updateBalance(value,broadcast = true) {
    balance = Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
    document.querySelector('#shopVicoinsCount').textContent = balance.toLocaleString('pt-BR');
    if (broadcast) window.dispatchEvent(new CustomEvent('cardapio:vicoins-updated',{detail:{balance}}));
    renderRewards();
  }

  function statusText(order) {
    if (order.status === 'delivered') return 'Entregue';
    if (order.status === 'cancelled') return 'Cancelado · Vicoins devolvidos';
    return 'Aguardando atendimento';
  }

  function renderRewards() {
    const authenticated = window.CardapioAuth?.isAuthenticated();
    rewardsRoot.innerHTML = rewards.map(reward => `<article class="shop-reward-card"><span class="shop-reward-kicker">VALE DE CONTEÚDO</span><h2>Resgate até <strong>${safe(reward.contentLimit.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))}</strong></h2><p>Use Vicoins para solicitar um resgate de conteúdo neste valor ou menos.</p><div class="shop-reward-cost"><img src="assets/vicoins-coin.png" alt=""><strong>${reward.coinCost.toLocaleString('pt-BR')}</strong><span>Vicoins</span></div><button type="button" data-reward-id="${safe(reward.id)}" ${authenticated && balance < reward.coinCost ? 'disabled' : ''}>${!authenticated ? 'Entrar para resgatar' : balance < reward.coinCost ? 'Saldo insuficiente' : 'Resgatar'}</button></article>`).join('');
    rewardsRoot.querySelectorAll('[data-reward-id]').forEach(button => button.addEventListener('click',() => submitOrder(button)));
  }

  function renderOrders() {
    if (!orders.length) {
      ordersRoot.innerHTML = '<p class="shop-empty">Você ainda não solicitou um vale.</p>';
      return;
    }
    ordersRoot.innerHTML = orders.map(order => `<article class="shop-order-row"><div><strong>Vale de resgate até ${safe(Number(order.contentLimit).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))}</strong>${order.requestedTitle ? `<small>Conteúdo desejado: ${safe(order.requestedTitle)}</small>` : ''}<small>${safe(new Date(order.createdAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}))} · ${Number(order.coinCost).toLocaleString('pt-BR')} Vicoins</small></div><span class="shop-order-status status-${safe(order.status)}">${safe(statusText(order))}</span></article>`).join('');
  }

  async function load() {
    if (!window.CardapioAuth?.isAuthenticated()) {
      updateBalance(0);
      orders = [];
      renderOrders();
      feedback.textContent = 'Entre com a Twitch para consultar seu saldo e resgatar uma oferta.';
      return;
    }
    feedback.textContent = 'Carregando seu saldo e seus pedidos…';
    try {
      const [wallet,history] = await Promise.all([api('/api/account/vicoins'),api('/api/account/vicoins-orders')]);
      updateBalance(wallet.balance);
      orders = Array.isArray(history.orders) ? history.orders : [];
      renderOrders();
      feedback.textContent = 'Escolha um vale compatível com o conteúdo que deseja resgatar.';
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível carregar sua carteira.';
    }
  }

  async function submitOrder(button) {
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para resgatar Vicoins.')) return;
    const reward = rewards.find(item => item.id === button.dataset.rewardId);
    if (!reward) return;
    if (balance < reward.coinCost) {
      feedback.textContent = 'Você não tem Vicoins suficientes para este vale.';
      return;
    }
    const amount = reward.contentLimit.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    if (!window.confirm(`Solicitar um vale de resgate de conteúdo até ${amount} por ${reward.coinCost} Vicoins? As moedas serão descontadas agora. Se o pedido for cancelado pelo administrador, elas serão devolvidas.`)) return;
    button.dataset.requestKey = button.dataset.requestKey || crypto.randomUUID();
    button.disabled = true;
    feedback.textContent = 'Registrando seu pedido…';
    try {
      const data = await api('/api/shop/vicoins-orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rewardId:reward.id,requestKey:button.dataset.requestKey,title:requestedTitleInput.value.trim()})});
      delete button.dataset.requestKey;
      updateBalance(data.balance);
      if (!orders.some(order => order.id === data.order.id)) orders.unshift(data.order);
      renderOrders();
      feedback.textContent = `Pedido enviado ao painel administrativo. Foram descontados ${reward.coinCost} Vicoins.`;
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível registrar o pedido.';
      button.disabled = false;
    }
  }

  window.CardapioVicoinsShop = {load};
  window.addEventListener('cardapio:auth-updated',load);
  window.addEventListener('cardapio:vicoins-updated',event => updateBalance(event.detail?.balance,false));
  window.addEventListener('cardapio:vicoins-orders-updated',load);
  window.CardapioAuth?.ready.then(load);
  renderRewards();
})();
