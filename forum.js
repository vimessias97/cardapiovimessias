(() => {
  const page = document.querySelector('#forum');
  const topicForm = document.querySelector('#forumTopicForm');
  const loginNotice = document.querySelector('#forumLoginNotice');
  const composerUser = document.querySelector('#forumComposerUser');
  const topicList = document.querySelector('#forumTopicList');
  const pageFeedback = document.querySelector('#forumPageFeedback');
  const topicCount = document.querySelector('#forumTopicCount');
  const categoryFilters = [...document.querySelectorAll('[data-forum-category]')];
  const apiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
  const categoryLabels = {geral:'Geral',filmes:'Filmes',series:'Séries',animes:'Animes',jogos:'Jogos',outros:'Outros'};
  const maxAttachmentBytes = 4 * 1024 * 1024;
  let topics = [];
  let activeCategory = 'todos';
  let requestId = 0;

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
  }

  async function api(path,options = {}) {
    let lastError;
    for (let index = 0; index < apiBases.length; index++) {
      try {
        const response = await fetch(`${apiBases[index]}${path}`,{credentials:'same-origin',cache:'no-store',...options});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível concluir esta ação.');
        return data;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Não foi possível conectar ao servidor.');
  }

  function authorMarkup(author = {}) {
    const label = safe(author.displayName || author.login || 'Usuário Twitch');
    const avatar = author.profileImageUrl
      ? `<img src="${safe(author.profileImageUrl)}" alt="" loading="lazy">`
      : '<span class="forum-author-fallback" aria-hidden="true">✦</span>';
    return `<button type="button" class="forum-author-button" data-profile-id="${safe(author.id || '')}">${avatar}<span>${label}</span></button>`;
  }

  function attachmentMarkup(attachment) {
    if (!attachment?.url) return '';
    return `<img class="forum-post-attachment" src="${safe(attachment.url)}" alt="${safe(attachment.name || 'Imagem anexada') }" loading="lazy">`;
  }

  function commentForm(topic) {
    if (!window.CardapioAuth?.isAuthenticated()) return '<p class="forum-comment-login">Entre com a <a href="/auth/twitch/start">Twitch</a> para participar desta conversa.</p>';
    return `<form class="forum-comment-form" data-topic-id="${safe(topic.id)}"><textarea name="content" maxlength="3000" rows="2" placeholder="Escreva um comentário…" required></textarea><div class="forum-comment-actions"><label class="forum-attach-label">▧ Anexar imagem/GIF<input class="forum-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><small class="forum-attachment-name"></small><button type="submit">Comentar</button></div><div class="forum-attachment-preview" aria-live="polite"></div><p class="forum-form-feedback" aria-live="polite"></p></form>`;
  }

  function renderComments(topic) {
    const comments = Array.isArray(topic.comments) ? topic.comments : [];
    const commentsHtml = comments.length ? comments.map(comment => `<article class="forum-comment"><div>${authorMarkup(comment.author)}</div><div><div class="forum-comment-meta"><time datetime="${safe(comment.createdAt)}">${safe(formatDate(comment.createdAt))}</time></div><p class="forum-comment-text">${safe(comment.content)}</p>${attachmentMarkup(comment.attachment)}</div></article>`).join('') : '<p class="forum-comment-login">Ainda não há comentários. Comece a conversa.</p>';
    return `<section class="forum-comments"><h3 class="forum-comments-heading">Comentários · ${comments.length}</h3><div class="forum-comment-list">${commentsHtml}</div>${commentForm(topic)}</section>`;
  }

  function renderTopics() {
    const visibleTopics = topics.filter(topic => activeCategory === 'todos' || topic.category === activeCategory);
    topicCount.textContent = `${visibleTopics.length} ${visibleTopics.length === 1 ? 'tópico' : 'tópicos'}`;
    if (!visibleTopics.length) {
      topicList.innerHTML = `<div class="forum-empty">${topics.length ? 'Ainda não há tópicos nesta categoria.' : 'O fórum está começando agora. Seja a primeira pessoa a abrir uma conversa.'}</div>`;
      return;
    }
    topicList.innerHTML = visibleTopics.map(topic => {
      const comments = Array.isArray(topic.comments) ? topic.comments : [];
      return `<article class="forum-topic-card"><div class="forum-topic-content"><div class="forum-topic-meta">${authorMarkup(topic.author)}<span class="forum-category-tag">${safe(categoryLabels[topic.category] || 'Geral')}</span><time class="forum-topic-time" datetime="${safe(topic.createdAt)}">${safe(formatDate(topic.createdAt))}</time></div><h2 class="forum-topic-title">${safe(topic.title)}</h2><p class="forum-post-text">${safe(topic.content)}</p>${attachmentMarkup(topic.attachment)}<div class="forum-topic-stats"><span aria-hidden="true">☷</span>${comments.length} ${comments.length === 1 ? 'comentário' : 'comentários'}<span>·</span>Atividade ${safe(formatDate(topic.updatedAt || topic.createdAt))}</div></div>${renderComments(topic)}</article>`;
    }).join('');
  }

  function syncAuth() {
    const user = window.CardapioAuth?.getUser();
    const authenticated = Boolean(user);
    topicForm.classList.toggle('hidden',!authenticated);
    loginNotice.classList.toggle('hidden',authenticated);
    composerUser.textContent = authenticated ? `Publicando como ${user.displayName || user.login}` : '';
    renderTopics();
  }

  async function load() {
    const currentRequest = ++requestId;
    pageFeedback.textContent = 'Carregando discussões…';
    try {
      const data = await api('/api/forum/topics');
      if (currentRequest !== requestId) return;
      topics = Array.isArray(data.topics) ? data.topics : [];
      pageFeedback.textContent = '';
      renderTopics();
    } catch (error) {
      if (currentRequest !== requestId) return;
      pageFeedback.textContent = error.message || 'Não foi possível carregar o fórum.';
    }
  }

  function fileToAttachment(file) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        if (comma < 0) return reject(new Error('Não consegui ler a imagem selecionada.'));
        resolve({name:file.name,type:file.type,data:result.slice(comma + 1)});
      };
      reader.onerror = () => reject(new Error('Não consegui ler a imagem selecionada.'));
      reader.readAsDataURL(file);
    });
  }

  async function prepareAttachment(form) {
    const file = form.querySelector('.forum-file-input')?.files?.[0];
    if (!file) return null;
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) throw new Error('Use uma imagem JPG, PNG, WebP ou GIF.');
    if (file.size > maxAttachmentBytes) throw new Error('A imagem ou GIF deve ter até 4 MB.');
    return fileToAttachment(file);
  }

  function setFormFeedback(form,message) {
    const target = form.querySelector('.forum-form-feedback');
    if (target) target.textContent = message;
  }

  function clearAttachment(form) {
    const input = form.querySelector('.forum-file-input');
    const name = form.querySelector('.forum-attachment-name');
    const preview = form.querySelector('.forum-attachment-preview');
    if (input) input.value = '';
    if (name) name.textContent = '';
    if (preview) {
      const image = preview.querySelector('img');
      if (image?.dataset.objectUrl) URL.revokeObjectURL(image.dataset.objectUrl);
      preview.replaceChildren();
    }
  }

  topicForm.addEventListener('submit',async event => {
    event.preventDefault();
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para criar um tópico.')) return;
    const button = topicForm.querySelector('[type=submit]');
    button.disabled = true;
    setFormFeedback(topicForm,'Publicando tópico…');
    try {
      const attachment = await prepareAttachment(topicForm);
      const data = await api('/api/forum/topics',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:topicForm.elements.title.value,category:topicForm.elements.category.value,content:topicForm.elements.content.value,attachment})});
      topicForm.reset();
      clearAttachment(topicForm);
      setFormFeedback(topicForm,'Tópico publicado.');
      await load();
      document.querySelector(`[data-topic-id="${CSS.escape(data.topic.id)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
    } catch (error) { setFormFeedback(topicForm,error.message || 'Não foi possível publicar o tópico.'); }
    finally { button.disabled = false; }
  });

  topicList.addEventListener('submit',async event => {
    const form = event.target.closest('.forum-comment-form');
    if (!form) return;
    event.preventDefault();
    if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para comentar.')) return;
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    setFormFeedback(form,'Publicando comentário…');
    try {
      const attachment = await prepareAttachment(form);
      await api(`/api/forum/topics/${encodeURIComponent(form.dataset.topicId)}/comments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:form.elements.content.value,attachment})});
      await load();
    } catch (error) { setFormFeedback(form,error.message || 'Não foi possível publicar o comentário.'); button.disabled = false; }
  });

  document.addEventListener('change',event => {
    const input = event.target.closest('.forum-file-input');
    if (!input) return;
    const form = input.closest('form');
    const file = input.files?.[0];
    const name = form.querySelector('.forum-attachment-name');
    const preview = form.querySelector('.forum-attachment-preview');
    const feedback = form.querySelector('.forum-form-feedback');
    const oldImage = preview.querySelector('img');
    if (oldImage?.dataset.objectUrl) URL.revokeObjectURL(oldImage.dataset.objectUrl);
    preview.replaceChildren();
    if (!file) { name.textContent = ''; return; }
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) || file.size > maxAttachmentBytes) {
      input.value = '';
      name.textContent = '';
      if (feedback) feedback.textContent = file.size > maxAttachmentBytes ? 'A imagem ou GIF deve ter até 4 MB.' : 'Use uma imagem JPG, PNG, WebP ou GIF.';
      return;
    }
    if (feedback) feedback.textContent = '';
    name.textContent = file.name;
    const objectUrl = URL.createObjectURL(file);
    const image = document.createElement('img');
    image.src = objectUrl;
    image.alt = 'Prévia do anexo';
    image.dataset.objectUrl = objectUrl;
    preview.append(image);
  });

  topicList.addEventListener('click',event => {
    const author = event.target.closest('[data-profile-id]');
    if (author?.dataset.profileId) window.CardapioCommunityProfiles?.open(author.dataset.profileId);
  });
  categoryFilters.forEach(button => button.addEventListener('click',() => {
    activeCategory = button.dataset.forumCategory;
    categoryFilters.forEach(item => item.classList.toggle('active',item === button));
    renderTopics();
  }));
  window.addEventListener('cardapio:auth-updated',syncAuth);
  window.CardapioForum = {load};
  syncAuth();
  load();
})();
