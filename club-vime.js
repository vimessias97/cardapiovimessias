(() => {
  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }
  window.CardapioClubVime = {
    name(value, isMember, expiresAt) {
      const text = safe(value || 'Usuário Twitch');
      const expiry = Date.parse(expiresAt || '');
      return isMember ? `<span class="club-vime-display-name"${Number.isFinite(expiry) ? ` data-club-vime-expires="${expiry}"` : ''}>${text}<span class="club-vime-crown" aria-label="Membro do Clube Vime" title="Clube Vime"> 👑</span></span>` : text;
    }
  };
  const timers = new WeakMap();
  function scheduleExpiry(node) {
    if (!(node instanceof HTMLElement) || timers.has(node)) return;
    const expiresAt = Number(node.dataset.clubVimeExpires);
    if (!Number.isFinite(expiresAt)) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      node.classList.remove('club-vime-display-name');
      node.querySelector('.club-vime-crown')?.remove();
      node.removeAttribute('data-club-vime-expires');
      return;
    }
    timers.set(node,setTimeout(() => { timers.delete(node); scheduleExpiry(node); },Math.min(remaining + 25,2_147_000_000)));
  }
  function scan(root) {
    if (root instanceof HTMLElement && root.matches('[data-club-vime-expires]')) scheduleExpiry(root);
    root.querySelectorAll?.('[data-club-vime-expires]').forEach(scheduleExpiry);
  }
  scan(document);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node instanceof HTMLElement) scan(node); }))).observe(document.documentElement,{childList:true,subtree:true});
})();
