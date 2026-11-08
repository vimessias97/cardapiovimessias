const twitchLogin = document.querySelector('#twitchLogin');
const twitchProfile = document.querySelector('#twitchProfile');
const twitchAvatar = document.querySelector('#twitchAvatar');
const twitchDisplayName = document.querySelector('#twitchDisplayName');
const twitchLoginName = document.querySelector('#twitchLoginName');
const twitchLogout = document.querySelector('#twitchLogout');
const twitchAuthFeedback = document.querySelector('#twitchAuthFeedback');
const sidebarUserProfile = document.querySelector('#sidebarUserProfile');
const sidebarUserAvatar = document.querySelector('#sidebarUserAvatar');
const sidebarUserName = document.querySelector('#sidebarUserName');
const sidebarUserLogin = document.querySelector('#sidebarUserLogin');
const sidebarUserRole = document.querySelector('#sidebarUserRole');
const sidebarUserLogout = document.querySelector('#sidebarUserLogout');
const gamesAccessNote = document.querySelector('#gamesAccessNote');
const adminPanelNav = document.querySelector('#adminPanelNav');
let currentTwitchUser = null;
let resolveAuthReady;
const authReady = new Promise(resolve => { resolveAuthReady = resolve; });

function showTwitchFeedback(message) {
  twitchAuthFeedback.textContent = message;
  twitchAuthFeedback.classList.add('is-visible');
}

function updateTwitchUi(profile) {
  currentTwitchUser = profile || null;
  const authenticated = Boolean(profile);
  twitchLogin.classList.toggle('hidden', authenticated);
  twitchProfile.classList.add('hidden');
  sidebarUserProfile.classList.toggle('hidden', !authenticated);
  adminPanelNav?.classList.toggle('hidden', profile?.role !== 'admin');
  if (gamesAccessNote) gamesAccessNote.textContent = authenticated
    ? 'Escolha um desafio e divirta-se.'
    : 'Entre com a Twitch para jogar os desafios.';
  if (authenticated) {
    const name = profile.displayName || profile.login;
    twitchDisplayName.textContent = name;
    twitchLoginName.textContent = `@${profile.login}`;
    sidebarUserName.textContent = name;
    sidebarUserLogin.textContent = `@${profile.login}`;
    sidebarUserRole.textContent = profile.role === 'admin' ? 'ADMINISTRADOR' : 'USUÁRIO TWITCH';
    sidebarUserRole.classList.toggle('is-admin', profile.role === 'admin');
    for (const avatar of [twitchAvatar,sidebarUserAvatar]) {
      if (profile.profileImageUrl) {
        avatar.src = profile.profileImageUrl;
        avatar.alt = `Foto de perfil de ${name}`;
        avatar.classList.remove('hidden');
      } else avatar.classList.add('hidden');
    }
  }
  window.dispatchEvent(new CustomEvent('cardapio:auth-updated',{detail:{user:currentTwitchUser}}));
}

async function loadTwitchAccount() {
  try {
    const response = await fetch('/api/auth/me', {credentials:'same-origin',cache:'no-store'});
    const data = await response.json();
    updateTwitchUi(data.authenticated ? data.profile : null);
    if (!data.authenticated && data.expired) showTwitchFeedback('Sua sessão da Twitch expirou. Entre novamente.');
  } catch {
    showTwitchFeedback('Não foi possível verificar a conta agora.');
    updateTwitchUi(null);
  } finally {
    resolveAuthReady(currentTwitchUser);
  }
}

async function logoutTwitch() {
  twitchLogout.disabled = true;
  sidebarUserLogout.disabled = true;
  try {
    await fetch('/api/auth/logout', {method:'POST',credentials:'same-origin'});
    updateTwitchUi(null);
    twitchAuthFeedback.textContent = '';
    twitchAuthFeedback.classList.remove('is-visible');
    history.replaceState(null,'',`${location.pathname}#inicio`);
    location.hash = '#inicio';
  } catch {
    showTwitchFeedback('Não foi possível encerrar a sessão. Tente novamente.');
  } finally {
    twitchLogout.disabled = false;
    sidebarUserLogout.disabled = false;
  }
}

twitchLogout.addEventListener('click',logoutTwitch);
sidebarUserLogout.addEventListener('click',logoutTwitch);

window.CardapioAuth = {
  getUser:() => currentTwitchUser,
  ready:authReady,
  isAuthenticated:() => Boolean(currentTwitchUser),
  isAdmin:() => currentTwitchUser?.role === 'admin',
  requireLogin(message = 'Entre com sua conta Twitch para usar este recurso.') {
    if (currentTwitchUser) return true;
    showTwitchFeedback(message);
    twitchLogin.focus({preventScroll:true});
    twitchLogin.scrollIntoView({behavior:'smooth',block:'nearest'});
    return false;
  }
};

const twitchStatus = new URLSearchParams(location.search).get('twitch');
const twitchMessages = {
  connected:'Conta da Twitch conectada.',
  cancelled:'A conexão com a Twitch foi cancelada.',
  failed:'Não foi possível conectar à Twitch. Confira a configuração do aplicativo.',
  'not-configured':'Para ativar o login, configure o aplicativo Twitch no arquivo .env.'
};
if (twitchMessages[twitchStatus]) showTwitchFeedback(twitchMessages[twitchStatus]);
if (twitchStatus) history.replaceState(null, '', `${location.pathname}${location.hash}`);
loadTwitchAccount();
window.setInterval(loadTwitchAccount, 55 * 60 * 1000);
