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
  let editingTopicId = '';
  let editingCommentId = '';

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

  function canManage(author) {
    const user = window.CardapioAuth?.getUser();
    return Boolean(user && (user.role === 'admin' || String(user.id) === String(author?.id || '')));
  }

  function attachmentMarkup(attachment) {
    if (!attachment?.url) return '';
    return `<img class="forum-post-attachment" src="${safe(attachment.url)}" alt="${safe(attachment.name || 'Imagem anexada') }" loading="lazy">`;
  }

  function commentForm(topic) {
    if (!window.CardapioAuth?.isAuthenticated()) return '<p class="forum-comment-login">Entre com a <a href="/auth/twitch/start">Twitch</a> para participar desta conversa.</p>';
    return `<form class="forum-comment-form" data-topic-id="${safe(topic.id)}"><textarea name="content" maxlength="3000" rows="2" placeholder="Escreva um comentário…" required></textarea><div class="forum-comment-actions"><label class="forum-attach-label">▧ Anexar imagem/GIF<input class="forum-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><small class="forum-attachment-name"></small><button type="submit">Comentar</button></div><div class="forum-attachment-preview" aria-live="polite"></div><p class="forum-form-feedback" aria-live="polite"></p></form>`;
  }

  function renderComment(topic,comment) {
    const editing = editingCommentId === comment.id;
    const actions = canManage(comment.author) && !editing ? `<div class="forum-item-actions"><button type="button" data-forum-edit-comment="${safe(comment.id)}" data-topic-id="${safe(topic.id)}">Editar</button><button type="button" class="is-danger" data-forum-delete-comment="${safe(comment.id)}" data-topic-id="${safe(topic.id)}">Apagar</button></div>` : '';
    const editForm = editing ? `<form class="forum-edit-comment-form" data-comment-id="${safe(comment.id)}" data-topic-id="${safe(topic.id)}"><textarea name="content" maxlength="3000" rows="3" required>${safe(comment.content)}</textarea>${comment.attachment?.url ? '<label class="forum-remove-attachment"><input type="checkbox" name="removeAttachment"> Remover imagem/GIF anexado</label>' : ''}<div class="forum-edit-actions"><button type="submit">Salvar edição</button><button type="button" class="is-secondary" data-forum-cancel-edit>Cancelar</button></div><p class="forum-form-feedback" aria-live="polite"></p></form>` : `<p class="forum-comment-text">${safe(comment.content)}</p>`;
    return `<article class="forum-comment"><div>${authorMarkup(comment.author)}</div><div class="forum-comment-main"><div class="forum-comment-meta"><time datetime="${safe(comment.createdAt)}">${safe(formatDate(comment.createdAt))}</time>${comment.editedAt ? '<small>editado</small>' : ''}${actions}</div>${editForm}${!editing ? attachmentMarkup(comment.attachment) : ''}</div></article>`;
  }

  function renderComments(topic) {
    const comments = Array.isArray(topic.comments) ? topic.comments : [];
    const commentsHtml = comments.length ? comments.map(comment => renderComment(topic,comment)).join('') : '<p class="forum-comment-login">Ainda não há comentários. Comece a conversa.</p>';
    return `<details class="forum-comments" open><summary class="forum-comments-heading">Comentários <span>${comments.length}</span><span class="forum-comments-chevron" aria-hidden="true">⌄</span></summary><div class="forum-comments-box"><div class="forum-comment-list">${commentsHtml}</div>${commentForm(topic)}</div></details>`;
  }

  function renderTopicEditor(topic) {
    return `<form class="forum-edit-topic-form" data-topic-id="${safe(topic.id)}"><label>Título<input type="text" name="title" minlength="3" maxlength="120" value="${safe(topic.title)}" required></label><label>Categoria<select name="category">${Object.entries(categoryLabels).map(([value,label]) => `<option value="${value}" ${topic.category === value ? 'selected' : ''}>${safe(label)}</option>`).join('')}</select></label><label>Mensagem<textarea name="content" minlength="3" maxlength="6000" rows="5" required>${safe(topic.content)}</textarea></label>${topic.attachment?.url ? '<label class="forum-remove-attachment"><input type="checkbox" name="removeAttachment"> Remover imagem/GIF anexado</label>' : ''}<div class="forum-edit-actions"><button type="submit">Salvar edição</button><button type="button" class="is-secondary" data-forum-cancel-edit>Cancelar</button></div><p class="forum-form-feedback" aria-live="polite"></p></form>`;
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
      const editing = editingTopicId === topic.id;
      const actions = canManage(topic.author) && !editing ? `<div class="forum-item-actions"><button type="button" data-forum-edit-topic="${safe(topic.id)}">Editar</button><button type="button" class="is-danger" data-forum-delete-topic="${safe(topic.id)}">Apagar</button></div>` : '';
      const content = editing ? renderTopicEditor(topic) : `<h2 class="forum-topic-title">${safe(topic.title)}</h2><p class="forum-post-text">${safe(topic.content)}</p>${attachmentMarkup(topic.attachment)}`;
      const likeCount = Number(topic.likeCount) || 0;
      const liked = Boolean(topic.likedByMe);
      const shareUrl = new URL(location.href);
      shareUrl.searchParams.set('forumTopic',topic.id);
      shareUrl.hash = 'forum';
      const postActions = `<div class="forum-post-actions"><button type="button" class="forum-like-button${liked ? ' is-liked' : ''}" data-forum-like="${safe(topic.id)}" aria-pressed="${liked}" aria-label="${liked ? 'Remover curtida' : 'Curtir'} (${likeCount})"><span aria-hidden="true">${liked ? '♥' : '♡'}</span> Curtir <strong>${likeCount}</strong></button><button type="button" class="forum-share-button" data-forum-share="${safe(topic.id)}" data-share-url="${safe(shareUrl.href)}"><span aria-hidden="true">↗</span> Compartilhar</button></div>`;
      return `<article class="forum-topic-card" data-topic-id="${safe(topic.id)}"><div class="forum-topic-content"><div class="forum-topic-meta">${authorMarkup(topic.author)}<span class="forum-category-tag">${safe(categoryLabels[topic.category] || 'Geral')}</span><time class="forum-topic-time" datetime="${safe(topic.createdAt)}">${safe(formatDate(topic.createdAt))}</time>${topic.editedAt ? '<small class="forum-edited-tag">editado</small>' : ''}${actions}</div>${content}<div class="forum-topic-stats"><span aria-hidden="true">☷</span>${comments.length} ${comments.length === 1 ? 'comentário' : 'comentários'}<span>·</span>Atividade ${safe(formatDate(topic.updatedAt || topic.createdAt))}</div>${postActions}</div>${renderComments(topic)}</article>`;
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
      const sharedTopicId = new URL(location.href).searchParams.get('forumTopic');
      if (sharedTopicId && location.hash === '#forum') setTimeout(() => document.querySelector(`[data-topic-id="${CSS.escape(sharedTopicId)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),250);
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
    const topicEditForm = event.target.closest('.forum-edit-topic-form');
    if (topicEditForm) {
      event.preventDefault();
      const button = topicEditForm.querySelector('[type=submit]');
      button.disabled = true;
      setFormFeedback(topicEditForm,'Salvando edição…');
      try {
        await api(`/api/forum/topics/${encodeURIComponent(topicEditForm.dataset.topicId)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({title:topicEditForm.elements.title.value,category:topicEditForm.elements.category.value,content:topicEditForm.elements.content.value,removeAttachment:Boolean(topicEditForm.elements.removeAttachment?.checked)})});
        editingTopicId = '';
        await load();
      } catch (error) { setFormFeedback(topicEditForm,error.message || 'Não foi possível editar o tópico.'); button.disabled = false; }
      return;
    }
    const commentEditForm = event.target.closest('.forum-edit-comment-form');
    if (commentEditForm) {
      event.preventDefault();
      const button = commentEditForm.querySelector('[type=submit]');
      button.disabled = true;
      setFormFeedback(commentEditForm,'Salvando edição…');
      try {
        await api(`/api/forum/topics/${encodeURIComponent(commentEditForm.dataset.topicId)}/comments/${encodeURIComponent(commentEditForm.dataset.commentId)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({content:commentEditForm.elements.content.value,removeAttachment:Boolean(commentEditForm.elements.removeAttachment?.checked)})});
        editingCommentId = '';
        await load();
      } catch (error) { setFormFeedback(commentEditForm,error.message || 'Não foi possível editar o comentário.'); button.disabled = false; }
      return;
    }
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

  topicList.addEventListener('click',async event => {
    const likeButton = event.target.closest('[data-forum-like]');
    if (likeButton) {
      if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para curtir tópicos.')) return;
      likeButton.disabled = true;
      try { await api(`/api/forum/topics/${encodeURIComponent(likeButton.dataset.forumLike)}/like`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}); await load(); }
      catch (error) { pageFeedback.textContent = error.message || 'Não foi possível registrar a curtida.'; likeButton.disabled = false; }
      return;
    }
    const shareButton = event.target.closest('[data-forum-share]');
    if (shareButton) {
      const shareData = {title:'Fórum ViMessias Play',text:'Veja esta conversa no fórum ViMessias Play',url:shareButton.dataset.shareUrl};
      try {
        if (navigator.share) await navigator.share(shareData);
        else { await navigator.clipboard.writeText(shareData.url); pageFeedback.textContent = 'Link do tópico copiado para compartilhar.'; }
      } catch (error) {
        if (error.name === 'AbortError') return;
        try { await navigator.clipboard.writeText(shareData.url); pageFeedback.textContent = 'Link do tópico copiado para compartilhar.'; }
        catch { pageFeedback.textContent = `Copie este link para compartilhar: ${shareData.url}`; }
      }
      return;
    }
    const cancel = event.target.closest('[data-forum-cancel-edit]');
    if (cancel) {
      editingTopicId = '';
      editingCommentId = '';
      renderTopics();
      return;
    }
    const editTopic = event.target.closest('[data-forum-edit-topic]');
    if (editTopic) {
      editingTopicId = editTopic.dataset.forumEditTopic;
      editingCommentId = '';
      renderTopics();
      topicList.querySelector(`[data-topic-id="${CSS.escape(editingTopicId)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    const editComment = event.target.closest('[data-forum-edit-comment]');
    if (editComment) {
      editingTopicId = '';
      editingCommentId = editComment.dataset.forumEditComment;
      renderTopics();
      topicList.querySelector(`[data-comment-id="${CSS.escape(editingCommentId)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    const deleteTopic = event.target.closest('[data-forum-delete-topic]');
    if (deleteTopic) {
      const id = deleteTopic.dataset.forumDeleteTopic;
      if (!window.confirm('Apagar este tópico e todos os comentários? Esta ação não pode ser desfeita.')) return;
      deleteTopic.disabled = true;
      try {
        await api(`/api/forum/topics/${encodeURIComponent(id)}`,{method:'DELETE'});
        pageFeedback.textContent = 'Tópico apagado.';
        await load();
      } catch (error) { pageFeedback.textContent = error.message || 'Não foi possível apagar o tópico.'; deleteTopic.disabled = false; }
      return;
    }
    const deleteComment = event.target.closest('[data-forum-delete-comment]');
    if (deleteComment) {
      const {topicId,forumDeleteComment:commentId} = deleteComment.dataset;
      if (!window.confirm('Apagar este comentário? Esta ação não pode ser desfeita.')) return;
      deleteComment.disabled = true;
      try {
        await api(`/api/forum/topics/${encodeURIComponent(topicId)}/comments/${encodeURIComponent(commentId)}`,{method:'DELETE'});
        pageFeedback.textContent = 'Comentário apagado.';
        await load();
      } catch (error) { pageFeedback.textContent = error.message || 'Não foi possível apagar o comentário.'; deleteComment.disabled = false; }
      return;
    }
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
