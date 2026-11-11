(() => {
  const form = document.querySelector('#adminGameKeyForm');
  const list = document.querySelector('#adminGameKeysAdminList');
  const feedback = document.querySelector('#adminGameKeysFeedback');
  if (!form || !list || !feedback) return;
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let games = [];

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  async function api(path,options = {}) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível gerenciar as keys.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function render() {
    if (!games.length) {
      list.innerHTML = '<p class="admin-game-keys-empty">Nenhum jogo cadastrado ainda.</p>';
      return;
    }
    list.innerHTML = games.map(game => `<article class="admin-game-key-item" data-game-key="${safe(game.id)}"><label>Título<input name="title" type="text" maxlength="120" value="${safe(game.title)}" required></label><label>Link Steam<input name="steamUrl" type="url" maxlength="500" value="${safe(game.steamUrl)}" required></label><label>Vicoins<input name="coinCost" type="number" min="1" max="1000000" step="1" value="${Number(game.coinCost)}" required></label><label>Estoque<input name="stock" type="number" min="0" max="1000000" step="1" value="${Number(game.stock ?? (game.reservedOrderId ? 0 : 1))}" required></label><div class="admin-game-key-item-actions"><button type="button" data-game-key-save="${safe(game.id)}">Salvar</button><button type="button" class="is-delete" data-game-key-delete="${safe(game.id)}" ${game.reservedOrderId ? 'disabled title="Finalize ou exclua o pedido pendente primeiro"' : ''}>Excluir</button></div>${game.reservedOrderId ? '<small class="admin-game-key-reserved">Pedido antigo reservado.</small>' : ''}</article>`).join('');
  }

  async function load() {
    if (!window.CardapioAuth?.isAdmin()) {
      games = [];
      list.replaceChildren();
      feedback.textContent = 'Área exclusiva do administrador.';
      return [];
    }
    feedback.textContent = 'Carregando jogos cadastrados…';
    try {
      const data = await api('/api/admin/shop-game-keys');
      games = Array.isArray(data.games) ? data.games : [];
      render();
      feedback.textContent = 'Edite o título, link Steam ou preço; os pedidos já feitos mantêm os dados originais.';
    } catch (error) { feedback.textContent = error.message || 'Não foi possível carregar os jogos.'; }
    return games;
  }

  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (!window.CardapioAuth?.isAdmin()) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Cadastrando jogo…';
    try {
      await api('/api/admin/shop-game-keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      form.reset();
      await load();
      feedback.textContent = 'Jogo cadastrado na lojinha.';
      window.CardapioVicoinsShop?.load();
    } catch (error) { feedback.textContent = error.message || 'Não foi possível cadastrar o jogo.'; }
    finally { submit.disabled = false; }
  });

  list.addEventListener('click',async event => {
    const save = event.target.closest('[data-game-key-save]');
    const remove = event.target.closest('[data-game-key-delete]');
    const button = save || remove;
    if (!button) return;
    const game = games.find(item => item.id === button.dataset.gameKeySave || item.id === button.dataset.gameKeyDelete);
    const card = button.closest('[data-game-key]');
    if (!game || !card) return;
    button.disabled = true;
    try {
      if (save) {
        feedback.textContent = 'Salvando alterações…';
        const title = card.querySelector('[name="title"]').value.trim();
        const steamUrl = card.querySelector('[name="steamUrl"]').value.trim();
        const coinCost = Number(card.querySelector('[name="coinCost"]').value);
        const stock = Number(card.querySelector('[name="stock"]').value);
        const url = new URL(steamUrl);
        if (url.protocol !== 'https:' || url.hostname !== 'store.steampowered.com' || !/^\/app\/\d+/.test(url.pathname) || !Number.isSafeInteger(coinCost) || coinCost < 1 || coinCost > 1000000 || !Number.isSafeInteger(stock) || stock < 0 || title.length < 2) throw new Error('Confira o título, o link da Steam, o preço e o estoque.');
        await api('/api/admin/shop-game-keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:game.id,title,steamUrl,coinCost,stock})});
        feedback.textContent = 'Jogo atualizado.';
      } else {
        if (game.reservedOrderId || !window.confirm(`Excluir “${game.title}” da lojinha? Pedidos anteriores serão preservados.`)) { button.disabled = false; return; }
        feedback.textContent = 'Excluindo jogo…';
        await api(`/api/admin/shop-game-keys/${encodeURIComponent(game.id)}`,{method:'DELETE'});
        feedback.textContent = 'Jogo removido da lojinha.';
      }
      await load();
      window.CardapioVicoinsShop?.load();
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível atualizar o jogo.';
      button.disabled = false;
    }
  });

  window.addEventListener('cardapio:auth-updated',load);
  window.CardapioAdminGameKeys = {load};
  window.CardapioAuth?.ready.then(() => { if (window.CardapioAuth?.isAdmin()) load(); });
})();
