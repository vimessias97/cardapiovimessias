const quoteGameDialog = document.querySelector('#quoteGameDialog');
const quoteGameOpen = document.querySelector('#quoteGameOpen');
const quoteGameClose = document.querySelector('#quoteGameClose');
const quoteGameTitle = document.querySelector('#quoteGameTitle');
const quoteGamePrompt = document.querySelector('#quoteGamePrompt');
const quoteGameOptions = document.querySelector('#quoteGameOptions');
const quoteGameProgress = document.querySelector('#quoteGameProgress');
const quoteGameScore = document.querySelector('#quoteGameScore');
const quoteGameFeedback = document.querySelector('#quoteGameFeedback');
const quoteGameRestart = document.querySelector('#quoteGameRestart');

const quoteQuestions = [
  {quote:'“Até o infinito e além!”',answer:'Buzz Lightyear',film:'Toy Story',options:['Buzz Lightyear','Woody','Andy','Rex']},
  {quote:'“Eu sou o rei do mundo!”',answer:'Jack Dawson',film:'Titanic',options:['Jack Dawson','Rose DeWitt Bukater','Cal Hockley','Thomas Andrews']},
  {quote:'“Por que tão sério?”',answer:'Coringa',film:'Batman: O Cavaleiro das Trevas',options:['Bruce Wayne','Coringa','Alfred Pennyworth','Harvey Dent']},
  {quote:'“Minha preciosa!”',answer:'Gollum',film:'O Senhor dos Anéis',options:['Gollum','Frodo Bolseiro','Gandalf','Aragorn']},
  {quote:'“Eu vejo gente morta.”',answer:'Cole Sear',film:'O Sexto Sentido',options:['Cole Sear','Malcolm Crowe','Vincent Gray','Lynn Sear']},
  {quote:'“Com grandes poderes vêm grandes responsabilidades.”',answer:'Tio Ben',film:'Homem-Aranha',options:['Tio Ben','Peter Parker','Tony Stark','Norman Osborn']},
  {quote:'“Eu voltarei.”',answer:'T-800',film:'O Exterminador do Futuro',options:['T-800','Sarah Connor','John Connor','Kyle Reese']},
  {quote:'“Você não pode lidar com a verdade!”',answer:'Coronel Jessup',film:'Questão de Honra',options:['Coronel Jessup','Tenente Kaffee','Comandante Galloway','Sam Weinberg']},
  {quote:'“Houston, temos um problema.”',answer:'Jim Lovell',film:'Apollo 13',options:['Jim Lovell','Jack Swigert','Fred Haise','Gene Kranz']},
  {quote:'“Não há lugar como nosso lar.”',answer:'Dorothy Gale',film:'O Mágico de Oz',options:['Dorothy Gale','Glinda','Espantalho','Bruxa Má do Oeste']}
];

let quoteIndex = 0;
let quoteScore = 0;
let quoteLocked = false;
let quoteAdvanceTimer;

function shuffleOptions(options) {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index],shuffled[swapIndex]] = [shuffled[swapIndex],shuffled[index]];
  }
  return shuffled;
}

function renderQuoteQuestion() {
  const question = quoteQuestions[quoteIndex];
  quoteLocked = false;
  if (!question) return finishQuoteGame();
  quoteGameProgress.textContent = `Pergunta ${quoteIndex + 1} de ${quoteQuestions.length}`;
  quoteGameScore.textContent = String(quoteScore);
  quoteGamePrompt.textContent = question.quote;
  quoteGameOptions.innerHTML = shuffleOptions(question.options).map(option => `<button type="button" class="quote-game-option" data-quote-answer="${option}">${option}</button>`).join('');
  quoteGameOptions.querySelectorAll('[data-quote-answer]').forEach(button => button.addEventListener('click', () => chooseQuoteAnswer(button,question)));
  quoteGameFeedback.className = 'emoji-game-feedback';
  quoteGameFeedback.textContent = 'Escolha uma das quatro alternativas.';
  quoteGameRestart.classList.add('hidden');
}

function chooseQuoteAnswer(button, question) {
  if (quoteLocked) return;
  quoteLocked = true;
  const correct = button.dataset.quoteAnswer === question.answer;
  quoteGameOptions.querySelectorAll('button').forEach(option => {
    option.disabled = true;
    if (option.dataset.quoteAnswer === question.answer) option.classList.add('is-correct');
  });
  if (correct) {
    quoteScore += 1;
    quoteGameScore.textContent = String(quoteScore);
    quoteGameFeedback.className = 'emoji-game-feedback is-correct';
    quoteGameFeedback.textContent = `Acertou! ${question.answer} disse a frase em ${question.film}.`;
  } else {
    button.classList.add('is-wrong');
    quoteGameFeedback.className = 'emoji-game-feedback is-wrong';
    quoteGameFeedback.textContent = `A resposta era ${question.answer}, em ${question.film}.`;
  }
  quoteAdvanceTimer = window.setTimeout(() => {
    quoteIndex += 1;
    renderQuoteQuestion();
  }, 1400);
}

function finishQuoteGame() {
  quoteGameProgress.textContent = 'Desafio concluído';
  quoteGamePrompt.textContent = '🎬';
  quoteGameOptions.replaceChildren();
  quoteGameFeedback.className = 'emoji-game-feedback is-correct';
  quoteGameFeedback.textContent = `Parabéns! Você acertou ${quoteScore} de ${quoteQuestions.length} frases.`;
  quoteGameRestart.classList.remove('hidden');
}

function startQuoteGame() {
  window.clearTimeout(quoteAdvanceTimer);
  quoteIndex = 0;
  quoteScore = 0;
  quoteGameTitle.textContent = 'Quem disse isso? (filme)';
  renderQuoteQuestion();
  if (!quoteGameDialog.open) quoteGameDialog.showModal();
}

quoteGameOpen.addEventListener('click', startQuoteGame);
quoteGameClose.addEventListener('click', () => quoteGameDialog.close());
quoteGameDialog.addEventListener('click', event => {
  if (event.target === quoteGameDialog) quoteGameDialog.close();
});
quoteGameRestart.addEventListener('click', startQuoteGame);
