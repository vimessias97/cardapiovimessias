(() => {
  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }
  window.CardapioClubVime = {
    name(value, isMember) {
      const text = safe(value || 'Usuário Twitch');
      return isMember ? `<span class="club-vime-display-name">${text}<span class="club-vime-crown" aria-label="Membro do Clube Vime" title="Clube Vime"> 👑</span></span>` : text;
    }
  };
})();
