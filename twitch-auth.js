const twitchLogin = document.querySelector('#twitchLogin');
const twitchAuthFeedback = document.querySelector('#twitchAuthFeedback');
const sidebarLoginArea = document.querySelector('#sidebarLoginArea');
const sidebarUserProfile = document.querySelector('#sidebarUserProfile');
const sidebarUserAvatar = document.querySelector('#sidebarUserAvatar');
const sidebarUserName = document.querySelector('#sidebarUserName');
const sidebarUserRole = document.querySelector('#sidebarUserRole');
const sidebarUserLogout = document.querySelector('#sidebarUserLogout');
const gamesAccessNote = document.querySelector('#gamesAccessNote');
const adminPanelNav = document.querySelector('#adminPanelNav');
const twitchLoginDialog = document.querySelector('#twitchLoginDialog');
const twitchLoginDialogMessage = document.querySelector('#twitchLoginDialogMessage');
const twitchLoginDialogAction = document.querySelector('#twitchLoginDialogAction');
const twitchLoginDialogClose = document.querySelector('#twitchLoginDialogClose');
let currentTwitchUser = null;
let resolveAuthReady;
const authReady = new Promise(resolve => { resolveAuthReady = resolve; });

function showTwitchFeedback(message) {
  twitchAuthFeedback.textContent = message;
  twitchAuthFeedback.classList.add('is-visible');
}

function currentPageReturnTo() {
  return `${location.pathname}${location.search}${location.hash}`;
}

function updateTwitchLoginHref() {
  const href = `/auth/twitch/start?returnTo=${encodeURIComponent(currentPageReturnTo())}`;
  twitchLogin.href = href;
  if (twitchLoginDialogAction) twitchLoginDialogAction.href = href;
}

function savePageStateBeforeLogin() {
  try {
    const fields = [...document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="password"]),textarea,select')]
      .filter(field => field.id || field.name)
      .map(field => ({id:field.id || '',name:field.name || '',value:field.value,checked:'checked' in field ? field.checked : undefined}));
    sessionStorage.setItem('vimessias-twitch-return-state',JSON.stringify({scrollY:window.scrollY,fields}));
  } catch {}
}

function restorePageStateAfterLogin() {
  try {
    const raw = sessionStorage.getItem('vimessias-twitch-return-state');
    if (!raw) return;
    sessionStorage.removeItem('vimessias-twitch-return-state');
    const saved = JSON.parse(raw);
    for (const fieldState of saved.fields || []) {
      const field = fieldState.id ? document.getElementById(fieldState.id) : document.querySelector(`[name="${CSS.escape(fieldState.name)}"]`);
      if (!field) continue;
      field.value = fieldState.value ?? '';
      if (typeof fieldState.checked === 'boolean') field.checked = fieldState.checked;
      field.dispatchEvent(new Event('input',{bubbles:true}));
      field.dispatchEvent(new Event('change',{bubbles:true}));
    }
    requestAnimationFrame(() => window.scrollTo({top:Number(saved.scrollY) || 0,behavior:'auto'}));
  } catch {}
}

function promptTwitchLogin(message) {
  showTwitchFeedback(message);
  if (twitchLoginDialogMessage) twitchLoginDialogMessage.textContent = message;
  updateTwitchLoginHref();
  if (twitchLoginDialog && !twitchLoginDialog.open) twitchLoginDialog.showModal();
}

function updateTwitchUi(profile) {
  currentTwitchUser = profile || null;
  const authenticated = Boolean(profile);
  sidebarLoginArea.classList.toggle('hidden', authenticated);
  sidebarUserProfile.classList.toggle('hidden', !authenticated);
  adminPanelNav?.classList.toggle('hidden', profile?.role !== 'admin');
  if (gamesAccessNote) gamesAccessNote.textContent = authenticated
    ? 'Escolha um desafio e divirta-se.'
    : 'Entre com a Twitch para jogar os desafios.';
  if (authenticated) {
    const name = profile.displayName || profile.login;
    sidebarUserName.textContent = name;
    sidebarUserRole.textContent = profile.role === 'admin' ? 'ADMINISTRADOR' : 'USUÁRIO TWITCH';
    sidebarUserRole.classList.toggle('is-admin', profile.role === 'admin');
    if (profile.profileImageUrl) {
      sidebarUserAvatar.src = profile.profileImageUrl;
      sidebarUserAvatar.alt = `Foto de perfil de ${name}`;
      sidebarUserAvatar.classList.remove('hidden');
    } else sidebarUserAvatar.classList.add('hidden');
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
    sidebarUserLogout.disabled = false;
  }
}

sidebarUserLogout.addEventListener('click',logoutTwitch);
twitchLoginDialogClose?.addEventListener('click',() => twitchLoginDialog.close());
twitchLoginDialog?.addEventListener('click',event => { if (event.target === twitchLoginDialog) twitchLoginDialog.close(); });
twitchLogin.addEventListener('click',event => {
  if (currentTwitchUser) return;
  event.preventDefault();
  savePageStateBeforeLogin();
  updateTwitchLoginHref();
  location.assign(twitchLogin.href);
});
twitchLoginDialogAction?.addEventListener('click',() => savePageStateBeforeLogin());

window.CardapioAuth = {
  getUser:() => currentTwitchUser,
  ready:authReady,
  isAuthenticated:() => Boolean(currentTwitchUser),
  isAdmin:() => currentTwitchUser?.role === 'admin',
  requireLogin(message = 'Entre com sua conta Twitch para usar este recurso.') {
    if (currentTwitchUser) return true;
    promptTwitchLogin(message);
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
if (twitchStatus) {
  const cleanUrl = new URL(location.href);
  cleanUrl.searchParams.delete('twitch');
  history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
}
updateTwitchLoginHref();
restorePageStateAfterLogin();
loadTwitchAccount();
window.setInterval(loadTwitchAccount, 55 * 60 * 1000);
