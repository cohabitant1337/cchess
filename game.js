/**
 * ХАОС-ШАХМАТЫ: Динамическое поле-словарь + Плагинная система способностей
 */

const PIECE_SYMBOLS = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
  r: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
  u: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
};

// Порядок хода по часовой стрелке: Белые (низ) -> Красные (лево) -> Чёрные (верх) -> Синие (право)
const PLAYER_META = {
  w: { name: 'Белые', icon: '⚪', dir: { dx: 0, dy: -1 }, fill: '#ffffff', stroke: '#111111', badgeClass: 'white-turn', ring: '#f1f2f6' },
  r: { name: 'Красные', icon: '🔴', dir: { dx: 1, dy: 0 }, fill: '#ff4757', stroke: '#111111', badgeClass: 'red-turn', ring: '#ff4757' },
  b: { name: 'Чёрные', icon: '⚫', dir: { dx: 0, dy: 1 }, fill: '#111111', stroke: '#ffffff', badgeClass: 'black-turn', ring: '#a4b0be' },
  u: { name: 'Синие', icon: '🔵', dir: { dx: -1, dy: 0 }, fill: '#1e90ff', stroke: '#ffffff', badgeClass: 'blue-turn', ring: '#1e90ff' }
};

const TURN_ORDER_2P = ['w', 'b'];
const TURN_ORDER_4P = ['w', 'r', 'b', 'u'];

function getPlayerColors(st) {
  return st.fourPlayer ? TURN_ORDER_4P : TURN_ORDER_2P;
}

function isPlayerAlive(st, color) {
  return !(st.eliminated && st.eliminated[color]);
}

function getNextAliveColor(st, currentColor) {
  const order = getPlayerColors(st);
  const idx = order.indexOf(currentColor);
  for (let i = 1; i <= order.length; i++) {
    const candidate = order[(idx + i) % order.length];
    if (isPlayerAlive(st, candidate)) return candidate;
  }
  return currentColor;
}

const ORTHO_DIRS = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 }
];

const DIAG_DIRS = [
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: 1 }
];

const ALL_DIRS = [...ORTHO_DIRS, ...DIAG_DIRS];

const MAX_MANA = 100;
const BASE_MANA_REGEN = 10;
const START_MANA = 20;

// ============================================================================
// ОФЛАЙН-ГЕНЕРАТОР ЗВУКОВ (WEB AUDIO API)
// ============================================================================
let soundEnabled = true;
let audioCtx = null;

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'move') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'capture') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.14);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'munchausen') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.38);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.41);
    } else if (type === 'ram') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.linearRampToValueAtTime(220, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.33);
    } else if (type === 'victory') {
      osc.type = 'triangle';
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
      });
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (_) {
    // Игнорируем ограничения автовоспроизведения аудио
  }
}

const SKILL_BRANCHES = [
  {
    id: 'magic',
    title: '🔮 Ветка Магии',
    nodes: [
      { id: 'm1', name: 'Поток маны', cost: 2, req: null, desc: '+5 регенерации маны за ход (итого +15).' },
      { id: 'm2', name: 'Экономия эфира', cost: 3, req: 'm1', desc: 'Стоимость маны способностей снижена на 25%.' },
      { id: 'm3', name: 'Хроно-сдвиг', cost: 4, req: 'm2', desc: 'Перезарядка (КД) способностей снижена на 2 хода.' },
      { id: 'm4', name: '⭕❌ Крестики-нолики', cost: 5, req: 'm3', ultimate: true, desc: 'УЛЬТИМЕЙТ: Открывает мини-игру 3×3 за право следующего хода.' }
    ]
  },
  {
    id: 'tactics',
    title: '⚔️ Ветка Тактики',
    nodes: [
      { id: 't1', name: 'Марш-бросок', cost: 2, req: null, desc: 'Пешки могут ходить на 2 клетки вперёд в любой ход.' },
      { id: 't2', name: 'Длинная рука', cost: 3, req: 't1', desc: 'Король получает +1 клетку к радиусу хода (до 2 клеток).' },
      { id: 't3', name: 'Штурмовой маневр', cost: 4, req: 't2', desc: '«Тарутинский маневр» стоит на 10 маны меньше и ставит пешку прикрытия.' },
      { id: 't4', name: '⛀ Шашечный прорыв', cost: 5, req: 't3', ultimate: true, desc: 'УЛЬТИМЕЙТ: Фигура рубит врагов цепочкой перепрыгиваний за 1 ход.' }
    ]
  }
];

function hasSkill(st, color, skillId) {
  return Boolean(st.skills && st.skills[color] && st.skills[color][skillId]);
}

function getManaRegen(st, color) {
  return BASE_MANA_REGEN + (hasSkill(st, color, 'm1') ? 5 : 0);
}

function getAbilityManaCost(st, color, ab) {
  let cost = ab.manaCost || 0;
  if (ab.id === 'tarutino' && hasSkill(st, color, 't3')) {
    cost = Math.max(0, cost - 10);
  }
  if (hasSkill(st, color, 'm2')) {
    cost = Math.floor(cost * 0.75);
  }
  return cost;
}

function getAbilityCooldown(st, color, ab) {
  if (ab.cooldown <= 0) return 0;
  return hasSkill(st, color, 'm3') ? Math.max(1, ab.cooldown - 2) : ab.cooldown;
}

// Утилиты координат
const keyOf = (x, y) => `${x},${y}`;
const parseKey = (k) => k.split(',').map(Number);

// Глобальное состояние игры
let state = {};

// Параметры рендера камеры (обновляются при каждом кадре)
let camera = {
  minX: 0, maxX: 7, minY: 0, maxY: 7,
  cellSize: 40, offsetX: 0, offsetY: 0
};

// ============================================================================
// 1. МОДУЛЬНАЯ СИСТЕМА СПОСОБНОСТЕЙ (ШАБЛОН ПЛАГИНОВ)
// ============================================================================
const ABILITIES = [
  {
    id: 'mobilization',
    name: '🪖 Мобилизация',
    description: 'Добавляет ряд в тылу, сдвигает 2 задних ряда и спавнит 3–8 пешек.',
    cooldown: 10,
    manaCost: 60,
    targetType: 'none',
    canUse(st, color) {
      return true;
    },
    execute(st, color) {
      const { minX, maxX, minY, maxY } = st.mainBounds;

      if (color === 'w') {
        // Тыловой край белых (основное поле) — максимальный Y
        const newY = maxY + 1;
        for (let x = minX; x <= maxX; x++) {
          const nk = keyOf(x, newY);
          if (!st.cells[nk]) st.cells[nk] = { x, y: newY, status: 'normal', lockTurns: 0 };
        }
        [maxY, maxY - 1].forEach(y => {
          for (let x = minX; x <= maxX; x++) {
            const p = st.pieces[keyOf(x, y)];
            const targetCell = st.cells[keyOf(x, y + 1)];
            if (p && p.type !== 'k' && targetCell && targetCell.status === 'normal' && !st.pieces[keyOf(x, y + 1)] && !(st.structures && st.structures[keyOf(x, y + 1)])) {
              st.pieces[keyOf(x, y + 1)] = p;
              delete st.pieces[keyOf(x, y)];
            }
          }
        });
        st.mainBounds.maxY = newY;
        spawnRandomPawns(st, 'w', newY - 2, minX, maxX);
      } else if (color === 'b') {
        // Тыловой край чёрных (основное поле) — минимальный Y
        const newY = minY - 1;
        for (let x = minX; x <= maxX; x++) {
          const nk = keyOf(x, newY);
          if (!st.cells[nk]) st.cells[nk] = { x, y: newY, status: 'normal', lockTurns: 0 };
        }
        [minY, minY + 1].forEach(y => {
          for (let x = minX; x <= maxX; x++) {
            const p = st.pieces[keyOf(x, y)];
            const targetCell = st.cells[keyOf(x, y - 1)];
            if (p && p.type !== 'k' && targetCell && targetCell.status === 'normal' && !st.pieces[keyOf(x, y - 1)] && !(st.structures && st.structures[keyOf(x, y - 1)])) {
              st.pieces[keyOf(x, y - 1)] = p;
              delete st.pieces[keyOf(x, y)];
            }
          }
        });
        st.mainBounds.minY = newY;
        spawnRandomPawns(st, 'b', newY + 2, minX, maxX);
      } else if (color === 'r') {
        // Тыловой край красных (левый край) — минимальный X
        const newX = minX - 1;
        for (let y = minY; y <= maxY; y++) {
          const nk = keyOf(newX, y);
          if (!st.cells[nk]) st.cells[nk] = { x: newX, y, status: 'normal', lockTurns: 0 };
        }
        [minX, minX + 1].forEach(x => {
          for (let y = minY; y <= maxY; y++) {
            const p = st.pieces[keyOf(x, y)];
            const targetCell = st.cells[keyOf(x - 1, y)];
            if (p && p.type !== 'k' && targetCell && targetCell.status === 'normal' && !st.pieces[keyOf(x - 1, y)] && !(st.structures && st.structures[keyOf(x - 1, y)])) {
              st.pieces[keyOf(x - 1, y)] = p;
              delete st.pieces[keyOf(x, y)];
            }
          }
        });
        st.mainBounds.minX = newX;
        spawnRandomPawnsCol(st, 'r', newX + 2, minY, maxY);
      } else if (color === 'u') {
        // Тыловой край синих (правый край) — максимальный X
        const newX = maxX + 1;
        for (let y = minY; y <= maxY; y++) {
          const nk = keyOf(newX, y);
          if (!st.cells[nk]) st.cells[nk] = { x: newX, y, status: 'normal', lockTurns: 0 };
        }
        [maxX, maxX - 1].forEach(x => {
          for (let y = minY; y <= maxY; y++) {
            const p = st.pieces[keyOf(x, y)];
            const targetCell = st.cells[keyOf(x + 1, y)];
            if (p && p.type !== 'k' && targetCell && targetCell.status === 'normal' && !st.pieces[keyOf(x + 1, y)] && !(st.structures && st.structures[keyOf(x + 1, y)])) {
              st.pieces[keyOf(x + 1, y)] = p;
              delete st.pieces[keyOf(x, y)];
            }
          }
        });
        st.mainBounds.maxX = newX;
        spawnRandomPawnsCol(st, 'u', newX - 2, minY, maxY);
      }
    }
  },

  {
    id: 'munchausen',
    name: '🚀 Мюнхгаузен',
    description: 'Жертвует 3 свои пешки и случайно взрывает 2–3 клетки из креста + (воронка на 10 ходов).',
    cooldown: 5,
    manaCost: 35,
    targetType: 'multi_pawns', // Спецрежим: выбор 3 пешек -> выбор 1 целевой клетки
    requiredPawns: 3,
    canUse(st, color) {
      const pawns = Object.values(st.pieces).filter(p => p.color === color && p.type === 'p');
      return pawns.length >= 3;
    },
    execute(st, color, targets) {
      // targets = { pawns: ['x,y', ...], targetCell: 'x,y' }
      targets.pawns.forEach(pk => delete st.pieces[pk]);
      const [tx, ty] = parseKey(targets.targetCell);

      const blastCoords = [
        { x: tx, y: ty },
        { x: tx + 1, y: ty },
        { x: tx - 1, y: ty },
        { x: tx, y: ty + 1 },
        { x: tx, y: ty - 1 }
      ];

      const existingCoords = blastCoords.filter(({ x, y }) => {
        const k = keyOf(x, y);
        if (!st.cells[k]) return false;
        // Король и постройки Dota полностью неуязвимы к способностям
        if (st.pieces[k] && st.pieces[k].type === 'k') return false;
        if (st.structures && st.structures[k]) return false;
        return true;
      });
      existingCoords.sort(() => Math.random() - 0.5);
      const blastCount = Math.min(existingCoords.length, Math.random() < 0.5 ? 2 : 3);
      const chosenCoords = existingCoords.slice(0, blastCount);

      chosenCoords.forEach(({ x, y }) => {
        const k = keyOf(x, y);
        delete st.pieces[k];
        st.cells[k].status = 'crater';
        st.cells[k].lockTurns = 10;
        // Если там был люк бункера — люк уничтожается вместе с бункером!
        Object.keys(st.bunker).forEach(bc => {
          if (st.bunker[bc] && st.bunker[bc].hatchKey === k) st.bunker[bc].hatchKey = null;
        });
      });

      playSound('munchausen');
    }
  },

  {
    id: 'ram',
    name: '💥 Таран',
    description: 'Ладья несётся по прямой до края поля, снося всех на пути и погибая сама.',
    cooldown: 0,
    manaCost: 50,
    targetType: 'ally_piece',
    pieceFilter: (p) => p.type === 'r',
    canUse(st, color) {
      return Object.values(st.pieces).some(p => p.color === color && p.type === 'r');
    },
    execute(st, color, targets) {
      // targets = { pieceKey: 'x,y', dir: { dx, dy } }
      const { pieceKey, dir } = targets;
      let [cx, cy] = parseKey(pieceKey);
      delete st.pieces[pieceKey];

      let destroyed = 0;
      while (destroyed < 3) {
        cx += dir.dx;
        cy += dir.dy;
        const nextK = keyOf(cx, cy);
        if (!st.cells[nextK]) break; // Дошли до конца существующих клеток
        if (st.structures && st.structures[nextK]) break; // Остановка перед Башней/Древним
        if (st.pieces[nextK]) {
          if (st.pieces[nextK].type === 'k') break; // Остановка перед неуязвимым Королём
          if (st.pieces[nextK].color !== color) st.sp[color] += 2;
          delete st.pieces[nextK];
          destroyed++;
        }
      }

      playSound('ram');
    }
  },

  {
    id: 'bunker',
    name: '🕳️ Бункер',
    description: 'Король прячется под землю на 3 полных хода, оставляя люк.',
    cooldown: 10,
    manaCost: 40,
    targetType: 'none',
    canUse(st, color) {
      if (st.bunker[color]) return false;
      return Object.values(st.pieces).some(p => p.color === color && p.type === 'k');
    },
    execute(st, color) {
      const kingEntry = Object.entries(st.pieces).find(([, p]) => p.color === color && p.type === 'k');
      if (!kingEntry) return;
      const [kKey] = kingEntry;

      delete st.pieces[kKey];
      st.bunker[color] = {
        turnsLeft: 3,
        hatchKey: kKey
      };
    }
  },

  {
    id: 'tarutino',
    name: '🥨 Тарутинский маневр',
    description: 'Крайняя фигура прорубает обходной коридор из 5 клеток («ручку кружки»).',
    cooldown: 5,
    manaCost: 25,
    targetType: 'edge_piece',
    canUse(st, color) {
      return Object.entries(st.pieces).some(([k, p]) => p.color === color && getMissingDirs(st, k).length > 0);
    },
    execute(st, color, targets) {
      // targets = { pieceKey: 'x,y', outDir?: { dx, dy } }
      const { pieceKey } = targets;
      const piece = st.pieces[pieceKey];
      if (!piece) return;

      const [sx, sy] = parseKey(pieceKey);
      const missingDirs = getMissingDirs(st, pieceKey);
      if (missingDirs.length === 0) return;

      const outDir = targets.outDir || missingDirs[0];
      const { cells: handleCells } = buildTarutinoHandle(sx, sy, outDir);
      const c4 = handleCells[3];
      const c5 = handleCells[4];

      // Помечаем пристройки как outcropping (боковая пристройка), не меняя mainBounds
      handleCells.forEach(pt => {
        const k = keyOf(pt.x, pt.y);
        if (!st.cells[k]) {
          st.cells[k] = { x: pt.x, y: pt.y, status: 'normal', lockTurns: 0, isOutcropping: true };
        }
      });

      // Перемещаем фигуру в конец коридора (c5), если клетка не занята
      // Король и постройки Dota неуязвимы к способностям
      const endKey = keyOf(c5.x, c5.y);
      const endHasStruct = Boolean(st.structures && st.structures[endKey]);
      const endHasKing = Boolean(st.pieces[endKey] && st.pieces[endKey].type === 'k');
      delete st.pieces[pieceKey];

      if (!endHasStruct && !endHasKing && st.pieces[endKey] && st.pieces[endKey].color !== color) {
        st.sp[color] += 2;
        delete st.pieces[endKey]; // Сносим врага на выходе из засады
      }

      if (!endHasStruct && !st.pieces[endKey]) {
        st.pieces[endKey] = piece;
      } else {
        const c4Key = keyOf(c4.x, c4.y);
        const c3Key = keyOf(handleCells[2].x, handleCells[2].y);
        if (!(st.structures && st.structures[c4Key]) && !st.pieces[c4Key]) {
          st.pieces[c4Key] = piece;
        } else if (!(st.structures && st.structures[c3Key]) && !st.pieces[c3Key]) {
          st.pieces[c3Key] = piece;
        } else {
          st.pieces[pieceKey] = piece;
        }
      }

      // Бонус навыка t3 («Штурмовой маневр»): пешка прикрытия на c2
      if (hasSkill(st, color, 't3')) {
        const coverKey = keyOf(handleCells[1].x, handleCells[1].y);
        if (st.cells[coverKey] && st.cells[coverKey].status === 'normal' && !st.pieces[coverKey]) {
          st.pieces[coverKey] = { type: 'p', color, moved: false };
        }
      }
    }
  },

  {
    id: 'tictactoe',
    name: '⭕❌ Крестики-нолики',
    description: 'УЛЬТИМЕЙТ: Мини-игра 3×3 за право следующего хода.',
    cooldown: 6,
    manaCost: 45,
    requiredSkill: 'm4',
    targetType: 'modal_ttt',
    canUse(st, color) {
      return hasSkill(st, color, 'm4');
    },
    execute() {}
  },

  {
    id: 'checkers',
    name: '⛀ Шашечный прорыв',
    description: 'УЛЬТИМЕЙТ: Фигура рубит врагов цепочкой перепрыгиваний за 1 ход.',
    cooldown: 5,
    manaCost: 40,
    requiredSkill: 't4',
    targetType: 'checkers_piece',
    canUse(st, color) {
      if (!hasSkill(st, color, 't4')) return false;
      return Object.entries(st.pieces).some(([k, p]) => p.color === color && getCheckerJumps(st, k, color).length > 0);
    },
    execute() {}
  }
];

function spendAbilityResources(st, color, ab) {
  const cost = getAbilityManaCost(st, color, ab);
  st.mana[color] = Math.max(0, st.mana[color] - cost);
  st.cooldowns[color][ab.id] = getAbilityCooldown(st, color, ab);
}

function getCheckerJumps(st, fromK, color) {
  const [x, y] = parseKey(fromK);
  const jumps = [];
  ALL_DIRS.forEach(d => {
    const midK = keyOf(x + d.dx, y + d.dy);
    const landK = keyOf(x + d.dx * 2, y + d.dy * 2);
    const midPiece = st.pieces[midK];
    const landCell = st.cells[landK];
    if (
      midPiece &&
      midPiece.color !== color &&
      midPiece.type !== 'k' && // Король неуязвим к способностям
      landCell &&
      landCell.status !== 'crater' &&
      !st.pieces[landK] &&
      !(st.structures && st.structures[landK])
    ) {
      jumps.push({ midK, landK });
    }
  });
  return jumps;
}

// Расчёт 5 клеток «ручки кружки» для Тарутинского маневра
function buildTarutinoHandle(sx, sy, outDir) {
  const sideDir = outDir.dx !== 0 ? { dx: 0, dy: 1 } : { dx: 1, dy: 0 };
  const c1 = { x: sx + outDir.dx, y: sy + outDir.dy };
  const c2 = { x: c1.x + outDir.dx, y: c1.y + outDir.dy };
  const c3 = { x: c2.x + sideDir.dx, y: c2.y + sideDir.dy };
  const c4 = { x: c3.x + sideDir.dx, y: c3.y + sideDir.dy };
  const c5 = { x: c4.x - outDir.dx, y: c4.y - outDir.dy };
  return { outDir, sideDir, cells: [c1, c2, c3, c4, c5] };
}

// Вспомогательная функция спавна пешек для Мобилизации (по горизонтали и вертикали)
function spawnRandomPawns(st, color, rowY, minX, maxX) {
  const candidates = [];
  for (let x = minX; x <= maxX; x++) {
    const k = keyOf(x, rowY);
    if (st.cells[k] && st.cells[k].status === 'normal' && !st.pieces[k] && !(st.structures && st.structures[k])) {
      candidates.push(k);
    }
  }
  candidates.sort(() => Math.random() - 0.5);
  const count = Math.min(candidates.length, Math.floor(Math.random() * 6) + 3); // от 3 до 8
  for (let i = 0; i < count; i++) {
    st.pieces[candidates[i]] = { type: 'p', color, moved: false };
  }
}

function spawnRandomPawnsCol(st, color, colX, minY, maxY) {
  const candidates = [];
  for (let y = minY; y <= maxY; y++) {
    const k = keyOf(colX, y);
    if (st.cells[k] && st.cells[k].status === 'normal' && !st.pieces[k] && !(st.structures && st.structures[k])) {
      candidates.push(k);
    }
  }
  candidates.sort(() => Math.random() - 0.5);
  const count = Math.min(candidates.length, Math.floor(Math.random() * 6) + 3); // от 3 до 8
  for (let i = 0; i < count; i++) {
    st.pieces[candidates[i]] = { type: 'p', color, moved: false };
  }
}

// Проверка, стоит ли клетка на краю (хотя бы 1 ортогональный сосед отсутствует в cells)
function getMissingDirs(st, k) {
  const [x, y] = parseKey(k);
  return ORTHO_DIRS.filter(d => !st.cells[keyOf(x + d.dx, y + d.dy)]);
}

// ============================================================================
// 2. ИНИЦИАЛИЗАЦИЯ И СОСТОЯНИЕ ИГРЫ
// ============================================================================
function initGame(
  vsAI = state.vsAI || false,
  tabletopMode = state.tabletopMode || false,
  dotaMode = state.dotaMode || false,
  fourPlayer = state.fourPlayer || false
) {
  const cols = fourPlayer ? 16 : 8;
  const rows = fourPlayer ? 16 : (dotaMode ? 10 : 8);
  const cells = {};
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      cells[keyOf(x, y)] = { x, y, status: 'normal', lockTurns: 0 };
    }
  }

  const pieces = {};
  const structures = {};
  const backRow = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

  if (fourPlayer) {
    if (dotaMode) {
      // 4 базы с Древними и 2 башнями на поле 16×16
      // Белые (низ)
      structures[keyOf(8, 15)] = { type: 'ancient', color: 'w', siege: 0, maxSiege: 3 };
      structures[keyOf(5, 12)] = { type: 'tower', color: 'w', siege: 0, maxSiege: 3 };
      structures[keyOf(10, 12)] = { type: 'tower', color: 'w', siege: 0, maxSiege: 3 };
      // Чёрные (верх)
      structures[keyOf(7, 0)] = { type: 'ancient', color: 'b', siege: 0, maxSiege: 3 };
      structures[keyOf(5, 3)] = { type: 'tower', color: 'b', siege: 0, maxSiege: 3 };
      structures[keyOf(10, 3)] = { type: 'tower', color: 'b', siege: 0, maxSiege: 3 };
      // Красные (лево)
      structures[keyOf(0, 7)] = { type: 'ancient', color: 'r', siege: 0, maxSiege: 3 };
      structures[keyOf(3, 5)] = { type: 'tower', color: 'r', siege: 0, maxSiege: 3 };
      structures[keyOf(3, 10)] = { type: 'tower', color: 'r', siege: 0, maxSiege: 3 };
      // Синие (право)
      structures[keyOf(15, 8)] = { type: 'ancient', color: 'u', siege: 0, maxSiege: 3 };
      structures[keyOf(12, 5)] = { type: 'tower', color: 'u', siege: 0, maxSiege: 3 };
      structures[keyOf(12, 10)] = { type: 'tower', color: 'u', siege: 0, maxSiege: 3 };

      for (let i = 0; i < 8; i++) {
        const c = 4 + i;
        pieces[keyOf(c, 14)] = { type: backRow[i], color: 'w', moved: false };
        pieces[keyOf(c, 13)] = { type: 'p', color: 'w', moved: false };
        pieces[keyOf(c, 1)] = { type: backRow[i], color: 'b', moved: false };
        pieces[keyOf(c, 2)] = { type: 'p', color: 'b', moved: false };
        pieces[keyOf(1, c)] = { type: backRow[i], color: 'r', moved: false };
        pieces[keyOf(2, c)] = { type: 'p', color: 'r', moved: false };
        pieces[keyOf(14, c)] = { type: backRow[i], color: 'u', moved: false };
        pieces[keyOf(13, c)] = { type: 'p', color: 'u', moved: false };
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const c = 4 + i;
        pieces[keyOf(c, 15)] = { type: backRow[i], color: 'w', moved: false };
        pieces[keyOf(c, 14)] = { type: 'p', color: 'w', moved: false };
        pieces[keyOf(c, 0)] = { type: backRow[i], color: 'b', moved: false };
        pieces[keyOf(c, 1)] = { type: 'p', color: 'b', moved: false };
        pieces[keyOf(0, c)] = { type: backRow[i], color: 'r', moved: false };
        pieces[keyOf(1, c)] = { type: 'p', color: 'r', moved: false };
        pieces[keyOf(15, c)] = { type: backRow[i], color: 'u', moved: false };
        pieces[keyOf(14, c)] = { type: 'p', color: 'u', moved: false };
      }
    }
  } else if (dotaMode) {
    // Расстановка Dota 2 игрока: Древние на y=0 и y=9, Башни на y=3 и y=6
    structures[keyOf(4, 0)] = { type: 'ancient', color: 'b', siege: 0, maxSiege: 3 };
    structures[keyOf(2, 3)] = { type: 'tower', color: 'b', siege: 0, maxSiege: 3 };
    structures[keyOf(5, 3)] = { type: 'tower', color: 'b', siege: 0, maxSiege: 3 };

    structures[keyOf(2, 6)] = { type: 'tower', color: 'w', siege: 0, maxSiege: 3 };
    structures[keyOf(5, 6)] = { type: 'tower', color: 'w', siege: 0, maxSiege: 3 };
    structures[keyOf(4, 9)] = { type: 'ancient', color: 'w', siege: 0, maxSiege: 3 };

    for (let x = 0; x < 8; x++) {
      pieces[keyOf(x, 1)] = { type: backRow[x], color: 'b', moved: false };
      pieces[keyOf(x, 2)] = { type: 'p', color: 'b', moved: false };
      pieces[keyOf(x, 7)] = { type: 'p', color: 'w', moved: false };
      pieces[keyOf(x, 8)] = { type: backRow[x], color: 'w', moved: false };
    }
  } else {
    for (let x = 0; x < 8; x++) {
      pieces[keyOf(x, 0)] = { type: backRow[x], color: 'b', moved: false };
      pieces[keyOf(x, 1)] = { type: 'p', color: 'b', moved: false };
      pieces[keyOf(x, 6)] = { type: 'p', color: 'w', moved: false };
      pieces[keyOf(x, 7)] = { type: backRow[x], color: 'w', moved: false };
    }
  }

  const colors = fourPlayer ? TURN_ORDER_4P : TURN_ORDER_2P;
  const cooldowns = {};
  const mana = {};
  const sp = {};
  const skills = {};
  const bunker = {};
  const destroyedTowers = {};
  const eliminated = {};

  colors.forEach(c => {
    cooldowns[c] = {};
    ABILITIES.forEach(ab => {
      cooldowns[c][ab.id] = 0;
    });
    mana[c] = START_MANA;
    sp[c] = 0;
    skills[c] = {};
    bunker[c] = null;
    destroyedTowers[c] = 0;
    eliminated[c] = false;
  });

  state = {
    cells,
    mainBounds: { minX: 0, maxX: cols - 1, minY: 0, maxY: rows - 1 },
    pieces,
    structures,
    destroyedTowers,
    eliminated,
    turn: 'w',
    vsAI: fourPlayer ? false : vsAI,
    fourPlayer,
    tabletopMode,
    dotaMode,
    gameOver: false,
    winner: null,
    selectedCell: null,
    validMoves: [],
    activeAbility: null, // { ability, step, selectedPawns: [], pendingPiece: null, tarutinoOptions: [], checkerJumps: [] }
    cooldowns,
    mana,
    sp,
    skills,
    bunker,
    pausedForSteal: false,
    pausedForTTT: false,
    tttState: null
  };

  hideAllModals();
  renderAbilitiesBar();
  updateUI();
  drawBoard();
}

// ============================================================================
// 3. ПРАВИЛА ШАХМАТ НА ДИНАМИЧЕСКОЙ СЕТКЕ
// ============================================================================
function isCellWalkable(k) {
  const cell = state.cells[k];
  return cell && cell.status !== 'crater' && !(state.structures && state.structures[k]);
}

function getValidMovesForPiece(k) {
  const piece = state.pieces[k];
  if (!piece) return [];
  const [x, y] = parseKey(k);
  const moves = [];
  const { type, color } = piece;

  const tryAdd = (tx, ty) => {
    const tk = keyOf(tx, ty);
    if (!isCellWalkable(tk)) return false;
    const targetPiece = state.pieces[tk];
    if (!targetPiece) {
      moves.push(tk);
      return true; // Можно идти дальше (для дальнобойных)
    } else if (targetPiece.color !== color) {
      moves.push(tk);
      return false; // Взятие останавливает луч
    }
    return false; // Своя фигура блокирует
  };

  if (type === 'p') {
    const dir = PLAYER_META[color].dir;
    // Ход на 1 вперёд
    const fwd1 = keyOf(x + dir.dx, y + dir.dy);
    if (isCellWalkable(fwd1) && !state.pieces[fwd1]) {
      moves.push(fwd1);
      // Ход на 2 вперёд, если пешка ещё не ходила (или изучен навык Марш-бросок)
      const fwd2 = keyOf(x + dir.dx * 2, y + dir.dy * 2);
      if ((!piece.moved || hasSkill(state, color, 't1')) && isCellWalkable(fwd2) && !state.pieces[fwd2]) {
        moves.push(fwd2);
      }
    }
    // Взятие по диагонали относительно направления пешки
    const perp = dir.dx !== 0 ? [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }] : [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    perp.forEach(pDir => {
      const diagK = keyOf(x + dir.dx + pDir.dx, y + dir.dy + pDir.dy);
      if (isCellWalkable(diagK) && state.pieces[diagK] && state.pieces[diagK].color !== color) {
        moves.push(diagK);
      }
    });
  } else if (type === 'n') {
    const jumps = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    jumps.forEach(([dx, dy]) => tryAdd(x + dx, y + dy));
  } else if (type === 'k') {
    const kingRange2 = hasSkill(state, color, 't2');
    ALL_DIRS.forEach(d => {
      if (tryAdd(x + d.dx, y + d.dy) && kingRange2) {
        tryAdd(x + d.dx * 2, y + d.dy * 2);
      }
    });
  } else {
    const dirs = [];
    if (type === 'r' || type === 'q') dirs.push(...ORTHO_DIRS);
    if (type === 'b' || type === 'q') dirs.push(...DIAG_DIRS);

    dirs.forEach(d => {
      let cx = x + d.dx;
      let cy = y + d.dy;
      while (tryAdd(cx, cy)) {
        cx += d.dx;
        cy += d.dy;
      }
    });
  }

  return moves;
}

function makeMove(fromK, toK) {
  const piece = state.pieces[fromK];
  if (!piece) return;

  const isCapture = Boolean(state.pieces[toK] && state.pieces[toK].color !== piece.color);
  if (isCapture) {
    state.sp[piece.color] += 2;
  }

  delete state.pieces[fromK];
  piece.moved = true;

  // Авто-превращение пешки в ферзя на крайней линии
  if (piece.type === 'p') {
    const [tx, ty] = parseKey(toK);
    const dir = PLAYER_META[piece.color].dir;
    const nextAhead = keyOf(tx + dir.dx, ty + dir.dy);
    if (!state.cells[nextAhead]) {
      piece.type = 'q';
    }
  }

  state.pieces[toK] = piece;
  playSound(isCapture ? 'capture' : 'move');
  endTurn(true);
}

// ============================================================================
// 4. ЗАВЕРШЕНИЕ ХОДА, ТАЙМЕРЫ, БУНКЕР И «УКРАСТЬ ХОД»
// ============================================================================
function endTurn(allowStealEvent = true) {
  state.selectedCell = null;
  state.validMoves = [];
  state.activeAbility = null;

  // Проверка победы (уничтожен ли вражеский король, если он не в бункере)
  if (checkVictory()) {
    updateUI();
    drawBoard();
    return;
  }

  // Тик воронок (crater lockTurns)
  Object.values(state.cells).forEach(cell => {
    if (cell.status === 'crater' && cell.lockTurns > 0) {
      cell.lockTurns--;
      if (cell.lockTurns <= 0) {
        cell.status = 'normal';
      }
    }
  });

  // Тик кулдаунов активного игрока и начисление +1 SP за ход
  const cur = state.turn;
  state.sp[cur] += 1;
  Object.keys(state.cooldowns[cur]).forEach(id => {
    if (state.cooldowns[cur][id] > 0) state.cooldowns[cur][id]--;
  });

  // Осада башен и Древнего (режим Dota)
  if (state.dotaMode && updateStructuresSiege(cur)) {
    updateUI();
    drawBoard();
    return;
  }

  // Тик бункера для игрока, который только что завершил свой ход
  if (state.bunker[cur]) {
    state.bunker[cur].turnsLeft--;
    if (state.bunker[cur].turnsLeft <= 0) {
      emergeFromBunker(cur);
    }
  }

  // Событие «Украсть ход» (шанс 10% после любого хода)
  if (allowStealEvent && !state.gameOver && Math.random() < 0.10) {
    state.pausedForSteal = true;
    document.getElementById('steal-white-btn').classList.toggle('hidden', !isPlayerAlive(state, 'w'));
    document.getElementById('steal-black-btn').classList.toggle('hidden', !isPlayerAlive(state, 'b'));
    document.getElementById('steal-red-btn').classList.toggle('hidden', !state.fourPlayer || !isPlayerAlive(state, 'r'));
    document.getElementById('steal-blue-btn').classList.toggle('hidden', !state.fourPlayer || !isPlayerAlive(state, 'u'));
    document.getElementById('steal-modal').classList.remove('hidden');
    updateUI();
    drawBoard();
    return;
  }

  // Обычная передача хода по часовой стрелке
  switchTurnTo(getNextAliveColor(state, cur));
}

function switchTurnTo(nextColor) {
  state.turn = nextColor;
  state.pausedForSteal = false;
  state.pausedForTTT = false;

  // Регенерация маны активному игроку при начале его хода
  state.mana[nextColor] = Math.min(MAX_MANA, state.mana[nextColor] + getManaRegen(state, nextColor));

  updateUI();
  drawBoard();

  // Ход случайного ИИ
  if (state.vsAI && state.turn === 'b' && !state.gameOver && !state.pausedForSteal && !state.pausedForTTT) {
    setTimeout(makeAIMove, 450);
  }
}

function updateStructuresSiege(attackerColor) {
  for (const [sk, struct] of Object.entries(state.structures)) {
    if (struct.color === attackerColor) continue;
    const isAncient = struct.type === 'ancient';
    const vulnerable = !isAncient || state.destroyedTowers[struct.color] >= 1;
    if (!vulnerable) {
      struct.siege = 0;
      continue;
    }

    const [sx, sy] = parseKey(sk);
    const hasAdjacentEnemy = ALL_DIRS.some(d => {
      const p = state.pieces[keyOf(sx + d.dx, sy + d.dy)];
      return p && p.color !== struct.color;
    });

    if (hasAdjacentEnemy) {
      struct.siege += 1;
      if (struct.siege >= struct.maxSiege) {
        delete state.structures[sk];
        if (struct.type === 'tower') {
          state.destroyedTowers[struct.color] += 1;
        } else if (struct.type === 'ancient') {
          state.eliminated[struct.color] = true;
          const alive = getPlayerColors(state).filter(c => isPlayerAlive(state, c));
          if (alive.length <= 1) {
            const winColor = alive[0] || attackerColor;
            state.gameOver = true;
            state.winner = winColor;
            const meta = PLAYER_META[winColor];
            showGameOver(
              `${meta.icon} Победа: ${meta.name}!`,
              'Все вражеские Древние разрушены!'
            );
            return true;
          }
        }
      }
    } else {
      struct.siege = 0;
    }
  }
  return false;
}

function emergeFromBunker(color) {
  state.bunker[color] = null;
  const freeCells = Object.entries(state.cells)
    .filter(([k, cell]) => cell.status === 'normal' && !state.pieces[k] && !(state.structures && state.structures[k]))
    .map(([k]) => k);

  if (freeCells.length > 0) {
    const randK = freeCells[Math.floor(Math.random() * freeCells.length)];
    state.pieces[randK] = { type: 'k', color, moved: true };
  } else {
    state.eliminated[color] = true;
    const alive = getPlayerColors(state).filter(c => isPlayerAlive(state, c));
    if (alive.length <= 1) {
      const winColor = alive[0] || getNextAliveColor(state, color);
      state.gameOver = true;
      state.winner = winColor;
      const meta = PLAYER_META[winColor];
      showGameOver(`${meta.icon} Победа: ${meta.name}!`, 'Последний выживший король!');
    }
  }
}

function checkVictory() {
  const colors = getPlayerColors(state);
  colors.forEach(c => {
    if (!isPlayerAlive(state, c)) return;
    const alive = state.bunker[c] !== null || Object.values(state.pieces).some(p => p.color === c && p.type === 'k');
    if (!alive) {
      state.eliminated[c] = true;
    }
  });

  const survivors = colors.filter(c => isPlayerAlive(state, c));
  if (survivors.length <= 1) {
    const winColor = survivors[0] || state.turn;
    state.gameOver = true;
    state.winner = winColor;
    const meta = PLAYER_META[winColor];
    showGameOver(`${meta.icon} Победа: ${meta.name}!`, 'Все вражеские короли повержены!');
    return true;
  }
  return false;
}

// Простой случайный ИИ
function makeAIMove() {
  if (state.gameOver || state.turn !== 'b' || state.pausedForSteal) return;

  // 20% шанс применить случайную доступную способность без сложного таргетинга
  const usableSimple = ABILITIES.filter(ab =>
    (ab.targetType === 'none' || ab.targetType === 'edge_piece') &&
    state.cooldowns.b[ab.id] === 0 &&
    state.mana.b >= getAbilityManaCost(state, 'b', ab) &&
    ab.canUse(state, 'b')
  );

  if (usableSimple.length > 0 && Math.random() < 0.2) {
    const ab = usableSimple[Math.floor(Math.random() * usableSimple.length)];
    if (ab.targetType === 'none') {
      ab.execute(state, 'b');
      spendAbilityResources(state, 'b', ab);
      endTurn(true);
      return;
    } else if (ab.targetType === 'edge_piece') {
      const edgeKeys = Object.entries(state.pieces)
        .filter(([k, p]) => p.color === 'b' && getMissingDirs(state, k).length > 0)
        .map(([k]) => k);
      if (edgeKeys.length > 0) {
        const rk = edgeKeys[Math.floor(Math.random() * edgeKeys.length)];
        const dirs = getMissingDirs(state, rk);
        const outDir = dirs[Math.floor(Math.random() * dirs.length)];
        ab.execute(state, 'b', { pieceKey: rk, outDir });
        spendAbilityResources(state, 'b', ab);
        endTurn(true);
        return;
      }
    }
  }

  // Собираем все возможные ходы чёрных
  const allMoves = [];
  Object.entries(state.pieces).forEach(([k, p]) => {
    if (p.color === 'b') {
      getValidMovesForPiece(k).forEach(toK => {
        const isCapture = Boolean(state.pieces[toK]);
        allMoves.push({ fromK: k, toK, isCapture });
      });
    }
  });

  if (allMoves.length === 0) {
    // Пропуск хода, если зажат
    endTurn(true);
    return;
  }

  // Предпочитаем взятия (70% приоритет)
  const captures = allMoves.filter(m => m.isCapture);
  const pool = (captures.length > 0 && Math.random() < 0.7) ? captures : allMoves;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  makeMove(chosen.fromK, chosen.toK);
}

// ============================================================================
// 5. ОТРИСОВКА НА CANVAS И АВТО-МАСШТАБИРОВАНИЕ КАМЕРЫ
// ============================================================================
const canvas = document.getElementById('board-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const container = document.getElementById('board-container');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = container.clientWidth * dpr;
  canvas.height = container.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoard();
}

window.addEventListener('resize', resizeCanvas);

function drawBoard() {
  const container = document.getElementById('board-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  ctx.clearRect(0, 0, width, height);

  const cellList = Object.values(state.cells);
  if (cellList.length === 0) return;

  // Вычисляем границы всех существующих клеток (и предпросмотра Тарутинского маневра, если активен)
  const boundsPoints = [...cellList];
  const tarutinoSelectingDir =
    state.activeAbility &&
    state.activeAbility.ability.id === 'tarutino' &&
    state.activeAbility.step === 'select_dir' &&
    state.activeAbility.tarutinoOptions;

  if (tarutinoSelectingDir) {
    state.activeAbility.tarutinoOptions.forEach(opt => {
      opt.cells.forEach(pt => boundsPoints.push(pt));
    });
  }

  const minX = Math.min(...boundsPoints.map(c => c.x));
  const maxX = Math.max(...boundsPoints.map(c => c.x));
  const minY = Math.min(...boundsPoints.map(c => c.y));
  const maxY = Math.max(...boundsPoints.map(c => c.y));

  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;

  const padding = (cols > 10 || rows > 10) ? 6 : 16;
  const availW = width - padding * 2;
  const availH = height - padding * 2;

  const cellSize = Math.max(8, Math.floor(Math.min(availW / cols, availH / rows)));
  const boardW = cols * cellSize;
  const boardH = rows * cellSize;

  const offsetX = Math.floor((width - boardW) / 2);
  const offsetY = Math.floor((height - boardH) / 2);

  camera = { minX, maxX, minY, maxY, cellSize, offsetX, offsetY };

  // 1. Рисуем клетки
  cellList.forEach(cell => {
    const px = offsetX + (cell.x - minX) * cellSize;
    const py = offsetY + (cell.y - minY) * cellSize;
    const k = keyOf(cell.x, cell.y);

    // Шахматная раскраска с учётом отрицательных координат
    const isLight = Math.abs(cell.x + cell.y) % 2 === 0;
    ctx.fillStyle = isLight ? '#d8dee9' : '#5e81ac';
    ctx.fillRect(px, py, cellSize, cellSize);

    // Тонкая рамка клетки
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, cellSize, cellSize);

    // Воронка (crater)
    if (cell.status === 'crater') {
      ctx.fillStyle = '#2e3440';
      ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
      ctx.font = `${Math.floor(cellSize * 0.55)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🕳️', px + cellSize / 2, py + cellSize / 2);

      // Счётчик ходов воронки
      ctx.fillStyle = '#ff6b81';
      ctx.font = `bold ${Math.max(10, Math.floor(cellSize * 0.24))}px sans-serif`;
      ctx.fillText(cell.lockTurns, px + cellSize * 0.78, py + cellSize * 0.24);
    }

    // Люк бункера
    getPlayerColors(state).forEach(c => {
      if (state.bunker[c] && state.bunker[c].hatchKey === k) {
        const meta = PLAYER_META[c];
        ctx.fillStyle = c === 'w' ? 'rgba(255,255,255,0.85)' : 'rgba(20,20,20,0.85)';
        ctx.beginPath();
        ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize * 0.34, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = meta.ring;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffa502';
        ctx.font = `bold ${Math.max(8, Math.floor(cellSize * 0.28))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🔒${state.bunker[c].turnsLeft}`, px + cellSize / 2, py + cellSize / 2);
      }
    });

    // Подсветка выбранной клетки или выбранной фигуры для способности
    if (
      state.selectedCell === k ||
      (state.activeAbility && state.activeAbility.pendingPiece === k)
    ) {
      ctx.fillStyle = 'rgba(255, 165, 2, 0.48)';
      ctx.fillRect(px, py, cellSize, cellSize);
    }

    // Подсветка выбранных пешек для Мюнхгаузена
    if (state.activeAbility && state.activeAbility.selectedPawns.includes(k)) {
      ctx.fillStyle = 'rgba(255, 71, 87, 0.55)';
      ctx.fillRect(px, py, cellSize, cellSize);
    }
  });

  // 2. Подсветка допустимых ходов
  state.validMoves.forEach(mk => {
    const [mx, my] = parseKey(mk);
    const px = offsetX + (mx - minX) * cellSize;
    const py = offsetY + (my - minY) * cellSize;

    ctx.fillStyle = state.pieces[mk] ? 'rgba(255, 71, 87, 0.55)' : 'rgba(46, 213, 115, 0.5)';
    ctx.beginPath();
    ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize * 0.22, 0, Math.PI * 2);
    ctx.fill();
  });

  // 3. Рисуем фигуры
  Object.entries(state.pieces).forEach(([k, piece]) => {
    const [x, y] = parseKey(k);
    const px = offsetX + (x - minX) * cellSize;
    const py = offsetY + (y - minY) * cellSize;

    const symbol = PIECE_SYMBOLS[piece.color][piece.type];
    ctx.font = `${Math.floor(cellSize * 0.74)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Контрастная тень для читаемости фигур 4 цветов на любых клетках
    const meta = PLAYER_META[piece.color] || PLAYER_META.b;
    ctx.fillStyle = meta.fill;
    ctx.strokeStyle = meta.stroke;
    ctx.lineWidth = Math.max(1.2, cellSize * 0.045);

    ctx.strokeText(symbol, px + cellSize / 2, py + cellSize / 2 + 2);
    ctx.fillText(symbol, px + cellSize / 2, py + cellSize / 2 + 2);
  });

  // 3.5. Рисуем башни (Таверы) и Древних (режим Dota)
  if (state.structures) {
    Object.entries(state.structures).forEach(([sk, struct]) => {
      const [sx, sy] = parseKey(sk);
      const px = offsetX + (sx - minX) * cellSize;
      const py = offsetY + (sy - minY) * cellSize;
      const cx = px + cellSize / 2;
      const cy = py + cellSize / 2;

      // Подложка цвета команды
      const meta = PLAYER_META[struct.color] || PLAYER_META.b;
      ctx.save();
      ctx.fillStyle = struct.color === 'w' ? 'rgba(241, 242, 246, 0.28)' : 'rgba(30, 39, 46, 0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = meta.ring;
      ctx.lineWidth = Math.max(1.5, cellSize * 0.06);
      ctx.stroke();

      // Иконка башни или Древнего
      const icon = struct.type === 'ancient' ? '🏛️' : '🗼';
      ctx.font = `${Math.floor(cellSize * 0.58)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, cx, cy + 1);

      // Щит неуязвимости у Древнего, пока живы обе башни
      if (struct.type === 'ancient' && state.destroyedTowers[struct.color] === 0) {
        ctx.font = `${Math.max(10, Math.floor(cellSize * 0.28))}px sans-serif`;
        ctx.fillText('🛡️', px + cellSize * 0.8, py + cellSize * 0.24);
      }

      // Прогресс-бар и счётчик осады над башней/Древним
      if (struct.siege > 0) {
        const barW = cellSize * 0.8;
        const barH = Math.max(5, cellSize * 0.12);
        const barX = cx - barW / 2;
        const barY = py + 2;

        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#ff4757';
        ctx.fillRect(barX, barY, barW * (struct.siege / struct.maxSiege), barH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(9, Math.floor(cellSize * 0.22))}px sans-serif`;
        ctx.fillText(`${struct.siege}/${struct.maxSiege}`, cx, barY + barH + 7);
      }
      ctx.restore();
    });
  }

  // 3.6. Подсветка прыжков для «Шашечного прорыва»
  if (
    state.activeAbility &&
    state.activeAbility.ability.id === 'checkers' &&
    state.activeAbility.step === 'chain_jump' &&
    state.activeAbility.checkerJumps
  ) {
    state.activeAbility.checkerJumps.forEach(j => {
      const [lx, ly] = parseKey(j.landK);
      const px = offsetX + (lx - minX) * cellSize;
      const py = offsetY + (ly - minY) * cellSize;
      ctx.fillStyle = 'rgba(46, 213, 115, 0.55)';
      ctx.beginPath();
      ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  // 4. Предпросмотр направлений для «Тарутинского маневра»
  if (tarutinoSelectingDir) {
    state.activeAbility.tarutinoOptions.forEach(opt => {
      opt.cells.forEach((pt, idx) => {
        const px = offsetX + (pt.x - minX) * cellSize;
        const py = offsetY + (pt.y - minY) * cellSize;
        const isExit = idx === opt.cells.length - 1;

        ctx.save();
        ctx.fillStyle = isExit ? 'rgba(46, 213, 115, 0.32)' : 'rgba(255, 165, 2, 0.25)';
        ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);

        ctx.strokeStyle = isExit ? '#2ed573' : '#ffa502';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
        ctx.restore();
      });

      // Крупная полупрозрачная стрелка на первой клетке (c1) для удобного тапа
      const c1 = opt.cells[0];
      const cx = offsetX + (c1.x - minX) * cellSize + cellSize / 2;
      const cy = offsetY + (c1.y - minY) * cellSize + cellSize / 2;
      const radius = cellSize * 0.38;

      ctx.save();
      ctx.fillStyle = 'rgba(255, 165, 2, 0.78)';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.translate(cx, cy);
      ctx.rotate(Math.atan2(opt.outDir.dy, opt.outDir.dx));
      ctx.fillStyle = '#111';
      ctx.beginPath();
      const s = radius * 0.65;
      ctx.moveTo(s, 0);
      ctx.lineTo(-s * 0.55, -s * 0.7);
      ctx.lineTo(-s * 0.2, 0);
      ctx.lineTo(-s * 0.55, s * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }
}

// ============================================================================
// 6. ОБРАБОТКА НАЖАТИЙ (ТАРГЕТИНГ СПОСОБНОСТЕЙ И ХОДЫ)
// ============================================================================
function isBoardFlipped() {
  return Boolean(state.tabletopMode && !state.vsAI && !state.fourPlayer && state.turn === 'b');
}

canvas.addEventListener('pointerdown', (e) => {
  if (state.gameOver || state.pausedForSteal) return;
  if (state.vsAI && state.turn === 'b') return;

  const rect = canvas.getBoundingClientRect();
  let clickX = e.clientX - rect.left;
  let clickY = e.clientY - rect.top;

  if (isBoardFlipped()) {
    clickX = rect.width - clickX;
    clickY = rect.height - clickY;
  }

  const gx = Math.floor((clickX - camera.offsetX) / camera.cellSize) + camera.minX;
  const gy = Math.floor((clickY - camera.offsetY) / camera.cellSize) + camera.minY;
  const clickedKey = keyOf(gx, gy);

  // Если выбираем направление для «Тарутинского маневра» (клетки предпросмотра ещё не в state.cells)
  if (
    state.activeAbility &&
    state.activeAbility.ability.id === 'tarutino' &&
    state.activeAbility.step === 'select_dir' &&
    state.activeAbility.tarutinoOptions
  ) {
    const matchedOpt = state.activeAbility.tarutinoOptions.find(opt =>
      opt.cells.some(pt => keyOf(pt.x, pt.y) === clickedKey)
    );
    if (matchedOpt) {
      const ab = state.activeAbility.ability;
      const cur = state.turn;
      ab.execute(state, cur, {
        pieceKey: state.activeAbility.pendingPiece,
        outDir: matchedOpt.outDir
      });
      spendAbilityResources(state, cur, ab);
      endTurn(true);
      return;
    }
  }

  if (!state.cells[clickedKey]) return;

  // Если активен выбор цели для способности
  if (state.activeAbility) {
    handleAbilityTargetClick(clickedKey);
    return;
  }

  // Если кликнули по допустимому ходу выбранной фигуры
  if (state.selectedCell && state.validMoves.includes(clickedKey)) {
    makeMove(state.selectedCell, clickedKey);
    return;
  }

  // Выбор своей фигуры
  const clickedPiece = state.pieces[clickedKey];
  if (clickedPiece && clickedPiece.color === state.turn) {
    state.selectedCell = clickedKey;
    state.validMoves = getValidMovesForPiece(clickedKey);
  } else {
    state.selectedCell = null;
    state.validMoves = [];
  }

  updateUI();
  drawBoard();
});

function handleAbilityTargetClick(k) {
  const { ability, step, selectedPawns } = state.activeAbility;
  const cur = state.turn;
  const piece = state.pieces[k];

  if (ability.targetType === 'multi_pawns') {
    if (step === 'select_pawns') {
      if (piece && piece.color === cur && piece.type === 'p') {
        const idx = selectedPawns.indexOf(k);
        if (idx >= 0) {
          selectedPawns.splice(idx, 1);
        } else {
          selectedPawns.push(k);
        }

        if (selectedPawns.length === ability.requiredPawns) {
          state.activeAbility.step = 'select_target';
        }
        updateUI();
        drawBoard();
      }
    } else if (step === 'select_target') {
      // Взрываем выбранную клетку
      ability.execute(state, cur, { pawns: selectedPawns, targetCell: k });
      spendAbilityResources(state, cur, ability);
      endTurn(true);
    }
  } else if (ability.targetType === 'ally_piece') {
    if (piece && piece.color === cur && (!ability.pieceFilter || ability.pieceFilter(piece))) {
      state.activeAbility.pendingPiece = k;
      if (ability.id === 'ram') {
        document.getElementById('ram-modal').classList.remove('hidden');
      }
    }
  } else if (ability.targetType === 'edge_piece') {
    const missingDirs = getMissingDirs(state, k);
    if (piece && piece.color === cur && missingDirs.length > 0) {
      const [sx, sy] = parseKey(k);
      state.activeAbility.pendingPiece = k;
      state.activeAbility.step = 'select_dir';
      state.activeAbility.tarutinoOptions = missingDirs.map(d => buildTarutinoHandle(sx, sy, d));
      updateUI();
      drawBoard();
    }
  } else if (ability.targetType === 'checkers_piece') {
    if (step === 'select_piece') {
      const jumps = getCheckerJumps(state, k, cur);
      if (piece && piece.color === cur && jumps.length > 0) {
        state.activeAbility.pendingPiece = k;
        state.activeAbility.step = 'chain_jump';
        state.activeAbility.checkerJumps = jumps;
        state.activeAbility.hasJumped = false;
        updateUI();
        drawBoard();
      }
    } else if (step === 'chain_jump') {
      const jump = (state.activeAbility.checkerJumps || []).find(j => j.landK === k);
      if (jump) {
        if (!state.activeAbility.hasJumped) {
          spendAbilityResources(state, cur, ability);
          state.activeAbility.hasJumped = true;
        }
        const movingPiece = state.pieces[state.activeAbility.pendingPiece];
        delete state.pieces[state.activeAbility.pendingPiece];
        delete state.pieces[jump.midK];
        state.sp[cur] += 2; // +2 SP за срубленную фигуру
        movingPiece.moved = true;
        state.pieces[jump.landK] = movingPiece;
        playSound('capture');

        if (checkVictory()) {
          state.activeAbility = null;
          updateUI();
          drawBoard();
          return;
        }

        const nextJumps = getCheckerJumps(state, jump.landK, cur);
        if (nextJumps.length > 0) {
          state.activeAbility.pendingPiece = jump.landK;
          state.activeAbility.checkerJumps = nextJumps;
          updateUI();
          drawBoard();
        } else {
          endTurn(true);
        }
      }
    }
  }
}

// ============================================================================
// 7. ИНТЕРФЕЙС, КНОПКИ СПОСОБНОСТЕЙ И МОДАЛЬНЫЕ ОКНА
// ============================================================================
function renderAbilitiesBar() {
  const panel = document.getElementById('abilities-panel');
  panel.innerHTML = '';

  ABILITIES.forEach(ab => {
    const btn = document.createElement('button');
    btn.className = 'ability-btn';
    btn.dataset.id = ab.id;

    const title = document.createElement('div');
    title.className = 'ab-title';
    title.textContent = ab.name;

    const manaEl = document.createElement('div');
    manaEl.className = 'ab-mana';
    manaEl.textContent = `💧 ${ab.manaCost || 0}`;

    const cd = document.createElement('div');
    cd.className = 'ab-cd';
    cd.textContent = ab.cooldown > 0 ? `КД: ${ab.cooldown}` : 'Без КД';

    btn.appendChild(title);
    btn.appendChild(manaEl);
    btn.appendChild(cd);

    btn.addEventListener('click', () => onAbilityClick(ab));
    panel.appendChild(btn);
  });
}

function onAbilityClick(ab) {
  if (state.gameOver || state.pausedForSteal || state.pausedForTTT) return;
  if (state.vsAI && state.turn === 'b') return;

  const cur = state.turn;
  const manaCost = getAbilityManaCost(state, cur, ab);
  if (state.cooldowns[cur][ab.id] > 0 || state.mana[cur] < manaCost || !ab.canUse(state, cur)) return;

  // Повторное нажатие отменяет выбор способности (если прорыв ещё не начался)
  if (state.activeAbility && state.activeAbility.ability.id === ab.id) {
    if (state.activeAbility.hasJumped) return;
    state.activeAbility = null;
    updateUI();
    drawBoard();
    return;
  }

  state.selectedCell = null;
  state.validMoves = [];

  if (ab.targetType === 'none') {
    ab.execute(state, cur);
    spendAbilityResources(state, cur, ab);
    endTurn(true);
  } else if (ab.targetType === 'modal_ttt') {
    spendAbilityResources(state, cur, ab);
    startTicTacToe(cur);
  } else {
    state.activeAbility = {
      ability: ab,
      step: ab.targetType === 'multi_pawns' ? 'select_pawns' : 'select_piece',
      selectedPawns: [],
      pendingPiece: null,
      tarutinoOptions: [],
      checkerJumps: [],
      hasJumped: false
    };
    updateUI();
    drawBoard();
  }
}

function updateUI() {
  const cur = state.turn;

  // Индикатор хода
  const turnBadge = document.getElementById('turn-indicator');
  const meta = PLAYER_META[cur] || PLAYER_META.w;
  turnBadge.textContent = (state.vsAI && cur === 'b') ? '🤖 Ход: ИИ' : `${meta.icon} Ход: ${meta.name}`;
  turnBadge.className = `badge ${meta.badgeClass}`;

  // Таймеры бункеров
  const timersBar = document.getElementById('timers-bar');
  timersBar.innerHTML = '';
  getPlayerColors(state).forEach(c => {
    if (state.bunker[c]) {
      const chip = document.createElement('span');
      chip.className = 'timer-chip';
      chip.textContent = `🕳️ Бункер (${PLAYER_META[c].name}): ${state.bunker[c].turnsLeft} х.`;
      timersBar.appendChild(chip);
    }
  });

  // Мана и очки навыков (SP)
  const curMana = state.mana[cur];
  const regen = getManaRegen(state, cur);
  document.getElementById('mana-text').textContent = `💧 ${curMana}/${MAX_MANA} (+${regen})`;
  document.getElementById('mana-fill').style.width = `${Math.min(100, (curMana / MAX_MANA) * 100)}%`;
  document.getElementById('sp-badge').textContent = `${state.sp[cur]} SP`;

  // Обновление кнопок способностей
  document.querySelectorAll('.ability-btn').forEach(btn => {
    const ab = ABILITIES.find(a => a.id === btn.dataset.id);
    const unlocked = !ab.requiredSkill || hasSkill(state, cur, ab.requiredSkill);
    btn.classList.toggle('hidden', !unlocked);

    const cdVal = state.cooldowns[cur][ab.id];
    const manaCost = getAbilityManaCost(state, cur, ab);
    const manaEl = btn.querySelector('.ab-mana');
    const cdEl = btn.querySelector('.ab-cd');

    if (manaEl) manaEl.textContent = `💧 ${manaCost}`;

    const isAI = state.vsAI && cur === 'b';
    const disabled = isAI || !unlocked || cdVal > 0 || curMana < manaCost || !ab.canUse(state, cur) || state.gameOver;
    btn.disabled = disabled;

    if (cdVal > 0) {
      cdEl.textContent = `⏳ ${cdVal} х.`;
    } else {
      const effCd = getAbilityCooldown(state, cur, ab);
      cdEl.textContent = effCd > 0 ? `КД ${effCd}` : 'Без КД';
    }

    const isActive = state.activeAbility && state.activeAbility.ability.id === ab.id;
    btn.classList.toggle('active', Boolean(isActive));
  });

  // Режим «Друг напротив друга» (Tabletop Mode): плавный переворот на 180° для чёрных
  const flipped = isBoardFlipped();
  document.getElementById('board-canvas').classList.toggle('flipped', flipped);
  document.getElementById('bottom-bar').classList.toggle('flipped', flipped);
  const ramCard = document.querySelector('#ram-modal .modal-card');
  if (ramCard) ramCard.classList.toggle('flipped', flipped);

  const tabletopBtn = document.getElementById('tabletop-btn');
  if (tabletopBtn) {
    tabletopBtn.classList.toggle('active', Boolean(state.tabletopMode));
  }

  const dotaBtn = document.getElementById('dota-btn');
  if (dotaBtn) {
    dotaBtn.classList.toggle('active', Boolean(state.dotaMode));
  }

  const checkersDoneBtn = document.getElementById('checkers-done-btn');
  const inCheckersChain =
    state.activeAbility &&
    state.activeAbility.ability.id === 'checkers' &&
    state.activeAbility.step === 'chain_jump' &&
    state.activeAbility.hasJumped;
  checkersDoneBtn.classList.toggle('hidden', !inCheckersChain);

  const cancelAbilityBtn = document.getElementById('cancel-ability-btn');
  if (cancelAbilityBtn) {
    const canCancel = Boolean(state.activeAbility && !state.activeAbility.hasJumped);
    cancelAbilityBtn.classList.toggle('hidden', !canCancel);
  }

  const skipTurnBtn = document.getElementById('skip-turn-btn');
  if (skipTurnBtn) {
    const isAI = state.vsAI && cur === 'b';
    skipTurnBtn.disabled = isAI || state.gameOver || state.pausedForSteal || state.pausedForTTT || inCheckersChain;
  }

  const soundBtn = document.getElementById('sound-btn');
  if (soundBtn) {
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    soundBtn.classList.toggle('active', soundEnabled);
  }

  // Подсказка шага
  const hint = document.getElementById('action-hint');
  if (state.activeAbility) {
    const { ability, step, selectedPawns } = state.activeAbility;
    if (ability.id === 'munchausen') {
      if (step === 'select_pawns') {
        hint.textContent = `🚀 Выберите 3 свои пешки: ${selectedPawns.length}/3`;
      } else {
        hint.textContent = '🎯 Выберите любую клетку для ракетного удара!';
      }
    } else if (ability.id === 'ram') {
      hint.textContent = '💥 Выберите свою ладью для тарана';
    } else if (ability.id === 'tarutino') {
      if (step === 'select_dir') {
        hint.textContent = '🥨 Нажмите на подсвеченную сторону со стрелкой, чтобы прорубить коридор';
      } else {
        hint.textContent = '🥨 Выберите любую свою фигуру на краю поля';
      }
    } else if (ability.id === 'checkers') {
      if (step === 'chain_jump') {
        hint.textContent = '⛀ Выберите подсвеченную клетку для прыжка через врага';
      } else {
        hint.textContent = '⛀ Выберите свою фигуру рядом с врагом для шашечного прорыва';
      }
    }
  } else {
    hint.textContent = 'Выберите фигуру для хода или активируйте способность';
  }
}

function hideAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function showGameOver(title, desc) {
  playSound('victory');
  document.getElementById('winner-title').textContent = title;
  document.getElementById('winner-desc').textContent = desc;
  document.getElementById('gameover-modal').classList.remove('hidden');
}

// ============================================================================
// 8. ДРЕВО НАВЫКОВ И МИНИ-ИГРА «КРЕСТИКИ-НОЛИКИ»
// ============================================================================
function renderSkillsTree() {
  const cur = state.turn;
  const sp = state.sp[cur];
  document.getElementById('modal-sp-badge').textContent = `${sp} SP`;

  const body = document.getElementById('skills-tree-body');
  body.innerHTML = '';

  SKILL_BRANCHES.forEach(branch => {
    const col = document.createElement('div');
    col.className = 'skill-branch';

    const title = document.createElement('div');
    title.className = 'branch-title';
    title.textContent = branch.title;
    col.appendChild(title);

    branch.nodes.forEach(node => {
      const learned = hasSkill(state, cur, node.id);
      const reqMet = !node.req || hasSkill(state, cur, node.req);
      const canBuy = !learned && reqMet && sp >= node.cost;

      const btn = document.createElement('button');
      btn.className = 'skill-node';
      if (node.ultimate) btn.classList.add('ultimate');
      if (learned) btn.classList.add('learned');
      else if (canBuy) btn.classList.add('available');
      else btn.classList.add('locked');

      btn.disabled = !canBuy;
      btn.innerHTML = `
        <div class="sk-top">
          <span>${node.name}</span>
          <span class="sk-cost">${learned ? '✓ Изучено' : `${node.cost} SP`}</span>
        </div>
        <div class="sk-desc">${node.desc}</div>
      `;

      btn.addEventListener('click', () => {
        if (!canBuy) return;
        state.sp[cur] -= node.cost;
        state.skills[cur][node.id] = true;
        renderSkillsTree();
        updateUI();
      });

      col.appendChild(btn);
    });

    body.appendChild(col);
  });
}

function startTicTacToe(initiatorColor) {
  state.pausedForTTT = true;
  state.tttState = {
    board: Array(9).fill(null),
    initiator: initiatorColor,
    opponent: getNextAliveColor(state, initiatorColor),
    turnMark: 'X',
    done: false
  };
  document.getElementById('ttt-modal').classList.remove('hidden');
  renderTTT();
}

function checkTTTWinner(b) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, c, d] of lines) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return b.every(Boolean) ? 'draw' : null;
}

function renderTTT() {
  const ttt = state.tttState;
  if (!ttt) return;

  const activeColor = ttt.turnMark === 'X' ? ttt.initiator : ttt.opponent;
  const label = (state.vsAI && activeColor === 'b') ? 'ИИ' : PLAYER_META[activeColor].name;
  document.getElementById('ttt-status').textContent = `Ходят ${ttt.turnMark} (${label})`;

  const grid = document.getElementById('ttt-grid');
  grid.innerHTML = '';

  ttt.board.forEach((val, idx) => {
    const cell = document.createElement('button');
    cell.className = 'ttt-cell';
    if (val === 'X') cell.classList.add('x');
    if (val === 'O') cell.classList.add('o');
    cell.textContent = val || '';
    cell.disabled = Boolean(val) || ttt.done || (state.vsAI && activeColor === 'b');
    cell.addEventListener('click', () => handleTTTMove(idx));
    grid.appendChild(cell);
  });

  if (!ttt.done && state.vsAI && activeColor === 'b') {
    setTimeout(() => {
      if (!state.tttState || state.tttState.done) return;
      const empties = state.tttState.board.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
      if (empties.length > 0) {
        handleTTTMove(empties[Math.floor(Math.random() * empties.length)]);
      }
    }, 350);
  }
}

function handleTTTMove(idx) {
  const ttt = state.tttState;
  if (!ttt || ttt.done || ttt.board[idx]) return;

  ttt.board[idx] = ttt.turnMark;
  const result = checkTTTWinner(ttt.board);

  if (result) {
    ttt.done = true;
    renderTTT();
    let nextTurn = ttt.opponent; // при ничьей очередь не меняется (переходит к сопернику)
    if (result === 'X') nextTurn = ttt.initiator;
    else if (result === 'O') nextTurn = ttt.opponent;

    setTimeout(() => {
      document.getElementById('ttt-modal').classList.add('hidden');
      state.pausedForTTT = false;
      state.tttState = null;
      state.selectedCell = null;
      state.validMoves = [];
      state.activeAbility = null;
      switchTurnTo(nextTurn);
    }, 550);
  } else {
    ttt.turnMark = ttt.turnMark === 'X' ? 'O' : 'X';
    renderTTT();
  }
}

// События кнопок управления и модалок
document.getElementById('sound-btn').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  updateUI();
});

document.getElementById('cancel-ability-btn').addEventListener('click', () => {
  if (state.activeAbility && !state.activeAbility.hasJumped) {
    state.activeAbility = null;
    updateUI();
    drawBoard();
  }
});

document.getElementById('skip-turn-btn').addEventListener('click', () => {
  if (state.gameOver || state.pausedForSteal || state.pausedForTTT) return;
  if (state.vsAI && state.turn === 'b') return;
  if (state.activeAbility && state.activeAbility.hasJumped) return;
  endTurn(true);
});

document.getElementById('dota-btn').addEventListener('click', () => {
  initGame(state.vsAI, state.tabletopMode, !state.dotaMode, state.fourPlayer);
});

document.getElementById('tabletop-btn').addEventListener('click', () => {
  state.tabletopMode = !state.tabletopMode;
  updateUI();
  drawBoard();
});

document.getElementById('mode-btn').addEventListener('click', () => {
  const modeBtn = document.getElementById('mode-btn');
  if (!state.vsAI && !state.fourPlayer) {
    // 2P -> AI
    modeBtn.textContent = '🤖 Против ИИ';
    modeBtn.classList.remove('active');
    initGame(true, state.tabletopMode, state.dotaMode, false);
  } else if (state.vsAI) {
    // AI -> 4P (16x16)
    modeBtn.textContent = '👑 4 Игрока (16×16)';
    modeBtn.classList.add('active');
    initGame(false, state.tabletopMode, state.dotaMode, true);
  } else {
    // 4P -> 2P
    modeBtn.textContent = '👥 2 Игрока';
    modeBtn.classList.remove('active');
    initGame(false, state.tabletopMode, state.dotaMode, false);
  }
});

document.getElementById('reset-btn').addEventListener('click', () => initGame(state.vsAI, state.tabletopMode, state.dotaMode, state.fourPlayer));
document.getElementById('play-again-btn').addEventListener('click', () => initGame(state.vsAI, state.tabletopMode, state.dotaMode, state.fourPlayer));

document.getElementById('skills-btn').addEventListener('click', () => {
  if (state.gameOver || state.pausedForSteal || state.pausedForTTT) return;
  if (state.vsAI && state.turn === 'b') return;
  renderSkillsTree();
  document.getElementById('skills-modal').classList.remove('hidden');
});

document.getElementById('skills-close-btn').addEventListener('click', () => {
  document.getElementById('skills-modal').classList.add('hidden');
});

document.getElementById('checkers-done-btn').addEventListener('click', () => {
  if (state.activeAbility && state.activeAbility.ability.id === 'checkers' && state.activeAbility.hasJumped) {
    endTurn(true);
  }
});

// Событие «Украсть ход»
document.getElementById('steal-white-btn').addEventListener('click', () => {
  document.getElementById('steal-modal').classList.add('hidden');
  switchTurnTo('w');
});

document.getElementById('steal-red-btn').addEventListener('click', () => {
  document.getElementById('steal-modal').classList.add('hidden');
  switchTurnTo('r');
});

document.getElementById('steal-black-btn').addEventListener('click', () => {
  document.getElementById('steal-modal').classList.add('hidden');
  switchTurnTo('b');
});

document.getElementById('steal-blue-btn').addEventListener('click', () => {
  document.getElementById('steal-modal').classList.add('hidden');
  switchTurnTo('u');
});

document.getElementById('steal-skip-btn').addEventListener('click', () => {
  document.getElementById('steal-modal').classList.add('hidden');
  switchTurnTo(getNextAliveColor(state, state.turn));
});

// Выбор направления для «Тарана»
document.querySelectorAll('.dir-btn[data-dx]').forEach(btn => {
  btn.addEventListener('click', () => {
    const dx = Number(btn.dataset.dx);
    const dy = Number(btn.dataset.dy);
    document.getElementById('ram-modal').classList.add('hidden');

    if (state.activeAbility && state.activeAbility.ability.id === 'ram') {
      const ab = state.activeAbility.ability;
      const cur = state.turn;
      ab.execute(state, cur, {
        pieceKey: state.activeAbility.pendingPiece,
        dir: { dx, dy }
      });
      spendAbilityResources(state, cur, ab);
      endTurn(true);
    }
  });
});

document.getElementById('ram-cancel-btn').addEventListener('click', () => {
  document.getElementById('ram-modal').classList.add('hidden');
  state.activeAbility = null;
  updateUI();
  drawBoard();
});

// Старт игры
initGame(false);
resizeCanvas();