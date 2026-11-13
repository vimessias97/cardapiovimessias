const twitchLogin = document.querySelector('#twitchLogin');
const twitchAuthFeedback = document.querySelector('#twitchAuthFeedback');
const sidebarLoginArea = document.querySelector('#sidebarLoginArea');
const sidebarUserProfile = document.querySelector('#sidebarUserProfile');
const sidebarUserAvatar = document.querySelector('#sidebarUserAvatar');
const sidebarUserName = document.querySelector('#sidebarUserName');
const sidebarProfileAdminLink = document.querySelector('#sidebarProfileAdminLink');
const sidebarUserLogout = document.querySelector('#sidebarUserLogout');
const gamesAccessNote = document.querySelector('#gamesAccessNote');
const twitchLoginDialog = document.querySelector('#twitchLoginDialog');
const twitchLoginDialogMessage = document.querySelector('#twitchLoginDialogMessage');
const twitchLoginDialogAction = document.querySelector('#twitchLoginDialogAction');
const twitchLoginDialogClose = document.querySelector('#twitchLoginDialogClose');
let currentTwitchUser = null;
let clubVimeExpiryTimer = null;
let authRetryTimer = null;
let authLoadPromise = null;
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
  sidebarProfileAdminLink?.classList.toggle('hidden', profile?.role !== 'admin');
  if (gamesAccessNote) gamesAccessNote.textContent = authenticated
    ? 'Escolha um desafio e divirta-se.'
    : 'Entre com a Twitch para jogar os desafios.';
  if (authenticated) {
    const name = profile.displayName || profile.login;
    sidebarUserName.innerHTML = window.CardapioClubVime?.name(name,profile.isClubVime,profile.clubVimeExpiresAt) || name;
    if (profile.profileImageUrl) {
      sidebarUserAvatar.src = profile.profileImageUrl;
      sidebarUserAvatar.alt = `Foto de perfil de ${name}`;
      sidebarUserAvatar.classList.remove('hidden');
    } else sidebarUserAvatar.classList.add('hidden');
  }
  if (clubVimeExpiryTimer) clearTimeout(clubVimeExpiryTimer);
  if (profile?.isClubVime && profile.clubVimeExpiresAt) {
    const expiresIn = Date.parse(profile.clubVimeExpiresAt) - Date.now();
    if (expiresIn > 0) clubVimeExpiryTimer = window.setTimeout(loadTwitchAccount,expiresIn + 1000);
  }
  window.dispatchEvent(new CustomEvent('cardapio:auth-updated',{detail:{user:currentTwitchUser}}));
}

async function loadTwitchAccount() {
  if (authLoadPromise) return authLoadPromise;
  authLoadPromise = (async () => {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('/api/auth/me', {credentials:'same-origin',cache:'no-store'});
        if (!response.ok) throw new Error('O servidor não conseguiu verificar sua conta agora.');
        const data = await response.json();
        updateTwitchUi(data.authenticated ? data.profile : null);
        if (!data.authenticated && data.expired) showTwitchFeedback('Sua sessão da Twitch expirou. Entre novamente.');
        if (authRetryTimer) clearTimeout(authRetryTimer);
        authRetryTimer = null;
        return currentTwitchUser;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve,attempt === 0 ? 350 : 900));
      }
    }
    showTwitchFeedback('A conexão está instável. Vou tentar verificar sua conta novamente em alguns segundos.');
    if (!authRetryTimer) authRetryTimer = window.setTimeout(() => { authRetryTimer = null; loadTwitchAccount(); },8000);
    if (lastError) console.warn('Não foi possível verificar a conta Twitch:',lastError.message);
    return currentTwitchUser;
  })();
  try { return await authLoadPromise; }
  finally {
    resolveAuthReady(currentTwitchUser);
    authLoadPromise = null;
  }
}

async function logoutTwitch() {
  sidebarUserLogout.disabled = true;
  if (authRetryTimer) clearTimeout(authRetryTimer);
  authRetryTimer = null;
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
window.addEventListener('online',() => { if (!currentTwitchUser) loadTwitchAccount(); });
