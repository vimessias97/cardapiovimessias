import http from 'node:http';
import {constants as fsConstants} from 'node:fs';
import {readFile,stat,writeFile,rename,mkdir,copyFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
try { for (const line of (await readFile(path.join(root, '.env'), 'utf8')).split(/\r?\n/)) { const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2'); } } catch {}
const port = Number(process.env.PORT || 3000);
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/,'');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const requestedDataStore = String(process.env.DATA_STORE || '').trim().toLowerCase();
const persistenceMode = requestedDataStore || (supabaseUrl && supabaseServiceRoleKey ? 'supabase' : 'local');
if (!['local','supabase'].includes(persistenceMode)) throw new Error('DATA_STORE deve ser "supabase" ou "local".');
if (persistenceMode === 'supabase' && (!supabaseUrl || !supabaseServiceRoleKey)) throw new Error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY (ou a chave legada SUPABASE_SERVICE_ROLE_KEY) no ambiente do servidor.');
if (process.env.NODE_ENV === 'production' && persistenceMode !== 'supabase') throw new Error('Em produção, configure DATA_STORE=supabase para não salvar dados em armazenamento temporário.');
const dataRoot = path.resolve(process.env.DATA_DIR || root);
await mkdir(dataRoot, {recursive:true});
const favoritesFile = path.join(dataRoot, 'favorites.json');
const ratingsFile = path.join(dataRoot, 'ratings.json');
const redemptionsFile = path.join(dataRoot, 'redemptions.json');
const communityMembersFile = path.join(dataRoot, 'community-members.json');
const communityBadgesFile = path.join(dataRoot, 'community-badges.json');
const promotionsFile = path.join(dataRoot, 'promotions.json');
const vicoinsFile = path.join(dataRoot, 'vicoins.json');
const vicoinsRewardsFile = path.join(dataRoot, 'vicoins-rewards.json');
const gameProgressFile = path.join(dataRoot, 'game-progress.json');
const forumFile = path.join(dataRoot, 'forum.json');
const forumUploadsDir = path.join(dataRoot, 'forum-uploads');
const profileBannersDir = path.join(dataRoot, 'profile-banners');
const youtubeVideosFile = path.join(dataRoot, 'youtube-videos.json');
const patreonMappingsFile = path.join(dataRoot, 'patreon-mappings.json');
await mkdir(forumUploadsDir,{recursive:true});
await mkdir(profileBannersDir,{recursive:true});
if (persistenceMode === 'local' && dataRoot !== root) {
  for (const name of ['favorites.json','ratings.json']) {
    const destination = path.join(dataRoot,name);
    try { await stat(destination); }
    catch { try { await copyFile(path.join(root,name),destination,fsConstants.COPYFILE_EXCL); } catch {} }
  }
}
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon'};
const tmdbCache = new Map();
const genreCache = new Map();
const suggestionsCache = new Map();
const calendarCache = new Map();
const trailerCache = new Map();
let youtubeVideosCache = {expiresAt:0,videos:[]};
let youtubeChannelId = '';
const twitchOAuthStates = new Map();
const twitchSessions = new Map();
const infiniteVicoinsUserIds = new Set();
let patreonPostsCache = {expiresAt:0,posts:[]};
const manualPatreonLinksFile = path.join(root, 'patreon-links.json');
let favoritesWriteQueue = Promise.resolve();
let ratingsWriteQueue = Promise.resolve();
let redemptionsWriteQueue = Promise.resolve();
let communityMembersWriteQueue = Promise.resolve();
let promotionsWriteQueue = Promise.resolve();
let vicoinsWriteQueue = Promise.resolve();
let forumWriteQueue = Promise.resolve();
const defaultPromotionCollections = [
  {id:'lotr',name:'Trilogia O Senhor dos Anéis',discountPercent:30,titles:[{id:120,mediaType:'movie'},{id:121,mediaType:'movie'},{id:122,mediaType:'movie'}]},
  {id:'hobbit',name:'Trilogia O Hobbit',discountPercent:30,titles:[{id:49051,mediaType:'movie'},{id:57158,mediaType:'movie'},{id:122917,mediaType:'movie'}]},
  {id:'harry-potter',name:'Coleção completa Harry Potter',discountPercent:30,titles:[{id:671,mediaType:'movie'},{id:672,mediaType:'movie'},{id:673,mediaType:'movie'},{id:674,mediaType:'movie'},{id:675,mediaType:'movie'},{id:767,mediaType:'movie'},{id:12444,mediaType:'movie'},{id:12445,mediaType:'movie'}]}
];
const defaultVicoinsRewards = [
  {id:'content-15',contentLimit:15,coinCost:500},
  {id:'content-20',contentLimit:20,coinCost:600},
  {id:'content-25',contentLimit:25,coinCost:700},
  {id:'content-30',contentLimit:30,coinCost:800}
];
async function readVicoinsRewards() {
  const saved = await readJsonState('vicoinsRewards',defaultVicoinsRewards);
  return defaultVicoinsRewards.map(base => {
    const item = Array.isArray(saved) ? saved.find(candidate => candidate?.id === base.id) : null;
    const cost = Number(item?.coinCost);
    return {...base,coinCost:Number.isSafeInteger(cost) && cost >= 1 && cost <= 1000000 ? cost : base.coinCost};
  });
}
const profileBannerRewards = [
  {id:'vimessias',name:'ViMessias',imageUrl:'/assets/profile-banners/vimessias-1600x240.png',paymentType:'livepix',amount:5}
];
function twitchConfig() {
  const clientId = process.env.TWITCH_CLIENT_ID || '';
  const clientSecret = process.env.TWITCH_CLIENT_SECRET || '';
  const redirectUri = process.env.TWITCH_REDIRECT_URI || '';
  return {clientId,clientSecret,redirectUri,configured:Boolean(clientId && clientSecret && redirectUri)};
}

function getTwitchRole(profile) {
  const adminId = String(process.env.TWITCH_ADMIN_USER_ID || '').trim();
  const adminLogin = String(process.env.TWITCH_ADMIN_LOGIN || 'vimessias_').trim().toLowerCase();
  const isAdmin = Boolean((adminId && String(profile.id) === adminId) || (adminLogin && String(profile.login || '').trim().toLowerCase() === adminLogin));
  return isAdmin ? 'admin' : 'user';
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function cookieOptions(req) {
  const secure = req.socket.encrypted || process.env.NODE_ENV === 'production' || (process.env.TWITCH_REDIRECT_URI || '').startsWith('https://');
  return secure ? '; Secure' : '';
}

function setCookie(res, name, value, options = '') {
  const previous = res.getHeader('set-cookie');
  const next = `${name}=${encodeURIComponent(value)}; Path=${options.includes('oauth-state') ? '/auth/twitch/callback' : '/'}; HttpOnly; SameSite=Lax${options.includes('clear') ? '; Max-Age=0' : options.includes('oauth-state') ? '; Max-Age=600' : '; Max-Age=604800'}${options.replace('oauth-state','').replace('clear','')}`;
  res.setHeader('set-cookie', previous ? [...(Array.isArray(previous) ? previous : [previous]), next] : next);
}

function privateJson(res, status, data) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'cookie'});
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.writeHead(302, {'location':location,'cache-control':'no-store'});
  res.end();
}

function safeTwitchReturnTo(value) {
  try {
    const target = new URL(String(value || '/'), 'http://vimessias.local');
    if (target.origin !== 'http://vimessias.local' || target.pathname.startsWith('/auth/')) return '/';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return '/'; }
}

function twitchReturnRedirect(returnTo, status) {
  const target = new URL(safeTwitchReturnTo(returnTo), 'http://vimessias.local');
  target.searchParams.set('twitch', status);
  return `${target.pathname}${target.search}${target.hash}`;
}

function clearTwitchSession(req, res) {
  const cookies = parseCookies(req);
  if (cookies.cardapio_twitch_session) twitchSessions.delete(cookies.cardapio_twitch_session);
  setCookie(res, 'cardapio_twitch_session', '', `clear${cookieOptions(req)}`);
}

async function exchangeTwitchCode(code, redirectUri) {
  const {clientId,clientSecret} = twitchConfig();
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:redirectUri}),
    signal:AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token || !data.refresh_token) throw new Error('A Twitch não concluiu a autorização. Confira o Client ID, segredo e URL de retorno.');
  return data;
}

async function refreshTwitchToken(session) {
  const {clientId,clientSecret} = twitchConfig();
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:session.refreshToken,grant_type:'refresh_token'}),
    signal:AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('A sessão da Twitch expirou. Entre novamente.');
  session.accessToken = data.access_token;
  session.refreshToken = data.refresh_token || session.refreshToken;
  session.accessExpiresAt = Date.now() + Number(data.expires_in || 0) * 1000;
}

async function verifyTwitchSession(session) {
  const {clientId} = twitchConfig();
  if (session.accessExpiresAt && session.accessExpiresAt < Date.now() + 5 * 60 * 1000) await refreshTwitchToken(session);
  if (session.validatedAt && Date.now() - session.validatedAt < 60 * 60 * 1000) return true;
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {headers:{Authorization:`OAuth ${session.accessToken}`},signal:AbortSignal.timeout(12000)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.client_id !== clientId || data.user_id !== session.profile.id) return false;
  session.validatedAt = Date.now();
  session.accessExpiresAt = Date.now() + Number(data.expires_in || 0) * 1000;
  const userResponse = await fetch('https://api.twitch.tv/helix/users', {headers:{Authorization:`Bearer ${session.accessToken}`,'Client-Id':clientId},signal:AbortSignal.timeout(12000)});
  const userData = await userResponse.json().catch(() => ({}));
  const user = userData.data?.[0];
  if (!userResponse.ok || !user || user.id !== session.profile.id) return false;
  session.profile = {id:user.id,login:user.login,displayName:user.display_name,profileImageUrl:user.profile_image_url || ''};
  return true;
}

async function getAuthenticatedProfile(req, res) {
  const sessionId = parseCookies(req).cardapio_twitch_session;
  const session = sessionId ? twitchSessions.get(sessionId) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (sessionId) twitchSessions.delete(sessionId);
    return null;
  }
  try {
    if (!await verifyTwitchSession(session)) throw new Error('Sessão inválida.');
    if (!session.communityMemberSavedAt || Date.now() - session.communityMemberSavedAt > 60 * 60 * 1000) {
      try {
        await saveCommunityMember(session.profile);
        session.communityMemberSavedAt = Date.now();
      } catch (error) { console.warn('Não foi possível atualizar o perfil da comunidade:',error.message); }
    }
    const role = getTwitchRole(session.profile);
    if (role === 'admin') infiniteVicoinsUserIds.add(session.profile.id);
    return {...session.profile,role};
  } catch {
    twitchSessions.delete(sessionId);
    res.setHeader('set-cookie', `cardapio_twitch_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieOptions(req)}`);
    return null;
  }
}

function json(res, status, data) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type'});
  res.end(JSON.stringify(data));
}

const localStateFiles = {
  favorites:favoritesFile,
  ratings:ratingsFile,
  redemptions:redemptionsFile,
  communityMembers:communityMembersFile,
  communityBadges:communityBadgesFile,
  promotions:promotionsFile,
  vicoins:vicoinsFile,
  vicoinsRewards:vicoinsRewardsFile,
  gameProgress:gameProgressFile,
  forum:forumFile,
  youtubeVideos:youtubeVideosFile,
  patreonMappings:patreonMappingsFile
};

async function supabaseRest(resource,options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1${resource}`,{
    ...options,
    headers:{apikey:supabaseServiceRoleKey,authorization:`Bearer ${supabaseServiceRoleKey}`,'content-type':'application/json',...(options.headers || {})},
    signal:options.signal || AbortSignal.timeout(15000)
  });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || `Supabase respondeu ${response.status}.`);
    error.status = response.status;
    error.code = data?.code || '';
    throw error;
  }
  return data;
}

function stateQuery(key,select = 'state_key,state_value,version') {
  const query = new URLSearchParams({state_key:`eq.${key}`,select});
  return `/app_state?${query}`;
}

async function readSupabaseStateRow(key,fallback) {
  const rows = await supabaseRest(stateQuery(key));
  if (Array.isArray(rows) && rows.length) return rows[0];
  try {
    await supabaseRest('/app_state',{method:'POST',headers:{prefer:'return=minimal'},body:JSON.stringify({state_key:key,state_value:structuredClone(fallback),version:0})});
  } catch (error) {
    if (error.status !== 409 && error.code !== '23505') throw error;
  }
  const created = await supabaseRest(stateQuery(key));
  if (!Array.isArray(created) || !created.length) throw new Error(`Não foi possível inicializar o estado "${key}" no Supabase.`);
  return created[0];
}

async function readJsonState(key,fallback) {
  if (persistenceMode === 'supabase') {
    const row = await readSupabaseStateRow(key,fallback);
    return structuredClone(row.state_value ?? fallback);
  }
  const file = localStateFiles[key];
  if (!file) throw new Error(`Estado local desconhecido: ${key}`);
  try { return JSON.parse(await readFile(file,'utf8')); }
  catch { return structuredClone(fallback); }
}

async function writeJsonState(key,value) {
  if (persistenceMode === 'supabase') throw new Error('Gravações no Supabase precisam usar updateJsonState para evitar sobrescrever alterações concorrentes.');
  const file = localStateFiles[key];
  if (!file) throw new Error(`Estado local desconhecido: ${key}`);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify(value,null,2),'utf8');
  await rename(temporary,file);
}

async function updateJsonState(key,fallback,update) {
  if (persistenceMode === 'local') {
    const current = await readJsonState(key,fallback);
    const result = update(current);
    await writeJsonState(key,current);
    return result;
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await readSupabaseStateRow(key,fallback);
    const next = structuredClone(row.state_value ?? fallback);
    const result = update(next);
    const version = Number(row.version) || 0;
    const query = new URLSearchParams({state_key:`eq.${key}`,version:`eq.${version}`});
    const updated = await supabaseRest(`/app_state?${query}`,{
      method:'PATCH',
      headers:{prefer:'return=representation'},
      body:JSON.stringify({state_value:next,version:version + 1,updated_at:new Date().toISOString()})
    });
    if (Array.isArray(updated) && updated.length) return result;
  }
  throw new Error(`O estado "${key}" mudou várias vezes; tente novamente.`);
}

function storageObjectPath(value) {
  return String(value || '').split('/').map(segment => encodeURIComponent(segment)).join('/');
}

async function uploadStorageObject(bucket,filename,buffer,contentType) {
  if (persistenceMode !== 'supabase') throw new Error('Configure o Supabase para armazenar imagens de forma persistente.');
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${storageObjectPath(filename)}`,{
    method:'POST',headers:{apikey:supabaseServiceRoleKey,authorization:`Bearer ${supabaseServiceRoleKey}`,'content-type':contentType,'x-upsert':'false'},
    body:buffer,signal:AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Não foi possível salvar a imagem no Supabase (${response.status}).`);
  }
}

async function downloadStorageObject(bucket,filename) {
  if (persistenceMode !== 'supabase') throw new Error('O armazenamento de imagens do Supabase não está ativo.');
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${storageObjectPath(filename)}`,{
    headers:{apikey:supabaseServiceRoleKey,authorization:`Bearer ${supabaseServiceRoleKey}`},signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Imagem não encontrada no armazenamento (${response.status}).`);
  return {buffer:Buffer.from(await response.arrayBuffer()),contentType:response.headers.get('content-type') || 'application/octet-stream'};
}

async function deleteStorageObject(bucket,filename) {
  if (persistenceMode !== 'supabase') return;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`,{
    method:'DELETE',headers:{apikey:supabaseServiceRoleKey,authorization:`Bearer ${supabaseServiceRoleKey}`,'content-type':'application/json'},
    body:JSON.stringify({prefixes:[filename]}),signal:AbortSignal.timeout(15000)
  });
  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Não foi possível remover a imagem (${response.status}).`);
  }
}

async function readFavorites() {
  const value = await readJsonState('favorites',[]);
  return Array.isArray(value) ? value : [];
}

async function readRatings() {
  const value = await readJsonState('ratings',[]);
  return Array.isArray(value) ? value : [];
}

async function readRedemptions() {
  const value = await readJsonState('redemptions',[]);
  return Array.isArray(value) ? value : [];
}

async function readCommunityMembers() {
  const value = await readJsonState('communityMembers',[]);
  return Array.isArray(value) ? value : [];
}

async function readCommunityBadges() {
  const value = await readJsonState('communityBadges',{badges:[]});
  return value && Array.isArray(value.badges) ? value : {badges:[]};
}

async function getCommunityBadgesForMember(memberId) {
  const store = await readCommunityBadges();
  return store.badges.filter(badge => Array.isArray(badge.memberIds) && badge.memberIds.includes(String(memberId)))
    .map(({id,name,symbol}) => ({id,name,symbol}));
}

async function readForumTopics() {
  const value = await readJsonState('forum',[]);
  return Array.isArray(value) ? value : [];
}

async function updateForumTopics(update) {
  const operation = forumWriteQueue.then(async () => {
    return updateJsonState('forum',[],update);
  });
  forumWriteQueue = operation.catch(() => {});
  return operation;
}

async function saveForumAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') return null;
  const allowed = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
  const type = String(attachment.type || '').toLowerCase();
  const extension = allowed[type];
  const encoded = String(attachment.data || '');
  if (!extension || !encoded || encoded.length > 5_600_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Anexe uma imagem JPG, PNG, WebP ou GIF de até 4 MB.');
  const buffer = Buffer.from(encoded,'base64');
  if (!buffer.length || buffer.length > 4 * 1024 * 1024 || buffer.toString('base64').replace(/=+$/,'') !== encoded.replace(/=+$/,'')) throw new Error('O arquivo anexado é inválido ou excede 4 MB.');
  const matches = type === 'image/jpeg' ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : type === 'image/png' ? buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
    : type === 'image/gif' ? ['GIF87a','GIF89a'].includes(buffer.toString('ascii',0,6))
    : type === 'image/webp' ? buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP'
    : false;
  if (!matches) throw new Error('O conteúdo do arquivo não corresponde ao tipo de imagem informado.');
  const filename = `${randomUUID()}.${extension}`;
  if (persistenceMode === 'supabase') await uploadStorageObject('forum-uploads',filename,buffer,type);
  else await writeFile(path.join(forumUploadsDir,filename),buffer,{flag:'wx'});
  const safeName = String(attachment.name || `imagem.${extension}`).replace(/[^A-Za-z0-9._ -]/g,'').trim().slice(0,80) || `imagem.${extension}`;
  return {url:`/api/forum/uploads/${filename}`,type,name:safeName};
}

async function deleteForumAttachment(attachment) {
  const match = /^\/api\/forum\/uploads\/([a-f0-9-]{36}\.(?:jpg|png|webp|gif))$/i.exec(String(attachment?.url || ''));
  if (!match) return;
  try {
    if (persistenceMode === 'supabase') await deleteStorageObject('forum-uploads',match[1]);
    else await unlink(path.join(forumUploadsDir,match[1]));
  } catch {}
}

async function readVicoinsStore() {
  const defaults = {balances:{},transactions:[],orders:[],bannerOrders:[],gameKeys:[],gameKeyOrders:[],customProfileBanners:[],removedProfileBanners:[],dailyClaims:{},profileBannerInventory:{},clubVimeMembers:[]};
  const value = await readJsonState('vicoins',defaults);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  if (value.balances && typeof value.balances === 'object' && !Array.isArray(value.balances)) {
    return {balances:value.balances,transactions:Array.isArray(value.transactions) ? value.transactions : [],orders:Array.isArray(value.orders) ? value.orders : [],bannerOrders:Array.isArray(value.bannerOrders) ? value.bannerOrders : [],gameKeys:Array.isArray(value.gameKeys) ? value.gameKeys : [],gameKeyOrders:Array.isArray(value.gameKeyOrders) ? value.gameKeyOrders : [],customProfileBanners:Array.isArray(value.customProfileBanners) ? value.customProfileBanners : [],removedProfileBanners:Array.isArray(value.removedProfileBanners) ? value.removedProfileBanners : [],dailyClaims:value.dailyClaims && typeof value.dailyClaims === 'object' && !Array.isArray(value.dailyClaims) ? value.dailyClaims : {},profileBannerInventory:value.profileBannerInventory && typeof value.profileBannerInventory === 'object' && !Array.isArray(value.profileBannerInventory) ? value.profileBannerInventory : {},clubVimeMembers:Array.isArray(value.clubVimeMembers) ? value.clubVimeMembers : []};
  }
  return {...defaults,balances:value};
}

function getProfileBannerRewards(store) {
  const removed = new Set(Array.isArray(store.removedProfileBanners) ? store.removedProfileBanners : []);
  const builtIn = profileBannerRewards.filter(item => !removed.has(item.id));
  const custom = Array.isArray(store.customProfileBanners) ? store.customProfileBanners : [];
  return [...builtIn,...custom.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.imageUrl === 'string').map(item => ({...item,paymentType:'livepix',amount:5,coinCost:5}))];
}

function getProfileBannerInventory(store,userId) {
  const saved = store.profileBannerInventory?.[userId];
  const rewards = getProfileBannerRewards(store);
  const owned = Array.isArray(saved?.owned) ? [...new Set(saved.owned.filter(id => rewards.some(item => item.id === id)))] : [];
  const equippedId = rewards.some(item => item.id === saved?.equipped) ? saved.equipped : '';
  return {owned,equipped:rewards.find(item => item.id === equippedId) || null};
}

function hasClubVime(store,userId) {
  return Boolean(getClubVimeMembership(store,userId)?.expiresAt && Date.parse(getClubVimeMembership(store,userId).expiresAt) > Date.now());
}

function getClubVimeMembership(store,userId) {
  if (!Array.isArray(store.clubVimeMembers)) return null;
  return store.clubVimeMembers.find(member => member && typeof member === 'object' && String(member.userId) === String(userId)) || null;
}

async function updateVicoinsStore(update) {
  const operation = vicoinsWriteQueue.then(async () => {
    return updateJsonState('vicoins',{balances:{},transactions:[],orders:[],bannerOrders:[],gameKeys:[],gameKeyOrders:[],customProfileBanners:[],removedProfileBanners:[],dailyClaims:{},profileBannerInventory:{}},update);
  });
  vicoinsWriteQueue = operation.catch(() => {});
  return operation;
}

function applyVicoinsTransaction(store,{userId,amount,type,referenceId,description}) {
  if (infiniteVicoinsUserIds.has(String(userId))) return Number.MAX_SAFE_INTEGER;
  store.balances = store.balances || {};
  store.transactions = Array.isArray(store.transactions) ? store.transactions : [];
  const existing = store.transactions.find(item => item.userId === userId && item.type === type && item.referenceId === referenceId);
  if (existing) return Number(store.balances[userId]) || 0;
  const current = Number(store.balances[userId]) || 0;
  const next = current + amount;
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(next) || next < 0) throw new Error('Saldo de Vicoins insuficiente.');
  store.balances[userId] = next;
  store.transactions.push({id:randomUUID(),userId,amount,type,referenceId,description,createdAt:new Date().toISOString()});
  return next;
}

async function getVicoinsBalance(userId,infinite = false) {
  if (infinite || infiniteVicoinsUserIds.has(String(userId))) return Number.MAX_SAFE_INTEGER;
  const store = await readVicoinsStore();
  const balance = Number(store.balances[userId]);
  return Number.isSafeInteger(balance) && balance >= 0 ? balance : 0;
}

async function awardActivityVicoins({userId,type,referenceId,description}) {
  if (infiniteVicoinsUserIds.has(String(userId))) return {awarded:0,balance:Number.MAX_SAFE_INTEGER};
  return updateVicoinsStore(store => {
    store.transactions = Array.isArray(store.transactions) ? store.transactions : [];
    const exists = store.transactions.some(item => item.userId === userId && item.type === type && item.referenceId === referenceId);
    const balance = applyVicoinsTransaction(store,{userId,amount:1,type,referenceId,description});
    return {awarded:exists ? 0 : 1,balance};
  });
}

async function reconcileApprovedRedemptionVicoins(userId = '') {
  const approved = (await readRedemptions()).filter(item => item.status === 'approved' && Number.isSafeInteger(Number(item.vicoinsAwarded)) && Number(item.vicoinsAwarded) > 0 && (!userId || item.requester?.id === userId));
  if (!approved.length) return;
  await updateVicoinsStore(store => {
    for (const item of approved) applyVicoinsTransaction(store,{userId:item.requester.id,amount:Number(item.vicoinsAwarded),type:'content-redemption',referenceId:item.id,description:`Vicoins por resgate de ${item.title}`});
  });
}

async function saveCommunityMember(profile) {
  const operation = communityMembersWriteQueue.then(async () => {
    return updateJsonState('communityMembers',[],members => {
      const existing = members.find(member => member.id === profile.id);
      const now = new Date().toISOString();
      const record = {
        id:profile.id,
        login:profile.login,
        displayName:profile.displayName || profile.login,
        profileImageUrl:profile.profileImageUrl || '',
        joinedAt:existing?.joinedAt || now,
        lastSeenAt:now
      };
      if (existing) Object.assign(existing,record);
      else members.push(record);
    });
  });
  communityMembersWriteQueue = operation.catch(() => {});
  return operation;
}

async function readPromotions() {
  const value = await readJsonState('promotions',defaultPromotionCollections);
  return Array.isArray(value) ? value : [];
}

async function updatePromotions(update) {
  const operation = promotionsWriteQueue.then(async () => {
    return updateJsonState('promotions',defaultPromotionCollections,update);
  });
  promotionsWriteQueue = operation.catch(() => {});
  return operation;
}

async function updateRedemptions(update) {
  const operation = redemptionsWriteQueue.then(async () => {
    return updateJsonState('redemptions',[],update);
  });
  redemptionsWriteQueue = operation.catch(() => {});
  return operation;
}

function parseScheduledAt(value) {
  const time = Date.parse(String(value || ''));
  if (!Number.isFinite(time)) throw new Error('Informe uma data e horário válidos para o resgate.');
  if (time <= Date.now()) throw new Error('Escolha uma data e horário futuros.');
  if (time > Date.now() + 730 * 24 * 60 * 60 * 1000) throw new Error('A data do resgate precisa estar dentro dos próximos dois anos.');
  return new Date(time).toISOString();
}

async function updateRatings(update) {
  const operation = ratingsWriteQueue.then(async () => {
    return updateJsonState('ratings',[],update);
  });
  ratingsWriteQueue = operation.catch(() => {});
  return operation;
}

function ratingSummary(entry, clientId = '') {
  const votes = Array.isArray(entry?.votes) ? entry.votes.filter(vote => Number.isFinite(vote.rating)) : [];
  const averageRating = votes.length ? Math.round(votes.reduce((sum,vote) => sum + vote.rating, 0) / votes.length * 10) / 10 : 0;
  return {averageRating,ratingCount:votes.length,myRating:votes.find(vote => vote.clientId === clientId)?.rating || null};
}

function publicTopRatings(entries) {
  return entries.map(entry => ({
    id:entry.id,
    mediaType:entry.mediaType,
    title:entry.title,
    posterUrl:entry.posterUrl,
    ...ratingSummary(entry)
  })).filter(entry => entry.ratingCount > 0)
    .sort((a,b) => b.averageRating - a.averageRating || b.ratingCount - a.ratingCount || a.title.localeCompare(b.title, 'pt-BR'))
    .slice(0,5);
}

function parseSteamImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const steamHosted = host === 'steamstatic.com' || host.endsWith('.steamstatic.com') || host === 'steamcdn-a.akamaihd.net' || host === 'steamuserimages-a.akamaihd.net';
    if (url.protocol !== 'https:' || !steamHosted || raw.length > 2000) throw new Error();
    return url.href;
  } catch { throw new Error('Use um link HTTPS direto de uma imagem hospedada na Steam.'); }
}

async function updateFavorites(update) {
  const operation = favoritesWriteQueue.then(async () => {
    return updateJsonState('favorites',[],update);
  });
  favoritesWriteQueue = operation.catch(() => {});
  return operation;
}

function publicFavorites(entries, clientId) {
  return entries.map(entry => ({
    id:entry.id,
    mediaType:entry.mediaType,
    title:entry.title,
    posterUrl:entry.posterUrl,
    year:entry.year || '',
    voteCount:Array.isArray(entry.voters) ? entry.voters.length : 0,
    liked:Array.isArray(entry.voters) && entry.voters.includes(clientId)
  })).filter(entry => entry.voteCount > 0)
    .sort((a,b) => b.voteCount - a.voteCount || a.title.localeCompare(b.title, 'pt-BR'));
}

function userFavorites(entries, userId) {
  return entries.filter(entry => Array.isArray(entry.voters) && entry.voters.includes(userId))
    .map(entry => ({id:entry.id,mediaType:entry.mediaType,title:entry.title,posterUrl:entry.posterUrl,year:entry.year || '',voteCount:entry.voters.length,liked:true}))
    .sort((a,b) => a.title.localeCompare(b.title,'pt-BR'));
}

function userRatingCount(entries,userId) {
  if (!userId) return 0;
  return entries.reduce((count,entry) => count + (Array.isArray(entry.votes) && entry.votes.some(vote => vote.clientId === userId) ? 1 : 0),0);
}

function userRatings(entries,userId) {
  if (!userId) return [];
  return entries.flatMap(entry => {
    const vote = Array.isArray(entry.votes) ? entry.votes.find(item => item.clientId === userId && Number.isFinite(item.rating)) : null;
    return vote ? [{id:entry.id,mediaType:entry.mediaType,title:entry.title,posterUrl:entry.posterUrl || '',rating:vote.rating}] : [];
  }).sort((a,b) => a.title.localeCompare(b.title,'pt-BR'));
}

function profileTitlePage(items,offset = 0,limit = 5) {
  const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  return {items:items.slice(safeOffset,safeOffset + limit),total:items.length};
}

async function removePatreonLinkedFavorites() {
  const favorites = await readFavorites();
  if (!favorites.length) return favorites;
  const linkedKeys = new Set((await Promise.all(favorites.map(async item => {
    try {
      const title = await getCatalogTitle(item.mediaType, Number(item.id));
      return title.reactUrl ? `${item.mediaType}:${item.id}` : '';
    } catch { return ''; }
  }))).filter(Boolean));
  if (!linkedKeys.size) return favorites;
  return updateFavorites(entries => {
    for (let index = entries.length - 1; index >= 0; index--) {
      const item = entries[index];
      if (linkedKeys.has(`${item.mediaType}:${item.id}`)) entries.splice(index, 1);
    }
    return entries;
  });
}

async function readRequestJson(req, maxBytes = 12000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('A solicitação excedeu o tamanho permitido.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('O conteúdo da solicitação não é um JSON válido.'); }
}

function decodeProfileBannerImage(image) {
  const type = String(image?.type || '').toLowerCase();
  const extension = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : '';
  const encoded = String(image?.data || '');
  if (!extension || !encoded || encoded.length > 5_600_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Envie um banner PNG ou JPG de até 4 MB.');
  const buffer = Buffer.from(encoded,'base64');
  if (!buffer.length || buffer.length > 4 * 1024 * 1024 || buffer.toString('base64').replace(/=+$/,'') !== encoded.replace(/=+$/,'')) throw new Error('A imagem é inválida ou excede 4 MB.');
  let width = 0;
  let height = 0;
  if (extension === 'png' && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) && buffer.length >= 24) {
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  } else if (extension === 'jpg' && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const frameMarkers = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    let offset = 2;
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      while (buffer[offset] === 0xff) offset++;
      const marker = buffer[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7 || marker === 0x01) continue;
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if (frameMarkers.has(marker) && length >= 7) {
        height = buffer.readUInt16BE(offset + 3);
        width = buffer.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  }
  if (width !== 1600 || height !== 240) throw new Error('A imagem do banner precisa ter exatamente 1600 × 240 px.');
  return {buffer,extension,type};
}

async function tmdbRequest(endpoint) {
  let response;
  try {
    response = await fetch(`https://api.themoviedb.org/3${endpoint}`, {headers:{Authorization:`Bearer ${process.env.TMDB_API_READ_ACCESS_TOKEN}`,accept:'application/json'},signal:AbortSignal.timeout(12000)});
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('O TMDB demorou para responder. Verifique a conexão do servidor e tente novamente.');
    throw new Error('O servidor não conseguiu conectar ao TMDB. Verifique a internet ou o DNS do servidor.');
  }
  if (!response.ok) throw new Error(response.status === 401 ? 'A chave de acesso do TMDB não foi aceita.' : 'Não consegui consultar o TMDB agora.');
  return response.json();
}

async function searchTmdb(query, startPage = 1, startOffset = 0) {
  if (!process.env.TMDB_API_READ_ACCESS_TOKEN) throw new Error('Configure TMDB_API_READ_ACCESS_TOKEN no arquivo .env para ativar a busca com pôsteres.');
  const hits = [];
  let page = startPage;
  let offset = startOffset;
  let totalPages = 500;
  let nextCursor = null;
  let scannedPages = 0;
  while (hits.length < 6 && page <= totalPages && page <= 500 && scannedPages < 10) {
    const search = await tmdbRequest(`/search/multi?query=${encodeURIComponent(query)}&language=pt-BR&include_adult=false&page=${page}`);
    totalPages = Math.min(Math.max(Number(search.total_pages) || 1, 1), 500);
    const pageHits = (search.results || []).filter(item => ['movie','tv'].includes(item.media_type));
    const availableHits = pageHits.slice(offset);
    const take = Math.min(6 - hits.length, availableHits.length);
    hits.push(...availableHits.slice(0, take));
    if (offset + take < pageHits.length) nextCursor = {page,offset:offset + take};
    else nextCursor = page < totalPages ? {page:page + 1,offset:0} : null;
    page = nextCursor?.page || 501;
    offset = nextCursor?.offset || 0;
    scannedPages++;
  }
  const results = await Promise.all(hits.map(async hit => {
    const kind = hit.media_type === 'movie' ? 'Filme' : hit.original_language === 'ja' ? 'Anime / Série' : 'Série';
    const detail = await tmdbRequest(`/${hit.media_type}/${hit.id}?language=pt-BR`);
    let durationMinutes = null;
    let durationLabel = '';
    if (hit.media_type === 'movie') {
      durationMinutes = Number(detail.runtime) || null;
      durationLabel = durationMinutes ? `${durationMinutes} min` : '';
    } else {
      const episodeMinutes = Array.isArray(detail.episode_run_time) && detail.episode_run_time.length ? Math.round(detail.episode_run_time.reduce((sum, value) => sum + Number(value || 0), 0) / detail.episode_run_time.length) : 0;
      const episodeCount = Number(detail.number_of_episodes) || 0;
      const seasons = Number(detail.number_of_seasons) || 0;
      durationMinutes = episodeMinutes && episodeCount ? episodeMinutes * episodeCount : null;
      durationLabel = `${seasons || '—'} temporada(s) · ${episodeCount || '—'} episódios${durationMinutes ? ` · aprox. ${durationMinutes} min no total` : episodeMinutes ? ` · ${episodeMinutes} min por episódio` : ''}`;
    }
    const posterPath = detail.poster_path || hit.poster_path;
    return {id:hit.id,mediaType:hit.media_type,title:detail.title || detail.name || hit.title || hit.name,originalTitle:detail.original_title || detail.original_name || hit.original_title || hit.original_name || '',kind,year:String(detail.release_date || detail.first_air_date || '').slice(0,4),overview:detail.overview || hit.overview || '',durationMinutes,durationLabel,posterUrl:posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null,sourceUrl:`https://www.themoviedb.org/${hit.media_type}/${hit.id}`};
  }));
  let posts = await getManualPatreonLinks();
  try { posts = [...posts, ...await getPatreonPosts()]; } catch {}
  await applyPatreonMatches(results,posts);
  return {source:'tmdb',results,nextCursor};
}

async function getCatalogTitle(type, id) {
  if (!process.env.TMDB_API_READ_ACCESS_TOKEN) throw new Error('Configure TMDB_API_READ_ACCESS_TOKEN no arquivo .env para consultar os detalhes.');
  if (!['movie','tv'].includes(type) || !Number.isSafeInteger(id) || id <= 0) throw new Error('Título inválido.');
  const detail = await tmdbRequest(`/${type}/${id}?language=pt-BR`);
  let trailer = null;
  try { trailer = await getCatalogTrailer(type, id); } catch {}
  const isMovie = type === 'movie';
  const episodeMinutes = Array.isArray(detail.episode_run_time) && detail.episode_run_time.length
    ? Math.round(detail.episode_run_time.reduce((sum, value) => sum + Number(value || 0), 0) / detail.episode_run_time.length)
    : 0;
  const episodeCount = Number(detail.number_of_episodes) || 0;
  const durationMinutes = isMovie ? Number(detail.runtime) || null : episodeMinutes && episodeCount ? episodeMinutes * episodeCount : null;
  const releaseDate = detail.release_date || detail.first_air_date || '';
  const result = {
    id,
    mediaType:type,
    title:detail.title || detail.name || 'Título sem nome',
    originalTitle:detail.original_title || detail.original_name || '',
    kind:isMovie ? 'Filme' : detail.original_language === 'ja' ? 'Anime / Série' : 'Série',
    genres:Array.isArray(detail.genres) ? detail.genres.map(genre => genre.name).filter(Boolean) : [],
    year:String(releaseDate).slice(0,4),
    releaseDate,
    overview:detail.overview || '',
    durationMinutes,
    durationLabel:isMovie
      ? (durationMinutes ? `${durationMinutes} min` : '')
      : `${Number(detail.number_of_seasons) || '—'} temporada(s) · ${episodeCount || '—'} episódios${durationMinutes ? ` · aprox. ${durationMinutes} min no total` : episodeMinutes ? ` · ${episodeMinutes} min por episódio` : ''}`,
    posterUrl:detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
    sourceUrl:`https://www.themoviedb.org/${type}/${id}`,
    trailer
  };
  let posts = await getManualPatreonLinks();
  try { posts = [...posts, ...await getPatreonPosts()]; } catch {}
  await applyPatreonMatches([result],posts);
  return result;
}

async function getCatalogTrailer(type, id) {
  const cacheKey = `${type}:${id}`;
  const cached = trailerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const path = type === 'movie' ? `/movie/${id}/videos` : `/tv/${id}/videos`;
  let videos = await tmdbRequest(`${path}?language=pt-BR`);
  let trailers = (videos.results || []).filter(video => video.site === 'YouTube' && video.type === 'Trailer' && /^[A-Za-z0-9_-]{11}$/.test(video.key || ''));
  if (!trailers.length) {
    videos = await tmdbRequest(`${path}?language=en-US`);
    trailers = (videos.results || []).filter(video => video.site === 'YouTube' && video.type === 'Trailer' && /^[A-Za-z0-9_-]{11}$/.test(video.key || ''));
  }
  trailers.sort((left, right) => Number(right.official) - Number(left.official) || Number(right.iso_639_1 === 'pt') - Number(left.iso_639_1 === 'pt'));
  const video = trailers[0];
  const value = video ? {key:video.key,name:String(video.name || 'Trailer').slice(0, 180),language:video.iso_639_1 || ''} : null;
  trailerCache.set(cacheKey, {value,expiresAt:Date.now() + 21600000});
  return value;
}

async function getTrendingSuggestions(period = 'week') {
  if (!process.env.TMDB_API_READ_ACCESS_TOKEN) throw new Error('Configure TMDB_API_READ_ACCESS_TOKEN no arquivo .env para ativar as sugestões.');
  const cached = suggestionsCache.get(period);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const trending = await tmdbRequest(`/trending/all/${period}?language=pt-BR`);
  const hits = (trending.results || [])
    .filter(item => ['movie','tv'].includes(item.media_type) && item.poster_path && (item.release_date || item.first_air_date))
    .slice(0, 10);
  const results = await Promise.all(hits.map(async hit => {
    const detail = await tmdbRequest(`/${hit.media_type}/${hit.id}?language=pt-BR`);
    const isMovie = hit.media_type === 'movie';
    const episodeMinutes = Array.isArray(detail.episode_run_time) && detail.episode_run_time.length
      ? Math.round(detail.episode_run_time.reduce((sum, value) => sum + Number(value || 0), 0) / detail.episode_run_time.length)
      : 0;
    const episodeCount = Number(detail.number_of_episodes) || 0;
    const durationMinutes = isMovie ? Number(detail.runtime) || null : episodeMinutes && episodeCount ? episodeMinutes * episodeCount : null;
    const date = detail.release_date || detail.first_air_date || hit.release_date || hit.first_air_date || '';
    return {
      id:hit.id,
      mediaType:hit.media_type,
      title:detail.title || detail.name || hit.title || hit.name,
      kind:isMovie ? 'Filme' : hit.original_language === 'ja' ? 'Anime / Série' : 'Série',
      releaseDate:date,
      durationMinutes,
      durationLabel:isMovie
        ? (durationMinutes ? `${durationMinutes} min` : '')
        : `${Number(detail.number_of_seasons) || '—'} temporada(s) · ${episodeCount || '—'} episódios${durationMinutes ? ` · aprox. ${durationMinutes} min no total` : ''}`,
      posterUrl:`https://image.tmdb.org/t/p/w500${detail.poster_path || hit.poster_path}`,
      sourceUrl:`https://www.themoviedb.org/${hit.media_type}/${hit.id}`,
      popularity:Number(hit.popularity) || 0
    };
  }));
  let posts = await getManualPatreonLinks();
  try { posts = [...posts, ...await getPatreonPosts()]; } catch {}
  await applyPatreonMatches(results,posts);
  const value = {source:'tmdb',results};
  suggestionsCache.set(period, {value,expiresAt:Date.now() + 1800000});
  return value;
}

async function getCalendarMovies(year, month) {
  if (!process.env.TMDB_API_READ_ACCESS_TOKEN) throw new Error('Configure TMDB_API_READ_ACCESS_TOKEN no arquivo .env para carregar o calendário.');
  const cacheKey = `${year}-${String(month).padStart(2, '0')}`;
  const cached = calendarCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const start = `${cacheKey}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  const query = new URLSearchParams({
    language:'pt-BR',region:'BR',include_adult:'false',include_video:'false',
    with_release_type:'2|3',sort_by:'primary_release_date.asc',
    'release_date.gte':start,'release_date.lte':end,page:'1'
  });
  const firstPage = await tmdbRequest(`/discover/movie?${query}`);
  const pageCount = Math.min(Math.max(Number(firstPage.total_pages) || 1, 1), 10);
  const pages = await Promise.all(Array.from({length:pageCount - 1}, (_, index) => {
    const pageQuery = new URLSearchParams(query);
    pageQuery.set('page', String(index + 2));
    return tmdbRequest(`/discover/movie?${pageQuery}`);
  }));
  const results = [firstPage, ...pages].flatMap(page => page.results || [])
    .filter(item => item.id && /^\d{4}-\d{2}-\d{2}$/.test(item.release_date || '') && item.release_date >= start && item.release_date <= end)
    .map(item => ({
      id:Number(item.id),mediaType:'movie',title:item.title || item.original_title || 'Título sem nome',
      releaseDate:item.release_date,
      posterUrl:item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
      sourceUrl:`https://www.themoviedb.org/movie/${item.id}`
    }))
    .sort((left, right) => left.releaseDate.localeCompare(right.releaseDate) || left.title.localeCompare(right.title, 'pt-BR'));
  const value = {source:'tmdb',year,month,results,hasMore:(Number(firstPage.total_pages) || 1) > pageCount};
  calendarCache.set(cacheKey, {value,expiresAt:Date.now() + 1800000});
  return value;
}

async function getCatalogGenres(type) {
  if (!process.env.TMDB_API_READ_ACCESS_TOKEN) throw new Error('Configure TMDB_API_READ_ACCESS_TOKEN no arquivo .env para carregar os gêneros.');
  if (!['movie','tv'].includes(type)) throw new Error('Escolha filme ou série.');
  const cached = genreCache.get(type);
  if (cached && cached.expiresAt > Date.now()) return cached.genres;
  const response = await tmdbRequest(`/genre/${type}/list?language=pt-BR`);
  const genres = (response.genres || []).filter(genre => Number.isInteger(Number(genre.id)) && typeof genre.name === 'string');
  genreCache.set(type, {genres,expiresAt:Date.now() + 21600000});
  return genres;
}

async function getRandomCatalogTitle(type, requestedGenre = 'all') {
  if (!process.env.TMDB_API_READ_ACCESS_TOKEN) throw new Error('Configure TMDB_API_READ_ACCESS_TOKEN no arquivo .env para ativar o sorteador.');
  if (!['movie','tv'].includes(type)) throw new Error('Escolha filme ou série.');
  let genreId = '';
  if (requestedGenre !== 'all') {
    const genres = await getCatalogGenres(type);
    genreId = String(Number(requestedGenre));
    if (!/^\d+$/.test(genreId) || !genres.some(genre => String(genre.id) === genreId)) throw new Error('Escolha um gênero disponível.');
  }
  const filters = `include_adult=false&language=pt-BR&sort_by=popularity.desc&vote_count.gte=25${genreId ? `&with_genres=${genreId}` : ''}`;
  const firstPage = await tmdbRequest(`/discover/${type}?${filters}&page=1`);
  const maxPage = Math.min(Math.max(Number(firstPage.total_pages) || 1, 1), 50);
  const page = Math.floor(Math.random() * maxPage) + 1;
  const discover = page === 1 ? firstPage : await tmdbRequest(`/discover/${type}?${filters}&page=${page}`);
  const hits = (discover.results || []).filter(item => item.poster_path && (item.release_date || item.first_air_date));
  if (!hits.length) throw new Error('Não encontrei títulos para sortear agora. Tente novamente.');
  const hit = hits[Math.floor(Math.random() * hits.length)];
  const detail = await tmdbRequest(`/${type}/${hit.id}?language=pt-BR`);
  const isMovie = type === 'movie';
  const episodeMinutes = Array.isArray(detail.episode_run_time) && detail.episode_run_time.length
    ? Math.round(detail.episode_run_time.reduce((sum, value) => sum + Number(value || 0), 0) / detail.episode_run_time.length)
    : 0;
  const episodeCount = Number(detail.number_of_episodes) || 0;
  const durationMinutes = isMovie ? Number(detail.runtime) || null : episodeMinutes && episodeCount ? episodeMinutes * episodeCount : null;
  const releaseDate = detail.release_date || detail.first_air_date || hit.release_date || hit.first_air_date || '';
  const result = {
    id:hit.id,
    mediaType:type,
    title:detail.title || detail.name || hit.title || hit.name,
    originalTitle:detail.original_title || detail.original_name || hit.original_title || hit.original_name || '',
    kind:isMovie ? 'Filme' : hit.original_language === 'ja' ? 'Anime / Série' : 'Série',
    genres:Array.isArray(detail.genres) ? detail.genres.map(genre => genre.name).filter(Boolean) : [],
    year:String(releaseDate).slice(0,4),
    releaseDate,
    overview:detail.overview || hit.overview || '',
    durationMinutes,
    durationLabel:isMovie
      ? (durationMinutes ? `${durationMinutes} min` : '')
      : `${Number(detail.number_of_seasons) || '—'} temporada(s) · ${episodeCount || '—'} episódios${durationMinutes ? ` · aprox. ${durationMinutes} min no total` : ''}`,
    posterUrl:`https://image.tmdb.org/t/p/w500${detail.poster_path || hit.poster_path}`,
    sourceUrl:`https://www.themoviedb.org/${type}/${hit.id}`
  };
  let posts = await getManualPatreonLinks();
  try { posts = [...posts, ...await getPatreonPosts()]; } catch {}
  await applyPatreonMatches([result],posts);
  return result;
}

async function getManualPatreonLinks() {
  try {
    const entries = JSON.parse(await readFile(manualPatreonLinksFile, 'utf8'));
    if (!Array.isArray(entries)) return [];
    return entries.flatMap(entry => {
      if (!entry || typeof entry.title !== 'string' || typeof entry.url !== 'string') return [];
      let link;
      try { link = new URL(entry.url); } catch { return []; }
      if (link.protocol !== 'https:' || !['www.patreon.com','patreon.com'].includes(link.hostname) || !/\/posts\//.test(link.pathname)) return [];
      const aliases = Array.isArray(entry.aliases) ? entry.aliases.filter(value => typeof value === 'string') : [];
      return [{title:entry.title,aliases,url:link.href}];
    });
  } catch { return []; }
}

function decodeHtml(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))).replace(/\s+/g, ' ').trim();
}

function normalizeContentTitle(value) {
  return String(value || '')
    .replace(/^\s*(?:filme|série|serie|anime|reality|show|documentário|documentario)\s*:\s*/i, '')
    .replace(/\((?:\s*\d{4}\s*|[^)]*(?:\d+\s*[ªº]?\s*(?:temp|temporada)|s\s*\d+\s*(?:e|ep)\s*\d+)[^)]*)\)/gi, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function patreonTitleKey(result) {
  return `${result.mediaType}:${Number(result.id)}`;
}

async function applyPatreonMatches(results,posts) {
  const store = await readJsonState('patreonMappings',{items:[]});
  const mappings = Array.isArray(store?.items) ? store.items : [];
  for (const result of results) {
    const key = patreonTitleKey(result);
    const specific = mappings.find(item => item.key === key);
    if (specific?.blockAutomatic) continue;
    if (specific?.url) {
      result.reactUrl = specific.url;
      result.reactPostTitle = specific.title || result.title;
      continue;
    }
    const titleKeys = [result.title,result.originalTitle].map(normalizeContentTitle).filter(Boolean);
    const matchingPosts = posts.filter(post => [...(post.aliases || []),post.title].some(title => titleKeys.includes(normalizeContentTitle(title))));
    const uniqueUrls = [...new Set(matchingPosts.map(post => post.url))];
    if (uniqueUrls.length !== 1) continue;
    const matchedPost = matchingPosts.find(post => post.url === uniqueUrls[0]);
    if (matchedPost) { result.reactUrl = matchedPost.url; result.reactPostTitle = matchedPost.title; }
  }
}

async function getPatreonPosts() {
  if (patreonPostsCache.expiresAt > Date.now()) return patreonPostsCache.posts;
  const response = await fetch('https://www.patreon.com/cw/vimessias/sitemap', {headers:{accept:'text/html','user-agent':'CardapioVimessias/0.4 (public post link lookup)'},signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Não consegui consultar os posts públicos do Patreon.');
  const html = await response.text();
  const posts = [];
  const pattern = /<a\b[^>]*href=["']([^"']*\/vimessias\/posts\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = new URL(match[1], 'https://www.patreon.com');
    if (url.hostname !== 'www.patreon.com' && url.hostname !== 'patreon.com') continue;
    const title = decodeHtml(match[2]);
    if (title) posts.push({title,url:url.href});
  }
  if (!posts.length) throw new Error('A lista pública de posts do Patreon não retornou títulos.');
  patreonPostsCache = {posts,expiresAt:Date.now() + 120000};
  return posts;
}

async function readYoutubeVideoSnapshot() {
  try {
    const value = await readJsonState('youtubeVideos',[]);
    return Array.isArray(value) ? value.filter(video => video && /^[\w-]{11}$/.test(String(video.id || '')) && typeof video.title === 'string').slice(0,5) : [];
  } catch { return []; }
}

async function getLatestYoutubeVideos() {
  if (youtubeVideosCache.expiresAt > Date.now()) return youtubeVideosCache.videos;
  try {
    if (!youtubeChannelId) {
      const channelResponse = await fetch('https://www.youtube.com/@ViMessiasReacts', {headers:{accept:'text/html','user-agent':'Mozilla/5.0 (compatible; VimessiasPlay/1.0)'},signal:AbortSignal.timeout(12000)});
      if (!channelResponse.ok) throw new Error('Não consegui abrir o canal do YouTube agora.');
      const channelHtml = await channelResponse.text();
      const channelMatch = channelHtml.match(/(?:externalId|channelId)"?\s*:\s*"(UC[\w-]{22})/i) || channelHtml.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
      if (!channelMatch) throw new Error('Não consegui identificar o canal do YouTube pelo endereço público.');
      youtubeChannelId = channelMatch[1];
    }
    const feedResponse = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(youtubeChannelId)}`, {headers:{accept:'application/atom+xml,application/xml,text/xml'},signal:AbortSignal.timeout(12000)});
    if (!feedResponse.ok) throw new Error('Não consegui carregar os vídeos recentes do YouTube.');
    const feed = await feedResponse.text();
    const videos = [...feed.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(([,entry]) => {
      const videoId = entry.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/i)?.[1]?.trim() || '';
      const rawTitle = entry.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '';
      const title = decodeHtml(rawTitle.replace(/^<!\[CDATA\[/,'').replace(/\]\]>$/,'').trim());
      const published = entry.match(/<published>([\s\S]*?)<\/published>/i)?.[1]?.trim() || '';
      if (!/^[\w-]{11}$/.test(videoId) || !title) return null;
      return {id:videoId,title,publishedAt:published,thumbnailUrl:`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,url:`https://www.youtube.com/watch?v=${videoId}`};
    }).filter(Boolean).slice(0,5);
    if (!videos.length) throw new Error('O feed do canal não retornou vídeos públicos.');
    youtubeVideosCache = {videos,expiresAt:Date.now() + 300000};
    try { await updateJsonState('youtubeVideos',[],saved => { saved.splice(0,saved.length,...videos); }); }
    catch (error) { console.error('Não foi possível salvar o cache persistente do YouTube:',error.message); }
    return videos;
  } catch (error) {
    const savedVideos = await readYoutubeVideoSnapshot();
    const fallbackVideos = savedVideos.length ? savedVideos : youtubeVideosCache.videos;
    if (fallbackVideos.length) {
      youtubeVideosCache = {videos:fallbackVideos,expiresAt:Date.now() + 60000};
      console.warn('YouTube indisponível; exibindo o último cache válido.');
      return fallbackVideos;
    }
    throw error;
  }
}

const startupYoutubeSnapshot = await readYoutubeVideoSnapshot();
if (startupYoutubeSnapshot.length) youtubeVideosCache = {videos:startupYoutubeSnapshot,expiresAt:Date.now() + 300000};

async function handle(req, res) {
  const canonicalHost = String(process.env.CANONICAL_HOST || 'vimessiasplay.com.br').trim().toLowerCase();
  const requestHost = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (process.env.NODE_ENV === 'production' && canonicalHost && requestHost !== canonicalHost) {
    res.writeHead(308,{'location':`https://${canonicalHost}${req.url}`,'cache-control':'public, max-age=3600'});
    return res.end();
  }
  const url = new URL(req.url, 'http://localhost');
  const profileBannerAssetMatch = req.method === 'GET' && /^\/api\/profile-banners\/([a-f0-9-]{36}\.(?:png|jpg))$/i.exec(url.pathname);
  if (profileBannerAssetMatch) {
    try {
      const image = persistenceMode === 'supabase'
        ? await downloadStorageObject('profile-banners',profileBannerAssetMatch[1])
        : {buffer:await readFile(path.join(profileBannersDir,profileBannerAssetMatch[1])),contentType:profileBannerAssetMatch[1].endsWith('.jpg') ? 'image/jpeg' : 'image/png'};
      res.writeHead(200,{'content-type':image.contentType,'content-length':image.buffer.length,'cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff'});
      return res.end(image.buffer);
    } catch { return json(res,404,{error:'Imagem de banner não encontrada.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/auth/twitch/start') {
    const {clientId,redirectUri,configured} = twitchConfig();
    const returnTo = safeTwitchReturnTo(url.searchParams.get('returnTo'));
    if (!configured) return redirect(res, twitchReturnRedirect(returnTo,'not-configured'));
    for (const [key, value] of twitchOAuthStates) if (value.expiresAt <= Date.now()) twitchOAuthStates.delete(key);
    const state = randomBytes(32).toString('base64url');
    twitchOAuthStates.set(state, {expiresAt:Date.now() + 10 * 60 * 1000,returnTo});
    setCookie(res, 'cardapio_twitch_oauth_state', state, `oauth-state${cookieOptions(req)}`);
    const authorize = new URL('https://id.twitch.tv/oauth2/authorize');
    authorize.search = new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',state}).toString();
    return redirect(res, authorize.href);
  }
  if (req.method === 'GET' && url.pathname === '/auth/twitch/callback') {
    const cookies = parseCookies(req);
    const state = String(url.searchParams.get('state') || '');
    const pending = twitchOAuthStates.get(state);
    const clearStateCookie = `cardapio_twitch_oauth_state=; Path=/auth/twitch/callback; HttpOnly; SameSite=Lax; Max-Age=0${cookieOptions(req)}`;
    res.setHeader('set-cookie', clearStateCookie);
    if (url.searchParams.has('error') || !state || !cookies.cardapio_twitch_oauth_state || cookies.cardapio_twitch_oauth_state !== state || !pending || pending.expiresAt <= Date.now()) {
      if (state) twitchOAuthStates.delete(state);
      return redirect(res, twitchReturnRedirect(pending?.returnTo || '/','cancelled'));
    }
    twitchOAuthStates.delete(state);
    try {
      const {clientId} = twitchConfig();
      const token = await exchangeTwitchCode(String(url.searchParams.get('code') || ''), twitchConfig().redirectUri);
      const validationResponse = await fetch('https://id.twitch.tv/oauth2/validate', {headers:{Authorization:`OAuth ${token.access_token}`},signal:AbortSignal.timeout(12000)});
      const validation = await validationResponse.json().catch(() => ({}));
      if (!validationResponse.ok || validation.client_id !== clientId || !validation.user_id) throw new Error('A Twitch não validou a conta autorizada.');
      const userResponse = await fetch('https://api.twitch.tv/helix/users', {headers:{Authorization:`Bearer ${token.access_token}`,'Client-Id':clientId},signal:AbortSignal.timeout(12000)});
      const userData = await userResponse.json().catch(() => ({}));
      const user = userData.data?.[0];
      if (!userResponse.ok || !user || user.id !== validation.user_id) throw new Error('Não consegui carregar o perfil da Twitch.');
      try { await saveCommunityMember({id:user.id,login:user.login,displayName:user.display_name,profileImageUrl:user.profile_image_url || ''}); }
      catch (error) { console.warn('Não foi possível registrar o novo perfil da comunidade:',error.message); }
      const sessionId = randomBytes(32).toString('base64url');
      twitchSessions.set(sessionId, {
        profile:{id:user.id,login:user.login,displayName:user.display_name,profileImageUrl:user.profile_image_url || ''},
        accessToken:token.access_token,refreshToken:token.refresh_token,
        accessExpiresAt:Date.now() + Number(token.expires_in || validation.expires_in || 0) * 1000,
        validatedAt:Date.now(),expiresAt:Date.now() + 7 * 24 * 60 * 60 * 1000
      });
      res.setHeader('set-cookie', [clearStateCookie, `cardapio_twitch_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${cookieOptions(req)}`]);
      return redirect(res, twitchReturnRedirect(pending.returnTo,'connected'));
    } catch {
      return redirect(res, twitchReturnRedirect(pending.returnTo,'failed'));
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const {configured} = twitchConfig();
    const profile = await getAuthenticatedProfile(req,res);
    if (profile) {
      const store = await readVicoinsStore();
      const membership = getClubVimeMembership(store,profile.id);
      profile.isClubVime = hasClubVime(store,profile.id);
      profile.clubVimeExpiresAt = membership?.expiresAt || null;
    }
    return privateJson(res, 200, profile
      ? {authenticated:true,configured,profile}
      : {authenticated:false,configured});
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res, 403, {error:'Origem da solicitação inválida.'});
    clearTwitchSession(req, res);
    return privateJson(res, 200, {authenticated:false});
  }
  if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    res.writeHead(204, {'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type'});
    return res.end();
  }
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, {ok:true,mode:'consulta',persistence:persistenceMode,persistent:persistenceMode === 'supabase'});
  if (req.method === 'GET' && url.pathname.startsWith('/api/forum/uploads/')) {
    const match = /^\/api\/forum\/uploads\/([a-f0-9-]{36}\.(?:jpg|png|webp|gif))$/i.exec(url.pathname);
    if (!match) return json(res,404,{error:'Imagem não encontrada.'});
    try {
      const filename = match[1];
      const image = persistenceMode === 'supabase'
        ? await downloadStorageObject('forum-uploads',filename)
        : {buffer:await readFile(path.join(forumUploadsDir,filename)),contentType:''};
      const extension = path.extname(filename).toLowerCase();
      res.writeHead(200,{'content-type':image.contentType || mime[extension],'content-length':image.buffer.length,'cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"});
      return res.end(image.buffer);
    } catch { return json(res,404,{error:'Imagem não encontrada.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/forum/topics') {
    const viewer = await getAuthenticatedProfile(req,res);
    const clubVimeStore = await readVicoinsStore();
    const topics = (await readForumTopics())
      .sort((a,b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))
      .slice(0,100);
    return json(res,200,{topics:topics.map(topic => {
      const likedBy = Array.isArray(topic.likedBy) ? topic.likedBy : [];
      const author = topic.author ? {...topic.author,clubVime:hasClubVime(clubVimeStore,topic.author.id),clubVimeExpiresAt:getClubVimeMembership(clubVimeStore,topic.author.id)?.expiresAt || null} : topic.author;
      const comments = Array.isArray(topic.comments) ? topic.comments.map(comment => ({...comment,author:comment.author ? {...comment.author,clubVime:hasClubVime(clubVimeStore,comment.author.id),clubVimeExpiresAt:getClubVimeMembership(clubVimeStore,comment.author.id)?.expiresAt || null} : comment.author})) : topic.comments;
      return {...topic,author,comments,likeCount:likedBy.length,likedByMe:Boolean(viewer && likedBy.includes(viewer.id)),likedBy:undefined};
    })});
  }
  const forumLikeMatch = /^\/api\/forum\/topics\/([a-f0-9-]{36})\/like$/i.exec(url.pathname);
  if (req.method === 'POST' && forumLikeMatch) {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para curtir tópicos no fórum.'});
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    try {
      const result = await updateForumTopics(topics => {
        const topic = topics.find(item => item.id === forumLikeMatch[1]);
        if (!topic) throw Object.assign(new Error('Este tópico não existe mais.'),{statusCode:404});
        topic.likedBy = Array.isArray(topic.likedBy) ? topic.likedBy : [];
        const index = topic.likedBy.indexOf(profile.id);
        const liked = index < 0;
        if (liked) topic.likedBy.push(profile.id);
        else topic.likedBy.splice(index,1);
        return {likeCount:topic.likedBy.length,likedByMe:liked};
      });
      return privateJson(res,200,result);
    } catch (error) { return privateJson(res,error.statusCode || 500,{error:error.message || 'Não foi possível registrar a curtida.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/forum/topics') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para criar tópicos no fórum.'});
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req,6 * 1024 * 1024); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return privateJson(res,400,{error:'Os dados do tópico são inválidos.'});
    const title = String(body.title || '').trim();
    const content = String(body.content || '').trim();
    const category = String(body.category || 'geral');
    if (title.length < 3 || title.length > 120 || content.length < 3 || content.length > 6000) return privateJson(res,400,{error:'Informe um título de 3 a 120 caracteres e uma mensagem de 3 a 6.000 caracteres.'});
    if (!['geral','filmes','series','animes','jogos','outros'].includes(category)) return privateJson(res,400,{error:'Escolha uma categoria válida para o tópico.'});
    try {
      const attachment = await saveForumAttachment(body.attachment);
      const now = new Date().toISOString();
      const topic = {id:randomUUID(),title,content,category,author:{id:profile.id,login:profile.login,displayName:profile.displayName,profileImageUrl:profile.profileImageUrl},attachment,comments:[],createdAt:now,updatedAt:now};
      await updateForumTopics(topics => { topics.push(topic); return null; });
      return privateJson(res,201,{topic});
    } catch (error) { return privateJson(res,400,{error:error.message || 'Não foi possível criar o tópico.'}); }
  }
  const forumTopicMatch = /^\/api\/forum\/topics\/([a-f0-9-]{36})$/i.exec(url.pathname);
  if (forumTopicMatch && ['PATCH','DELETE'].includes(req.method)) {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para editar o fórum.'});
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    try {
      let body = {};
      if (req.method === 'PATCH') {
        try { body = await readRequestJson(req,64 * 1024); }
        catch (error) { return privateJson(res,400,{error:error.message}); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return privateJson(res,400,{error:'Os dados do tópico são inválidos.'});
      }
      const result = await updateForumTopics(topics => {
        const index = topics.findIndex(item => item.id === forumTopicMatch[1]);
        const topic = topics[index];
        if (!topic) throw Object.assign(new Error('Este tópico não existe mais.'),{statusCode:404});
        if (profile.role !== 'admin' && topic.author?.id !== profile.id) throw Object.assign(new Error('Você só pode editar ou apagar seus próprios tópicos.'),{statusCode:403});
        if (req.method === 'DELETE') {
          const attachments = [topic.attachment,...(Array.isArray(topic.comments) ? topic.comments.map(comment => comment.attachment) : [])].filter(Boolean);
          topics.splice(index,1);
          return {deleted:true,attachments};
        }
        const title = String(body.title || '').trim();
        const content = String(body.content || '').trim();
        const category = String(body.category || 'geral');
        if (title.length < 3 || title.length > 120 || content.length < 3 || content.length > 6000) throw Object.assign(new Error('Informe um título de 3 a 120 caracteres e uma mensagem de 3 a 6.000 caracteres.'),{statusCode:400});
        if (!['geral','filmes','series','animes','jogos','outros'].includes(category)) throw Object.assign(new Error('Escolha uma categoria válida para o tópico.'),{statusCode:400});
        topic.title = title;
        topic.content = content;
        topic.category = category;
        const removedAttachment = body.removeAttachment === true ? topic.attachment : null;
        if (removedAttachment) topic.attachment = null;
        topic.updatedAt = new Date().toISOString();
        topic.editedAt = topic.updatedAt;
        return {topic,removedAttachment};
      });
      await Promise.all((result.attachments || [result.removedAttachment]).filter(Boolean).map(deleteForumAttachment));
      return privateJson(res,200,result.deleted ? {deleted:true} : {topic:result.topic});
    } catch (error) { return privateJson(res,error.statusCode || 500,{error:error.message || 'Não foi possível atualizar o tópico.'}); }
  }
  const forumCommentMatch = /^\/api\/forum\/topics\/([a-f0-9-]{36})\/comments$/i.exec(url.pathname);
  if (req.method === 'POST' && forumCommentMatch) {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para comentar no fórum.'});
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req,6 * 1024 * 1024); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return privateJson(res,400,{error:'Os dados do comentário são inválidos.'});
    const content = String(body.content || '').trim();
    if (content.length < 1 || content.length > 3000) return privateJson(res,400,{error:'O comentário precisa ter até 3.000 caracteres.'});
    try {
      const attachment = await saveForumAttachment(body.attachment);
      const now = new Date().toISOString();
      const comment = {id:randomUUID(),content,author:{id:profile.id,login:profile.login,displayName:profile.displayName,profileImageUrl:profile.profileImageUrl},attachment,createdAt:now};
      const topic = await updateForumTopics(topics => {
        const item = topics.find(entry => entry.id === forumCommentMatch[1]);
        if (!item) throw new Error('Este tópico não existe mais.');
        item.comments = Array.isArray(item.comments) ? item.comments : [];
        item.comments.push(comment);
        item.updatedAt = now;
        return item;
      });
      return privateJson(res,201,{topic});
    } catch (error) { return privateJson(res,error.message === 'Este tópico não existe mais.' ? 404 : 400,{error:error.message || 'Não foi possível publicar o comentário.'}); }
  }
  const forumCommentEditMatch = /^\/api\/forum\/topics\/([a-f0-9-]{36})\/comments\/([a-f0-9-]{36})$/i.exec(url.pathname);
  if (forumCommentEditMatch && ['PATCH','DELETE'].includes(req.method)) {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para editar comentários.'});
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    try {
      let body = {};
      if (req.method === 'PATCH') {
        try { body = await readRequestJson(req,32 * 1024); }
        catch (error) { return privateJson(res,400,{error:error.message}); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return privateJson(res,400,{error:'Os dados do comentário são inválidos.'});
      }
      const result = await updateForumTopics(topics => {
        const topic = topics.find(item => item.id === forumCommentEditMatch[1]);
        if (!topic) throw Object.assign(new Error('Este tópico não existe mais.'),{statusCode:404});
        const comments = Array.isArray(topic.comments) ? topic.comments : [];
        const index = comments.findIndex(item => item.id === forumCommentEditMatch[2]);
        const comment = comments[index];
        if (!comment) throw Object.assign(new Error('Este comentário não existe mais.'),{statusCode:404});
        if (profile.role !== 'admin' && comment.author?.id !== profile.id) throw Object.assign(new Error('Você só pode editar ou apagar seus próprios comentários.'),{statusCode:403});
        if (req.method === 'DELETE') {
          const attachment = comment.attachment;
          comments.splice(index,1);
          topic.comments = comments;
          topic.updatedAt = new Date().toISOString();
          return {deleted:true,attachment};
        }
        const content = String(body.content || '').trim();
        if (content.length < 1 || content.length > 3000) throw Object.assign(new Error('O comentário precisa ter até 3.000 caracteres.'),{statusCode:400});
        comment.content = content;
        const removedAttachment = body.removeAttachment === true ? comment.attachment : null;
        if (removedAttachment) comment.attachment = null;
        comment.editedAt = new Date().toISOString();
        topic.updatedAt = comment.editedAt;
        return {comment,removedAttachment};
      });
      await deleteForumAttachment(result.attachment || result.removedAttachment);
      return privateJson(res,200,result.deleted ? {deleted:true} : {comment:result.comment});
    } catch (error) { return privateJson(res,error.statusCode || 500,{error:error.message || 'Não foi possível atualizar o comentário.'}); }
  }
  if (url.pathname === '/api/admin/patreon-mappings' && ['GET','POST','DELETE'].includes(req.method)) {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode gerenciar associações do Patreon.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    if (req.method === 'GET') {
      const store = await readJsonState('patreonMappings',{items:[]});
      return privateJson(res,200,{items:Array.isArray(store.items) ? store.items : []});
    }
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const mediaType = String(body.mediaType || '');
    const id = Number(body.id);
    if (!['movie','tv'].includes(mediaType) || !Number.isSafeInteger(id) || id <= 0) return privateJson(res,400,{error:'Informe o tipo e um ID válido do TMDB.'});
    const key = `${mediaType}:${id}`;
    try {
      const store = await updateJsonState('patreonMappings',{items:[]},state => {
        state.items = Array.isArray(state.items) ? state.items : [];
        if (req.method === 'DELETE') state.items = state.items.filter(item => item.key !== key);
        else {
          const title = String(body.title || '').trim().slice(0,150);
          const rawUrl = String(body.url || '').trim();
          let safeUrl = '';
          if (rawUrl) {
            let parsed;
            try { parsed = new URL(rawUrl); } catch { throw new Error('Informe um link válido do Patreon.'); }
            if (parsed.protocol !== 'https:' || !['www.patreon.com','patreon.com'].includes(parsed.hostname) || !/\/posts\//.test(parsed.pathname)) throw new Error('Use um link HTTPS de post do Patreon.');
            safeUrl = parsed.href;
          }
          if (!title) throw new Error('Informe o título da obra.');
          const item = {key,id,mediaType,title,url:safeUrl,blockAutomatic:!safeUrl,updatedAt:new Date().toISOString()};
          const index = state.items.findIndex(entry => entry.key === key);
          if (index < 0) state.items.push(item); else state.items[index] = item;
        }
        return state.items;
      });
      for (const cacheKey of tmdbCache.keys()) tmdbCache.delete(cacheKey);
      suggestionsCache.clear();
      return privateJson(res,200,{items:store});
    } catch (error) { return privateJson(res,400,{error:error.message || 'Não foi possível salvar a associação.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/promotions') {
    return json(res,200,{promotions:await readPromotions()});
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/promotions') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode gerenciar promoções.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const action = String(body.action || '');
    const id = String(body.id || '');
    if (action === 'delete') {
      if (!id) return privateJson(res,400,{error:'Selecione uma promoção para excluir.'});
      try {
        const promotions = await updatePromotions(collections => {
          const index = collections.findIndex(item => item.id === id);
          if (index >= 0) collections.splice(index,1);
          return collections;
        });
        return privateJson(res,200,{promotions});
      } catch { return privateJson(res,500,{error:'Não foi possível excluir a promoção.'}); }
    }
    if (action !== 'save') return privateJson(res,400,{error:'Ação de promoção inválida.'});
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim().slice(0,240);
    const discountPercent = Number(body.discountPercent);
    const titles = Array.isArray(body.titles) ? body.titles : [];
    if (!name || name.length > 100) return privateJson(res,400,{error:'Informe um título de coleção com até 100 caracteres.'});
    if (!Number.isFinite(discountPercent) || discountPercent < 1 || discountPercent > 100) return privateJson(res,400,{error:'O desconto precisa estar entre 1% e 100%.'});
    if (!titles.length || titles.length > 30) return privateJson(res,400,{error:'Adicione de 1 a 30 filmes ou séries à coleção.'});
    const normalizedTitles = [];
    const titleKeys = new Set();
    for (const item of titles) {
      const titleId = Number(item?.id);
      const mediaType = String(item?.mediaType || '');
      const key = `${mediaType}:${titleId}`;
      if (!['movie','tv'].includes(mediaType) || !Number.isSafeInteger(titleId) || titleId <= 0 || titleKeys.has(key)) return privateJson(res,400,{error:'A coleção contém um título inválido ou repetido.'});
      titleKeys.add(key);
      normalizedTitles.push({id:titleId,mediaType});
    }
    const savedId = id || randomUUID();
    try {
      const promotions = await updatePromotions(collections => {
        const index = collections.findIndex(item => item.id === savedId);
        const collection = {id:savedId,name,description,discountPercent,titles:normalizedTitles};
        if (index >= 0) collections[index] = collection;
        else collections.unshift(collection);
        return collections;
      });
      return privateJson(res,200,{promotions});
    } catch { return privateJson(res,500,{error:'Não foi possível salvar a promoção.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/redemptions/week') {
    const from = Date.parse(url.searchParams.get('from') || '');
    const to = Date.parse(url.searchParams.get('to') || '');
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 8 * 24 * 60 * 60 * 1000) return json(res,400,{error:'Intervalo inválido para o calendário de reacts.'});
    const entries = (await readRedemptions())
      .filter(entry => {
        const scheduled = Date.parse(entry.scheduledAt || '');
        return entry.status === 'approved' && Number.isFinite(scheduled) && scheduled >= from && scheduled < to;
      })
      .sort((a,b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
      .map(entry => ({id:entry.id,title:entry.title,mediaType:entry.mediaType,scheduledAt:entry.scheduledAt}));
    return json(res,200,{redemptions:entries});
  }
  if (req.method === 'GET' && url.pathname === '/api/redemptions/recent') {
    const clubVimeStore = await readVicoinsStore();
    const entries = (await readRedemptions())
      .filter(entry => ['approved','completed'].includes(entry.status))
      .sort((a,b) => Date.parse(b.approvedAt || b.createdAt) - Date.parse(a.approvedAt || a.createdAt))
      .map(entry => { const membership = getClubVimeMembership(clubVimeStore,entry.requester?.id); return {id:entry.id,catalogId:entry.catalogId || null,title:entry.title,mediaType:entry.mediaType,posterUrl:entry.posterUrl,durationMinutes:entry.durationMinutes,durationLabel:entry.durationLabel,scheduledAt:entry.scheduledAt,requester:{id:entry.requester?.id || '',login:entry.requester?.login || '',displayName:entry.requester?.displayName || '',clubVime:hasClubVime(clubVimeStore,entry.requester?.id),clubVimeExpiresAt:membership?.expiresAt || null}}; });
    return json(res,200,{redemptions:entries});
  }
  if (req.method === 'GET' && url.pathname === '/api/community/members') {
    const clubVimeStore = await readVicoinsStore();
    const members = (await readCommunityMembers())
      .sort((a,b) => (Date.parse(b.joinedAt || '') || 0) - (Date.parse(a.joinedAt || '') || 0))
      .slice(0,8)
      .map(({id,login,displayName,profileImageUrl,joinedAt}) => ({id,login,displayName,profileImageUrl,joinedAt,clubVime:hasClubVime(clubVimeStore,id),clubVimeExpiresAt:getClubVimeMembership(clubVimeStore,id)?.expiresAt || null}));
    return json(res,200,{members});
  }
  if (req.method === 'GET' && url.pathname === '/api/community/rankings') {
    const members = await readCommunityMembers();
    const memberById = new Map(members.map(member => [member.id,member]));
    let store;
    const isExcluded = member => getTwitchRole(member) === 'admin' || String(member?.login || '').toLowerCase() === 'vimessias_';
    const rankedMember = (id,values) => {
      const member = memberById.get(id) || {};
      return {id,displayName:member.displayName || member.login || 'Usuário Twitch',profileImageUrl:member.profileImageUrl || '',clubVime:hasClubVime(store,id),clubVimeExpiresAt:getClubVimeMembership(store,id)?.expiresAt || null,...values};
    };
    try { await reconcileApprovedRedemptionVicoins(); }
    catch { return json(res,500,{error:'Não foi possível atualizar o ranking de Vicoins.'}); }
    store = await readVicoinsStore();
    const vicoins = Object.entries(store.balances)
      .map(([id,value]) => {
        const member = memberById.get(id) || {};
        return {id,displayName:member.displayName || member.login || 'Usuário Twitch',profileImageUrl:member.profileImageUrl || '',clubVime:hasClubVime(store,id),clubVimeExpiresAt:getClubVimeMembership(store,id)?.expiresAt || null,balance:Number(value) || 0,isAdmin:getTwitchRole({...member,id}) === 'admin'};
      })
      .filter(member => member.balance > 0 && !member.isAdmin && !isExcluded(memberById.get(member.id) || {id:member.id}))
      .sort((a,b) => b.balance - a.balance || a.displayName.localeCompare(b.displayName,'pt-BR'))
      .slice(0,5);
    const totals = new Map();
    for (const entry of await readRedemptions()) {
      const userId = String(entry.requester?.id || '');
      const minutes = Number(entry.durationMinutes);
      if (!['approved','completed'].includes(entry.status) || !userId || !Number.isFinite(minutes) || minutes <= 0) continue;
      const amount = Math.ceil(minutes / 30) * 5;
      const current = totals.get(userId) || {totalValue:0,redemptionCount:0};
      current.totalValue += amount;
      current.redemptionCount++;
      totals.set(userId,current);
    }
    const redemptionSpenders = [...totals.entries()]
      .map(([id,value]) => {
        const member = memberById.get(id) || {};
        return rankedMember(id,value);
      })
      .filter(member => !isExcluded(memberById.get(member.id) || {id:member.id}))
      .sort((a,b) => b.totalValue - a.totalValue || b.redemptionCount - a.redemptionCount || a.displayName.localeCompare(b.displayName,'pt-BR'))
      .slice(0,5);
    const favoriteCounts = new Map();
    for (const entry of await readFavorites()) for (const id of new Set(Array.isArray(entry.voters) ? entry.voters : [])) favoriteCounts.set(id,(favoriteCounts.get(id) || 0) + 1);
    const ratingCounts = new Map();
    for (const entry of await readRatings()) for (const id of new Set((Array.isArray(entry.votes) ? entry.votes : []).map(vote => String(vote.clientId || '')).filter(Boolean))) ratingCounts.set(id,(ratingCounts.get(id) || 0) + 1);
    const makeActivityRank = (counts,key) => [...counts.entries()].map(([id,count]) => rankedMember(id,{[key]:count})).filter(member => member[key] > 0 && !isExcluded(memberById.get(member.id) || {id:member.id})).sort((a,b) => b[key] - a[key] || a.displayName.localeCompare(b.displayName,'pt-BR')).slice(0,5);
    return json(res,200,{vicoins,redemptionSpenders,favoriteLeaders:makeActivityRank(favoriteCounts,'favoriteCount'),ratingLeaders:makeActivityRank(ratingCounts,'ratingCount'),redemptionValueRule:'R$ 5 por bloco iniciado de 30 minutos; considera apenas resgates aprovados.'});
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/community/members/')) {
    const memberId = url.pathname.slice('/api/community/members/'.length);
    if (!/^\d{1,32}$/.test(memberId)) return json(res,400,{error:'Perfil inválido.'});
    const member = (await readCommunityMembers()).find(item => item.id === memberId);
    if (!member) return json(res,404,{error:'Este perfil não está disponível.'});
    await reconcileApprovedRedemptionVicoins(memberId);
    const allFavorites = userFavorites(await readFavorites(),memberId);
    const allRedemptions = (await readRedemptions())
      .filter(entry => entry.requester?.id === memberId && ['approved','completed'].includes(entry.status))
      .sort((a,b) => Date.parse(b.approvedAt || b.createdAt) - Date.parse(a.approvedAt || a.createdAt))
      .map(({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,approvedAt}) => ({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,approvedAt}));
    const allRatings = userRatings(await readRatings(),memberId);
    const pages = Object.fromEntries(['redemptions','favorites','ratings'].map(key => [key,profileTitlePage(({redemptions:allRedemptions,favorites:allFavorites,ratings:allRatings})[key],Math.max(0,Number.parseInt(url.searchParams.get(`${key}Offset`) || '0',10) || 0))]));
    const {items:redemptions} = pages.redemptions;
    const {items:favorites} = pages.favorites;
    const {items:ratings} = pages.ratings;
    const totals = Object.fromEntries(Object.entries(pages).map(([key,page]) => [key,page.total]));
    const achievements = {favorites:allFavorites.length,ratings:allRatings.length,redemptions:allRedemptions.length};
    const vicoinsStore = await readVicoinsStore();
    const bannerInventory = getProfileBannerInventory(vicoinsStore,memberId);
    const isAdmin = getTwitchRole(member) === 'admin';
    const profile = {id:member.id,login:member.login,displayName:member.displayName,profileImageUrl:member.profileImageUrl,joinedAt:member.joinedAt,isClubVime:hasClubVime(vicoinsStore,memberId),clubVimeExpiresAt:getClubVimeMembership(vicoinsStore,memberId)?.expiresAt || null,vicoins:await getVicoinsBalance(memberId,isAdmin),vicoinsInfinite:isAdmin,banner:bannerInventory.equipped};
    return json(res,200,{profile,favorites,redemptions,ratings,totals,achievements,badges:await getCommunityBadgesForMember(memberId)});
  }
  if (req.method === 'GET' && url.pathname === '/api/shop/rewards') {
    return json(res,200,{rewards:await readVicoinsRewards()});
  }
  if (req.method === 'GET' && url.pathname === '/api/shop/game-keys') {
    const store = await readVicoinsStore();
    const games = store.gameKeys.filter(item => item?.active !== false && !item?.reservedOrderId && Number(item.stock ?? 1) > 0).sort((a,b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')).map(item => ({id:item.id,title:item.title,steamUrl:item.steamUrl,coinCost:item.coinCost,stock:Number(item.stock ?? 1)}));
    return json(res,200,{games});
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/vicoins-rewards') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode alterar os valores dos vales.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); } catch (error) { return privateJson(res,400,{error:error.message}); }
    const id = String(body.id || '');
    const coinCost = Number(body.coinCost);
    if (!defaultVicoinsRewards.some(item => item.id === id) || !Number.isSafeInteger(coinCost) || coinCost < 1 || coinCost > 1000000) return privateJson(res,400,{error:'Informe um valor de 1 a 1.000.000 Vicoins.'});
    try {
      const rewards = await updateJsonState('vicoinsRewards',defaultVicoinsRewards,state => {
        const next = defaultVicoinsRewards.map(base => ({...base,...(Array.isArray(state) ? state.find(item => item?.id === base.id) : {})}));
        const target = next.find(item => item.id === id); target.coinCost = coinCost;
        state.splice(0,state.length,...next); return next;
      });
      return privateJson(res,200,{rewards});
    } catch (error) { return privateJson(res,500,{error:error.message || 'Não foi possível salvar os valores.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/shop/profile-banners') {
    const store = await readVicoinsStore();
    const banners = getProfileBannerRewards(store).map(({id,name,imageUrl,paymentType,amount,coinCost}) => ({id,name,imageUrl,paymentType,amount,coinCost}));
    return json(res,200,{banners});
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/shop-game-keys') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode gerenciar keys de jogos.'});
    const store = await readVicoinsStore();
    return privateJson(res,200,{games:store.gameKeys.slice().sort((a,b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))});
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/shop-game-keys') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode cadastrar keys de jogos.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const id = String(body.id || '').trim();
    const title = String(body.title || '').trim();
    const steamUrl = String(body.steamUrl || '').trim();
    const imageUrlSupplied = Object.hasOwn(body,'imageUrl');
    const imageUrl = String(body.imageUrl || '').trim();
    const coinCost = Number(body.coinCost);
    const stock = Number(body.stock);
    let parsedSteamUrl;
    try { parsedSteamUrl = new URL(steamUrl); } catch {}
    if (title.length < 2 || title.length > 120 || !parsedSteamUrl || parsedSteamUrl.protocol !== 'https:' || parsedSteamUrl.hostname !== 'store.steampowered.com' || steamUrl.length > 500 || !/^\/app\/\d+(?:\/|$)/.test(parsedSteamUrl.pathname) || !Number.isSafeInteger(coinCost) || coinCost < 1 || coinCost > 1000000 || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) return privateJson(res,400,{error:'Informe título, link de jogo Steam, preço válido e estoque entre 0 e 1.000.000.'});
    let directImageUrl = '';
    try { directImageUrl = parseSteamImageUrl(imageUrl); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    try {
      const games = await updateVicoinsStore(store => {
        store.gameKeys = Array.isArray(store.gameKeys) ? store.gameKeys : [];
        if (id) {
          const item = store.gameKeys.find(game => game.id === id);
          if (!item) throw new Error('Jogo não encontrado para edição.');
          item.title = title;
          item.steamUrl = parsedSteamUrl.href;
          if (imageUrlSupplied) item.imageUrl = directImageUrl;
          item.coinCost = coinCost;
          item.stock = stock;
          item.updatedAt = new Date().toISOString();
        } else {
          store.gameKeys.unshift({id:randomUUID(),title,steamUrl:parsedSteamUrl.href,imageUrl:directImageUrl,coinCost,stock,active:true,reservedOrderId:'',createdAt:new Date().toISOString(),createdBy:profile.id});
        }
        return store.gameKeys.slice().sort((a,b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));
      });
      return privateJson(res,200,{games});
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível salvar o jogo.'}); }
  }
  const adminGameKeyMatch = /^\/api\/admin\/shop-game-keys\/([a-f0-9-]{36})$/i.exec(url.pathname);
  if (req.method === 'DELETE' && adminGameKeyMatch) {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode excluir jogos da lojinha.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    try {
      const games = await updateVicoinsStore(store => {
        store.gameKeys = Array.isArray(store.gameKeys) ? store.gameKeys : [];
        const index = store.gameKeys.findIndex(game => game.id === adminGameKeyMatch[1]);
        if (index < 0) throw new Error('Jogo não encontrado.');
        if (store.gameKeys[index].reservedOrderId || store.gameKeyOrders.some(order => order.gameKeyId === adminGameKeyMatch[1] && order.status === 'pending')) throw new Error('Este jogo tem um pedido pendente; finalize ou exclua o pedido antes de remover o cadastro.');
        store.gameKeys.splice(index,1);
        return store.gameKeys;
      });
      return privateJson(res,200,{games});
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível excluir o jogo.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/profile-banners') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode gerenciar banners.'});
    const store = await readVicoinsStore();
    return privateJson(res,200,{banners:store.customProfileBanners});
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/profile-banners') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode adicionar banners.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req,5_700_000); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const name = String(body.name || '').trim().slice(0,60);
    if (!name) return privateJson(res,400,{error:'Informe um nome para o banner.'});
    let image;
    try { image = decodeProfileBannerImage(body.image); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const id = randomUUID();
    const filename = `${id}.${image.extension}`;
    try {
      if (persistenceMode === 'supabase') await uploadStorageObject('profile-banners',filename,image.buffer,image.extension === 'jpg' ? 'image/jpeg' : 'image/png');
      else await writeFile(path.join(profileBannersDir,filename),image.buffer,{flag:'wx'});
      const banner = {id,name,coinCost:5,amount:5,imageUrl:`/api/profile-banners/${filename}`,paymentType:'livepix',custom:true,createdAt:new Date().toISOString()};
      const banners = await updateVicoinsStore(store => {
        store.customProfileBanners = Array.isArray(store.customProfileBanners) ? store.customProfileBanners : [];
        store.customProfileBanners.push(banner);
        return store.customProfileBanners;
      });
      return privateJson(res,201,{banner,banners});
    } catch (error) {
      try {
        if (persistenceMode === 'supabase') await deleteStorageObject('profile-banners',filename);
        else await unlink(path.join(profileBannersDir,filename));
      } catch {}
      return privateJson(res,500,{error:error.message || 'Não foi possível salvar o banner.'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/profile-banner-grants') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode conceder banners.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); } catch (error) { return privateJson(res,400,{error:error.message}); }
    const userId = String(body.userId || '');
    const bannerId = String(body.bannerId || '');
    if (!userId || userId.length > 64 || !bannerId) return privateJson(res,400,{error:'Escolha um usuário e um banner.'});
    try {
      const members = await readCommunityMembers();
      if (!members.some(member => String(member.id) === userId)) throw new Error('Usuário Twitch não encontrado.');
      const result = await updateVicoinsStore(store => {
        const banner = getProfileBannerRewards(store).find(item => item.id === bannerId);
        if (!banner) throw new Error('Banner não encontrado.');
        store.profileBannerInventory = store.profileBannerInventory || {};
        const inventory = store.profileBannerInventory[userId] || {owned:[],equipped:''};
        inventory.owned = Array.isArray(inventory.owned) ? inventory.owned : [];
        if (!inventory.owned.includes(banner.id)) inventory.owned.push(banner.id);
        inventory.equipped = banner.id;
        store.profileBannerInventory[userId] = inventory;
        return {bannerName:banner.name,userId,inventory:getProfileBannerInventory(store,userId)};
      });
      return privateJson(res,200,result);
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível conceder o banner.'}); }
  }
  const adminBannerDeleteMatch = /^\/api\/admin\/profile-banners\/([a-f0-9-]{36})$/i.exec(url.pathname);
  if (req.method === 'DELETE' && adminBannerDeleteMatch) {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode excluir banners.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    const id = adminBannerDeleteMatch[1];
    try {
      const result = await updateVicoinsStore(store => {
        store.customProfileBanners = Array.isArray(store.customProfileBanners) ? store.customProfileBanners : [];
        const index = store.customProfileBanners.findIndex(item => item.id === id);
        if (index < 0) throw new Error('Banner manual não encontrado.');
        const [banner] = store.customProfileBanners.splice(index,1);
        for (const inventory of Object.values(store.profileBannerInventory || {})) {
          if (!inventory || typeof inventory !== 'object') continue;
          inventory.owned = Array.isArray(inventory.owned) ? inventory.owned.filter(ownedId => ownedId !== id) : [];
          if (inventory.equipped === id) inventory.equipped = '';
        }
        return {banner,banners:store.customProfileBanners};
      });
      const filename = /^\/api\/profile-banners\/([a-f0-9-]{36}\.(?:png|jpg))$/i.exec(result.banner.imageUrl)?.[1];
      if (filename) {
        try {
          if (persistenceMode === 'supabase') await deleteStorageObject('profile-banners',filename);
          else await unlink(path.join(profileBannersDir,filename));
        } catch {}
      }
      return privateJson(res,200,result);
    } catch (error) { return privateJson(res,404,{error:error.message || 'Não foi possível excluir este banner.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/account/profile') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para abrir seu perfil.'});
    await reconcileApprovedRedemptionVicoins(profile.id);
    const allFavorites = userFavorites(await readFavorites(),profile.id);
    const allRedemptions = (await readRedemptions())
      .filter(entry => entry.requester?.id === profile.id && ['approved','completed'].includes(entry.status))
      .sort((a,b) => Date.parse(b.approvedAt || b.createdAt) - Date.parse(a.approvedAt || a.createdAt))
      .map(({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,approvedAt}) => ({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,approvedAt}));
    const allRatings = userRatings(await readRatings(),profile.id);
    const pages = Object.fromEntries(['redemptions','favorites','ratings'].map(key => [key,profileTitlePage(({redemptions:allRedemptions,favorites:allFavorites,ratings:allRatings})[key],Math.max(0,Number.parseInt(url.searchParams.get(`${key}Offset`) || '0',10) || 0))]));
    const {items:redemptions} = pages.redemptions;
    const {items:favorites} = pages.favorites;
    const {items:ratings} = pages.ratings;
    const totals = Object.fromEntries(Object.entries(pages).map(([key,page]) => [key,page.total]));
    const achievements = {favorites:allFavorites.length,ratings:allRatings.length,redemptions:allRedemptions.length};
    const vicoinsStore = await readVicoinsStore();
    const bannerInventory = getProfileBannerInventory(vicoinsStore,profile.id);
    return privateJson(res,200,{profile:{...profile,isClubVime:hasClubVime(vicoinsStore,profile.id),clubVimeExpiresAt:getClubVimeMembership(vicoinsStore,profile.id)?.expiresAt || null,vicoins:await getVicoinsBalance(profile.id,profile.role === 'admin'),vicoinsInfinite:profile.role === 'admin',banner:bannerInventory.equipped},favorites,redemptions,ratings,totals,achievements,badges:await getCommunityBadgesForMember(profile.id)});
  }
  if (req.method === 'GET' && url.pathname === '/api/account/profile-banner') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para consultar seus banners.'});
    const store = await readVicoinsStore();
    return privateJson(res,200,getProfileBannerInventory(store,profile.id));
  }
  if (req.method === 'POST' && url.pathname === '/api/account/profile-banner') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para trocar seu banner.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const bannerId = String(body.bannerId || '');
    try {
      const inventory = await updateVicoinsStore(store => {
        store.profileBannerInventory = store.profileBannerInventory || {};
        const saved = store.profileBannerInventory[profile.id] || {owned:[],equipped:''};
        saved.owned = Array.isArray(saved.owned) ? saved.owned : [];
        if (!getProfileBannerRewards(store).some(item => item.id === bannerId) || !saved.owned.includes(bannerId)) throw new Error('Esse banner ainda não foi liberado no seu perfil.');
        saved.equipped = bannerId;
        store.profileBannerInventory[profile.id] = saved;
        return getProfileBannerInventory(store,profile.id);
      });
      return privateJson(res,200,inventory);
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível trocar o banner.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/account/profile-banner-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para consultar seus pedidos de banner.'});
    const store = await readVicoinsStore();
    const orders = store.bannerOrders.filter(order => order.requester?.id === profile.id && order.orderType !== 'club-vime').sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0,10);
    const clubVimeOrder = store.bannerOrders.filter(order => order.requester?.id === profile.id && order.orderType === 'club-vime').sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;
    const membership = getClubVimeMembership(store,profile.id);
    return privateJson(res,200,{orders,clubVime:{active:hasClubVime(store,profile.id),expiresAt:membership?.expiresAt || null,pending:clubVimeOrder?.status === 'pending',order:clubVimeOrder}});
  }
  if (req.method === 'POST' && url.pathname === '/api/shop/profile-banner-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para solicitar um banner.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const storeSnapshot = await readVicoinsStore();
    const reward = getProfileBannerRewards(storeSnapshot).find(item => item.id === String(body.bannerId || ''));
    if (!reward || reward.paymentType !== 'livepix') return privateJson(res,400,{error:'Banner inválido para solicitação.'});
    try {
      const result = await updateVicoinsStore(store => {
        store.bannerOrders = Array.isArray(store.bannerOrders) ? store.bannerOrders : [];
        const inventory = getProfileBannerInventory(store,profile.id);
        if (inventory.owned.includes(reward.id)) throw new Error('Este banner já foi liberado no seu perfil.');
        const pending = store.bannerOrders.find(order => order.requester?.id === profile.id && order.bannerId === reward.id && order.status === 'pending');
        if (pending) return {order:pending,alreadyPending:true};
        const currentReward = getProfileBannerRewards(store).find(item => item.id === reward.id);
        if (!currentReward || currentReward.paymentType !== 'livepix') throw new Error('Este banner não está mais disponível.');
        const order = {id:randomUUID(),orderType:'paid-banner',bannerId:currentReward.id,bannerName:currentReward.name,amount:5,currency:'BRL',paymentUrl:'https://livepix.gg/vimessias',status:'pending',requester:{id:profile.id,login:profile.login,displayName:profile.displayName,profileImageUrl:profile.profileImageUrl || profile.profile_image_url || ''},createdAt:new Date().toISOString()};
        store.bannerOrders.push(order);
        return {order,alreadyPending:false};
      });
      return privateJson(res,201,result);
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível solicitar este banner.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/shop/club-vime-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para solicitar o Clube Vime.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); } catch (error) { return privateJson(res,400,{error:error.message}); }
    try {
      const result = await updateVicoinsStore(store => {
        store.bannerOrders = Array.isArray(store.bannerOrders) ? store.bannerOrders : [];
        store.clubVimeMembers = Array.isArray(store.clubVimeMembers) ? store.clubVimeMembers : [];
        if (hasClubVime(store,profile.id)) throw new Error('Esta conta já é membro do Clube Vime.');
        const pending = store.bannerOrders.find(order => order.orderType === 'club-vime' && order.requester?.id === profile.id && order.status === 'pending');
        if (pending) return {order:pending,alreadyPending:true};
        const order = {id:randomUUID(),orderType:'club-vime',amount:10,currency:'BRL',paymentUrl:'https://livepix.gg/vimessias',status:'pending',requester:{id:profile.id,login:profile.login,displayName:profile.displayName,profileImageUrl:profile.profileImageUrl || ''},createdAt:new Date().toISOString()};
        store.bannerOrders.unshift(order);
        return {order,alreadyPending:false};
      });
      return privateJson(res,201,result);
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível solicitar o Clube Vime.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/shop/profile-banners') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para resgatar um banner.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const bannerId = String(body.bannerId || '');
    const initialStore = await readVicoinsStore();
    const reward = getProfileBannerRewards(initialStore).find(item => item.id === bannerId);
    if (!reward || reward.paymentType !== 'vicoins') return privateJson(res,400,{error:'Este banner não pode ser resgatado com Vicoins.'});
    try {
      const result = await updateVicoinsStore(store => {
        const currentReward = getProfileBannerRewards(store).find(item => item.id === bannerId);
        if (!currentReward || currentReward.paymentType !== 'vicoins') throw new Error('Este banner não está mais disponível.');
        store.profileBannerInventory = store.profileBannerInventory || {};
        const inventory = store.profileBannerInventory[profile.id] || {owned:[],equipped:''};
        inventory.owned = Array.isArray(inventory.owned) ? inventory.owned : [];
        if (inventory.owned.includes(currentReward.id)) {
          inventory.equipped = currentReward.id;
          store.profileBannerInventory[profile.id] = inventory;
          return {balance:Number(store.balances[profile.id]) || 0,inventory:getProfileBannerInventory(store,profile.id),alreadyOwned:true};
        }
        const balance = applyVicoinsTransaction(store,{userId:profile.id,amount:-currentReward.coinCost,type:'profile-banner',referenceId:currentReward.id,description:`Banner de perfil: ${currentReward.name}`});
        inventory.owned.push(currentReward.id);
        inventory.equipped = currentReward.id;
        store.profileBannerInventory[profile.id] = inventory;
        return {balance,inventory:getProfileBannerInventory(store,profile.id),alreadyOwned:false};
      });
      return privateJson(res,200,result);
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível resgatar este banner.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/redemptions') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch antes de solicitar um resgate.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const type = String(body.mediaType || '');
    const id = Number(body.id);
    const manual = body.manual && typeof body.manual === 'object' ? body.manual : null;
    if (!['movie','tv','other'].includes(type) || (type === 'other' && !manual) || (!manual && (!Number.isSafeInteger(id) || id <= 0))) return privateJson(res,400,{error:'Título inválido para solicitar o resgate.'});
    let scheduledAt;
    try { scheduledAt = parseScheduledAt(body.scheduledAt); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    let title;
    if (manual) {
      const manualTitle = String(manual.title || '').trim();
      const manualDuration = Number(manual.durationMinutes);
      if (!manualTitle || manualTitle.length > 120 || !Number.isSafeInteger(manualDuration) || manualDuration < 1 || manualDuration > 59999) return privateJson(res,400,{error:'Informe um título e uma duração manual válida.'});
      const hours = Math.floor(manualDuration / 60);
      const minutes = manualDuration % 60;
      title = {title:manualTitle,posterUrl:'',durationMinutes:manualDuration,durationLabel:hours ? `${hours}h ${String(minutes).padStart(2,'0')}min` : `${minutes} min`};
    } else {
      try { title = await getCatalogTitle(type,id); }
      catch (error) { return privateJson(res,502,{error:error.message || 'Não foi possível confirmar o título no catálogo.'}); }
    }
    const redemption = {
      id:randomUUID(),
      catalogId:manual ? null : id,
      title:title.title,
      mediaType:type,
      posterUrl:title.posterUrl || '',
      durationMinutes:Number(title.durationMinutes) || null,
      durationLabel:title.durationLabel || (title.durationMinutes ? `${title.durationMinutes} min` : 'Duração não informada'),
      estimatedValue:Number(title.durationMinutes) > 0 ? Math.ceil(Number(title.durationMinutes) / 30) * 5 : null,
      scheduledAt,
      status:'pending',
      requester:{id:profile.id,login:profile.login,displayName:profile.displayName},
      createdAt:new Date().toISOString()
    };
    try {
      await updateRedemptions(entries => { entries.push(redemption); return null; });
      return privateJson(res,201,{redemption:{id:redemption.id,status:redemption.status,title:redemption.title,scheduledAt:redemption.scheduledAt}});
    } catch { return privateJson(res,500,{error:'Não foi possível registrar o pedido. Tente novamente.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/account/game-progress') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para continuar seus jogos.'});
    const store = await readJsonState('gameProgress',{});
    return privateJson(res,200,{progress:store[profile.id] || {}});
  }
  if (req.method === 'PUT' && url.pathname === '/api/account/game-progress') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para salvar seu progresso.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); } catch (error) { return privateJson(res,400,{error:error.message}); }
    const game = String(body.game || '');
    const index = Number(body.index), score = Number(body.score);
    const maximum = game === 'movies' ? 100 : game === 'series' ? 100 : 0;
    if (!maximum || !Number.isSafeInteger(index) || index < 0 || index > maximum || !Number.isSafeInteger(score) || score < 0 || score > index) return privateJson(res,400,{error:'Progresso de jogo inválido.'});
    try {
      const progress = await updateJsonState('gameProgress',{},state => {
        if (!state[profile.id] || typeof state[profile.id] !== 'object') state[profile.id] = {};
        state[profile.id][game] = {index,score,updatedAt:new Date().toISOString()};
        return state[profile.id][game];
      });
      return privateJson(res,200,{progress});
    } catch (error) { return privateJson(res,500,{error:error.message || 'Não foi possível salvar o progresso.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/account/redemptions') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para ver seus resgates.'});
    const redemptions = (await readRedemptions())
      .filter(entry => entry.requester?.id === profile.id && entry.status !== 'rejected')
      .sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,status,createdAt}) => ({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,status,createdAt}));
    return privateJson(res,200,{redemptions});
  }
  if (req.method === 'GET' && url.pathname === '/api/account/vicoins') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para consultar seus Vicoins.'});
    try { await reconcileApprovedRedemptionVicoins(profile.id); }
    catch { return privateJson(res,500,{error:'Não foi possível atualizar seu saldo de Vicoins.'}); }
    return privateJson(res,200,{balance:await getVicoinsBalance(profile.id,profile.role === 'admin'),infinite:profile.role === 'admin'});
  }
  if (req.method === 'GET' && url.pathname === '/api/account/vicoins/daily') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para resgatar o bônus diário.'});
    const store = await readVicoinsStore();
    const lastClaim = Date.parse(store.dailyClaims[profile.id] || '');
    const availableAt = Number.isFinite(lastClaim) ? new Date(lastClaim + 24 * 60 * 60 * 1000).toISOString() : null;
    return privateJson(res,200,{claimAmount:20,eligible:!availableAt || Date.now() >= Date.parse(availableAt),availableAt,balance:await getVicoinsBalance(profile.id,profile.role === 'admin'),infinite:profile.role === 'admin'});
  }
  if (req.method === 'POST' && url.pathname === '/api/account/vicoins/daily') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para resgatar o bônus diário.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    try {
      const result = await updateVicoinsStore(store => {
        const lastClaim = Date.parse(store.dailyClaims[profile.id] || '');
        const now = Date.now();
        if (Number.isFinite(lastClaim) && now < lastClaim + 24 * 60 * 60 * 1000) {
          const error = new Error('Seu bônus diário já foi resgatado.');
          error.availableAt = new Date(lastClaim + 24 * 60 * 60 * 1000).toISOString();
          throw error;
        }
        const claimedAt = new Date(now).toISOString();
        const availableAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
        const balance = applyVicoinsTransaction(store,{userId:profile.id,amount:20,type:'daily-login',referenceId:claimedAt,description:'Bônus diário de login'});
        store.dailyClaims[profile.id] = claimedAt;
        return {claimAmount:20,balance,eligible:false,availableAt};
      });
      return privateJson(res,200,result);
    } catch (error) {
      return privateJson(res,409,{error:error.message || 'Não foi possível resgatar o bônus diário.',availableAt:error.availableAt || null});
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/account/vicoins-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para ver seus pedidos da lojinha.'});
    const store = await readVicoinsStore();
    const orders = store.orders.filter(order => order.requester?.id === profile.id).sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0,20);
    return privateJson(res,200,{orders,balance:await getVicoinsBalance(profile.id,profile.role === 'admin'),infinite:profile.role === 'admin'});
  }
  if (req.method === 'POST' && url.pathname === '/api/shop/vicoins-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para resgatar Vicoins na lojinha.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const rewards = await readVicoinsRewards();
    const reward = rewards.find(item => item.id === String(body.rewardId || ''));
    const requestKey = String(body.requestKey || '');
    const requestedTitle = String(body.title || '').trim();
    if (!reward || !/^[\da-f-]{36}$/i.test(requestKey)) return privateJson(res,400,{error:'Selecione uma oferta válida da lojinha.'});
    if (requestedTitle.length > 150) return privateJson(res,400,{error:'O título informado deve ter até 150 caracteres.'});
    try {
      const result = await updateVicoinsStore(store => {
        const previous = store.orders.find(order => order.requester?.id === profile.id && order.requestKey === requestKey);
        if (previous) return {order:previous,balance:Number(store.balances[profile.id]) || 0};
        const order = {id:randomUUID(),requestKey,rewardId:reward.id,contentLimit:reward.contentLimit,coinCost:reward.coinCost,requestedTitle,status:'pending',requester:{id:profile.id,login:profile.login,displayName:profile.displayName},createdAt:new Date().toISOString()};
        const balance = applyVicoinsTransaction(store,{userId:profile.id,amount:-reward.coinCost,type:'shop-redemption',referenceId:order.id,description:`Resgate de conteúdo até R$ ${reward.contentLimit}`});
        store.orders.push(order);
        return {order,balance};
      });
      return privateJson(res,201,result);
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível resgatar esta oferta.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/shop/game-key-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para resgatar uma key de jogo.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const gameKeyId = String(body.gameKeyId || '');
    if (!/^[a-f0-9-]{36}$/i.test(gameKeyId)) return privateJson(res,400,{error:'Selecione um jogo válido.'});
    try {
      const result = await updateVicoinsStore(store => {
        store.gameKeys = Array.isArray(store.gameKeys) ? store.gameKeys : [];
        store.gameKeyOrders = Array.isArray(store.gameKeyOrders) ? store.gameKeyOrders : [];
        const game = store.gameKeys.find(item => item.id === gameKeyId && item.active !== false);
        const availableStock = Number(game?.stock ?? 1);
        if (!game || game.reservedOrderId || !Number.isSafeInteger(availableStock) || availableStock <= 0) throw new Error('Esta key está sem estoque. Atualize a lojinha.');
        const order = {id:randomUUID(),gameKeyId:game.id,gameTitle:game.title,steamUrl:game.steamUrl,coinCost:game.coinCost,status:'pending',requester:{id:profile.id,login:profile.login,displayName:profile.displayName},createdAt:new Date().toISOString()};
        const balance = applyVicoinsTransaction(store,{userId:profile.id,amount:-game.coinCost,type:'game-key-redemption',referenceId:order.id,description:`Key de jogo: ${game.title}`});
        game.stock = availableStock - 1;
        store.gameKeyOrders.unshift(order);
        return {order,balance};
      });
      return privateJson(res,201,result);
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível solicitar esta key.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/shop-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode ver os pedidos da lojinha.'});
    const store = await readVicoinsStore();
    const orders = [
      ...store.orders.filter(order => !['deleted','delivered','completed'].includes(order.status)).map(order => ({...order,orderType:'content-voucher'})),
      ...store.bannerOrders.filter(order => !['deleted','completed'].includes(order.status)).map(order => ({...order,orderType:order.orderType || 'paid-banner'})),
      ...(Array.isArray(store.gameKeyOrders) ? store.gameKeyOrders : []).filter(order => !['deleted','delivered','completed'].includes(order.status)).map(order => ({...order,orderType:'game-key'}))
    ].sort((a,b) => {
      const rank = status => status === 'pending' ? 0 : status === 'approved' ? 1 : 2;
      return rank(a.status) - rank(b.status) || Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '');
    });
    return privateJson(res,200,{orders});
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/shop-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode atualizar pedidos da lojinha.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const id = String(body.id || '');
    const orderType = String(body.orderType || '');
    const action = String(body.action || '');
    if (!/^[a-f0-9-]{36}$/i.test(id) || !['content-voucher','paid-banner','club-vime','game-key'].includes(orderType) || !['approve','finish','delete'].includes(action)) return privateJson(res,400,{error:'Ação inválida para o pedido da lojinha.'});
    try {
      const result = await updateVicoinsStore(store => {
        store.orders = Array.isArray(store.orders) ? store.orders : [];
        store.bannerOrders = Array.isArray(store.bannerOrders) ? store.bannerOrders : [];
        store.gameKeys = Array.isArray(store.gameKeys) ? store.gameKeys : [];
        store.gameKeyOrders = Array.isArray(store.gameKeyOrders) ? store.gameKeyOrders : [];
        const now = new Date().toISOString();
        if (orderType === 'content-voucher') {
          const order = (Array.isArray(store.orders) ? store.orders : []).find(item => item.id === id);
          if (!order) throw new Error('Pedido de vale não encontrado.');
          if (action === 'approve') throw new Error('Este tipo de pedido não exige aprovação de pagamento.');
          if (action === 'finish') {
            if (order.status !== 'pending') throw new Error('Este pedido já foi finalizado.');
            order.status = 'delivered'; order.deliveredAt = now; order.deliveredBy = profile.id;
          } else {
            if (order.status === 'pending') applyVicoinsTransaction(store,{userId:order.requester.id,amount:order.coinCost,type:'shop-refund',referenceId:order.id,description:`Devolução do pedido excluído da lojinha até R$ ${order.contentLimit}`});
            order.status = 'deleted'; order.deletedAt = now; order.deletedBy = profile.id;
          }
        } else if (orderType === 'paid-banner' || orderType === 'club-vime') {
          store.bannerOrders = Array.isArray(store.bannerOrders) ? store.bannerOrders : [];
          const order = store.bannerOrders.find(item => item.id === id);
          if (!order) throw new Error('Pedido de banner não encontrado.');
          if ((order.orderType || 'paid-banner') !== orderType) throw new Error('O tipo deste pedido não corresponde à solicitação.');
          if (action === 'approve') {
            if (order.status !== 'pending') throw new Error('Este pedido já foi analisado.');
            if (orderType === 'club-vime') {
              store.clubVimeMembers = Array.isArray(store.clubVimeMembers) ? store.clubVimeMembers : [];
              if (hasClubVime(store,order.requester.id)) throw new Error('Este usuário já está no Clube Vime.');
              applyVicoinsTransaction(store,{userId:order.requester.id,amount:500,type:'club-vime',referenceId:order.id,description:'Bônus de entrada no Clube Vime'});
              const activatedAt = now;
              const expiresAt = new Date(Date.parse(now) + 30 * 24 * 60 * 60 * 1000).toISOString();
              store.clubVimeMembers = store.clubVimeMembers.filter(member => String(typeof member === 'string' ? member : member?.userId) !== String(order.requester.id));
              store.clubVimeMembers.push({userId:String(order.requester.id),activatedAt,expiresAt});
              order.clubVimeExpiresAt = expiresAt;
            } else {
              const reward = getProfileBannerRewards(store).find(item => item.id === order.bannerId && item.paymentType === 'livepix');
              if (!reward) throw new Error('O banner desta solicitação não está disponível.');
              store.profileBannerInventory = store.profileBannerInventory || {};
              const inventory = store.profileBannerInventory[order.requester.id] || {owned:[],equipped:''};
              inventory.owned = Array.isArray(inventory.owned) ? inventory.owned : [];
              if (!inventory.owned.includes(reward.id)) inventory.owned.push(reward.id);
              inventory.equipped = reward.id;
              store.profileBannerInventory[order.requester.id] = inventory;
            }
            order.status = 'approved'; order.approvedAt = now; order.approvedBy = profile.id;
          } else if (action === 'finish') {
            if (order.status !== 'approved') throw new Error('Aprove o pagamento antes de finalizar.');
            order.status = 'completed'; order.completedAt = now; order.completedBy = profile.id;
          } else {
            order.status = 'deleted'; order.deletedAt = now; order.deletedBy = profile.id;
          }
        } else {
          store.gameKeys = Array.isArray(store.gameKeys) ? store.gameKeys : [];
          store.gameKeyOrders = Array.isArray(store.gameKeyOrders) ? store.gameKeyOrders : [];
          const order = store.gameKeyOrders.find(item => item.id === id);
          if (!order) throw new Error('Pedido de key não encontrado.');
          if (action === 'approve') throw new Error('Este pedido não exige confirmação de pagamento.');
          if (action === 'finish') {
            if (order.status !== 'pending') throw new Error('Este pedido já foi finalizado.');
            order.status = 'delivered'; order.deliveredAt = now; order.deliveredBy = profile.id;
            const game = store.gameKeys.find(item => item.id === order.gameKeyId);
            if (game?.reservedOrderId === order.id) { game.reservedOrderId = ''; game.stock = Number(game.stock ?? 0); }
          } else {
            if (order.status === 'pending') {
              applyVicoinsTransaction(store,{userId:order.requester.id,amount:order.coinCost,type:'game-key-refund',referenceId:order.id,description:`Devolução da key de jogo excluída: ${order.gameTitle}`});
              const game = store.gameKeys.find(item => item.id === order.gameKeyId);
              if (game) game.stock = Math.min(1000000,Number(game.stock ?? 0) + 1);
              if (game?.reservedOrderId === order.id) game.reservedOrderId = '';
            }
            order.status = 'deleted'; order.deletedAt = now; order.deletedBy = profile.id;
          }
        }
        return {orders:[...store.orders.filter(item => !['deleted','delivered','completed'].includes(item.status)).map(item => ({...item,orderType:'content-voucher'})),...store.bannerOrders.filter(item => !['deleted','completed'].includes(item.status)).map(item => ({...item,orderType:item.orderType || 'paid-banner'})),...store.gameKeyOrders.filter(item => !['deleted','delivered','completed'].includes(item.status)).map(item => ({...item,orderType:'game-key'}))].sort((a,b) => (a.status === 'pending' ? 0 : a.status === 'approved' ? 1 : 2) - (b.status === 'pending' ? 0 : b.status === 'approved' ? 1 : 2) || Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))};
      });
      return privateJson(res,200,result);
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível atualizar o pedido.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/profile-banner-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode ver os pedidos de banner.'});
    const store = await readVicoinsStore();
    const orders = store.bannerOrders.filter(order => order.orderType !== 'club-vime').slice().sort((a,b) => Number(a.status !== 'pending') - Number(b.status !== 'pending') || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return privateJson(res,200,{orders});
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/profile-banner-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode atualizar pedidos de banner.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const id = String(body.id || '');
    const action = String(body.action || '');
    if (!id || !['approve','reject'].includes(action)) return privateJson(res,400,{error:'Ação inválida para o pedido de banner.'});
    try {
      const result = await updateVicoinsStore(store => {
        store.bannerOrders = Array.isArray(store.bannerOrders) ? store.bannerOrders : [];
        const order = store.bannerOrders.find(item => item.id === id && item.orderType !== 'club-vime');
        if (!order) throw new Error('Pedido de banner não encontrado.');
        if (order.status !== 'pending') throw new Error('Este pedido já foi finalizado.');
        const now = new Date().toISOString();
        if (action === 'approve') {
          const reward = getProfileBannerRewards(store).find(item => item.id === order.bannerId && item.paymentType === 'livepix');
          if (!reward) throw new Error('O banner desta solicitação não está disponível.');
          store.profileBannerInventory = store.profileBannerInventory || {};
          const inventory = store.profileBannerInventory[order.requester.id] || {owned:[],equipped:''};
          inventory.owned = Array.isArray(inventory.owned) ? inventory.owned : [];
          if (!inventory.owned.includes(reward.id)) inventory.owned.push(reward.id);
          inventory.equipped = reward.id;
          store.profileBannerInventory[order.requester.id] = inventory;
          order.status = 'approved';
          order.approvedAt = now;
          order.approvedBy = profile.id;
        } else {
          order.status = 'rejected';
          order.rejectedAt = now;
          order.rejectedBy = profile.id;
        }
        return {orders:store.bannerOrders.slice().sort((a,b) => Number(a.status !== 'pending') - Number(b.status !== 'pending') || Date.parse(b.createdAt) - Date.parse(a.createdAt))};
      });
      return privateJson(res,200,result);
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível atualizar o pedido.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/community-members') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode consultar a lista de usuários.'});
    const members = (await readCommunityMembers())
      .filter(member => member?.login)
      .sort((a,b) => String(a.displayName || a.login).localeCompare(String(b.displayName || b.login),'pt-BR'))
      .map(({id,login,displayName}) => ({id,login,displayName:displayName || login}));
    return privateJson(res,200,{members});
  }
  if (url.pathname === '/api/admin/community-badges' && ['GET','POST','PUT','DELETE'].includes(req.method)) {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode gerenciar insígnias.'});
    const origin = req.headers.origin;
    if (req.method !== 'GET' && origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    if (req.method === 'GET') {
      const [store,members] = await Promise.all([readCommunityBadges(),readCommunityMembers()]);
      return privateJson(res,200,{badges:store.badges,members:members.filter(member => member?.id && member?.login).map(({id,login,displayName}) => ({id,login,displayName:displayName || login})).sort((a,b) => a.displayName.localeCompare(b.displayName,'pt-BR'))});
    }
    let body;
    try { body = await readRequestJson(req); } catch (error) { return privateJson(res,400,{error:error.message}); }
    if (req.method === 'POST') {
      const name = String(body.name || '').trim().slice(0,48);
      const symbolText = String(body.symbol || '').trim();
      const symbol = typeof Intl.Segmenter === 'function'
        ? [...new Intl.Segmenter('pt-BR',{granularity:'grapheme'}).segment(symbolText)].slice(0,4).map(item => item.segment).join('')
        : Array.from(symbolText).slice(0,12).join('');
      const rawIds = Array.isArray(body.memberIds) ? body.memberIds.map(value => String(value)) : [];
      if (name.length < 2 || !symbol || rawIds.length > 500) return privateJson(res,400,{error:'Informe o nome, um símbolo e até 500 destinatários.'});
      const members = await readCommunityMembers();
      const validIds = new Set(members.map(member => String(member.id)));
      if (rawIds.some(id => !validIds.has(id))) return privateJson(res,400,{error:'A lista contém uma conta que não está registrada na comunidade.'});
      try {
        const result = await updateJsonState('communityBadges',{badges:[]},store => {
          if (!Array.isArray(store.badges)) store.badges = [];
          if (store.badges.some(item => String(item.name || '').toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw new Error('Já existe uma insígnia com esse nome.');
          const badge = {id:randomUUID(),name,symbol,memberIds:[...new Set(rawIds)],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
          store.badges.push(badge); return {badge,badges:store.badges};
        });
        return privateJson(res,201,result);
      } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível criar a insígnia.'}); }
    }
    const id = String(body.id || '');
    if (!/^[a-f0-9-]{36}$/i.test(id)) return privateJson(res,400,{error:'Insígnia inválida.'});
    if (req.method === 'PUT') {
      const requestedIds = Array.isArray(body.memberIds) ? body.memberIds.map(value => String(value)) : [];
      if (requestedIds.length > 500) return privateJson(res,400,{error:'Selecione até 500 destinatários.'});
      const validIds = new Set((await readCommunityMembers()).map(member => String(member.id)));
      if (requestedIds.some(value => !validIds.has(value))) return privateJson(res,400,{error:'A lista contém uma conta que não está registrada na comunidade.'});
    }
    try {
      const result = await updateJsonState('communityBadges',{badges:[]},store => {
        if (!Array.isArray(store.badges)) store.badges = [];
        const index = store.badges.findIndex(item => item.id === id);
        if (index < 0) return null;
        if (req.method === 'DELETE') { store.badges.splice(index,1); return {badges:store.badges}; }
        const rawIds = Array.isArray(body.memberIds) ? body.memberIds.map(value => String(value)) : [];
        const badge = store.badges[index];
        badge.memberIds = [...new Set(rawIds)]; badge.updatedAt = new Date().toISOString();
        return {badge,badges:store.badges};
      });
      if (!result) return privateJson(res,404,{error:'Esta insígnia não foi encontrada.'});
      return privateJson(res,200,result);
    } catch (error) { return privateJson(res,400,{error:error.message || 'Não foi possível atualizar a insígnia.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/vicoins-adjustments') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode ajustar Vicoins.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const login = String(body.login || '').trim().replace(/^@/,'').toLowerCase();
    const amount = Number(body.amount);
    const action = String(body.action || '');
    const reason = String(body.reason || '').trim().slice(0,120);
    if (!/^[a-z0-9_]{1,25}$/.test(login)) return privateJson(res,400,{error:'Informe um usuário Twitch válido, sem espaços.'});
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) return privateJson(res,400,{error:'Informe uma quantidade inteira entre 1 e 1.000.000 Vicoins.'});
    if (!['add','remove'].includes(action)) return privateJson(res,400,{error:'Escolha adicionar ou remover Vicoins.'});
    const target = (await readCommunityMembers()).find(member => String(member.login || '').toLowerCase() === login);
    if (!target) return privateJson(res,404,{error:'Este usuário ainda não aparece na comunidade. Peça para entrar no site com a Twitch uma vez e tente novamente.'});
    if (getTwitchRole(target) === 'admin') return privateJson(res,400,{error:'A conta administradora já tem Vicoins ilimitados.'});
    const signedAmount = action === 'add' ? amount : -amount;
    try {
      const balance = await updateVicoinsStore(store => applyVicoinsTransaction(store,{
        userId:target.id,
        amount:signedAmount,
        type:'admin-adjustment',
        referenceId:randomUUID(),
        description:`${action === 'add' ? 'Adição' : 'Remoção'} manual por @${profile.login}${reason ? ` · ${reason}` : ''}`
      }));
      return privateJson(res,200,{login:target.login,displayName:target.displayName || target.login,amount,balance,action});
    } catch (error) {
      return privateJson(res,409,{error:error.message || 'Não foi possível ajustar o saldo de Vicoins.'});
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/vicoins-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode ver os pedidos da lojinha.'});
    const store = await readVicoinsStore();
    const orders = store.orders.slice().sort((a,b) => Number(a.status !== 'pending') - Number(b.status !== 'pending') || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return privateJson(res,200,{orders});
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/vicoins-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode atualizar pedidos da lojinha.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const id = String(body.id || '');
    const action = String(body.action || '');
    if (!id || !['delivered','cancel'].includes(action)) return privateJson(res,400,{error:'Ação inválida para o pedido da lojinha.'});
    try {
      const result = await updateVicoinsStore(store => {
        const order = store.orders.find(item => item.id === id);
        if (!order) throw new Error('Pedido não encontrado.');
        if (order.status !== 'pending') throw new Error('Este pedido já foi finalizado.');
        if (action === 'delivered') {
          order.status = 'delivered';
          order.deliveredAt = new Date().toISOString();
          order.deliveredBy = profile.id;
        } else {
          applyVicoinsTransaction(store,{userId:order.requester.id,amount:order.coinCost,type:'shop-refund',referenceId:order.id,description:`Devolução do pedido da lojinha até R$ ${order.contentLimit}`});
          order.status = 'cancelled';
          order.cancelledAt = new Date().toISOString();
          order.cancelledBy = profile.id;
        }
        return {orders:store.orders.slice().sort((a,b) => Number(a.status !== 'pending') - Number(b.status !== 'pending') || Date.parse(b.createdAt) - Date.parse(a.createdAt))};
      });
      return privateJson(res,200,result);
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível atualizar o pedido.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/redemptions') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode acessar a fila de resgates.'});
    const redemptions = (await readRedemptions()).filter(item => item.status !== 'completed').sort((a,b) => {
      const pendingOrder = Number(b.status === 'pending') - Number(a.status === 'pending');
      return pendingOrder || Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
    return privateJson(res,200,{redemptions});
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/redemptions') {
    const profile = await getAuthenticatedProfile(req,res);
    if (profile?.role !== 'admin') return privateJson(res,403,{error:'Apenas o administrador pode editar a fila de resgates.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const id = String(body.id || '');
    const action = String(body.action || '');
    let scheduledAt = '';
    if (action === 'edit') {
      try { scheduledAt = parseScheduledAt(body.scheduledAt); }
      catch (error) { return privateJson(res,400,{error:error.message}); }
    }
    if (!id || !['edit','approve','reject','delete','finish'].includes(action)) return privateJson(res,400,{error:'Ação administrativa inválida.'});
    try {
      const redemptions = await updateRedemptions(entries => {
        const itemIndex = entries.findIndex(entry => entry.id === id);
        if (itemIndex < 0) return null;
        if (action === 'delete') {
          entries.splice(itemIndex,1);
          return entries.sort((a,b) => Number(b.status === 'pending') - Number(a.status === 'pending') || Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
        }
        const item = entries[itemIndex];
        if (action === 'edit') {
          if (!['pending','approved'].includes(item.status)) throw new Error('Não é possível alterar a data de um pedido rejeitado.');
          item.scheduledAt = scheduledAt;
          item.updatedAt = new Date().toISOString();
        }
        if (action === 'approve') {
          if (item.status !== 'pending') throw new Error('Só é possível aprovar pedidos pendentes.');
          item.status = 'approved'; item.approvedAt = new Date().toISOString(); item.approvedBy = profile.id;
          const durationMinutes = Number(item.durationMinutes);
          item.vicoinsAwarded = Number.isFinite(durationMinutes) && durationMinutes > 0 ? Math.ceil(durationMinutes / 30) * 20 : 0;
        }
        if (action === 'finish') {
          if (item.status !== 'approved') throw new Error('Só é possível finalizar um resgate aprovado.');
          item.status = 'completed'; item.completedAt = new Date().toISOString(); item.completedBy = profile.id;
        }
        if (action === 'reject') {
          if (item.status !== 'pending') throw new Error('Só é possível rejeitar pedidos pendentes.');
          item.status = 'rejected'; item.rejectedAt = new Date().toISOString(); item.rejectedBy = profile.id;
        }
        return entries.sort((a,b) => Number(b.status === 'pending') - Number(a.status === 'pending') || Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
      });
      if (!redemptions) return privateJson(res,404,{error:'Solicitação não encontrada.'});
      if (action === 'approve') await reconcileApprovedRedemptionVicoins();
      return privateJson(res,200,{redemptions:redemptions.filter(item => item.status !== 'completed')});
    } catch (error) { return privateJson(res,409,{error:error.message || 'Não foi possível atualizar a solicitação.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/youtube/latest') {
    try { return json(res, 200, {videos:await getLatestYoutubeVideos()}); }
    catch (error) { return json(res, 502, {error:error.message || 'Não foi possível carregar os vídeos recentes do YouTube.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/favorites') {
    const profile = await getAuthenticatedProfile(req,res);
    return privateJson(res, 200, {favorites:publicFavorites(await removePatreonLinkedFavorites(), profile?.id || '')});
  }
  if (req.method === 'GET' && url.pathname === '/api/account/favorites') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res, 401, {error:'Entre com a Twitch para ver seus filmes favoritos.'});
    return privateJson(res, 200, {favorites:userFavorites(await removePatreonLinkedFavorites(),profile.id)});
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/ratings') {
    return json(res, 200, {topRated:publicTopRatings(await readRatings())});
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/rating') {
    const profile = await getAuthenticatedProfile(req,res);
    const type = url.searchParams.get('type') || '';
    const id = Number(url.searchParams.get('id'));
    if (!['movie','tv'].includes(type) || !Number.isSafeInteger(id) || id <= 0) return json(res, 400, {error:'Dados de avaliação inválidos.'});
    try {
      const title = await getCatalogTitle(type,id);
      if (!title.reactUrl) return json(res, 200, {eligible:false});
      const entry = (await readRatings()).find(value => value.mediaType === type && Number(value.id) === id);
      return json(res, 200, {eligible:true,...ratingSummary(entry,profile?.id || '')});
    } catch (error) { return json(res, 502, {error:error.message || 'Não foi possível carregar as avaliações.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/rating-history') {
    const type = url.searchParams.get('type') || '';
    const id = Number(url.searchParams.get('id'));
    if (!['movie','tv'].includes(type) || !Number.isSafeInteger(id) || id <= 0) return json(res,400,{error:'Dados do histórico de avaliações inválidos.'});
    const entry = (await readRatings()).find(value => value.mediaType === type && Number(value.id) === id);
    const memberById = new Map((await readCommunityMembers()).map(member => [String(member.id),member]));
    const vicoinsStore = await readVicoinsStore();
    const votes = (Array.isArray(entry?.votes) ? entry.votes : []).filter(vote => Number.isFinite(vote.rating)).map(vote => {
      const member = memberById.get(String(vote.clientId)) || {};
      return {displayName:member.displayName || member.login || 'Usuário Twitch',profileImageUrl:member.profileImageUrl || '',clubVime:hasClubVime(vicoinsStore,vote.clientId),clubVimeExpiresAt:getClubVimeMembership(vicoinsStore,vote.clientId)?.expiresAt || null,rating:vote.rating};
    }).sort((a,b) => b.rating - a.rating || a.displayName.localeCompare(b.displayName,'pt-BR'));
    return json(res,200,{votes});
  }
  if (req.method === 'POST' && url.pathname === '/api/catalog/rating') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res, 401, {error:'Entre com a Twitch para avaliar este título.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return json(res, 400, {error:error.message}); }
    const clientId = profile.id;
    const item = body.item || {};
    const type = item.mediaType;
    const id = Number(item.id);
    const rating = Number(body.rating);
    if (!['movie','tv'].includes(type) || !Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(rating) || rating < 0.5 || rating > 5 || Math.round(rating * 2) !== rating * 2) return json(res, 400, {error:'Informe uma nota de meia em meia estrela, entre 0,5 e 5.'});
    let title;
    try { title = await getCatalogTitle(type,id); }
    catch (error) { return json(res, 502, {error:error.message || 'Não foi possível validar o título no TMDB.'}); }
    if (!title.reactUrl) return json(res, 403, {error:'Só é possível avaliar títulos com react disponível no Patreon.'});
    try {
      const result = await updateRatings(entries => {
        let entry = entries.find(value => value.mediaType === type && Number(value.id) === id);
        if (!entry) {
          entry = {id,mediaType:type,title:title.title,posterUrl:title.posterUrl || '',votes:[]};
          entries.push(entry);
        }
        entry.title = title.title;
        entry.posterUrl = title.posterUrl || entry.posterUrl || '';
        entry.votes = Array.isArray(entry.votes) ? entry.votes : [];
        const previous = entry.votes.find(vote => vote.clientId === clientId);
        if (previous) previous.rating = rating;
        else entry.votes.push({clientId,rating});
        return { ...ratingSummary(entry,clientId),topRated:publicTopRatings(entries) };
      });
      const reward = await awardActivityVicoins({userId:clientId,type:'rating-activity',referenceId:`${type}:${id}`,description:`Vicoins por avaliar: ${title.title}`});
      return privateJson(res,200,{eligible:true,...result,vicoinsAwarded:reward.awarded,vicoinsBalance:reward.balance});
    } catch { return json(res, 500, {error:'Não foi possível salvar sua avaliação.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/title') {
    const type = url.searchParams.get('type') || '';
    const id = Number(url.searchParams.get('id'));
    if (!['movie','tv'].includes(type) || !Number.isSafeInteger(id) || id <= 0) return json(res, 400, {error:'Título inválido.'});
    try { return json(res, 200, {source:'tmdb',result:await getCatalogTitle(type,id)}); }
    catch (error) { return json(res, 502, {error:error.message || 'Não foi possível carregar os detalhes do TMDB.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/catalog/favorites') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res, 401, {error:'Entre com a Twitch para salvar seus favoritos.'});
    try {
      const body = await readRequestJson(req);
      const clientId = profile.id;
      const item = body.item || {};
      const mediaType = item.mediaType;
      const id = Number(item.id);
      const title = String(item.title || '').trim().slice(0, 200);
      const action = body.action;
      if (!['movie','tv'].includes(mediaType) || !Number.isSafeInteger(id) || id <= 0 || !title || !['add','remove'].includes(action)) throw new Error('Dados do favorito inválidos.');
      if (action === 'add') {
        let verifiedTitle;
        try { verifiedTitle = await getCatalogTitle(mediaType,id); }
        catch (error) { return json(res, 502, {error:error.message || 'Não foi possível validar o título.'}); }
        if (verifiedTitle.reactUrl) return json(res, 409, {error:'Este título já tem react no Patreon e não pode receber corações.'});
      }
      let posterUrl = '';
      if (item.posterUrl) {
        const poster = new URL(item.posterUrl);
        if (poster.protocol !== 'https:' || poster.hostname !== 'image.tmdb.org' || !poster.pathname.startsWith('/t/p/')) throw new Error('Endereço de pôster inválido.');
        posterUrl = poster.href;
      }
      const entryKey = `${mediaType}:${id}`;
      const updated = await updateFavorites(entries => {
        let entry = entries.find(value => `${value.mediaType}:${value.id}` === entryKey);
        if (action === 'add') {
          if (!entry) {
            entry = {id,mediaType,title,posterUrl,year:/^\d{4}$/.test(String(item.year || '')) ? String(item.year) : '',voters:[]};
            entries.push(entry);
          }
          entry.voters = Array.isArray(entry.voters) ? entry.voters : [];
          if (!entry.voters.includes(clientId)) entry.voters.push(clientId);
          entry.title = title;
          if (posterUrl) entry.posterUrl = posterUrl;
        } else if (entry) {
          entry.voters = (Array.isArray(entry.voters) ? entry.voters : []).filter(voter => voter !== clientId);
          if (!entry.voters.length) entries.splice(entries.indexOf(entry), 1);
        }
        return {favorites:publicFavorites(entries,clientId)};
      });
      const reward = action === 'add'
        ? await awardActivityVicoins({userId:clientId,type:'favorite-activity',referenceId:entryKey,description:`Vicoins por favoritar: ${title}`})
        : {awarded:0,balance:await getVicoinsBalance(clientId)};
      return privateJson(res,200,{favorites:updated.favorites,vicoinsAwarded:reward.awarded,vicoinsBalance:reward.balance});
    } catch (error) { return json(res, 400, {error:error.message || 'Não foi possível atualizar o favorito.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/suggestions') {
    const period = url.searchParams.get('period') === 'day' ? 'day' : 'week';
    try { return json(res, 200, await getTrendingSuggestions(period)); }
    catch (error) { return json(res, 502, {error:error.message || 'Não foi possível carregar sugestões agora.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/calendar') {
    const monthValue = url.searchParams.get('month') || '';
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthValue);
    if (!match || Number(match[1]) < 1900 || Number(match[1]) > 2100) return json(res, 400, {error:'Informe o mês no formato AAAA-MM.'});
    try { return json(res, 200, await getCalendarMovies(Number(match[1]), Number(match[2]))); }
    catch (error) { return json(res, 502, {error:error.message || 'Não foi possível carregar as estreias do mês.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/genres') {
    const type = url.searchParams.get('type') || '';
    try { return json(res, 200, {source:'tmdb',genres:await getCatalogGenres(type)}); }
    catch (error) { return json(res, error.message === 'Escolha filme ou série.' ? 400 : 502, {error:error.message || 'Não foi possível carregar os gêneros.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/random') {
    const type = url.searchParams.get('type') || '';
    const genre = url.searchParams.get('genre') || 'all';
    try { return json(res, 200, {source:'tmdb',result:await getRandomCatalogTitle(type,genre)}); }
    catch (error) { return json(res, ['Escolha filme ou série.','Escolha um gênero disponível.'].includes(error.message) ? 400 : 502, {error:error.message || 'Não foi possível sortear um título agora.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/catalog/search-tmdb') {
    const query = String(url.searchParams.get('q') || '').trim().slice(0, 100);
    if (query.length < 2) return json(res, 400, {error:'Digite pelo menos 2 letras.'});
    const page = Number(url.searchParams.get('page') || 1);
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isSafeInteger(page) || page < 1 || page > 500 || !Number.isSafeInteger(offset) || offset < 0 || offset > 20) return json(res, 400, {error:'Cursor de busca inválido.'});
    const normalizedQuery = query.toLocaleLowerCase('pt-BR');
    const manualLinksModified = await stat(manualPatreonLinksFile).then(file => file.mtimeMs).catch(() => 0);
    const key = `${normalizedQuery}:${page}:${offset}:${manualLinksModified}`;
    const cached = tmdbCache.get(key);
    if (cached && cached.until > Date.now()) return json(res, 200, cached.value);
    try {
      const value = await searchTmdb(query,page,offset);
      tmdbCache.set(key, {value, until:Date.now() + 120000});
      return json(res, 200, value);
    } catch (error) {
      return json(res, 502, {error:error.message || 'A consulta ao TMDB falhou. Tente novamente em instantes.'});
    }
  }
  if (req.method !== 'GET') return json(res, 405, {error:'Método não permitido.'});
  const requested = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  const relative = path.relative(root, requested);
  const publicExtensions = new Set(['.html','.css','.js','.svg','.png','.jpg','.jpeg','.webp','.ico']);
  if (!requested.startsWith(root + path.sep) || relative.split(path.sep).some(part => part.startsWith('.') || part === 'node_modules') || !publicExtensions.has(path.extname(requested).toLowerCase())) return json(res, 404, {error:'Arquivo não encontrado.'});
  try {
    const data = await readFile(requested);
    res.writeHead(200, {'content-type':mime[path.extname(requested)] || 'application/octet-stream','cache-control':'no-cache'});
    res.end(data);
  } catch {
    return json(res, 404, {error:'Arquivo não encontrado.'});
  }
}

if (persistenceMode === 'supabase') {
  try { await supabaseRest('/app_state?select=state_key&limit=1'); }
  catch (error) { throw new Error(`Supabase não está pronto. Confira a migração SQL, SUPABASE_URL e SUPABASE_SECRET_KEY. Detalhe: ${error.message}`); }
} else {
  console.warn('Persistência local ativa. Em produção, configure DATA_STORE=supabase para manter os dados após reinícios e deploys.');
}

http.createServer((req, res) => { handle(req, res).catch(error => { console.error('Falha ao atender requisição:',error); json(res, 500, {error:'Erro interno.'}); }); }).listen(port, '0.0.0.0', () => console.log(`Vimessias Play em http://localhost:${port} (dados: ${persistenceMode})`));
