const emojiGameDialog = document.querySelector('#emojiGameDialog');
const emojiGameOpenButtons = [...document.querySelectorAll('[data-emoji-game]')];
const emojiGameTitle = document.querySelector('#emojiGameTitle');
const emojiGameClose = document.querySelector('#emojiGameClose');
const emojiGuessForm = document.querySelector('#emojiGuessForm');
const emojiGuessInput = document.querySelector('#emojiGuessInput');
const emojiClues = document.querySelector('#emojiClues');
const emojiGameProgress = document.querySelector('#emojiGameProgress');
const emojiGameScore = document.querySelector('#emojiGameScore');
const emojiGameFeedback = document.querySelector('#emojiGameFeedback');
const emojiGameRestart = document.querySelector('#emojiGameRestart');

const emojiQuestionSets = {
  movies: {
    heading:'Adivinhe por emojis (filmes)',
    questions:[
      {clues:['🧙‍♂️','⚡','🏰'],title:'Harry Potter',answers:['harry potter','harry potter e a pedra filosofal','harry potter and the philosophers stone','harry potter and the sorcerers stone']},
      {clues:['🦁','👑','🌅'],title:'O Rei Leão',answers:['o rei leao','rei leao','the lion king']},
      {clues:['🚢','🧊','💔'],title:'Titanic',answers:['titanic']},
      {clues:['🦖','🏝️','🚙'],title:'Jurassic Park',answers:['jurassic park','parque dos dinossauros']},
      {clues:['🧊','👸','❄️'],title:'Frozen',answers:['frozen','frozen uma aventura congelante']},
      {clues:['🕷️','🧑','🏙️'],title:'Homem-Aranha',answers:['homem aranha','spider man','spiderman']},
      {clues:['🧸','🤠','🚀'],title:'Toy Story',answers:['toy story']},
      {clues:['🐠','🔍','🌊'],title:'Procurando Nemo',answers:['procurando nemo','finding nemo']},
      {clues:['👽','🚲','🌕'],title:'E.T. – O Extraterrestre',answers:['et','e t','et o extraterrestre','e t o extraterrestre','et the extra terrestrial','e t the extra terrestrial']},
      {clues:['🧛‍♂️','❤️','🌲'],title:'Crepúsculo',answers:['crepusculo','saga crepusculo','twilight']},
      {clues:['🏹','🔥','👧'],title:'Jogos Vorazes',answers:['jogos vorazes','the hunger games']},
      {clues:['💊','🔴','🔵'],title:'Matrix',answers:['matrix','the matrix']},
      {clues:['🧑‍🚀','🌌','🕳️'],title:'Interestelar',answers:['interestelar','interstellar']},
      {clues:['🦈','🌊','🚤'],title:'Tubarão',answers:['tubarao','jaws']},
      {clues:['🤡','🎈','🩸'],title:'It: A Coisa',answers:['it','a coisa','it a coisa','it chapter one']},
      {clues:['🪓','🚪','❄️'],title:'O Iluminado',answers:['o iluminado','the shining','shining']},
      {clues:['📼','📺','👻'],title:'O Chamado',answers:['o chamado','the ring','ring']},
      {clues:['🧸','🔪','🩸'],title:'Brinquedo Assassino',answers:['brinquedo assassino','childs play','chucky']},
      {clues:['🏚️','👻','🔔'],title:'Invocação do Mal',answers:['invocacao do mal','the conjuring']},
      {clues:['🧙‍♀️','🧹','🌕'],title:'Abracadabra',answers:['abracadabra','hocus pocus']},
      {clues:['🏴‍☠️','⚓','💀'],title:'Piratas do Caribe',answers:['piratas do caribe','pirates of the caribbean','pirates of caribbean']},
      {clues:['🦍','🏙️','🗽'],title:'King Kong',answers:['king kong']},
      {clues:['🐀','👨‍🍳','🍲'],title:'Ratatouille',answers:['ratatouille']},
      {clues:['🐼','🥋','👊'],title:'Kung Fu Panda',answers:['kung fu panda']},
      {clues:['🧜‍♀️','🦀','🌊'],title:'A Pequena Sereia',answers:['a pequena sereia','pequena sereia','the little mermaid']},
      {clues:['👠','🎃','🕛'],title:'Cinderela',answers:['cinderela','cinderella']},
      {clues:['🧑‍🚀','🌕','🇺🇸'],title:'O Primeiro Homem',answers:['o primeiro homem','first man']},
      {clues:['🏎️','💨','🏁'],title:'Velozes e Furiosos',answers:['velozes e furiosos','fast and furious','fast furious']},
      {clues:['🐺','💰','💊'],title:'O Lobo de Wall Street',answers:['o lobo de wall street','the wolf of wall street','wolf of wall street']},
      {clues:['🃏','🤡','🔫'],title:'Coringa',answers:['coringa','joker']},
      {clues:['🦇','🌃','🦹'],title:'Batman',answers:['batman','o batman']},
      {clues:['🦸‍♂️','💚','🧪'],title:'Hulk',answers:['hulk','o incrivel hulk','the incredible hulk']},
      {clues:['🦸‍♂️','🛡️','🇺🇸'],title:'Capitão América',answers:['capitao america','captain america']},
      {clues:['⚡','🔨','🌩️'],title:'Thor',answers:['thor']},
      {clues:['🐜','🦸‍♂️'],title:'Homem-Formiga',answers:['homem formiga','ant man','antman']},
      {clues:['👨‍👩‍👧‍👦','🦸'],title:'Os Incríveis',answers:['os incriveis','the incredibles','incredibles']},
      {clues:['🐉','🔥','👸'],title:'Como Treinar o Seu Dragão',answers:['como treinar o seu dragao','how to train your dragon']},
      {clues:['🐺','👧','🌲'],title:'A Menina e o Lobo',answers:['a menina e o lobo']},
      {clues:['🧑‍🚀','🤖','🌱'],title:'WALL-E',answers:['wall e','walle','wall-e']},
      {clues:['👨‍🚀','🌎','🌱'],title:'Perdido em Marte',answers:['perdido em marte','the martian','martian']},
      {clues:['🧠','💭','🎭'],title:'Divertida Mente',answers:['divertida mente','inside out']},
      {clues:['👻','🚫','🚗'],title:'Os Caça-Fantasmas',answers:['os caca fantasmas','caca fantasmas','ghostbusters']},
      {clues:['🧟‍♂️','🏬','🔫'],title:'Madrugada dos Mortos',answers:['madrugada dos mortos','dawn of the dead']},
      {clues:['🏠','👹','🚪'],title:'Sobrenatural',answers:['sobrenatural','insidious']},
      {clues:['👨‍👩‍👧‍👦','🏚️','👻'],title:'Poltergeist',answers:['poltergeist']},
      {clues:['🪞','👻','🔪'],title:'Espelhos do Medo',answers:['espelhos do medo','mirrors']},
      {clues:['🧙‍♀️','📖','🩸'],title:'A Bruxa',answers:['a bruxa','the witch','witch']},
      {clues:['🧑‍⚕️','🏥','🔪'],title:'Halloween',answers:['halloween']},
      {clues:['🏕️','🪓','💀'],title:'Sexta-Feira 13',answers:['sexta feira 13','sexta feira treze','friday the 13th','friday 13']},
      {clues:['🔥','⛓️','💀'],title:'Hellraiser',answers:['hellraiser']},
      {clues:['👨‍👩‍👧','🚪','👹'],title:'A Entidade',answers:['a entidade','the entity']},
      {clues:['👶','👹','🍼'],title:'A Profecia',answers:['a profecia','the omen','omen']},
      {clues:['🧟‍♀️','🧬','🏥'],title:'Resident Evil',answers:['resident evil','residente evil']},
      {clues:['🧑‍🚀','👾','🚀'],title:'Alien: O Oitavo Passageiro',answers:['alien','alien o oitavo passageiro','o oitavo passageiro']},
      {clues:['🤖','💀','🌎'],title:'O Exterminador do Futuro',answers:['o exterminador do futuro','terminator','the terminator']},
      {clues:['🐒','🧬','🌎'],title:'Planeta dos Macacos',answers:['planeta dos macacos','planet of the apes']},
      {clues:['🏜️','🐛','🚀'],title:'Duna',answers:['duna','dune']},
      {clues:['🧑‍🚀','🌌','🪐'],title:'Guardiões da Galáxia',answers:['guardioes da galaxia','guardioes da galáxia','guardians of the galaxy']},
      {clues:['🧙‍♂️','💍','🌋'],title:'O Senhor dos Anéis',answers:['o senhor dos aneis','senhor dos aneis','the lord of the rings']},
      {clues:['🧝‍♂️','🏹','🗡️'],title:'O Hobbit',answers:['o hobbit','hobbit','the hobbit']},
      {clues:['🐍','🏛️','⚔️'],title:'Indiana Jones',answers:['indiana jones']},
      {clues:['🏛️','⚡','🗡️'],title:'Fúria de Titãs',answers:['furia de titas','clash of the titans']},
      {clues:['🦇','🧛‍♂️','🌙'],title:'Drácula',answers:['dracula','dracula de bram stoker','bram stokers dracula']},
      {clues:['🐺','🌕','🩸'],title:'O Lobisomem',answers:['o lobisomem','lobisomem','the wolfman','wolfman']},
      {clues:['🧟‍♂️','🧠','🚶'],title:'Guerra Mundial Z',answers:['guerra mundial z','world war z']},
      {clues:['🧑‍🚀','🌊','🌍'],title:'Waterworld',answers:['waterworld','waterworld o segredo das aguas']},
      {clues:['🚗','⚡','⏰'],title:'De Volta para o Futuro',answers:['de volta para o futuro','back to the future']},
      {clues:['🧑‍🔬','🦍','🧬'],title:'A Ilha do Dr. Moreau',answers:['a ilha do dr moreau','a ilha do doutor moreau','the island of dr moreau']},
      {clues:['👨‍👦','🎈','🏠'],title:'Up: Altas Aventuras',answers:['up','up altas aventuras']},
      {clues:['🐧','🎤','❄️'],title:'Happy Feet',answers:['happy feet','happy feet o pinguim']},
      {clues:['🦊','🐰','🚓'],title:'Zootopia',answers:['zootopia','zootropolis']},
      {clues:['🐉','👑','⚔️'],title:'Shrek',answers:['shrek']},
      {clues:['🧑‍🍳','🐀','🍝'],title:'Ratatouille',answers:['ratatouille']},
      {clues:['🐻','🍯','🌳'],title:'Ursinho Pooh',answers:['ursinho pooh','pooh','winnie the pooh']},
      {clues:['👹','🚪','👧'],title:'Monstros S.A.',answers:['monstros sa','monstros s a','monstros companhia','monsters inc','monsters incorporated']},
      {clues:['🧞‍♂️','🕌','🪔'],title:'Aladdin',answers:['aladdin']},
      {clues:['🐘','🎪','🎈'],title:'Dumbo',answers:['dumbo']},
      {clues:['🐒','👑','🌴'],title:'Mogli',answers:['mogli','mowgli','mogli o menino lobo']},
      {clues:['🐺','👦','🌲'],title:'O Livro da Selva',answers:['o livro da selva','livro da selva','the jungle book']},
      {clues:['🧑‍🚀','🪐','👽'],title:'Avatar',answers:['avatar']},
      {clues:['🏹','🧝‍♀️','🌳'],title:'Valente',answers:['valente','brave']},
      {clues:['🐉','👸','🔥'],title:'Raya e o Último Dragão',answers:['raya e o ultimo dragao','raya','raya and the last dragon']},
      {clues:['🧛‍♂️','🏨','🦇'],title:'Hotel Transilvânia',answers:['hotel transilvania','hotel transylvania']},
      {clues:['🐈','👢','⚔️'],title:'Gato de Botas',answers:['gato de botas','puss in boots']},
      {clues:['🐧','🕵️‍♂️','❄️'],title:'Os Pinguins de Madagascar',answers:['os pinguins de madagascar','pinguins de madagascar','penguins of madagascar']},
      {clues:['👨‍🚀','🧑‍🚀','🌑'],title:'Gravidade',answers:['gravidade','gravity']},
      {clues:['🧑‍🔬','🧟‍♂️','🏙️'],title:'Eu Sou a Lenda',answers:['eu sou a lenda','i am legend']},
      {clues:['🏠','🌪️','👠'],title:'O Mágico de Oz',answers:['o magico de oz','mago de oz','the wizard of oz','wizard of oz']},
      {clues:['👩‍🦰','🧜‍♀️','🪞'],title:'Splash',answers:['splash']},
      {clues:['🧑‍⚖️','🔪','🩸'],title:'Psicose',answers:['psicose','psycho']},
      {clues:['🏨','🚪','🔪'],title:'O Iluminado',answers:['o iluminado','the shining','shining']},
      {clues:['🧑‍🎤','🎸','🌟'],title:'Bohemian Rhapsody',answers:['bohemian rhapsody']},
      {clues:['🎹','❤️','🌧️'],title:'La La Land',answers:['la la land']},
      {clues:['👨‍👩‍👧‍👦','🎶','🏠'],title:'Encanto',answers:['encanto']},
      {clues:['👩‍🦰','🧙‍♀️','🧹'],title:'Wicked',answers:['wicked']},
      {clues:['🚂','❄️','🎅'],title:'O Expresso Polar',answers:['o expresso polar','expresso polar','the polar express']},
      {clues:['🎄','👦','🏠'],title:'Esqueceram de Mim',answers:['esqueceram de mim','home alone']},
      {clues:['🦌','🔴','🎅'],title:'Rudolph, a Rena do Nariz Vermelho',answers:['rudolph a rena do nariz vermelho','rudolph the red nosed reindeer','rudolph the red nose reindeer']},
      {clues:['🧑‍🚀','🦍','🌌'],title:'O Planeta dos Macacos',answers:['planeta dos macacos','o planeta dos macacos','planet of the apes']},
      {clues:['🧑‍🚀','🪐','💥'],title:'Armageddon',answers:['armageddon','armagedom']}
    ]
  },
  series: {
    heading:'Adivinhe por emojis (séries)',
    questions:[
      {clues:['🚲','🧇','👾'],title:'Stranger Things',answers:['stranger things']},
      {clues:['🧟‍♂️','🚶','🌎'],title:'The Walking Dead',answers:['the walking dead','walking dead']},
      {clues:['🧪','👨‍🔬','💰'],title:'Breaking Bad',answers:['breaking bad']},
      {clues:['👑','🐉','⚔️'],title:'Game of Thrones',answers:['game of thrones','a guerra dos tronos']},
      {clues:['🏦','🎭','💰'],title:'La Casa de Papel',answers:['la casa de papel','casa de papel','money heist']},
      {clues:['🧛‍♂️','❤️','🐺'],title:'The Vampire Diaries',answers:['the vampire diaries','diarios de um vampiro','diarios do vampiro']},
      {clues:['👨‍⚕️','🏥','🩺'],title:"Grey's Anatomy",answers:['greys anatomy','grey s anatomy','anatomia de grey']},
      {clues:['🦑','🎮','🔺'],title:'Round 6',answers:['round 6','round six','squid game']},
      {clues:['🏚️','👻','🩸'],title:'A Maldição da Residência Hill',answers:['a maldicao da residencia hill','residencia hill','the haunting of hill house','hill house']},
      {clues:['🧙‍♀️','🩸','🏠'],title:'American Horror Story',answers:['american horror story','ahs']},
      {clues:['🕵️‍♂️','🔍','🏙️'],title:'Sherlock',answers:['sherlock']},
      {clues:['☕','🛋️','👫'],title:'Friends',answers:['friends']},
      {clues:['🏢','📄','😂'],title:'The Office',answers:['the office','office']},
      {clues:['👨‍🔬','👩‍🔬','🚀'],title:'The Big Bang Theory',answers:['the big bang theory','big bang theory']},
      {clues:['👨‍👩‍👦','🏡','😂'],title:'Todo Mundo Odeia o Chris',answers:['todo mundo odeia o chris','everybody hates chris']},
      {clues:['👨‍👩‍👧‍👦','🛋️','😂'],title:'Modern Family',answers:['modern family']},
      {clues:['👼','😈','⚔️'],title:'Supernatural',answers:['supernatural','sobrenatural']},
      {clues:['🐺','🌕','🩸'],title:'Teen Wolf',answers:['teen wolf','lobo adolescente']},
      {clues:['🧛‍♂️','🦇','🏰'],title:'Penny Dreadful',answers:['penny dreadful']},
      {clues:['🏘️','🚧','👹'],title:'From',answers:['from','origem']},
      {clues:['👁️','📺','👻'],title:'Archive 81',answers:['archive 81','arquivo 81']},
      {clues:['🧟‍♂️','🏫','🎒'],title:'All of Us Are Dead',answers:['all of us are dead','estamos todos mortos']},
      {clues:['🏕️','🌲','👁️'],title:'Yellowjackets',answers:['yellowjackets']},
      {clues:['👻','🏠','📹'],title:'A Maldição da Mansão Bly',answers:['a maldicao da mansao bly','mansao bly','the haunting of bly manor','bly manor']},
      {clues:['🧑‍⚕️','🧠','🔍'],title:'Dr. House',answers:['dr house','house','house md']},
      {clues:['👨‍⚖️','⚖️','🏢'],title:'Suits',answers:['suits','homens de terno']},
      {clues:['👑','🇬🇧','🏰'],title:'The Crown',answers:['the crown','crown']},
      {clues:['👮‍♂️','🚔','😂'],title:'Brooklyn Nine-Nine',answers:['brooklyn nine nine','brooklyn 99','b99']},
      {clues:['🧑‍💻','💻','🔐'],title:'Mr. Robot',answers:['mr robot','mister robot']},
      {clues:['👩‍⚕️','🏥','💉'],title:'The Good Doctor',answers:['the good doctor','o bom doutor']},
      {clues:['🧛‍♂️','🩸','🌙'],title:'True Blood',answers:['true blood','sangue verdadeiro']},
      {clues:['🧟‍♀️','🧬','🏙️'],title:'The Last of Us',answers:['the last of us','last of us']},
      {clues:['🧑‍⚖️','🔍','🚔'],title:'Law & Order',answers:['law and order','law order','lei e ordem']},
      {clues:['👨‍👩‍👧‍👦','🏡','❤️'],title:'This Is Us',answers:['this is us']},
      {clues:['🏫','🔪','👧'],title:'Pretty Little Liars',answers:['pretty little liars','pll','maldosas']},
      {clues:['👩‍🎓','💄','🏫'],title:'Gossip Girl',answers:['gossip girl']},
      {clues:['🏫','❤️','🎭'],title:'Elite',answers:['elite','elites']},
      {clues:['👩‍🎓','🏫','💔'],title:'Euphoria',answers:['euphoria']},
      {clues:['🧑‍🎓','🎸','🏫'],title:'Glee',answers:['glee']},
      {clues:['🧑‍🎓','🏫','🔍'],title:'Veronica Mars',answers:['veronica mars']},
      {clues:['👹','😈','🏙️'],title:'Lucifer',answers:['lucifer']},
      {clues:['🧙‍♂️','📚','✨'],title:'O Mundo Sombrio de Sabrina',answers:['o mundo sombrio de sabrina','sabrina','chilling adventures of sabrina']},
      {clues:['🧛‍♂️','🐺','🧙‍♀️'],title:'The Originals',answers:['the originals','os originais']},
      {clues:['🐉','👸','🔥'],title:'A Casa do Dragão',answers:['a casa do dragao','house of the dragon']},
      {clues:['🧙‍♂️','⚡','🏫'],title:'Merlin',answers:['merlin']},
      {clues:['🧚‍♀️','✨','🏫'],title:'Fate: A Saga Winx',answers:['fate a saga winx','fate the winx saga','winx']},
      {clues:['🧞‍♂️','🕌','✨'],title:'Once Upon a Time',answers:['once upon a time','era uma vez']},
      {clues:['🧙‍♀️','🧹','🔮'],title:'Charmed',answers:['charmed','feiticeiras']},
      {clues:['🧟‍♀️','🧠','🔎'],title:'iZombie',answers:['izombie','i zombie']},
      {clues:['🐉','⚔️','🏰'],title:'The Witcher',answers:['the witcher','witcher']},
      {clues:['🧛‍♂️','🏫','❤️'],title:'Legacies',answers:['legacies','legados']},
      {clues:['👁️','🌀','🏙️'],title:'The OA',answers:['the oa','oa']},
      {clues:['🧑‍🚀','🪐','👽'],title:'Doctor Who',answers:['doctor who','doutor who']},
      {clues:['🦸‍♀️','✨','🏙️'],title:'Supergirl',answers:['supergirl']},
      {clues:['🧛‍♂️','🩸','🕰️'],title:'Entrevista com o Vampiro',answers:['entrevista com o vampiro','interview with the vampire']},
      {clues:['🧑‍🚀','🌌','🛸'],title:'Star Trek',answers:['star trek']},
      {clues:['🌍','☢️','🏕️'],title:'The 100',answers:['the 100','os 100']},
      {clues:['🤖','❤️','👩'],title:'Westworld',answers:['westworld']},
      {clues:['🧬','🧪','👥'],title:'Orphan Black',answers:['orphan black']},
      {clues:['🪞','📱','😱'],title:'Black Mirror',answers:['black mirror','espelho negro']},
      {clues:['🏙️','🧠','🔮'],title:'Sense8',answers:['sense8','sense eight']},
      {clues:['🏜️','🧬','⚔️'],title:'Silo',answers:['silo']},
      {clues:['🚀','🪐','👽'],title:'Lost in Space',answers:['lost in space','perdidos no espaco']},
      {clues:['👨‍🚀','🌑','🚀'],title:'For All Mankind',answers:['for all mankind','por toda a humanidade']},
      {clues:['🧑‍🔬','🧠','⏳'],title:'Fringe',answers:['fringe']},
      {clues:['🧑‍💼','🔫','🕵️'],title:'The Blacklist',answers:['the blacklist','lista negra']},
      {clues:['🕵️‍♀️','🔍','🧩'],title:'Elementary',answers:['elementary','elementar']},
      {clues:['👮‍♀️','🚔','🧬'],title:'CSI',answers:['csi','csi investigacao criminal']},
      {clues:['🕵️‍♂️','🧠','🔪'],title:'Dexter',answers:['dexter']},
      {clues:['👮‍♂️','🌲','🩸'],title:'True Detective',answers:['true detective','detetive verdadeiro']},
      {clues:['🧑‍🚀','👽','🛸'],title:'Arquivo X',answers:['arquivo x','the x files','x files']},
      {clues:['🚒','🔥','🚑'],title:'Chicago Fire',answers:['chicago fire']},
      {clues:['🏥','🚑','🔥'],title:'Chicago Med',answers:['chicago med']},
      {clues:['🕵️‍♂️','🧥','🌃'],title:'Lupin',answers:['lupin']},
      {clues:['🧑‍💻','🕶️','🔫'],title:'Person of Interest',answers:['person of interest','pessoa de interesse']},
      {clues:['👮‍♂️','🚔','🌴'],title:'Hawaii Five-0',answers:['hawaii five 0','hawaii five o','hawaii cinco zero']},
      {clues:['👽','🏡','👨‍👩‍👧'],title:'Alf',answers:['alf']},
      {clues:['🧞‍♀️','🪔','✨'],title:'Jeannie é um Gênio',answers:['jeannie e um genio','i dream of jeannie','jeannie']},
      {clues:['👨‍👩‍👧‍👦','🏡','🎸'],title:'Três é Demais',answers:['tres e demais','tres por tres','full house']},
      {clues:['🧛‍♂️','🦇','🩸'],title:'Buffy: A Caça-Vampiros',answers:['buffy a caca vampiros','buffy the vampire slayer','buffy']},
      {clues:['👨‍👩‍👧‍👦','🏡','😂'],title:'Um Maluco no Pedaço',answers:['um maluco no pedaco','the fresh prince of bel air','fresh prince']},
      {clues:['🧑‍🔬','🦕','🏠'],title:'Família Dinossauros',answers:['familia dinossauros','dinosaurs']},
      {clues:['👨‍👩‍👧‍👦','🎭','🏡'],title:'Família Soprano',answers:['familia soprano','the sopranos','sopranos']},
      {clues:['🏥','😂','👨‍⚕️'],title:'Sob Nova Direção',answers:['sob nova direcao']},
      {clues:['🏫','👦','😂'],title:'Carrossel',answers:['carrossel']},
      {clues:['🧑‍⚖️','🔪','🏙️'],title:'Bom Dia, Verônica',answers:['bom dia veronica','good morning veronica']},
      {clues:['🏢','💼','💰'],title:'O Mecanismo',answers:['o mecanismo','the mechanism']},
      {clues:['🏫','🎒','❤️'],title:'Malhação',answers:['malhacao']},
      {clues:['👮‍♂️','🔫','🏙️'],title:'Impuros',answers:['impuros']},
      {clues:['🧑‍⚕️','🏥','❤️'],title:'Sob Pressão',answers:['sob pressao']},
      {clues:['🏚️','👻','🩸'],title:'Desalma',answers:['desalma']},
      {clues:['🏙️','💰','🕵️'],title:'DNA do Crime',answers:['dna do crime']},
      {clues:['🏝️','✈️','❓'],title:'Lost',answers:['lost']},
      {clues:['👨‍⚕️','🩺','🏥'],title:'Scrubs',answers:['scrubs']},
      {clues:['🧑‍🚀','🌌','🪐'],title:'Foundation',answers:['foundation','fundacao']},
      {clues:['👩‍👧','☕','🏡'],title:'Gilmore Girls',answers:['gilmore girls','tal mae tal filha']},
      {clues:['👨‍👦','🧠','😂'],title:'Two and a Half Men',answers:['two and a half men','dois homens e meio']},
      {clues:['👨‍👩‍👧‍👦','🏠','🎄'],title:'Malcolm in the Middle',answers:['malcolm in the middle','malcolm']},
      {clues:['👩‍❤️‍👨','🏖️','💔'],title:'O Verão que Mudou Minha Vida',answers:['o verao que mudou minha vida','the summer i turned pretty','summer i turned pretty']},
      {clues:['👑','💃','🏰'],title:'Bridgerton',answers:['bridgerton']}
    ]
  }
};

let activeGame = 'movies';
let emojiQuestions = emojiQuestionSets[activeGame].questions;
let questionIndex = 0;
let score = 0;
let locked = false;
let savedGameProgress = {};
const gameApiBases = location.protocol === 'file:' ? ['http://localhost:3002','http://localhost:3000'] : [''];
async function gameApi(path,options = {}) { let lastError; for (const base of gameApiBases) { try { const response = await fetch(`${base}${path}`,{credentials:'same-origin',cache:'no-store',...options}); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o progresso.'); return data; } catch (error) { if (!(error instanceof TypeError)) throw error; lastError = error; } } throw lastError || new Error('Não foi possível conectar ao servidor.'); }
async function loadGameProgress() { if (!window.CardapioAuth?.isAuthenticated()) return; try { savedGameProgress = (await gameApi('/api/account/game-progress')).progress || {}; } catch { savedGameProgress = {}; } }
function saveGameProgress(game,index,points) { if (!window.CardapioAuth?.isAuthenticated()) return; const value = {game,index,score:points}; gameApi('/api/account/game-progress',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(value)}).catch(error => { emojiGameFeedback.textContent = `Não foi possível sincronizar o progresso: ${error.message}`; }); }

function normalizeGuess(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim();
}

function renderQuestion() {
  const question = emojiQuestions[questionIndex];
  if (!question) return finishGame();
  locked = false;
  emojiGameProgress.textContent = `Pergunta ${questionIndex + 1} de ${emojiQuestions.length}`;
  emojiGameScore.textContent = String(score);
  emojiClues.innerHTML = question.clues.map((emoji,index) => `<span class="emoji-clue" style="--clue-index:${index}">${emoji}</span>`).join('<span class="emoji-clue-plus" aria-hidden="true">+</span>');
  emojiGuessForm.classList.remove('hidden');
  emojiGameRestart.classList.add('hidden');
  emojiGameFeedback.className = 'emoji-game-feedback';
  emojiGameFeedback.textContent = 'Acerte para avançar para a próxima pista.';
  emojiGuessInput.value = '';
}

function finishGame() {
  emojiGameProgress.textContent = 'Desafio concluído';
  emojiClues.innerHTML = '<span class="emoji-game-finish-icon" aria-hidden="true">🏆</span>';
  emojiGuessForm.classList.add('hidden');
  emojiGameFeedback.className = 'emoji-game-feedback is-correct';
  emojiGameFeedback.textContent = `Parabéns! Você acertou ${score} de ${emojiQuestions.length} títulos.`;
  emojiGameRestart.classList.remove('hidden');
}

async function startGame(game) {
  if (!window.CardapioAuth?.requireLogin('Entre com a Twitch para jogar e salvar seu progresso.')) return;
  await loadGameProgress();
  activeGame = game;
  emojiQuestions = emojiQuestionSets[game].questions;
  const saved = savedGameProgress[game];
  questionIndex = Number.isSafeInteger(saved?.index) && saved.index < emojiQuestions.length ? saved.index : 0;
  score = Number.isSafeInteger(saved?.score) && saved.score <= questionIndex ? saved.score : 0;
  emojiGameTitle.textContent = emojiQuestionSets[game].heading;
  renderQuestion();
  if (!emojiGameDialog.open) emojiGameDialog.showModal();
  setTimeout(() => emojiGuessInput.focus(), 50);
}

emojiGameOpenButtons.forEach(button => button.addEventListener('click', () => startGame(button.dataset.emojiGame)));

emojiGameClose.addEventListener('click', () => emojiGameDialog.close());
emojiGameDialog.addEventListener('click', event => {
  if (event.target === emojiGameDialog) emojiGameDialog.close();
});

emojiGuessForm.addEventListener('submit', event => {
  event.preventDefault();
  if (locked) return;
  const answer = normalizeGuess(emojiGuessInput.value);
  const question = emojiQuestions[questionIndex];
  const correct = question.answers.some(value => normalizeGuess(value) === answer);
  if (!correct) {
    emojiGameFeedback.className = 'emoji-game-feedback is-wrong';
    emojiGameFeedback.textContent = 'Ainda não! Tente outra vez.';
    emojiGuessInput.select();
    return;
  }
  locked = true;
  score += 1;
  emojiGameScore.textContent = String(score);
  emojiGameFeedback.className = 'emoji-game-feedback is-correct';
  emojiGameFeedback.textContent = `Acertou! Era ${question.title}.`;
  saveGameProgress(activeGame,questionIndex + 1,score);
  setTimeout(() => {
    questionIndex += 1;
    renderQuestion();
    if (questionIndex < emojiQuestions.length) emojiGuessInput.focus();
  }, 850);
});

emojiGameRestart.addEventListener('click', () => {
  questionIndex = 0;
  score = 0;
  saveGameProgress(activeGame,0,0);
  renderQuestion();
  emojiGuessInput.focus();
});

renderQuestion();
