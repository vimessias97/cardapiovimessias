const trooveGameDialog = document.querySelector('#trooveGameDialog');
const trooveGameFrame = document.querySelector('#trooveGameFrame');
const trooveGameOpen = document.querySelector('#trooveGameOpen');
const trooveGameClose = document.querySelector('#trooveGameClose');
const trooveGameUrl = 'https://www.mrtroove.com/pt-br/quiz/48e03f';

trooveGameOpen?.addEventListener('click', () => {
  if (!trooveGameDialog || !trooveGameFrame) return;
  trooveGameFrame.src = trooveGameUrl;
  trooveGameDialog.showModal();
});

trooveGameClose?.addEventListener('click', () => trooveGameDialog?.close());

trooveGameDialog?.addEventListener('close', () => {
  if (trooveGameFrame) trooveGameFrame.src = 'about:blank';
});

trooveGameDialog?.addEventListener('click', event => {
  if (event.target === trooveGameDialog) trooveGameDialog.close();
});
