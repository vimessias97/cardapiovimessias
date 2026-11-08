(() => {
  const form = document.querySelector('#adminShopBannerForm');
  const list = document.querySelector('#adminShopBannerList');
  const feedback = document.querySelector('#adminShopBannerFeedback');
  if (!form || !list || !feedback) return;
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let banners = [];

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  async function api(path,options = {}) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível gerenciar os banners.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function render() {
    if (!banners.length) {
      list.innerHTML = '<p class="admin-shop-banner-empty">Nenhum banner manual cadastrado.</p>';
      return;
    }
    list.innerHTML = banners.map(banner => `<article class="admin-shop-banner-item"><img src="${safe(banner.imageUrl)}" alt="Prévia do banner ${safe(banner.name)}"><div><strong>${safe(banner.name)}</strong><span>${Number(banner.coinCost).toLocaleString('pt-BR')} Vicoins</span></div><button type="button" data-delete-banner="${safe(banner.id)}">Excluir</button></article>`).join('');
  }

  async function load() {
    if (!window.CardapioAuth?.isAdmin()) {
      banners = [];
      list.replaceChildren();
      feedback.textContent = 'Área exclusiva do administrador.';
      return [];
    }
    feedback.textContent = 'Carregando banners manuais…';
    try {
      const data = await api('/api/admin/profile-banners');
      banners = Array.isArray(data.banners) ? data.banners : [];
      render();
      feedback.textContent = 'Somente banners cadastrados manualmente aparecem nesta lista.';
    } catch (error) { feedback.textContent = error.message || 'Não foi possível carregar os banners.'; }
    return banners;
  }

  function fileData(file) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem.'));
      reader.onload = () => {
        const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+=*)$/.exec(String(reader.result || ''));
        if (!match) return reject(new Error('Selecione uma imagem PNG ou JPG válida.'));
        resolve({type:match[1],data:match[2]});
      };
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (!window.CardapioAuth?.isAdmin()) return;
    const data = new FormData(form);
    const file = data.get('image');
    const coinCost = Number(data.get('coinCost'));
    if (!(file instanceof File) || !file.size) { feedback.textContent = 'Escolha a imagem do banner.'; return; }
    if (file.size > 4 * 1024 * 1024) { feedback.textContent = 'A imagem precisa ter até 4 MB.'; return; }
    if (!Number.isSafeInteger(coinCost) || coinCost < 1) { feedback.textContent = 'Informe um custo válido em Vicoins.'; return; }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Validando imagem e cadastrando banner…';
    try {
      const image = await fileData(file);
      const bitmap = await createImageBitmap(file);
      const dimensionsValid = bitmap.width === 1600 && bitmap.height === 240;
      bitmap.close();
      if (!dimensionsValid) throw new Error('A imagem precisa ter exatamente 1600 × 240 px.');
      await api('/api/admin/profile-banners',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:data.get('name'),coinCost,image})});
      form.reset();
      await load();
      feedback.textContent = 'Banner adicionado à lojinha.';
      window.CardapioVicoinsShop?.load();
    } catch (error) { feedback.textContent = error.message || 'Não foi possível adicionar o banner.'; }
    finally { submit.disabled = false; }
  });

  list.addEventListener('click',async event => {
    const button = event.target.closest('[data-delete-banner]');
    if (!button) return;
    const banner = banners.find(item => item.id === button.dataset.deleteBanner);
    if (!banner || !window.confirm(`Excluir o banner “${banner.name}” da lojinha e removê-lo dos perfis que o possuem?`)) return;
    button.disabled = true;
    feedback.textContent = 'Excluindo banner…';
    try {
      await api(`/api/admin/profile-banners/${encodeURIComponent(banner.id)}`,{method:'DELETE'});
      await load();
      feedback.textContent = 'Banner excluído da lojinha e dos perfis.';
      window.CardapioVicoinsShop?.load();
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível excluir o banner.';
      button.disabled = false;
    }
  });

  window.addEventListener('cardapio:auth-updated',load);
  window.CardapioAdminShopBanners = {load};
  window.CardapioAuth?.ready.then(() => { if (window.CardapioAuth?.isAdmin()) load(); });
})();
