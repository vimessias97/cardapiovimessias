(() => {
  const form = document.querySelector('#adminCommunityBadgeForm');
  const recipients = document.querySelector('#adminCommunityBadgeRecipients');
  const list = document.querySelector('#adminCommunityBadgesList');
  const feedback = document.querySelector('#adminCommunityBadgesFeedback');
  if (!form || !recipients || !list || !feedback) return;
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  let badges = [];
  let members = [];
  const safe = value => String(value ?? '').replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  async function api(path,options = {}) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar as insígnias.');
        return data;
      } catch (error) { if (!(error instanceof TypeError)) throw error; lastError = error; }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }
  function optionMarkup(selected = []) {
    const selectedIds = new Set(selected.map(String));
    return members.map(member => `<option value="${safe(member.id)}" ${selectedIds.has(String(member.id)) ? 'selected' : ''}>${safe(member.displayName)} (@${safe(member.login)})</option>`).join('');
  }
  function render() {
    recipients.innerHTML = optionMarkup();
    if (!badges.length) { list.innerHTML = '<p class="admin-community-badges-empty">Nenhuma insígnia cadastrada ainda.</p>'; return; }
    list.innerHTML = badges.map(badge => `<article class="admin-community-badge-card" data-badge-card="${safe(badge.id)}"><div class="admin-community-badge-title"><span aria-hidden="true">${safe(badge.symbol)}</span><div><strong>${safe(badge.name)}</strong><small>${(badge.memberIds || []).length} ${(badge.memberIds || []).length === 1 ? 'pessoa recebeu' : 'pessoas receberam'}</small></div></div><label>Destinatários<select multiple size="5" data-badge-members="${safe(badge.id)}">${optionMarkup(badge.memberIds || [])}</select><small>Use Ctrl ou Shift para selecionar várias pessoas.</small></label><div class="admin-community-badge-actions"><button type="button" data-save-members="${safe(badge.id)}">Salvar destinatários</button><button type="button" class="is-danger" data-delete-badge="${safe(badge.id)}">Excluir insígnia</button></div></article>`).join('');
  }
  async function load() {
    if (!window.CardapioAuth?.isAdmin()) { list.replaceChildren(); feedback.textContent = 'Área exclusiva do administrador.'; return; }
    try {
      const data = await api('/api/admin/community-badges');
      badges = Array.isArray(data.badges) ? data.badges : [];
      members = Array.isArray(data.members) ? data.members : [];
      render();
      feedback.textContent = members.length ? '' : 'Peça para as pessoas entrarem no site com a Twitch para aparecerem nesta lista.';
    } catch (error) { feedback.textContent = error.message || 'Não foi possível carregar as insígnias.'; }
  }
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (!window.CardapioAuth?.isAdmin()) return;
    const values = new FormData(form);
    const name = String(values.get('name') || '').trim();
    const symbol = String(values.get('symbol') || '').trim();
    const memberIds = [...recipients.selectedOptions].map(option => option.value);
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Criando insígnia…';
    try {
      const data = await api('/api/admin/community-badges',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,symbol,memberIds})});
      badges = data.badges || badges;
      form.reset();
      render();
      feedback.textContent = 'Insígnia criada e atribuída às pessoas selecionadas.';
    } catch (error) { feedback.textContent = error.message || 'Não foi possível criar a insígnia.'; }
    finally { submit.disabled = false; }
  });
  list.addEventListener('click',async event => {
    const saveButton = event.target.closest('[data-save-members]');
    const deleteButton = event.target.closest('[data-delete-badge]');
    if (!saveButton && !deleteButton) return;
    const id = (saveButton || deleteButton).dataset[saveButton ? 'saveMembers' : 'deleteBadge'];
    if (deleteButton && !window.confirm('Excluir esta insígnia e removê-la dos perfis que a receberam?')) return;
    const card = list.querySelector(`[data-badge-card="${id}"]`);
    const button = saveButton || deleteButton;
    button.disabled = true;
    feedback.textContent = saveButton ? 'Salvando destinatários…' : 'Excluindo insígnia…';
    try {
      const data = await api('/api/admin/community-badges',{method:deleteButton ? 'DELETE' : 'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(deleteButton ? {id} : {id,memberIds:[...card.querySelector(`[data-badge-members="${CSS.escape(id)}"]`).selectedOptions].map(option => option.value)})});
      badges = data.badges || [];
      render();
      feedback.textContent = deleteButton ? 'Insígnia excluída dos perfis.' : 'Destinatários atualizados.';
    } catch (error) { feedback.textContent = error.message || 'Não foi possível atualizar a insígnia.'; button.disabled = false; }
  });
  window.addEventListener('cardapio:auth-updated',load);
  window.CardapioAuth?.ready?.then(load);
})();
