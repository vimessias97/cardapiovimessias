const youtubeLatestList = document.querySelector('#youtubeLatestList');
const youtubeLatestFeedback = document.querySelector('#youtubeLatestFeedback');
const youtubeApiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];

function youtubeSafe(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function youtubeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
}

async function loadYoutubeLatest() {
  try {
    let response;
    let data;
    for (let index = 0; index < youtubeApiBases.length; index++) {
      try {
        const candidate = await fetch(`${youtubeApiBases[index]}/api/youtube/latest`,{cache:'no-store'});
        if (candidate.status === 404 && index < youtubeApiBases.length - 1) continue;
        response = candidate;
        data = await candidate.json();
        break;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
    if (!response) throw new Error('Não conectou ao servidor local. Para carregar os vídeos, abra http://localhost:3002 ou http://localhost:3000 e mantenha o servidor Node ligado.');
    if (response.status === 404) throw new Error('A rota de vídeos não está ativa neste servidor. Reinicie o servidor Node e recarregue a página.');
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os vídeos recentes.');
    const videos = Array.isArray(data.videos) ? data.videos : [];
    if (!videos.length) {
      youtubeLatestList.replaceChildren();
      youtubeLatestFeedback.textContent = 'Nenhum vídeo público encontrado no feed do canal.';
      return;
    }
    youtubeLatestFeedback.textContent = '';
    youtubeLatestList.innerHTML = videos.map(video => `<li class="youtube-latest-item"><a href="${youtubeSafe(video.url)}" target="_blank" rel="noopener noreferrer" aria-label="Assistir ${youtubeSafe(video.title)} no YouTube"><img src="${youtubeSafe(video.thumbnailUrl)}" alt="" loading="lazy"><span class="youtube-latest-copy"><strong>${youtubeSafe(video.title)}</strong><small>${youtubeDate(video.publishedAt)}</small></span><span class="youtube-latest-play" aria-hidden="true">▶</span></a></li>`).join('');
  } catch (error) {
    youtubeLatestList.replaceChildren();
    youtubeLatestFeedback.textContent = error.message || 'Não foi possível carregar os vídeos do canal.';
  }
}

loadYoutubeLatest();
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadYoutubeLatest(); });
