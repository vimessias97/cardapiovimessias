(() => {
  const rewardsRoot = document.querySelector('#shopRewards');
  const feedback = document.querySelector('#shopFeedback');
  const ordersRoot = document.querySelector('#shopOrders');
  const requestedTitleInput = document.querySelector('#shopRequestedTitle');
  const dailyClaimButton = document.querySelector('#claimDailyVicoins');
  const dailyTimer = document.querySelector('#dailyVicoinsTimer');
  const bannerButton = document.querySelector('#redeemHalloweenBanner');
  const vimessiasBannerButton = document.querySelector('#requestVimessiasBanner');
  const vimessiasBannerFeedback = document.querySelector('#vimessiasBannerFeedback');
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  const rewards = [
    {id:'content-15',contentLimit:15,coinCost:500},
    {id:'content-20',contentLimit:20,coinCost:600},
    {id:'content-25',contentLimit:25,coinCost:700},
    {id:'content-30',contentLimit:30,coinCost:800}
  ];
  let balance = 0;
  let orders = [];
  let dailyAvailableAt = null;
  let dailyEligible = false;
  let dailyTimerInterval = null;
  let ownsHalloweenBanner = false;
  let ownsVimessiasBanner = false;
  let vimessiasBannerOrder = null;

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
    renderProfileBanner();
    renderVimessiasBanner();
  }

  function statusText(order) {
    if (order.status === 'delivered') return 'Entregue';
    if (order.status === 'cancelled') return 'Cancelado · Vicoins devolvidos';
    return 'Aguardando atendimento';
  }

  function renderDailyStatus() {
    if (!window.CardapioAuth?.isAuthenticated()) {
      dailyTimer.textContent = 'Entre com a Twitch para liberar';
      dailyClaimButton.textContent = 'Entrar';
      dailyClaimButton.disabled = false;
      return;
    }
    if (dailyEligible) {
      dailyTimer.textContent = 'Disponível agora';
      dailyClaimButton.textContent = 'Resgatar';
      dailyClaimButton.disabled = false;
      return;
    }
    if (!dailyAvailableAt) {
      dailyTimer.textContent = 'Carregando disponibilidade…';
      dailyClaimButton.textContent = 'Aguarde';
      dailyClaimButton.disabled = true;
      return;
    }
    const remaining = Math.max(0,Date.parse(dailyAvailableAt) - Date.now());
    if (!remaining) {
      dailyEligible = true;
      renderDailyStatus();
      return;
    }
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    dailyTimer.textContent = `Próximo resgate em ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    dailyClaimButton.textContent = 'Já resgatado';
    dailyClaimButton.disabled = true;
  }

  async function loadDailyStatus() {
    if (!window.CardapioAuth?.isAuthenticated()) {
      dailyAvailableAt = null;
      dailyEligible = false;
      renderDailyStatus();
      return;
    }
    try {
      const data = await api('/api/account/vicoins/daily');
      dailyAvailableAt = data.availableAt || null;
      dailyEligible = Boolean(data.eligible);
      if (Number.isSafeInteger(Number(data.balance))) updateBalance(data.balance);
      renderDailyStatus();
    } catch (error) {
      dailyTimer.textContent = error.message || 'Não foi possível consultar o bônus.';
      dailyClaimButton.disabled = true;
    }
  }

  function renderRewards() {
    const authenticated = window.CardapioAuth?.isAuthenticated();
    rewardsRoot.innerHTML = rewards.map(reward => `<article class="shop-reward-card"><span class="shop-reward-kicker">VALE DE CONTEÚDO</span><h2>Resgate até <strong>${safe(reward.contentLimit.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))}</strong></h2><p>Use Vicoins para solicitar um resgate de conteúdo neste valor ou menos.</p><div class="shop-reward-cost"><img src="assets/vicoins-coin.png" alt=""><strong>${reward.coinCost.toLocaleString('pt-BR')}</strong><span>Vicoins</span></div><button type="button" data-reward-id="${safe(reward.id)}" ${authenticated && balance < reward.coinCost ? 'disabled' : ''}>${!authenticated ? 'Entrar para resgatar' : balance < reward.coinCost ? 'Saldo insuficiente' : 'Resgatar'}</button></article>`).join('');
    rewardsRoot.querySelectorAll('[data-reward-id]').forEach(button => button.addEventListener('click',() => submitOrder(button)));
  }

  function renderProfileBanner() {
    const authenticated = window.CardapioAuth?.isAuthenticated();
    bannerButton.disabled = ownsHalloweenBanner || !authenticated || balance < 100;
    bannerButton.textContent = ownsHalloweenBanner ? 'Equipado no seu perfil' : !authenticated ? 'Entre para resgatar' : balance < 100 ? 'Vicoins insuficientes' : 'Resgatar por 100 Vicoins';
  }

  function renderVimessiasBanner() {
    const authenticated = window.CardapioAuth?.isAuthenticated();
    if (!authenticated) {
      vimessiasBannerButton.disabled = false;
      vimessiasBannerButton.textContent = 'Entre para solicitar';
      vimessiasBannerFeedback.textContent = 'Entre com a Twitch para solicitar este banner.';
      return;
    }
    if (ownsVimessiasBanner) {
      vimessiasBannerButton.disabled = true;
      vimessiasBannerButton.textContent = 'Liberado no seu perfil';
      vimessiasBannerFeedback.textContent = 'Banner aprovado e aplicado ao seu perfil.';
      return;
    }
    if (vimessiasBannerOrder?.status === 'pending') {
      vimessiasBannerButton.disabled = true;
      vimessiasBannerButton.textContent = 'Aguardando aprovação';
      vimessiasBannerFeedback.innerHTML = 'Pedido registrado. Após pagar, aguarde a conferência e aprovação no painel. <a href="https://livepix.gg/vimessias" target="_blank" rel="noopener noreferrer">Abrir LivePix ↗</a>';
      return;
    }
    if (vimessiasBannerOrder?.status === 'rejected') vimessiasBannerFeedback.textContent = 'O pedido anterior foi rejeitado. Você pode solicitar novamente.';
    else vimessiasBannerFeedback.textContent = 'Após registrar o pedido, abra o LivePix e aguarde a aprovação administrativa.';
    vimessiasBannerButton.disabled = false;
    vimessiasBannerButton.textContent = 'Solicitar banner por R$ 5,00';
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
      ownsHalloweenBanner = false;
      ownsVimessiasBanner = false;
      vimessiasBannerOrder = null;
      renderProfileBanner();
      renderVimessiasBanner();
      renderOrders();
      loadDailyStatus();
      feedback.textContent = 'Entre com a Twitch para consultar seu saldo e resgatar uma oferta.';
      return;
    }
    feedback.textContent = 'Carregando seu saldo e seus pedidos…';
    try {
      const [wallet,history,bannerInventory,bannerOrders] = await Promise.all([api('/api/account/vicoins'),api('/api/account/vicoins-orders'),api('/api/account/profile-banner'),api('/api/account/profile-banner-orders')]);
      updateBalance(wallet.balance);
      ownsHalloweenBanner = Array.isArray(bannerInventory.owned) && bannerInventory.owned.includes('halloween-michael');
      ownsVimessiasBanner = Array.isArray(bannerInventory.owned) && bannerInventory.owned.includes('vimessias');
      vimessiasBannerOrder = Array.isArray(bannerOrders.orders) ? bannerOrders.orders.find(order => order.bannerId === 'vimessias') || null : null;
      renderProfileBanner();
      renderVimessiasBanner();
      orders = Array.isArray(history.orders) ? history.orders : [];
      renderOrders();
      await loadDailyStatus();
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

  dailyClaimButton.addEventListener('click',async () => {
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para resgatar seus 20 Vicoins diários.')) return;
    if (!dailyEligible) return;
    dailyClaimButton.disabled = true;
    dailyTimer.textContent = 'Registrando seu bônus…';
    try {
      const data = await api('/api/account/vicoins/daily',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
      dailyAvailableAt = data.availableAt;
      dailyEligible = false;
      updateBalance(data.balance);
      feedback.textContent = 'Você recebeu 20 Vicoins. O próximo bônus poderá ser resgatado em 24 horas.';
      renderDailyStatus();
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível resgatar o bônus diário.';
      await loadDailyStatus();
    }
  });

  bannerButton.addEventListener('click',async () => {
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para resgatar um banner de perfil.')) return;
    if (ownsHalloweenBanner) return;
    if (balance < 100) {
      feedback.textContent = 'Você precisa de 100 Vicoins para resgatar este banner.';
      return;
    }
    if (!window.confirm('Resgatar o banner Halloween · Michael Myers por 100 Vicoins? Ele será aplicado automaticamente ao seu perfil.')) return;
    bannerButton.disabled = true;
    feedback.textContent = 'Aplicando o banner ao seu perfil…';
    try {
      const data = await api('/api/shop/profile-banners',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bannerId:'halloween-michael'})});
      ownsHalloweenBanner = data.inventory?.owned?.includes('halloween-michael') || false;
      updateBalance(data.balance);
      renderProfileBanner();
      feedback.textContent = data.alreadyOwned ? 'Este banner já está no seu perfil.' : 'Banner resgatado e aplicado ao seu perfil. Foram descontados 100 Vicoins.';
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível resgatar este banner.';
      await load();
    }
  });

  vimessiasBannerButton.addEventListener('click',async () => {
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para solicitar o banner ViMessias.')) return;
    if (ownsVimessiasBanner || vimessiasBannerOrder?.status === 'pending') return;
    if (!window.confirm('Registrar um pedido do banner ViMessias por R$ 5,00? O pedido ficará pendente até a conferência do pagamento no LivePix e aprovação administrativa.')) return;
    vimessiasBannerButton.disabled = true;
    vimessiasBannerFeedback.textContent = 'Registrando seu pedido…';
    try {
      const data = await api('/api/shop/profile-banner-orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bannerId:'vimessias'})});
      vimessiasBannerOrder = data.order;
      renderVimessiasBanner();
      feedback.textContent = 'Pedido do banner registrado. Faça o pagamento no LivePix e aguarde a aprovação.';
    } catch (error) {
      vimessiasBannerFeedback.textContent = error.message || 'Não foi possível registrar o pedido.';
      vimessiasBannerButton.disabled = false;
    }
  });

  window.CardapioVicoinsShop = {load};
  window.addEventListener('cardapio:auth-updated',load);
  window.addEventListener('cardapio:vicoins-updated',event => updateBalance(event.detail?.balance,false));
  window.addEventListener('cardapio:vicoins-orders-updated',load);
  window.CardapioAuth?.ready.then(load);
  if (dailyTimerInterval) clearInterval(dailyTimerInterval);
  dailyTimerInterval = setInterval(renderDailyStatus,1000);
  renderDailyStatus();
  renderRewards();
  renderProfileBanner();
})();
