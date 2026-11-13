(() => {
  const rewardsRoot = document.querySelector('#shopRewards');
  const feedback = document.querySelector('#shopFeedback');
  const requestedTitleInput = document.querySelector('#shopRequestedTitle');
  const dailyClaimButton = document.querySelector('#claimDailyVicoins');
  const dailyTimer = document.querySelector('#dailyVicoinsTimer');
  const dailyClaimAmountLabel = document.querySelector('#dailyClaimAmount');
  const bannerGrid = document.querySelector('#shopBannerGrid');
  const gameKeysRoot = document.querySelector('#shopGameKeysList');
  const gameKeysFeedback = document.querySelector('#shopGameKeysFeedback');
  const moreBannersGrid = document.querySelector('#shopMoreBannersGrid');
  const moreBannersDialog = document.querySelector('#shopMoreBannersDialog');
  const moreBannersClose = document.querySelector('#shopMoreBannersClose');
  const clubFeedback = document.querySelector('#clubVimeFeedback');
  const clubRequestButton = document.querySelector('#clubVimeRequest');
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let rewards = [
    {id:'content-15',contentLimit:15,coinCost:500},
    {id:'content-20',contentLimit:20,coinCost:600},
    {id:'content-25',contentLimit:25,coinCost:700},
    {id:'content-30',contentLimit:30,coinCost:800}
  ];
  let balance = 0;
  let infiniteBalance = false;
  let dailyAvailableAt = null;
  let dailyEligible = false;
  let dailyClaimAmount = 20;
  let dailyTimerInterval = null;
  let bannerCatalog = [];
  let gameKeys = [];
  let bannerInventory = {owned:[],equipped:null};
  let bannerOrders = [];
  let equippedProfileBannerId = '';
  let clubMembership = {active:false,pending:false,expiresAt:null,order:null};

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

  function updateBalance(value,broadcast = true,infinite = infiniteBalance) {
    balance = Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
    infiniteBalance = Boolean(infinite || window.CardapioAuth?.isAdmin());
    document.querySelector('#shopVicoinsCount').textContent = infiniteBalance ? '∞' : balance.toLocaleString('pt-BR');
    if (broadcast) window.dispatchEvent(new CustomEvent('cardapio:vicoins-updated',{detail:{balance,infinite:infiniteBalance}}));
    renderRewards();
    renderBanners();
    renderGameKeys();
  }

  function renderDailyStatus() {
    if (dailyClaimAmountLabel) dailyClaimAmountLabel.textContent = `+${dailyClaimAmount} Vicoins`;
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
      dailyClaimAmount = 20;
      renderDailyStatus();
      return;
    }
    try {
      const data = await api('/api/account/vicoins/daily');
      dailyAvailableAt = data.availableAt || null;
      dailyEligible = Boolean(data.eligible);
      dailyClaimAmount = Number.isSafeInteger(Number(data.claimAmount)) ? Number(data.claimAmount) : 20;
      if (Number.isSafeInteger(Number(data.balance))) updateBalance(data.balance);
      renderDailyStatus();
    } catch (error) {
      dailyTimer.textContent = error.message || 'Não foi possível consultar o bônus.';
      dailyClaimButton.disabled = true;
    }
  }

  function renderRewards() {
    const authenticated = window.CardapioAuth?.isAuthenticated();
    const isAdmin = Boolean(window.CardapioAuth?.isAdmin());
    rewardsRoot.innerHTML = rewards.map(reward => `<article class="shop-reward-card"><span class="shop-reward-kicker">VALE DE CONTEÚDO</span><h2>Resgate até <strong>${safe(reward.contentLimit.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))}</strong></h2><p>Use Vicoins para solicitar um resgate de conteúdo neste valor ou menos.</p><div class="shop-reward-cost"><img src="assets/vicoins-coin-optimized.png" alt=""><strong>${reward.coinCost.toLocaleString('pt-BR')}</strong><span>Vicoins</span></div>${isAdmin ? `<label class="shop-reward-admin-cost">Alterar custo <input type="number" min="1" max="1000000" step="1" value="${reward.coinCost}" data-reward-cost="${safe(reward.id)}"><span>Vicoins</span><button type="button" data-save-reward="${safe(reward.id)}">Salvar</button></label>` : ''}<button type="button" data-reward-id="${safe(reward.id)}" ${authenticated && balance < reward.coinCost ? 'disabled' : ''}>${!authenticated ? 'Entrar para resgatar' : balance < reward.coinCost ? 'Saldo insuficiente' : 'Resgatar'}</button></article>`).join('');
    rewardsRoot.querySelectorAll('[data-reward-id]').forEach(button => button.addEventListener('click',() => submitOrder(button)));
    rewardsRoot.querySelectorAll('[data-save-reward]').forEach(button => button.addEventListener('click',async () => {
      if (!window.CardapioAuth?.isAdmin()) return;
      const input = rewardsRoot.querySelector(`[data-reward-cost="${button.dataset.saveReward}"]`);
      const coinCost = Number(input?.value);
      if (!Number.isSafeInteger(coinCost) || coinCost < 1 || coinCost > 1000000) { feedback.textContent = 'Informe um valor entre 1 e 1.000.000 Vicoins.'; return; }
      button.disabled = true; feedback.textContent = 'Salvando custo do vale…';
      try { const data = await api('/api/admin/vicoins-rewards',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:button.dataset.saveReward,coinCost})}); rewards = data.rewards || rewards; renderRewards(); feedback.textContent = 'Novo custo salvo. Ele será usado nos próximos pedidos.'; }
      catch (error) { feedback.textContent = error.message || 'Não foi possível salvar o custo.'; button.disabled = false; }
    }));
  }

  function renderGameKeys() {
    if (!gameKeysRoot) return;
    if (!gameKeys.length) {
      gameKeysRoot.innerHTML = '<p class="shop-empty">Nenhuma key está disponível no momento. Volte em breve.</p>';
      return;
    }
    const authenticated = window.CardapioAuth?.isAuthenticated();
    gameKeysRoot.innerHTML = gameKeys.map(game => {
      const cost = Number(game.coinCost) || 0;
      const insufficient = authenticated && !infiniteBalance && balance < cost;
      const stock = Number(game.stock ?? 1);
      return `<article class="shop-game-key-card"><span class="shop-game-key-kicker">KEY DE JOGO</span><h3>${safe(game.title)}</h3><p class="shop-game-key-stock">Restam ${stock} ${stock === 1 ? 'unidade' : 'unidades'} no estoque</p><a href="${safe(game.steamUrl)}" target="_blank" rel="noopener noreferrer">Ver na Steam ↗</a><div class="shop-reward-cost"><img src="assets/vicoins-coin-optimized.png" alt=""><strong>${cost.toLocaleString('pt-BR')}</strong><span>Vicoins</span></div><button type="button" data-game-key-redeem="${safe(game.id)}" ${insufficient ? 'disabled' : ''}>${!authenticated ? 'Entrar para resgatar' : insufficient ? 'Saldo insuficiente' : 'Resgatar key'}</button></article>`;
    }).join('');
  }

  async function redeemGameKey(button) {
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para resgatar uma key de jogo.')) return;
    const game = gameKeys.find(item => item.id === button.dataset.gameKeyRedeem);
    if (!game) return;
    if (!infiniteBalance && balance < Number(game.coinCost)) { gameKeysFeedback.textContent = 'Você não tem Vicoins suficientes para este jogo.'; return; }
    if (!window.confirm(`Solicitar a key de “${game.title}” por ${Number(game.coinCost).toLocaleString('pt-BR')} Vicoins? O saldo será descontado agora e o administrador fará a entrega.`)) return;
    button.disabled = true;
    gameKeysFeedback.textContent = 'Registrando o pedido da key…';
    try {
      const data = await api('/api/shop/game-key-orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({gameKeyId:game.id})});
      updateBalance(data.balance);
      await load();
      gameKeysFeedback.textContent = `Pedido de “${game.title}” enviado ao painel administrativo. Foram descontados ${Number(game.coinCost).toLocaleString('pt-BR')} Vicoins.`;
      window.dispatchEvent(new CustomEvent('cardapio:vicoins-orders-updated'));
    } catch (error) {
      gameKeysFeedback.textContent = error.message || 'Não foi possível solicitar esta key.';
      button.disabled = false;
    }
  }

  function bannerCardMarkup(banner,authenticated,owned) {
    const hasBanner = owned.has(banner.id);
    const equipped = equippedProfileBannerId === banner.id;
    const pendingOrder = bannerOrders.find(order => order.bannerId === banner.id && order.status === 'pending');
    const lastOrder = bannerOrders.find(order => order.bannerId === banner.id);
    const livepix = banner.paymentType === 'livepix';
    const label = equipped ? 'Equipado' : hasBanner ? 'Trocar' : pendingOrder ? 'Aguardando' : !authenticated ? 'Entrar' : livepix ? 'Resgatar' : balance < Number(banner.coinCost) ? 'Sem saldo' : 'Resgatar';
    const disabled = !authenticated || equipped || Boolean(pendingOrder) || (!hasBanner && !livepix && balance < Number(banner.coinCost));
    const cost = livepix
      ? `<div class="shop-banner-price"><strong>${Number(banner.amount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong><span>via LivePix</span></div>`
      : `<div class="shop-reward-cost"><img src="assets/vicoins-coin-optimized.png" alt=""><strong>${Number(banner.coinCost).toLocaleString('pt-BR')}</strong><span>Vicoins</span></div>`;
    let status = '';
    if (livepix && pendingOrder) status = `<p class="shop-banner-order-feedback">Pedido pendente. <a href="${safe(pendingOrder.paymentUrl || 'https://livepix.gg/vimessias')}" target="_blank" rel="noopener noreferrer">Abrir LivePix ↗</a></p>`;
    else if (livepix && hasBanner) status = '<p class="shop-banner-order-feedback">Banner liberado no perfil.</p>';
    else if (livepix && lastOrder?.status === 'rejected') status = '<p class="shop-banner-order-feedback">Pedido anterior rejeitado; você pode solicitar de novo.</p>';
    return `<article class="shop-banner-card"><img class="shop-banner-preview" src="${safe(banner.imageUrl)}" alt="Banner de perfil: ${safe(banner.name)}" loading="lazy"><div class="shop-banner-details"><div class="shop-banner-action-row">${cost}<button type="button" class="shop-banner-redeem" data-shop-banner="${safe(banner.id)}" ${disabled ? 'disabled' : ''}>${label}</button></div>${status}</div></article>`;
  }

  function renderBanners() {
    const authenticated = window.CardapioAuth?.isAuthenticated();
    const owned = new Set(Array.isArray(bannerInventory.owned) ? bannerInventory.owned : []);
    const allBanners = bannerCatalog;
    bannerGrid.innerHTML = `<button type="button" class="shop-banner-card shop-more-banners-card" data-open-banners><span class="shop-more-banners-preview"><span aria-hidden="true">▧</span><strong>Confira todos os banners</strong></span></button>`;
    moreBannersGrid.innerHTML = allBanners.length ? allBanners.map(banner => bannerCardMarkup(banner,authenticated,owned)).join('') : '<p class="shop-empty shop-more-banners-empty">Ainda não há banners cadastrados. Volte em breve para conferir as novidades.</p>';
    renderClubVime();
  }

  function renderClubVime() {
    if (!clubFeedback || !clubRequestButton) return;
    const authenticated = window.CardapioAuth?.isAuthenticated();
    const active = clubMembership.active && Date.parse(clubMembership.expiresAt || '') > Date.now();
    clubRequestButton.disabled = !authenticated || active || clubMembership.pending;
    if (!authenticated) clubFeedback.textContent = 'Entre com a Twitch para solicitar o Clube Vime.';
    else if (active) clubFeedback.textContent = `Renovação disponível em ${formatClubCountdown(Date.parse(clubMembership.expiresAt))}.`;
    else if (clubMembership.pending) clubFeedback.innerHTML = 'Pedido enviado. <a href="https://livepix.gg/vimessias" target="_blank" rel="noopener noreferrer">Pague R$ 10 no LivePix ↗</a> e aguarde a conferência no painel administrativo.';
    else clubFeedback.textContent = 'Após pagar R$ 10 pelo LivePix, aguarde a aprovação do administrador. O banner será concedido manualmente.';
    clubRequestButton.textContent = active ? 'Clube Vime ativo' : clubMembership.pending ? 'Pedido aguardando aprovação' : 'Solicitar ou renovar Clube Vime · R$ 10';
  }

  function formatClubCountdown(expiresAt) {
    const ms = Math.max(0,expiresAt - Date.now());
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor(ms % 86400000 / 3600000);
    const minutes = Math.floor(ms % 3600000 / 60000);
    const seconds = Math.floor(ms % 60000 / 1000);
    return `${days}d ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  }

  async function load() {
    feedback.textContent = '';
    if (!window.CardapioAuth?.isAuthenticated()) {
      updateBalance(0,true,false);
      bannerInventory = {owned:[],equipped:null};
      bannerOrders = [];
      clubMembership = {active:false,pending:false,expiresAt:null,order:null};
      equippedProfileBannerId = '';
      try {
        const [catalog,offerData,gameData] = await Promise.all([api('/api/shop/profile-banners'),api('/api/shop/rewards'),api('/api/shop/game-keys')]);
        bannerCatalog = Array.isArray(catalog.banners) ? catalog.banners : [];
        gameKeys = Array.isArray(gameData.games) ? gameData.games : [];
        rewards = Array.isArray(offerData.rewards) ? offerData.rewards : rewards; renderRewards();
      } catch (error) { feedback.textContent = error.message || 'Não foi possível carregar os banners.'; }
      renderBanners();
      renderGameKeys();
      loadDailyStatus();
      if (!feedback.textContent.includes('carregar os banners')) feedback.textContent = '';
      return;
    }
    try {
      const [wallet,inventory,ordersData,catalog,offerData,gameData] = await Promise.all([api('/api/account/vicoins'),api('/api/account/profile-banner'),api('/api/account/profile-banner-orders'),api('/api/shop/profile-banners'),api('/api/shop/rewards'),api('/api/shop/game-keys')]);
      updateBalance(wallet.balance,true,wallet.infinite);
      bannerInventory = inventory;
      equippedProfileBannerId = inventory.equipped?.id || '';
      bannerOrders = Array.isArray(ordersData.orders) ? ordersData.orders : [];
      clubMembership = ordersData.clubVime || {active:false,pending:false,order:null};
      bannerCatalog = Array.isArray(catalog.banners) ? catalog.banners : [];
      gameKeys = Array.isArray(gameData.games) ? gameData.games : [];
      rewards = Array.isArray(offerData.rewards) ? offerData.rewards : rewards;
      renderRewards();
      renderBanners();
      renderGameKeys();
      await loadDailyStatus();
      feedback.textContent = '';
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
      feedback.textContent = `Pedido enviado ao painel administrativo. Foram descontados ${reward.coinCost} Vicoins.`;
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível registrar o pedido.';
      button.disabled = false;
    }
  }

  async function equipProfileBanner(bannerId) {
    try {
      feedback.textContent = 'Aplicando o banner ao seu perfil…';
      const inventory = await api('/api/account/profile-banner',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bannerId})});
      bannerInventory = inventory;
      equippedProfileBannerId = inventory.equipped?.id || '';
      renderBanners();
      feedback.textContent = 'Banner trocado e aplicado ao seu perfil.';
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível trocar o banner.';
      await load();
    }
  }

  dailyClaimButton.addEventListener('click',async () => {
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para resgatar seu bônus diário de Vicoins.')) return;
    if (!dailyEligible) return;
    dailyClaimButton.disabled = true;
    dailyTimer.textContent = 'Registrando seu bônus…';
    try {
      const data = await api('/api/account/vicoins/daily',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
      dailyAvailableAt = data.availableAt;
      dailyEligible = false;
      const received = Number(data.claimAmount) || dailyClaimAmount;
      dailyClaimAmount = Math.min(50,20 + (Number(data.streak) || 1) * 10);
      updateBalance(data.balance);
      feedback.textContent = `Você recebeu ${received} Vicoins. O próximo bônus poderá ser resgatado em 24 horas.`;
      renderDailyStatus();
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível resgatar o bônus diário.';
      await loadDailyStatus();
    }
  });

  async function activateBanner(bannerId) {
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para resgatar ou trocar um banner.')) return;
    const banner = bannerCatalog.find(item => item.id === bannerId);
    if (!banner) return;
    if (bannerInventory.owned?.includes(banner.id)) {
      if (equippedProfileBannerId !== banner.id) await equipProfileBanner(banner.id);
      return;
    }
    if (banner.paymentType === 'livepix') {
      if (!window.confirm(`Registrar o pedido do banner ${banner.name} por ${Number(banner.amount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}? O banner só será liberado após a confirmação do pagamento e aprovação administrativa.`)) return;
      try {
        const data = await api('/api/shop/profile-banner-orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bannerId:banner.id})});
        bannerOrders = [data.order,...bannerOrders.filter(order => order.id !== data.order.id)];
        renderBanners();
        feedback.textContent = 'Pedido registrado. Faça o pagamento pelo LivePix exibido no banner e aguarde a aprovação.';
      } catch (error) { feedback.textContent = error.message || 'Não foi possível registrar o pedido do banner.'; }
      return;
    }
    if (balance < Number(banner.coinCost)) {
      feedback.textContent = `Você precisa de ${Number(banner.coinCost).toLocaleString('pt-BR')} Vicoins para resgatar este banner.`;
      return;
    }
    if (!window.confirm(`Resgatar o banner por ${Number(banner.coinCost).toLocaleString('pt-BR')} Vicoins? Ele será aplicado automaticamente ao seu perfil.`)) return;
    try {
      const data = await api('/api/shop/profile-banners',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bannerId:banner.id})});
      bannerInventory = data.inventory;
      equippedProfileBannerId = data.inventory?.equipped?.id || '';
      updateBalance(data.balance);
      renderBanners();
      feedback.textContent = data.alreadyOwned ? 'Este banner já está liberado no seu perfil.' : `Banner resgatado. Foram descontados ${Number(banner.coinCost).toLocaleString('pt-BR')} Vicoins.`;
    } catch (error) { feedback.textContent = error.message || 'Não foi possível resgatar este banner.'; }
  }

  clubRequestButton?.addEventListener('click',async () => {
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para solicitar o Clube Vime.')) return;
    if ((clubMembership.active && Date.parse(clubMembership.expiresAt || '') > Date.now()) || clubMembership.pending) return;
    if (!window.confirm('Solicitar ou renovar o Clube Vime por R$ 10? Depois do pagamento pelo LivePix, o administrador aprovará o pedido e ativará 30 dias de nome dourado com coroa e 500 Vicoins. O banner será concedido manualmente.')) return;
    clubRequestButton.disabled = true;
    clubFeedback.textContent = 'Registrando o pedido do Clube Vime…';
    try {
      const data = await api('/api/shop/club-vime-orders',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
      clubMembership = {active:false,pending:true,expiresAt:null,order:data.order};
      renderClubVime();
      clubFeedback.innerHTML = 'Pedido registrado. <a href="https://livepix.gg/vimessias" target="_blank" rel="noopener noreferrer">Pague R$ 10 no LivePix ↗</a> e aguarde a aprovação.';
      window.dispatchEvent(new CustomEvent('cardapio:vicoins-orders-updated'));
    } catch (error) { clubFeedback.textContent = error.message || 'Não foi possível solicitar o Clube Vime.'; renderClubVime(); }
  });

  function handleBannerGridClick(event) {
    const open = event.target.closest('[data-open-banners]');
    if (open) { moreBannersDialog.showModal(); return; }
    const button = event.target.closest('[data-shop-banner]');
    if (button) activateBanner(button.dataset.shopBanner);
  }

  bannerGrid.addEventListener('click',handleBannerGridClick);
  moreBannersGrid.addEventListener('click',handleBannerGridClick);
  moreBannersClose.addEventListener('click',() => moreBannersDialog.close());
  moreBannersDialog.addEventListener('click',event => { if (event.target === moreBannersDialog) moreBannersDialog.close(); });

  gameKeysRoot?.addEventListener('click',event => {
    const button = event.target.closest('[data-game-key-redeem]');
    if (button) redeemGameKey(button);
  });

  window.CardapioVicoinsShop = {load,openBanners:() => moreBannersDialog.showModal()};
  window.addEventListener('cardapio:auth-updated',load);
  window.addEventListener('cardapio:vicoins-updated',event => updateBalance(event.detail?.balance,false,event.detail?.infinite));
  window.addEventListener('cardapio:vicoins-orders-updated',load);
  window.CardapioAuth?.ready.then(load);
  if (dailyTimerInterval) clearInterval(dailyTimerInterval);
  dailyTimerInterval = setInterval(() => { renderDailyStatus(); if (clubMembership.active) renderClubVime(); },1000);
  renderDailyStatus();
  renderRewards();
  renderBanners();
  renderGameKeys();
})();
