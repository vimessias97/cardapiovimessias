import http from 'node:http';
import {constants as fsConstants} from 'node:fs';
import {readFile,stat,writeFile,rename,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
try { for (const line of (await readFile(path.join(root, '.env'), 'utf8')).split(/\r?\n/)) { const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2'); } } catch {}
const port = Number(process.env.PORT || 3000);
const dataRoot = path.resolve(process.env.DATA_DIR || root);
await mkdir(dataRoot, {recursive:true});
const favoritesFile = path.join(dataRoot, 'favorites.json');
const ratingsFile = path.join(dataRoot, 'ratings.json');
const redemptionsFile = path.join(dataRoot, 'redemptions.json');
const communityMembersFile = path.join(dataRoot, 'community-members.json');
const promotionsFile = path.join(dataRoot, 'promotions.json');
const vicoinsFile = path.join(dataRoot, 'vicoins.json');
const youtubeVideosFile = path.join(dataRoot, 'youtube-videos.json');
if (dataRoot !== root) {
  for (const name of ['favorites.json','ratings.json']) {
    const destination = path.join(dataRoot,name);
    try { await stat(destination); }
    catch { try { await copyFile(path.join(root,name),destination,fsConstants.COPYFILE_EXCL); } catch {} }
  }
}
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const tmdbCache = new Map();
const genreCache = new Map();
const suggestionsCache = new Map();
const calendarCache = new Map();
const trailerCache = new Map();
let youtubeVideosCache = {expiresAt:0,videos:[]};
let youtubeChannelId = '';
const twitchOAuthStates = new Map();
const twitchSessions = new Map();
let patreonPostsCache = {expiresAt:0,posts:[]};
const manualPatreonLinksFile = path.join(root, 'patreon-links.json');
let favoritesWriteQueue = Promise.resolve();
let ratingsWriteQueue = Promise.resolve();
let redemptionsWriteQueue = Promise.resolve();
let communityMembersWriteQueue = Promise.resolve();
let promotionsWriteQueue = Promise.resolve();
let vicoinsWriteQueue = Promise.resolve();
const defaultPromotionCollections = [
  {id:'lotr',name:'Trilogia O Senhor dos Anéis',discountPercent:30,titles:[{id:120,mediaType:'movie'},{id:121,mediaType:'movie'},{id:122,mediaType:'movie'}]},
  {id:'hobbit',name:'Trilogia O Hobbit',discountPercent:30,titles:[{id:49051,mediaType:'movie'},{id:57158,mediaType:'movie'},{id:122917,mediaType:'movie'}]},
  {id:'harry-potter',name:'Coleção completa Harry Potter',discountPercent:30,titles:[{id:671,mediaType:'movie'},{id:672,mediaType:'movie'},{id:673,mediaType:'movie'},{id:674,mediaType:'movie'},{id:675,mediaType:'movie'},{id:767,mediaType:'movie'},{id:12444,mediaType:'movie'},{id:12445,mediaType:'movie'}]}
];
const vicoinsRewards = [
  {id:'content-15',contentLimit:15,coinCost:500},
  {id:'content-20',contentLimit:20,coinCost:600},
  {id:'content-25',contentLimit:25,coinCost:700},
  {id:'content-30',contentLimit:30,coinCost:800}
];
const profileBannerRewards = [
  {id:'halloween-michael',name:'Halloween · Michael Myers',imageUrl:'/assets/profile-banners/halloween-michael-1600x240.png',coinCost:100}
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
    return {...session.profile,role:getTwitchRole(session.profile)};
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

async function readFavorites() {
  try {
    const value = JSON.parse(await readFile(favoritesFile, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

async function readRatings() {
  try {
    const value = JSON.parse(await readFile(ratingsFile, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

async function readRedemptions() {
  try {
    const value = JSON.parse(await readFile(redemptionsFile,'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

async function readCommunityMembers() {
  try {
    const value = JSON.parse(await readFile(communityMembersFile,'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

async function readVicoinsStore() {
  try {
    const value = JSON.parse(await readFile(vicoinsFile,'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {balances:{},transactions:[],orders:[],dailyClaims:{},profileBannerInventory:{}};
    if (value.balances && typeof value.balances === 'object' && !Array.isArray(value.balances)) {
      return {balances:value.balances,transactions:Array.isArray(value.transactions) ? value.transactions : [],orders:Array.isArray(value.orders) ? value.orders : [],dailyClaims:value.dailyClaims && typeof value.dailyClaims === 'object' && !Array.isArray(value.dailyClaims) ? value.dailyClaims : {},profileBannerInventory:value.profileBannerInventory && typeof value.profileBannerInventory === 'object' && !Array.isArray(value.profileBannerInventory) ? value.profileBannerInventory : {}};
    }
    return {balances:value,transactions:[],orders:[],dailyClaims:{},profileBannerInventory:{}};
  } catch { return {balances:{},transactions:[],orders:[],dailyClaims:{},profileBannerInventory:{}}; }
}

function getProfileBannerInventory(store,userId) {
  const saved = store.profileBannerInventory?.[userId];
  const owned = Array.isArray(saved?.owned) ? [...new Set(saved.owned.filter(id => profileBannerRewards.some(item => item.id === id)))] : [];
  const equippedId = profileBannerRewards.some(item => item.id === saved?.equipped) ? saved.equipped : '';
  return {owned,equipped:profileBannerRewards.find(item => item.id === equippedId) || null};
}

async function updateVicoinsStore(update) {
  const operation = vicoinsWriteQueue.then(async () => {
    const store = await readVicoinsStore();
    const result = update(store);
    const temporary = `${vicoinsFile}.tmp`;
    await writeFile(temporary,JSON.stringify(store,null,2),'utf8');
    await rename(temporary,vicoinsFile);
    return result;
  });
  vicoinsWriteQueue = operation.catch(() => {});
  return operation;
}

function applyVicoinsTransaction(store,{userId,amount,type,referenceId,description}) {
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

async function getVicoinsBalance(userId) {
  const store = await readVicoinsStore();
  const balance = Number(store.balances[userId]);
  return Number.isSafeInteger(balance) && balance >= 0 ? balance : 0;
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
    const members = await readCommunityMembers();
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
    const temporary = `${communityMembersFile}.tmp`;
    await writeFile(temporary,JSON.stringify(members,null,2),'utf8');
    await rename(temporary,communityMembersFile);
  });
  communityMembersWriteQueue = operation.catch(() => {});
  return operation;
}

async function readPromotions() {
  try {
    const value = JSON.parse(await readFile(promotionsFile,'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return structuredClone(defaultPromotionCollections); }
}

async function updatePromotions(update) {
  const operation = promotionsWriteQueue.then(async () => {
    const collections = await readPromotions();
    const result = update(collections);
    const temporary = `${promotionsFile}.tmp`;
    await writeFile(temporary,JSON.stringify(collections,null,2),'utf8');
    await rename(temporary,promotionsFile);
    return result;
  });
  promotionsWriteQueue = operation.catch(() => {});
  return operation;
}

async function updateRedemptions(update) {
  const operation = redemptionsWriteQueue.then(async () => {
    const entries = await readRedemptions();
    const result = update(entries);
    const temporaryFile = `${redemptionsFile}.tmp`;
    await writeFile(temporaryFile,JSON.stringify(entries,null,2),'utf8');
    await rename(temporaryFile,redemptionsFile);
    return result;
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
    const entries = await readRatings();
    const result = update(entries);
    const temporaryFile = `${ratingsFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(entries, null, 2), 'utf8');
    await rename(temporaryFile, ratingsFile);
    return result;
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

async function updateFavorites(update) {
  const operation = favoritesWriteQueue.then(async () => {
    const entries = await readFavorites();
    const result = update(entries);
    const temporaryFile = `${favoritesFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(entries, null, 2), 'utf8');
    await rename(temporaryFile, favoritesFile);
    return result;
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
  try {
    posts = [...posts, ...await getPatreonPosts()];
    for (const result of results) {
      const titleKeys = [result.title,result.originalTitle].map(normalizeContentTitle).filter(Boolean);
      const matchedPost = posts.find(post => [...(post.aliases || []),post.title].some(title => titleKeys.includes(normalizeContentTitle(title))));
      if (matchedPost) {
        result.reactUrl = matchedPost.url;
        result.reactPostTitle = matchedPost.title;
      }
    }
  } catch {
    for (const result of results) {
      const titleKeys = [result.title,result.originalTitle].map(normalizeContentTitle).filter(Boolean);
      const matchedPost = posts.find(post => [...(post.aliases || []),post.title].some(title => titleKeys.includes(normalizeContentTitle(title))));
      if (matchedPost) { result.reactUrl = matchedPost.url; result.reactPostTitle = matchedPost.title; }
    }
  }
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
  const titleKeys = [result.title,result.originalTitle].map(normalizeContentTitle).filter(Boolean);
  const matchedPost = posts.find(post => [...(post.aliases || []),post.title].some(title => titleKeys.includes(normalizeContentTitle(title))));
  if (matchedPost) { result.reactUrl = matchedPost.url; result.reactPostTitle = matchedPost.title; }
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
  for (const result of results) {
    const key = normalizeContentTitle(result.title);
    const matchedPost = posts.find(post => [...(post.aliases || []),post.title].some(title => normalizeContentTitle(title) === key));
    if (matchedPost) { result.reactUrl = matchedPost.url; result.reactPostTitle = matchedPost.title; }
  }
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
      id:Number(item.id),title:item.title || item.original_title || 'Título sem nome',
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
  const titleKeys = [result.title,result.originalTitle].map(normalizeContentTitle).filter(Boolean);
  const matchedPost = posts.find(post => [...(post.aliases || []),post.title].some(title => titleKeys.includes(normalizeContentTitle(title))));
  if (matchedPost) { result.reactUrl = matchedPost.url; result.reactPostTitle = matchedPost.title; }
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
    const value = JSON.parse(await readFile(youtubeVideosFile,'utf8'));
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
    try {
      const temporaryFile = `${youtubeVideosFile}.${randomUUID()}.tmp`;
      await writeFile(temporaryFile,JSON.stringify(videos,null,2),'utf8');
      await rename(temporaryFile,youtubeVideosFile);
    } catch (error) { console.error('Não foi possível salvar o cache persistente do YouTube:',error.message); }
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
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/auth/twitch/start') {
    const {clientId,redirectUri,configured} = twitchConfig();
    if (!configured) return redirect(res, '/?twitch=not-configured#inicio');
    for (const [key, value] of twitchOAuthStates) if (value.expiresAt <= Date.now()) twitchOAuthStates.delete(key);
    const state = randomBytes(32).toString('base64url');
    twitchOAuthStates.set(state, {expiresAt:Date.now() + 10 * 60 * 1000});
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
      return redirect(res, '/?twitch=cancelled#inicio');
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
      return redirect(res, '/?twitch=connected#inicio');
    } catch {
      return redirect(res, '/?twitch=failed#inicio');
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const {configured} = twitchConfig();
    const profile = await getAuthenticatedProfile(req,res);
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
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, {ok:true,mode:'consulta'});
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
    const entries = (await readRedemptions())
      .filter(entry => entry.status === 'approved')
      .sort((a,b) => Date.parse(b.approvedAt || b.createdAt) - Date.parse(a.approvedAt || a.createdAt))
      .slice(0,5)
      .map(entry => ({id:entry.id,title:entry.title,mediaType:entry.mediaType,posterUrl:entry.posterUrl,durationMinutes:entry.durationMinutes,durationLabel:entry.durationLabel,scheduledAt:entry.scheduledAt,requester:{login:entry.requester?.login || '',displayName:entry.requester?.displayName || ''}}));
    return json(res,200,{redemptions:entries});
  }
  if (req.method === 'GET' && url.pathname === '/api/community/members') {
    const members = (await readCommunityMembers())
      .sort((a,b) => (Date.parse(b.joinedAt || '') || 0) - (Date.parse(a.joinedAt || '') || 0))
      .slice(0,8)
      .map(({id,login,displayName,profileImageUrl,joinedAt}) => ({id,login,displayName,profileImageUrl,joinedAt}));
    return json(res,200,{members});
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/community/members/')) {
    const memberId = url.pathname.slice('/api/community/members/'.length);
    if (!/^\d{1,32}$/.test(memberId)) return json(res,400,{error:'Perfil inválido.'});
    const member = (await readCommunityMembers()).find(item => item.id === memberId);
    if (!member) return json(res,404,{error:'Este perfil não está disponível.'});
    await reconcileApprovedRedemptionVicoins(memberId);
    const favorites = userFavorites(await removePatreonLinkedFavorites(),memberId);
    const redemptions = (await readRedemptions())
      .filter(entry => entry.requester?.id === memberId && entry.status === 'approved')
      .sort((a,b) => Date.parse(b.approvedAt || b.createdAt) - Date.parse(a.approvedAt || a.createdAt))
      .map(({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,approvedAt}) => ({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,approvedAt}));
    const vicoinsStore = await readVicoinsStore();
    const bannerInventory = getProfileBannerInventory(vicoinsStore,memberId);
    const profile = {id:member.id,login:member.login,displayName:member.displayName,profileImageUrl:member.profileImageUrl,joinedAt:member.joinedAt,vicoins:await getVicoinsBalance(memberId),banner:bannerInventory.equipped};
    return json(res,200,{profile,favorites,redemptions});
  }
  if (req.method === 'GET' && url.pathname === '/api/account/profile') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para abrir seu perfil.'});
    await reconcileApprovedRedemptionVicoins(profile.id);
    const favorites = userFavorites(await removePatreonLinkedFavorites(),profile.id);
    const redemptions = (await readRedemptions())
      .filter(entry => entry.requester?.id === profile.id && entry.status === 'approved')
      .sort((a,b) => Date.parse(b.approvedAt || b.createdAt) - Date.parse(a.approvedAt || a.createdAt))
      .map(({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,approvedAt}) => ({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,approvedAt}));
    const vicoinsStore = await readVicoinsStore();
    const bannerInventory = getProfileBannerInventory(vicoinsStore,profile.id);
    return privateJson(res,200,{profile:{...profile,vicoins:await getVicoinsBalance(profile.id),banner:bannerInventory.equipped},favorites,redemptions});
  }
  if (req.method === 'GET' && url.pathname === '/api/account/profile-banner') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para consultar seus banners.'});
    const store = await readVicoinsStore();
    return privateJson(res,200,getProfileBannerInventory(store,profile.id));
  }
  if (req.method === 'POST' && url.pathname === '/api/shop/profile-banners') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para resgatar um banner.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const reward = profileBannerRewards.find(item => item.id === String(body.bannerId || ''));
    if (!reward) return privateJson(res,400,{error:'Banner inválido para resgate.'});
    try {
      const result = await updateVicoinsStore(store => {
        store.profileBannerInventory = store.profileBannerInventory || {};
        const inventory = store.profileBannerInventory[profile.id] || {owned:[],equipped:''};
        inventory.owned = Array.isArray(inventory.owned) ? inventory.owned : [];
        if (inventory.owned.includes(reward.id)) {
          inventory.equipped = reward.id;
          store.profileBannerInventory[profile.id] = inventory;
          return {balance:Number(store.balances[profile.id]) || 0,inventory:getProfileBannerInventory(store,profile.id),alreadyOwned:true};
        }
        const balance = applyVicoinsTransaction(store,{userId:profile.id,amount:-reward.coinCost,type:'profile-banner',referenceId:reward.id,description:`Banner de perfil: ${reward.name}`});
        inventory.owned.push(reward.id);
        inventory.equipped = reward.id;
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
    if (!['movie','tv'].includes(type) || (!manual && (!Number.isSafeInteger(id) || id <= 0))) return privateJson(res,400,{error:'Título inválido para solicitar o resgate.'});
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
      title:title.title,
      mediaType:type,
      posterUrl:title.posterUrl || '',
      durationMinutes:Number(title.durationMinutes) || null,
      durationLabel:title.durationLabel || (title.durationMinutes ? `${title.durationMinutes} min` : 'Duração não informada'),
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
  if (req.method === 'GET' && url.pathname === '/api/account/redemptions') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para ver seus resgates.'});
    const redemptions = (await readRedemptions())
      .filter(entry => entry.requester?.id === profile.id)
      .sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,status,createdAt}) => ({id,title,mediaType,posterUrl,durationMinutes,durationLabel,scheduledAt,status,createdAt}));
    return privateJson(res,200,{redemptions});
  }
  if (req.method === 'GET' && url.pathname === '/api/account/vicoins') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para consultar seus Vicoins.'});
    try { await reconcileApprovedRedemptionVicoins(profile.id); }
    catch { return privateJson(res,500,{error:'Não foi possível atualizar seu saldo de Vicoins.'}); }
    return privateJson(res,200,{balance:await getVicoinsBalance(profile.id)});
  }
  if (req.method === 'GET' && url.pathname === '/api/account/vicoins/daily') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para resgatar o bônus diário.'});
    const store = await readVicoinsStore();
    const lastClaim = Date.parse(store.dailyClaims[profile.id] || '');
    const availableAt = Number.isFinite(lastClaim) ? new Date(lastClaim + 24 * 60 * 60 * 1000).toISOString() : null;
    return privateJson(res,200,{claimAmount:20,eligible:!availableAt || Date.now() >= Date.parse(availableAt),availableAt,balance:await getVicoinsBalance(profile.id)});
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
    return privateJson(res,200,{orders,balance:await getVicoinsBalance(profile.id)});
  }
  if (req.method === 'POST' && url.pathname === '/api/shop/vicoins-orders') {
    const profile = await getAuthenticatedProfile(req,res);
    if (!profile) return privateJson(res,401,{error:'Entre com a Twitch para resgatar Vicoins na lojinha.'});
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return privateJson(res,403,{error:'Origem da solicitação inválida.'});
    let body;
    try { body = await readRequestJson(req); }
    catch (error) { return privateJson(res,400,{error:error.message}); }
    const reward = vicoinsRewards.find(item => item.id === String(body.rewardId || ''));
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
    const redemptions = (await readRedemptions()).sort((a,b) => {
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
    if (!id || !['edit','approve','reject','delete'].includes(action)) return privateJson(res,400,{error:'Ação administrativa inválida.'});
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
        if (action === 'reject') {
          if (item.status !== 'pending') throw new Error('Só é possível rejeitar pedidos pendentes.');
          item.status = 'rejected'; item.rejectedAt = new Date().toISOString(); item.rejectedBy = profile.id;
        }
        return entries.sort((a,b) => Number(b.status === 'pending') - Number(a.status === 'pending') || Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
      });
      if (!redemptions) return privateJson(res,404,{error:'Solicitação não encontrada.'});
      if (action === 'approve') await reconcileApprovedRedemptionVicoins();
      return privateJson(res,200,{redemptions});
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
      return json(res, 200, {eligible:true,...result});
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
      const favorites = await updateFavorites(entries => {
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
        return publicFavorites(entries, clientId);
      });
      return json(res, 200, {favorites});
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

http.createServer((req, res) => { handle(req, res).catch(() => json(res, 500, {error:'Erro interno.'})); }).listen(port, '0.0.0.0', () => console.log(`Vimessias Play em http://localhost:${port}`));
