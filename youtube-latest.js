const youtubeLatestList = document.querySelector('#youtubeLatestList');
const youtubeLatestFeedback = document.querySelector('#youtubeLatestFeedback');
const youtubeApiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
const youtubeCacheKey = 'vimessias-play.youtube-latest.v1';

function youtubeSafe(value = '') {
  return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function youtubeNormalize(videos) {
  if (!Array.isArray(videos)) return [];
  return videos.map(video => {
    const id = String(video?.id || '');
    const title = String(video?.title || '').trim();
    if (!/^[\w-]{11}$/.test(id) || !title) return null;
    return {id,title,publishedAt:String(video.publishedAt || ''),thumbnailUrl:`https://i.ytimg.com/vi/${id}/mqdefault.jpg`,url:`https://www.youtube.com/watch?v=${id}`};
  }).filter(Boolean).slice(0,5);
}

function youtubeReadCache() {
  try { return youtubeNormalize(JSON.parse(localStorage.getItem(youtubeCacheKey) || '[]')); }
  catch { return []; }
}

function youtubeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
}

function youtubeRender(videos,message = '') {
  const safeVideos = youtubeNormalize(videos);
  if (safeVideos.length) {
    youtubeLatestList.innerHTML = safeVideos.map(video => `<li class="youtube-latest-item"><a href="${video.url}" target="_blank" rel="noopener noreferrer" aria-label="Assistir ${youtubeSafe(video.title)} no YouTube"><img src="${video.thumbnailUrl}" alt="" loading="lazy"><span class="youtube-latest-copy"><strong>${youtubeSafe(video.title)}</strong><small>${youtubeDate(video.publishedAt)}</small></span><span class="youtube-latest-play" aria-hidden="true">▶</span></a></li>`).join('');
  }
  youtubeLatestFeedback.textContent = message;
}

async function loadYoutubeLatest() {
  const cachedVideos = youtubeReadCache();
  if (cachedVideos.length) youtubeRender(cachedVideos,'Carregando os vídeos mais recentes…');
  else youtubeLatestFeedback.textContent = 'Carregando vídeos…';
  try {
    let response;
    let data;
    for (let index = 0; index < youtubeApiBases.length; index++) {
      try {
        const candidate = await fetch(`${youtubeApiBases[index]}/api/youtube/latest`,{cache:'no-store'});
        if (candidate.status === 404 && index < youtubeApiBases.length-1) continue;
        response = candidate;
        data = await candidate.json();
        break;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
    if (!response) throw new Error('Não foi possível conectar ao servidor de vídeos.');
    if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar os vídeos recentes.');
    const videos = youtubeNormalize(data.videos);
    if (!videos.length) {
      if (cachedVideos.length) youtubeRender(cachedVideos,'Mostrando os últimos vídeos salvos; o canal não retornou uma lista nova.');
      else youtubeLatestFeedback.textContent = 'Nenhum vídeo público encontrado no feed do canal.';
      return;
    }
    try { localStorage.setItem(youtubeCacheKey,JSON.stringify(videos)); } catch {}
    youtubeRender(videos,'');
  } catch (error) {
    const fallbackVideos = cachedVideos.length ? cachedVideos : youtubeReadCache();
    if (fallbackVideos.length) youtubeRender(fallbackVideos,'Mostrando os últimos vídeos salvos; não foi possível atualizar o canal agora.');
    else youtubeLatestFeedback.textContent = error.message || 'Não foi possível carregar os vídeos do canal.';
  }
}

loadYoutubeLatest();
document.addEventListener('visibilitychange',() => { if (!document.hidden) loadYoutubeLatest(); });
