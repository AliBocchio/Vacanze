/* ============================================================
   VACATION FAMILY TRACKER — app.js
   Firebase Realtime Database edition — aggiornamenti in tempo reale
   ============================================================ */

'use strict';

// ── Modalità: Firebase se configurato, altrimenti localStorage locale ────
// Quando firebase-config.js ha ancora i valori placeholder (INSERISCI_...)
// l'app funziona in modalità locale. Appena metti la config vera, passa
// automaticamente alla modalità cloud con sync real-time.
const FIREBASE_READY = (
  typeof firebaseConfig !== 'undefined' &&
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith('INSERISCI')
);

let db = null;
if (FIREBASE_READY) {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
  } catch (e) {
    console.warn('Firebase init fallito, uso localStorage:', e);
  }
}

// ── localStorage — usato SOLO per l'identità del dispositivo ─
const IDENTITY_KEY = 'vacanze_identity_2026';

// ── Summer range ──────────────────────────────────────────────
// Parte fisso dal 26 giugno 2026
const SUMMER_END = new Date(2026, 8, 30);

function getSummerStart() {
  return new Date(2026, 5, 26); // 26 giugno 2026 — fisso
}

const MONTHS    = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                   'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DAY_NAMES = ['Do','Lu','Ma','Me','Gi','Ve','Sa'];

// ── Family members ────────────────────────────────────────────
const FAMILY_MEMBERS = [
  'Alice','Pietro','Lucilla','Roberto',
  'Nonna Adele','Nonno Peppino','Chiara','Andrea',
  'Lucia','Cristina','Diego','Zia Silvia',
];

// ── Fixed travel pairs ────────────────────────────────────────────
const TRAVEL_PAIRS = [
  { members: ['Lucilla',     'Roberto']       },
  { members: ['Diego',       'Cristina']      },
  { members: ['Nonna Adele', 'Nonno Peppino'] },
];

// ── Color pool ────────────────────────────────────────────────
const COLOR_POOL = [
  { hex: '#FF6B6B', label: 'Corallo'  },
  { hex: '#FF8C69', label: 'Salmone'  },
  { hex: '#FD79A8', label: 'Rosa'     },
  { hex: '#F0A500', label: 'Ambra'    },
  { hex: '#FFEAA7', label: 'Giallo'   },
  { hex: '#7ED56F', label: 'Verde'    },
  { hex: '#96CEB4', label: 'Salvia'   },
  { hex: '#4ECDC4', label: 'Turchese' },
  { hex: '#45B7D1', label: 'Azzurro'  },
  { hex: '#74B9FF', label: 'Blu'      },
  { hex: '#A29BFE', label: 'Lavanda'  },
  { hex: '#DDA0DD', label: 'Prugna'   },
  { hex: '#E17055', label: 'Arancio'  },
  { hex: '#55EFC4', label: 'Menta'    },
  { hex: '#6C5CE7', label: 'Viola'    },
  { hex: '#FDCB6E', label: 'Oro'      },
];

// ── App state ─────────────────────────────────────────────────
let vacations     = [];
let colorRegistry = {};
let currentUser   = null;
let editingId     = null;
let pendingSave   = null;

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateIT(date) {
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000) + 1;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function isWeekend(date) { return date.getDay() === 0 || date.getDay() === 6; }

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── Destination emoji lookup ──────────────────────────────────
const DEST_EMOJI_MAP = [
  { keys: ['spagna','barcellona','barcelona','madrid','siviglia','ibiza','maiorca','menorca','valencia','malaga','gran canaria','tenerife','canarie','marbella'], e: '🇪🇸' },
  { keys: ['francia','parigi','paris','nizza','marsiglia','lione','bordeaux','provenza','normandia','bretagna','corsica','strasburgo','montpellier','biarritz'], e: '🇫🇷' },
  { keys: ['grecia','santorini','mykonos','creta','rodi','corfù','corfu','zante','atene','lefkada','kefalonia','skiathos','skopelos','naxos','paros','milos','sifnos'], e: '🇬🇷' },
  { keys: ['portogallo','lisbona','porto','algarve','faro','sintra','funchal','madeira','azzorre'], e: '🇵🇹' },
  { keys: ['germania','berlino','monaco','amburgo','colonia','francoforte','dresda','heidelberg','norimberga'], e: '🇩🇪' },
  { keys: ['austria','vienna','salzburg','salisburgo','innsbruck','hallstatt','graz'], e: '🇦🇹' },
  { keys: ['svizzera','zurigo','ginevra','berna','interlaken','zermatt','verbier','lugano','locarno','davos','st moritz','engadina'], e: '🇨🇭' },
  { keys: ['inghilterra','londra','london','uk','regno unito','scozia','edimburgo','edinburgh','glasgow','manchester','oxford','cambridge'], e: '🇬🇧' },
  { keys: ['irlanda','dublino','cork','galway','killarney'], e: '🇮🇪' },
  { keys: ['olanda','amsterdam','paesi bassi','rotterdam','utrecht','delft','maastricht'], e: '🇳🇱' },
  { keys: ['belgio','bruxelles','bruges','gand','anversa'], e: '🇧🇪' },
  { keys: ['usa','stati uniti','new york','los angeles','miami','chicago','boston','san francisco','las vegas','orlando','hawaii','california','florida','nashville'], e: '🇺🇸' },
  { keys: ['canada','toronto','vancouver','montreal','quebec','banff','niagara'], e: '🇨🇦' },
  { keys: ['messico','cancun','tulum','playa del carmen','guadalajara','oaxaca','cabo san lucas'], e: '🇲🇽' },
  { keys: ['turchia','istanbul','ankara','bodrum','alanya','antalya','cappadocia','izmir','marmaris','fethiye'], e: '🇹🇷' },
  { keys: ['egitto','cairo','sharm','hurghada','luxor','marsa alam'], e: '🇪🇬' },
  { keys: ['marocco','marrakech','casablanca','fes','agadir','essaouira','chefchaouen','tangeri'], e: '🇲🇦' },
  { keys: ['giappone','tokyo','kyoto','osaka','nara','hiroshima','okinawa'], e: '🇯🇵' },
  { keys: ['tailandia','bangkok','phuket','chiang mai','koh samui','koh tao','krabi'], e: '🇹🇭' },
  { keys: ['bali','indonesia','jakarta','lombok','komodo'], e: '🇮🇩' },
  { keys: ['maldive','maldives'], e: '🇲🇻' },
  { keys: ['cuba','havana','avana','varadero'], e: '🇨🇺' },
  { keys: ['croazia','dubrovnik','spalato','split','hvar','zara','zadar','istria','rovinj','pula'], e: '🇭🇷' },
  { keys: ['slovenia','lubiana','bled','piran'], e: '🇸🇮' },
  { keys: ['albania','tirana','saranda','vlora','berat'], e: '🇦🇱' },
  { keys: ['montenegro','budva','kotor','podgorica','tivat'], e: '🇲🇪' },
  { keys: ['norvegia','oslo','bergen','fjord','fiordi','lofoten','tromso'], e: '🇳🇴' },
  { keys: ['svezia','stoccolma','goteborg','malmö'], e: '🇸🇪' },
  { keys: ['danimarca','copenaghen','copenhagen','aarhus'], e: '🇩🇰' },
  { keys: ['finlandia','helsinki','lapponia','rovaniemi','tampere'], e: '🇫🇮' },
  { keys: ['islanda','reykjavik','geysir'], e: '🇮🇸' },
  { keys: ['ungheria','budapest','eger'], e: '🇭🇺' },
  { keys: ['praga','repubblica ceca','cechia','brno','cesky krumlov'], e: '🇨🇿' },
  { keys: ['polonia','varsavia','cracovia','gdansk','wroclaw'], e: '🇵🇱' },
  { keys: ['romania','bucarest','brasov','sibiu','transylvania'], e: '🇷🇴' },
  { keys: ['dubai','emirati','abu dhabi'], e: '🇦🇪' },
  { keys: ['israele','tel aviv','gerusalemme','eilat'], e: '🇮🇱' },
  { keys: ['india','mumbai','delhi','goa','rajasthan','kerala','jaipur','agra','taj mahal'], e: '🇮🇳' },
  { keys: ['vietnam','hanoi','ho chi minh','hoi an','halong'], e: '🇻🇳' },
  { keys: ['cambogia','phnom penh','siem reap','angkor'], e: '🇰🇭' },
  { keys: ['singapore'], e: '🇸🇬' },
  { keys: ['australia','sydney','melbourne','perth','brisbane','gold coast'], e: '🇦🇺' },
  { keys: ['nuova zelanda','auckland','wellington','queenstown'], e: '🇳🇿' },
  { keys: ['malta','valletta','gozo'], e: '🇲🇹' },
  { keys: ['cipro','paphos','limassol','nicosia','ayia napa'], e: '🇨🇾' },
  { keys: ['tunisia','tunisi','djerba','sousse','hammamet'], e: '🇹🇳' },
  { keys: ['brasile','rio','são paulo','salvador','fortaleza','florianopolis'], e: '🇧🇷' },
  { keys: ['argentina','buenos aires','patagonia','mendoza','bariloche'], e: '🇦🇷' },
  { keys: ['peru','lima','cusco','machu picchu'], e: '🇵🇪' },
  { keys: ['kenya','nairobi','mombasa','safari','masai mara'], e: '🇰🇪' },
  { keys: ['tanzania','zanzibar','serengeti','kilimanjaro'], e: '🇹🇿' },
  { keys: ['sudafrica','cape town','johannesburg','kruger','città del capo'], e: '🇿🇦' },
  { keys: ['russia','mosca','san pietroburgo'], e: '🇷🇺' },
  { keys: ['cina','pechino','shanghai','hong kong'], e: '🇨🇳' },
  // ── Regioni / luoghi italiani ─────────────────────────────────
  { keys: ['sicilia','palermo','catania','taormina','agrigento','siracusa','trapani','cefalù','eolie','stromboli','vulcano','pantelleria','ragusa','modica','noto'], e: '🌋' },
  { keys: ['sardegna','cagliari','olbia','alghero','costa smeralda','porto cervo','porto rotondo','stintino','villasimius','chia'], e: '🏝️' },
  { keys: ['costiera amalfitana','positano','ravello','amalfi','capri','ischia','procida','vietri'], e: '⛵' },
  { keys: ['puglia','bari','lecce','alberobello','polignano','gallipoli','otranto','salento','ostuni','trulli','matera'], e: '🫒' },
  { keys: ['toscana','firenze','siena','pisa','lucca','volterra','san gimignano','chianti','montalcino','arezzo','elba'], e: '🌻' },
  { keys: ['cinque terre','portofino','liguria','genova','sanremo','rapallo','sestri levante'], e: '⛵' },
  { keys: ['venezia','venice','murano','burano','lido','mestre'], e: '🚣' },
  { keys: ['lago di como','lago di garda','lago maggiore','bellagio','riva del garda','bardolino','sirmione','stresa','varenna'], e: '🛶' },
  { keys: ['umbria','assisi','perugia','orvieto','gubbio','spoleto'], e: '🏡' },
  { keys: ['basilicata','matera','maratea'], e: '🪨' },
  { keys: ['calabria','tropea','pizzo','reggio calabria','scilla'], e: '🏖️' },
  { keys: ['campania','napoli','naples','pompei','ercolano','caserta','paestum','cilento'], e: '🏛️' },
  { keys: ['roma','rome','colosseo','vaticano','tivoli'], e: '🏛️' },
  // ── Montagna / sci ───────────────────────────────────────────
  { keys: ['sestriere','cervinia','courmayeur','cortina','val gardena','bormio','livigno','madonna di campiglio','andalo','canazei','arabba','selva','ortisei'], e: '⛷️' },
  { keys: ['dolomiti','alto adige','val badia','val di fassa','val di fiemme','alpe di siusi','merano','bolzano','bressanone','brunico'], e: '⛷️' },
  { keys: ['montagna','rifugio','trekking','escursion','hiking','alpi','appennin','monte rosa','gran paradiso'], e: '🏔️' },
  // ── Mare / natura generica ───────────────────────────────────
  { keys: ['spiaggia','riviera','adriatico','tirrenico','ionio','marina','lido','beach','resort balneare','terme','agriturismo'], e: '🏖️' },
  { keys: ['lago','lake'], e: '🏞️' },
  { keys: ['campagna','collina','villa'], e: '🌾' },
  { keys: ['crociera','cruise','nave','traghetto'], e: '🛳️' },
];

function getDestinationEmoji(destination) {
  if (!destination || !destination.trim()) return '📍';
  const lower = destination.toLowerCase();
  for (const entry of DEST_EMOJI_MAP) {
    for (const kw of entry.keys) {
      if (lower.includes(kw)) return entry.e;
    }
  }
  return '📍';
}

// ── Travel pair helpers ───────────────────────────────────────
function getTravelPartner(name) {
  for (const pair of TRAVEL_PAIRS) {
    if (pair.members.includes(name)) return pair.members.find(m => m !== name);
  }
  return null;
}

function getTravelPair(name) {
  return TRAVEL_PAIRS.find(p => p.members.includes(name)) || null;
}

// ─────────────────────────────────────────────────────────────
//  COLOR REGISTRY
//  → Firebase se online, localStorage se offline/non configurato
// ─────────────────────────────────────────────────────────────

function getPersonColor(name) {
  return colorRegistry[name] || '#8b949e';
}

function saveRegistry() {
  if (db) {
    db.ref('colorRegistry').set(colorRegistry);
  } else {
    localStorage.setItem('vacanze_registry_2026', JSON.stringify(colorRegistry));
  }
}

// ─────────────────────────────────────────────────────────────
//  IDENTITY  (localStorage — solo questo dispositivo)
// ─────────────────────────────────────────────────────────────

function loadIdentity() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (raw) currentUser = JSON.parse(raw);
  } catch { currentUser = null; }
}

function saveIdentity(name, color) {
  currentUser = { name, color };
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(currentUser));
}

// ─────────────────────────────────────────────────────────────
//  VACATIONS
//  → Firebase se online, localStorage se offline/non configurato
// ─────────────────────────────────────────────────────────────

function saveData() {
  if (db) {
    // Firebase: converti array in oggetto { id: vacation }
    const obj = {};
    for (const v of vacations) obj[v.id] = v;
    db.ref('vacations').set(obj);
  } else {
    localStorage.setItem('vacanze_famiglia_2026', JSON.stringify(vacations));
  }
}

// ─────────────────────────────────────────────────────────────
//  APP INIT
// ─────────────────────────────────────────────────────────────

function initApp() {
  loadIdentity();

  if (db) {
    // ── MODALITÀ FIREBASE: real-time sync su tutti i dispositivi ──
    //
    // colorRegistry listener:
    // Scatta immediatamente con i dati attuali, poi ogni volta che
    // un familiare si registra e sceglie il colore.
    // → Se Lucilla apre l'app e Roberto non si è ancora registrato,
    //   il suo dot è grigio. Quando Roberto sceglie il suo colore
    //   questo listener scatta su TUTTI i dispositivi connessi
    //   e render() aggiorna il Gantt con il nuovo colore. ✅
    db.ref('colorRegistry').on('value', (snapshot) => {
      colorRegistry = snapshot.val() || {};
      // Aggiorna i chip colore se la registrazione è aperta
      const regOverlay = document.getElementById('regOverlay');
      if (regOverlay.style.display === 'flex' && regSelectedName && !colorRegistry[regSelectedName]) {
        buildRegColorGrid();
      }
      // Aggiorna il Gantt su tutti i dispositivi connessi
      if (currentUser) render();
    });

    // vacations listener:
    // Scatta ogni volta che un familiare aggiunge/modifica/elimina un periodo
    db.ref('vacations').on('value', (snapshot) => {
      const data = snapshot.val();
      vacations = data ? Object.values(data) : [];
      if (currentUser) render();
    });

  } else {
    // ── MODALITÀ LOCALE: localStorage (nessuna sync tra dispositivi) ──
    showFirebaseBanner();
    try { vacations     = JSON.parse(localStorage.getItem('vacanze_famiglia_2026') || '[]'); } catch { vacations = []; }
    try { colorRegistry = JSON.parse(localStorage.getItem('vacanze_registry_2026')  || '{}'); } catch { colorRegistry = {}; }
  }

  currentUser ? showMainApp() : showRegistration();
}

// Banner che avvisa che Firebase non è ancora configurato
function showFirebaseBanner() {
  const banner = document.createElement('div');
  banner.id = 'firebaseBanner';
  banner.innerHTML = `
    <span>⚠️ Modalità locale — i dati non sono condivisi tra dispositivi.<br>
    Configura <code>firebase-config.js</code> per abilitare la sync in tempo reale.</span>`;
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:9999;
    background:linear-gradient(135deg,#f0a500,#e17055);
    color:#fff;padding:.6rem 1rem;font-size:.8rem;
    text-align:center;line-height:1.5;
    box-shadow:0 2px 12px rgba(0,0,0,.3);`;
  document.body.prepend(banner);
}

// ─────────────────────────────────────────────────────────────
//  REGISTRATION SCREEN
// ─────────────────────────────────────────────────────────────

let regSelectedName  = null;
let regSelectedColor = null;

function showRegistration() {
  document.getElementById('regOverlay').style.display = 'flex';
  buildRegNameGrid();
}

function buildRegNameGrid() {
  const grid = document.getElementById('regNameGrid');
  grid.innerHTML = '';
  regSelectedName  = null;
  regSelectedColor = null;
  document.getElementById('regEnterBtn').disabled = true;
  document.getElementById('regColorSection').style.display   = 'none';
  document.getElementById('regAlreadySection').style.display = 'none';

  for (const name of FAMILY_MEMBERS) {
    const chip = document.createElement('div');
    chip.className = 'reg-name-chip';
    chip.dataset.name = name;
    const existingColor = colorRegistry[name];
    chip.innerHTML = existingColor
      ? `<span class="reg-chip-dot" style="background:${existingColor};"></span>${escapeHtml(name)}`
      : escapeHtml(name);
    chip.addEventListener('click', () => onRegNameSelect(name));
    grid.appendChild(chip);
  }
}

function onRegNameSelect(name) {
  regSelectedName  = name;
  regSelectedColor = null;

  document.querySelectorAll('.reg-name-chip').forEach(c => {
    c.classList.toggle('selected', c.dataset.name === name);
  });

  const alreadySection = document.getElementById('regAlreadySection');
  const colorSection   = document.getElementById('regColorSection');
  const enterBtn       = document.getElementById('regEnterBtn');

  if (colorRegistry[name]) {
    regSelectedColor = colorRegistry[name];
    colorSection.style.display   = 'none';
    alreadySection.style.display = 'flex';
    document.getElementById('regAlreadyDot').style.background = colorRegistry[name];
    document.getElementById('regAlreadyText').textContent = 'Il tuo colore è già stato salvato!';
    enterBtn.disabled = false;
  } else {
    alreadySection.style.display = 'none';
    colorSection.style.display   = 'flex';
    buildRegColorGrid();
    enterBtn.disabled = true;
  }
}

function buildRegColorGrid() {
  const grid = document.getElementById('regColorGrid');
  grid.innerHTML = '';

  const takenColors = new Set(
    Object.entries(colorRegistry)
      .filter(([n]) => n !== regSelectedName)
      .map(([, c]) => c)
  );

  for (const col of COLOR_POOL) {
    const swatch = document.createElement('div');
    swatch.className = 'reg-color-swatch';
    swatch.style.background = col.hex;
    swatch.title = col.label;
    swatch.dataset.hex = col.hex;

    if (takenColors.has(col.hex)) {
      swatch.classList.add('taken');
    } else {
      swatch.addEventListener('click', () => onRegColorSelect(col.hex));
    }
    grid.appendChild(swatch);
  }
}

function onRegColorSelect(hex) {
  regSelectedColor = hex;
  document.querySelectorAll('.reg-color-swatch:not(.taken)').forEach(s => {
    s.classList.toggle('selected', s.dataset.hex === hex);
  });
  document.getElementById('regEnterBtn').disabled = false;
}

document.getElementById('regEnterBtn').addEventListener('click', () => {
  if (!regSelectedName || !regSelectedColor) return;
  // Salva colore su Firebase (visibile a tutti)
  colorRegistry[regSelectedName] = regSelectedColor;
  saveRegistry();
  // Salva identità su localStorage (solo questo dispositivo)
  saveIdentity(regSelectedName, regSelectedColor);

  const overlay = document.getElementById('regOverlay');
  overlay.classList.add('hiding');
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('hiding');
    showMainApp();
  }, 450);
});

// ─────────────────────────────────────────────────────────────
//  MAIN APP + USER BADGE
// ─────────────────────────────────────────────────────────────

function showMainApp() {
  if (currentUser) {
    document.getElementById('currentUserBadge').style.display = 'flex';
    document.getElementById('currentUserDot').style.background = currentUser.color;
    document.getElementById('currentUserName').textContent = currentUser.name;
  }
  render();
}

document.getElementById('switchUserBtn').addEventListener('click', () => {
  currentUser = null;
  localStorage.removeItem(IDENTITY_KEY);
  document.getElementById('currentUserBadge').style.display = 'none';
  buildRegNameGrid();
  document.getElementById('regOverlay').style.display = 'flex';
});

// ─────────────────────────────────────────────────────────────
//  DAY LIST & GROUPING
// ─────────────────────────────────────────────────────────────

function buildDayList() {
  const days  = [];
  let cur = new Date(getSummerStart()); // parte da oggi
  while (cur <= SUMMER_END) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  return days;
}

// Restituisce true se TUTTI i 12 familiari hanno una vacanza in quel giorno.
// Usato per mostrare ⚠️ nella colonna data.
function isEveryoneAway(day) {
  // Considera solo i membri che hanno inserito almeno una vacanza;
  // se un membro non ha inserito nulla, è considerato "a casa" → non scatta l'alert.
  const membersWithData = new Set(vacations.map(v => v.name));
  if (membersWithData.size < FAMILY_MEMBERS.length) return false; // qualcuno non ha ancora dati
  return FAMILY_MEMBERS.every(name => findVacationForDay(name, day) !== null);
}

function groupByMonth(days) {
  const groups = [];
  let current = null;
  for (const day of days) {
    const m = day.getMonth();
    if (!current || current.month !== m) {
      current = { month: m, label: MONTHS[m], days: [] };
      groups.push(current);
    }
    current.days.push(day);
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────
//  PERSON / PAIR LIST
// ─────────────────────────────────────────────────────────────

function getPersonList() {
  const namesWithVacations = new Set(vacations.map(v => v.name));
  const result       = [];
  const seenPairKeys = new Set();

  for (const name of FAMILY_MEMBERS) {
    const pair = getTravelPair(name);

    if (pair) {
      const anyInPair = pair.members.some(m => namesWithVacations.has(m));
      if (!anyInPair) continue;
      const pairKey = pair.members.slice().sort().join('|');
      if (seenPairKeys.has(pairKey)) continue;
      seenPairKeys.add(pairKey);
      result.push({
        type:          'pair',
        members:       pair.members,
        label:         pair.members.join(' & '),
        color:         getPersonColor(pair.members[0]),
        color2:        getPersonColor(pair.members[1]),
        registered0:   !!colorRegistry[pair.members[0]],
        registered1:   !!colorRegistry[pair.members[1]],
      });
    } else {
      if (!namesWithVacations.has(name)) continue;
      result.push({
        type:       'single',
        name,
        label:      name,
        color:      getPersonColor(name),
        registered: !!colorRegistry[name],
      });
    }
  }
  return result;
}

function findVacationForDay(name, day) {
  for (const v of vacations) {
    if (v.name !== name) continue;
    const s = parseLocalDate(v.startDate);
    const e = parseLocalDate(v.endDate);
    if (day >= s && day <= e) return v;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  RENDER GANTT
// ─────────────────────────────────────────────────────────────

function renderGantt() {
  const wrapper     = document.getElementById('ganttWrapper');
  const emptyEl     = document.getElementById('ganttEmpty');
  const allDays     = buildDayList();
  const today       = new Date();
  const monthGroups = groupByMonth(allDays);
  const columns     = getPersonList();

  if (columns.length === 0) {
    wrapper.innerHTML = '';
    wrapper.appendChild(emptyEl);
    emptyEl.style.display = 'flex';
    return;
  }
  emptyEl.style.display = 'none';

  const table = document.createElement('table');
  table.className = 'gantt-table';
  table.setAttribute('role', 'grid');
  table.setAttribute('aria-label', 'Calendario vacanze');

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // Header row
  const headerRow = document.createElement('tr');
  headerRow.className = 'gantt-header-row';

  const cornerTh = document.createElement('th');
  cornerTh.className = 'gantt-date-col gantt-corner';
  cornerTh.textContent = 'Data';
  headerRow.appendChild(cornerTh);

  for (const col of columns) {
    const th = document.createElement('th');
    th.className = 'gantt-person-header';
    if (col.type === 'pair') {
      // Show which members are registered vs pending
      const dot0 = col.registered0
        ? `<span class="person-header-dot" style="background:${col.color};"></span>`
        : `<span class="person-header-dot unregistered" title="Non ancora registrato"></span>`;
      const dot1 = col.registered1
        ? `<span class="person-header-dot" style="background:${col.color2};"></span>`
        : `<span class="person-header-dot unregistered" title="Non ancora registrato"></span>`;
      th.innerHTML = `
        <div class="person-header-inner">
          <div class="pair-dots">${dot0}${dot1}</div>
          <span class="person-header-name">${escapeHtml(col.label)}</span>
        </div>`;
    } else {
      const dot = col.registered
        ? `<span class="person-header-dot" style="background:${col.color};"></span>`
        : `<span class="person-header-dot unregistered" title="Non ancora registrato"></span>`;
      th.innerHTML = `
        <div class="person-header-inner">
          ${dot}
          <span class="person-header-name ${col.registered ? '' : 'unregistered-name'}">${escapeHtml(col.label)}</span>
        </div>`;
    }
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  // Body
  for (const grp of monthGroups) {
    const monthTr = document.createElement('tr');
    monthTr.className = 'gantt-month-sep-row';
    const monthTd = document.createElement('td');
    monthTd.colSpan = columns.length + 1;
    monthTd.className = 'gantt-month-cell';
    monthTd.textContent = `☀️  ${grp.label}`;
    monthTr.appendChild(monthTd);
    tbody.appendChild(monthTr);

    for (const day of grp.days) {
      const tr = document.createElement('tr');
      tr.className = 'gantt-day-row';
      const isToday = isSameDay(day, today);
      const isWE    = isWeekend(day);
      if (isToday) tr.classList.add('is-today');
      if (isWE)    tr.classList.add('is-weekend');

      const dateTd = document.createElement('td');
      dateTd.className = 'gantt-date-col gantt-date-cell';
      const allAway = isEveryoneAway(day);
      dateTd.innerHTML = `
        <span class="date-num">${day.getDate()}</span>
        <span class="date-name">${DAY_NAMES[day.getDay()]}</span>${
          allAway ? '<span class="all-away-icon" title="Tutti in vacanza!">⚠️</span>' : ''
        }`;
      tr.appendChild(dateTd);

      for (const col of columns) {
        const td = document.createElement('td');
        td.className = 'gantt-person-cell';

        if (col.type === 'pair') {
          let foundVac = null;
          for (const member of col.members) {
            foundVac = findVacationForDay(member, day);
            if (foundVac) break;
          }
          if (foundVac) {
            td.classList.add('away-cell', 'pair-cell');
            const pairEmoji = getDestinationEmoji(foundVac.destination);
            const startD  = parseLocalDate(foundVac.startDate);
            const endD    = parseLocalDate(foundVac.endDate);
            const isStart = isSameDay(day, startD);
            const isEnd   = isSameDay(day, endD);

            if (foundVac.provisional) {
              // Provvisorio: sfondo al 20%, bordo tratteggiato
              td.classList.add('provisional-cell');
              td.style.background = `linear-gradient(135deg, ${hexToRgba(col.color, 0.18)} 50%, ${hexToRgba(col.color2, 0.18)} 50%)`;
              td.style.outline = `1.5px dashed ${hexToRgba(col.color, 0.5)}`;
              td.style.outlineOffset = '-2px';
            } else {
              td.style.background = `linear-gradient(135deg, ${hexToRgba(col.color, 0.7)} 50%, ${hexToRgba(col.color2, 0.7)} 50%)`;
            }

            if (isStart && isEnd)  td.style.borderRadius = '8px';
            else if (isStart)      td.style.borderRadius = '8px 8px 0 0';
            else if (isEnd)        td.style.borderRadius = '0 0 8px 8px';
            if (isStart) {
              const ind = document.createElement('span');
              ind.className = 'dest-emoji-indicator';
              ind.textContent = foundVac.provisional ? '⏳' : pairEmoji;
              td.appendChild(ind);
            }
            td.dataset.tooltipName   = col.label;
            td.dataset.tooltipColor  = col.color;
            td.dataset.tooltipColor2 = col.color2;
            td.dataset.tooltipDest   = `${pairEmoji} ${foundVac.destination}${foundVac.provisional ? ' (provvisorio)' : ''}`;
            td.dataset.tooltipStart  = foundVac.startDate;
            td.dataset.tooltipEnd    = foundVac.endDate;
            td.dataset.tooltipPair   = 'true';
            td.classList.add('has-tooltip');
          }
        } else {
          const vac = findVacationForDay(col.name, day);
          if (vac) {
            td.classList.add('away-cell');
            const destEmoji = getDestinationEmoji(vac.destination);
            const startD  = parseLocalDate(vac.startDate);
            const endD    = parseLocalDate(vac.endDate);
            const isStart = isSameDay(day, startD);
            const isEnd   = isSameDay(day, endD);

            if (vac.provisional) {
              td.classList.add('provisional-cell');
              td.style.background = hexToRgba(col.color, 0.18);
              td.style.outline = `1.5px dashed ${hexToRgba(col.color, 0.5)}`;
              td.style.outlineOffset = '-2px';
            } else {
              td.style.background = hexToRgba(col.color, 0.65);
            }

            if (isStart && isEnd)  td.style.borderRadius = '8px';
            else if (isStart)      td.style.borderRadius = '8px 8px 0 0';
            else if (isEnd)        td.style.borderRadius = '0 0 8px 8px';
            if (isStart) {
              const ind = document.createElement('span');
              ind.className = 'dest-emoji-indicator';
              ind.textContent = vac.provisional ? '⏳' : destEmoji;
              td.appendChild(ind);
            }
            td.dataset.tooltipName  = col.name;
            td.dataset.tooltipColor = col.color;
            td.dataset.tooltipDest  = `${destEmoji} ${vac.destination}${vac.provisional ? ' (provvisorio)' : ''}`;
            td.dataset.tooltipStart = vac.startDate;
            td.dataset.tooltipEnd   = vac.endDate;
            td.classList.add('has-tooltip');
          }
        }

        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  wrapper.innerHTML = '';
  wrapper.appendChild(table);

  // Attach tap-tooltip to all away cells after render
  wrapper.querySelectorAll('.has-tooltip').forEach(cell => {
    cell.addEventListener('click', onCellTap);
  });
}

// ─────────────────────────────────────────────────────────────
//  TAP-TOOLTIP  (funziona sia su mobile che desktop)
// ─────────────────────────────────────────────────────────────

function closeCellTooltip() {
  const t = document.getElementById('cellTooltip');
  if (t) t.remove();
}

function onCellTap(e) {
  e.stopPropagation();
  closeCellTooltip();

  const d        = e.currentTarget.dataset;
  const startD   = parseLocalDate(d.tooltipStart);
  const endD     = parseLocalDate(d.tooltipEnd);
  const duration = daysBetween(startD, endD);

  const dotsHtml = d.tooltipPair === 'true'
    ? `<span class="cell-tooltip-dot" style="background:${d.tooltipColor};"></span>
       <span class="cell-tooltip-dot" style="background:${d.tooltipColor2};"></span>`
    : `<span class="cell-tooltip-dot" style="background:${d.tooltipColor};"></span>`;

  const tip = document.createElement('div');
  tip.id = 'cellTooltip';
  tip.className = 'cell-tooltip';
  tip.innerHTML = `
    <div class="cell-tooltip-name">${dotsHtml} ${escapeHtml(d.tooltipName)}</div>
    <div class="cell-tooltip-dest">${escapeHtml(d.tooltipDest)}</div>
    <div class="cell-tooltip-dates">${formatDateIT(startD)} → ${formatDateIT(endD)}</div>
    <div class="cell-tooltip-duration">${duration} ${duration === 1 ? 'giorno' : 'giorni'}</div>
  `;
  document.body.appendChild(tip);

  // Position near tapped cell, keep inside viewport
  const rect = e.currentTarget.getBoundingClientRect();
  const tw   = tip.offsetWidth  || 190;
  const th   = tip.offsetHeight || 110;
  let left   = rect.left + rect.width / 2 - tw / 2;
  let top    = rect.bottom + 8;
  left = Math.max(8, Math.min(left, window.innerWidth  - tw - 8));
  if (top + th > window.innerHeight - 8) top = rect.top - th - 8;
  tip.style.left = `${left}px`;
  tip.style.top  = `${top}px`;

  // Close on next tap anywhere
  setTimeout(() => {
    document.addEventListener('click', closeCellTooltip, { once: true });
  }, 50);
}



// ─────────────────────────────────────────────────────────────
//  RENDER CARDS
// ─────────────────────────────────────────────────────────────

function renderCards() {
  const grid  = document.getElementById('cardsGrid');
  const badge = document.getElementById('countBadge');

  badge.textContent = vacations.length;
  grid.innerHTML    = '';

  if (vacations.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;padding:1rem 0;">Nessun periodo inserito.</p>`;
    return;
  }

  const sorted = [...vacations].sort((a, b) => a.startDate.localeCompare(b.startDate));

  for (const v of sorted) {
    const startD   = parseLocalDate(v.startDate);
    const endD     = parseLocalDate(v.endDate);
    const duration = daysBetween(startD, endD);
    const color    = getPersonColor(v.name);
    const emoji    = getDestinationEmoji(v.destination);

    let companionBadge = '';
    const partner = getTravelPartner(v.name);
    if (partner && v.withPartner) {
      companionBadge = `<div class="card-companions">✈️ con ${escapeHtml(partner)}</div>`;
    }

    const provisionalBadge = v.provisional
      ? `<div class="provisional-badge">⏳ Provvisorio</div>`
      : '';

    const card = document.createElement('div');
    card.className = 'vacation-card' + (v.provisional ? ' provisional' : '');
    card.id = `card-${v.id}`;

    // Barra laterale colorata: al 40% se provvisorio
    const barAlpha = v.provisional ? 0.35 : 1;
    const barBg    = v.provisional
      ? `repeating-linear-gradient(-45deg, ${hexToRgba(color,0.4)}, ${hexToRgba(color,0.4)} 4px, ${hexToRgba(color,0.15)} 4px, ${hexToRgba(color,0.15)} 8px)`
      : color;

    card.innerHTML = `
      <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${barBg};border-radius:4px 0 0 4px;"></div>
      <div class="card-header">
        <div class="card-name">
          <span class="card-dot" style="background:${color};"></span>
          ${escapeHtml(v.name)}
        </div>
        <div class="card-actions">
          <button class="btn btn-edit" onclick="openEditModal('${v.id}')" aria-label="Modifica">✏️</button>
          <button class="btn btn-danger" onclick="deleteVacation('${v.id}')" aria-label="Elimina">🗑</button>
        </div>
      </div>
      <div class="card-dest">${emoji} ${escapeHtml(v.destination)}</div>
      <div class="card-dates">${formatDateIT(startD)} → ${formatDateIT(endD)}</div>
      ${companionBadge}
      ${provisionalBadge}
      <div class="card-duration">${duration} ${duration === 1 ? 'giorno' : 'giorni'}</div>
    `;
    grid.appendChild(card);
  }
}

function render() { renderGantt(); renderCards(); }

// ─────────────────────────────────────────────────────────────
//  VACATION SAVE
// ─────────────────────────────────────────────────────────────

function commitSave(name, dest, start, end, withPartner, provisional) {
  const color   = getPersonColor(name);
  const partner = getTravelPartner(name);
  const groupId = uid();

  vacations.push({
    id: uid(), groupId, name,
    destination: dest, startDate: start, endDate: end,
    color, withPartner: withPartner && !!partner,
    provisional: !!provisional,
  });

  if (withPartner && partner) {
    vacations.push({
      id: uid(), groupId, name: partner,
      destination: dest, startDate: start, endDate: end,
      color: getPersonColor(partner), withPartner: true,
      provisional: !!provisional,
    });
    showToast(provisional ? `⏳ Aggiunti (provvisorio): ${name} e ${partner}` : `🌴 Aggiunti: ${name} e ${partner}!`);
  } else {
    showToast(provisional ? '⏳ Periodo provvisorio aggiunto!' : '🌴 Periodo aggiunto!');
  }

  saveData();
  closeModal();
}

// ─────────────────────────────────────────────────────────────
//  PAIR CONFIRMATION
// ─────────────────────────────────────────────────────────────

const pairConfirmOverlay = document.getElementById('pairConfirmOverlay');

function showPairConfirm(data) {
  pendingSave = data;
  const partner      = getTravelPartner(data.name);
  const partnerColor = getPersonColor(partner);

  document.getElementById('pairConfirmMsg').innerHTML =
    `Confermi che <strong>${escapeHtml(data.name)}</strong> sarà in viaggio insieme a
     <span class="pair-confirm-badge" style="background:${hexToRgba(partnerColor,0.2)};border-color:${partnerColor};color:${partnerColor};">
       <span style="width:8px;height:8px;border-radius:50%;background:${partnerColor};display:inline-block;flex-shrink:0;"></span>
       ${escapeHtml(partner)}
     </span>?`;

  pairConfirmOverlay.classList.add('open');
}

document.getElementById('pairConfirmYesBtn').addEventListener('click', () => {
  if (!pendingSave) return;
  pairConfirmOverlay.classList.remove('open');
  commitSave(pendingSave.name, pendingSave.dest, pendingSave.start, pendingSave.end, true, pendingSave.provisional);
  pendingSave = null;
});

document.getElementById('pairConfirmNoBtn').addEventListener('click', () => {
  if (!pendingSave) return;
  pairConfirmOverlay.classList.remove('open');
  commitSave(pendingSave.name, pendingSave.dest, pendingSave.start, pendingSave.end, false, pendingSave.provisional);
  pendingSave = null;
});

// ─────────────────────────────────────────────────────────────
//  MODAL
// ─────────────────────────────────────────────────────────────

const backdrop   = document.getElementById('modalBackdrop');
const modalTitle = document.getElementById('modalTitle');
const form       = document.getElementById('vacationForm');

function openModal(title = '✏️ Aggiungi Periodo di Vacanza') {
  modalTitle.textContent = title;
  backdrop.classList.add('open');
  document.getElementById('personName').focus();
}

function closeModal() {
  backdrop.classList.remove('open');
  form.reset();
  clearErrors();
  editingId = null;
  document.getElementById('editId').value = '';
  document.getElementById('destEmojiPreview').textContent = '📍';
  document.getElementById('provisionalCheck').checked = false;
}

function openEditModal(id) {
  const v = vacations.find(x => x.id === id);
  if (!v) return;
  editingId = id;
  document.getElementById('editId').value      = id;
  document.getElementById('personName').value  = v.name;
  document.getElementById('destination').value = v.destination;
  document.getElementById('startDate').value   = v.startDate;
  document.getElementById('endDate').value     = v.endDate;
  document.getElementById('provisionalCheck').checked = !!v.provisional;
  document.getElementById('destEmojiPreview').textContent = getDestinationEmoji(v.destination);
  openModal('✏️ Modifica Periodo di Vacanza');
}
window.openEditModal = openEditModal;

document.getElementById('openModalBtn').addEventListener('click', () => {
  editingId = null;
  form.reset();
  clearErrors();
  document.getElementById('destEmojiPreview').textContent = '📍';
  if (currentUser) document.getElementById('personName').value = currentUser.name;
  openModal('✏️ Aggiungi Periodo di Vacanza');
});

// Live emoji preview
document.getElementById('destination').addEventListener('input', () => {
  const val      = document.getElementById('destination').value;
  const el       = document.getElementById('destEmojiPreview');
  const newEmoji = getDestinationEmoji(val);
  if (el.textContent !== newEmoji) {
    el.textContent = newEmoji;
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
    setTimeout(() => el.classList.remove('bounce'), 300);
  }
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); pairConfirmOverlay.classList.remove('open'); }
});

// ─────────────────────────────────────────────────────────────
//  VALIDATION
// ─────────────────────────────────────────────────────────────

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => el.classList.remove('visible'));
  document.querySelectorAll('input, select').forEach(el => el.classList.remove('error'));
}

function showError(inputId, errorId) {
  document.getElementById(inputId).classList.add('error');
  document.getElementById(errorId).classList.add('visible');
}

function validateForm() {
  clearErrors();
  let valid = true;
  const name  = document.getElementById('personName').value;
  const dest  = document.getElementById('destination').value.trim();
  const start = document.getElementById('startDate').value;
  const end   = document.getElementById('endDate').value;

  if (!name)  { showError('personName', 'nameError');  valid = false; }
  if (!dest)  { showError('destination', 'destError'); valid = false; }
  if (!start) { showError('startDate', 'startError');  valid = false; }
  if (!end)   { showError('endDate', 'endError');      valid = false; }
  if (start && end && end < start) {
    showError('endDate', 'endError');
    document.getElementById('endError').textContent = 'La data di ritorno deve essere dopo la partenza';
    valid = false;
  }
  return valid;
}

// ─────────────────────────────────────────────────────────────
//  FORM SUBMIT
// ─────────────────────────────────────────────────────────────

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateForm()) return;

  const name        = document.getElementById('personName').value;
  const dest        = document.getElementById('destination').value.trim();
  const start       = document.getElementById('startDate').value;
  const end         = document.getElementById('endDate').value;
  const id          = document.getElementById('editId').value;
  const provisional = document.getElementById('provisionalCheck').checked;
  const color       = getPersonColor(name);

  if (id) {
    // Modifica esistente
    const idx = vacations.findIndex(v => v.id === id);
    if (idx !== -1) {
      vacations[idx] = { ...vacations[idx], name, destination: dest, startDate: start, endDate: end, color, provisional };
      showToast('✅ Periodo aggiornato!');
      saveData();
      closeModal();
    }
    return;
  }

  const partner = getTravelPartner(name);
  if (partner) {
    showPairConfirm({ name, dest, start, end, provisional });
  } else {
    commitSave(name, dest, start, end, false, provisional);
  }
});

// ─────────────────────────────────────────────────────────────
//  DELETE
// ─────────────────────────────────────────────────────────────

function deleteVacation(id) {
  vacations = vacations.filter(v => v.id !== id);
  saveData();
  showToast('🗑️ Periodo eliminato');
  // render() verrà chiamato dal listener Firebase
}
window.deleteVacation = deleteVacation;

// ─────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────

let toastTimeout;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ─────────────────────────────────────────────────────────────
//  BOOTSTRAP
// ─────────────────────────────────────────────────────────────

initApp();
