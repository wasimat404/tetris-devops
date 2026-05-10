/* ===================================================================
   TETRIS // DevOps Edition — game logic
   Vanilla JS, Canvas-based. No dependencies.
   =================================================================== */

(() => {
  // ----------------------- CONSTANTS -----------------------
  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30;          // px per cell on main board
  const PREVIEW_BLOCK = 22;  // px per cell on hold/next previews

  const COLORS = {
    I: "#00f0f0",
    O: "#f0f000",
    T: "#a000f0",
    S: "#00f070",
    Z: "#f02060",
    J: "#2060f0",
    L: "#f0a000",
  };

  // Each shape is defined in its 4-rotation matrix form
  const SHAPES = {
    I: [
      [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
      [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
      [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
      [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
    ],
    O: [
      [[1, 1], [1, 1]],
      [[1, 1], [1, 1]],
      [[1, 1], [1, 1]],
      [[1, 1], [1, 1]],
    ],
    T: [
      [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
      [[0, 1, 0], [0, 1, 1], [0, 1, 0]],
      [[0, 0, 0], [1, 1, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 1, 0], [0, 1, 0]],
    ],
    S: [
      [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
      [[0, 1, 0], [0, 1, 1], [0, 0, 1]],
      [[0, 0, 0], [0, 1, 1], [1, 1, 0]],
      [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
    ],
    Z: [
      [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
      [[0, 0, 1], [0, 1, 1], [0, 1, 0]],
      [[0, 0, 0], [1, 1, 0], [0, 1, 1]],
      [[0, 1, 0], [1, 1, 0], [1, 0, 0]],
    ],
    J: [
      [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
      [[0, 1, 1], [0, 1, 0], [0, 1, 0]],
      [[0, 0, 0], [1, 1, 1], [0, 0, 1]],
      [[0, 1, 0], [0, 1, 0], [1, 1, 0]],
    ],
    L: [
      [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
      [[0, 1, 0], [0, 1, 0], [0, 1, 1]],
      [[0, 0, 0], [1, 1, 1], [1, 0, 0]],
      [[1, 1, 0], [0, 1, 0], [0, 1, 0]],
    ],
  };

  const TYPES = Object.keys(SHAPES);
  const SCORE_TABLE = { 1: 100, 2: 300, 3: 500, 4: 800 };

  // ----------------------- DOM -----------------------
  const boardCanvas = document.getElementById("board");
  const nextCanvas = document.getElementById("next");
  const holdCanvas = document.getElementById("hold");
  const ctx = boardCanvas.getContext("2d");
  const nextCtx = nextCanvas.getContext("2d");
  const holdCtx = holdCanvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const linesEl = document.getElementById("lines");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");

  // ----------------------- STATE -----------------------
  let board, current, nextPiece, heldPiece, canHold;
  let score, level, lines;
  let dropCounter, dropInterval, lastTime;
  let bag;
  let gameOver, paused;
  let rafId;

  // ----------------------- HELPERS -----------------------
  function makeBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function refillBag() {
    const arr = [...TYPES];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    bag.push(...arr);
  }

  function takeFromBag() {
    if (bag.length === 0) refillBag();
    return bag.shift();
  }

  function makePiece(type) {
    return {
      type,
      rot: 0,
      shape: SHAPES[type][0],
      x: Math.floor((COLS - SHAPES[type][0][0].length) / 2),
      y: 0,
    };
  }

  function collide(piece, board, dx = 0, dy = 0, shape = piece.shape) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = piece.x + c + dx;
        const ny = piece.y + r + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function merge(piece, board) {
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c]) {
          const ny = piece.y + r;
          const nx = piece.x + c;
          if (ny >= 0) board[ny][nx] = piece.type;
        }
      }
    }
  }

  function rotate(piece, dir = 1) {
    const newRot = (piece.rot + dir + 4) % 4;
    const newShape = SHAPES[piece.type][newRot];
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (!collide(piece, board, k, 0, newShape)) {
        piece.x += k;
        piece.rot = newRot;
        piece.shape = newShape;
        return true;
      }
    }
    return false;
  }

  function clearLines() {
    let cleared = 0;
    outer: for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) {
        if (!board[r][c]) continue outer;
      }
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      r++;
    }
    if (cleared > 0) {
      lines += cleared;
      score += (SCORE_TABLE[cleared] || 0) * level;
      const newLevel = Math.floor(lines / 10) + 1;
      if (newLevel !== level) {
        level = newLevel;
        dropInterval = Math.max(80, 1000 - (level - 1) * 80);
      }
    }
  }

  function spawn() {
    current = makePiece(nextPiece);
    nextPiece = takeFromBag();
    canHold = true;
    if (collide(current, board)) {
      gameOver = true;
      showOverlay("GAME OVER", `Score: ${score}  ·  Press R to restart`);
    }
    drawNext();
  }

  function hold() {
    if (!canHold) return;
    if (heldPiece === null) {
      heldPiece = current.type;
      spawn();
    } else {
      const swap = heldPiece;
      heldPiece = current.type;
      current = makePiece(swap);
      if (collide(current, board)) {
        gameOver = true;
        showOverlay("GAME OVER", `Score: ${score}  ·  Press R to restart`);
      }
    }
    canHold = false;
    drawHold();
  }

  function hardDrop() {
    let dy = 0;
    while (!collide(current, board, 0, dy + 1)) dy++;
    current.y += dy;
    score += dy * 2;
    lock();
  }

  function softDrop() {
    if (!collide(current, board, 0, 1)) {
      current.y++;
      score += 1;
    } else {
      lock();
    }
    dropCounter = 0;
  }

  function lock() {
    merge(current, board);
    clearLines();
    if (!gameOver) spawn();
  }

  // ----------------------- DRAWING -----------------------
  function drawBlock(c, x, y, color, size = BLOCK) {
    const px = x * size;
    const py = y * size;
    c.fillStyle = color;
    c.fillRect(px, py, size, size);
    c.fillStyle = "rgba(255, 255, 255, 0.25)";
    c.fillRect(px, py, size, size / 6);
    c.fillRect(px, py, size / 6, size);
    c.fillStyle = "rgba(0, 0, 0, 0.3)";
    c.fillRect(px + size - size / 6, py, size / 6, size);
    c.fillRect(px, py + size - size / 6, size, size / 6);
    c.strokeStyle = "rgba(0, 0, 0, 0.6)";
    c.lineWidth = 1;
    c.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
  }

  function drawGrid() {
    ctx.strokeStyle = "rgba(120, 80, 255, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * BLOCK, 0);
      ctx.lineTo(x * BLOCK, ROWS * BLOCK);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * BLOCK);
      ctx.lineTo(COLS * BLOCK, y * BLOCK);
      ctx.stroke();
    }
  }

  function drawGhost() {
    if (gameOver || paused) return;
    let dy = 0;
    while (!collide(current, board, 0, dy + 1)) dy++;
    if (dy === 0) return;
    ctx.save();
    ctx.globalAlpha = 0.2;
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < current.shape[r].length; c++) {
        if (current.shape[r][c]) {
          const x = current.x + c;
          const y = current.y + r + dy;
          if (y >= 0) drawBlock(ctx, x, y, COLORS[current.type]);
        }
      }
    }
    ctx.restore();
  }

  function drawBoard() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    drawGrid();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) drawBlock(ctx, c, r, COLORS[board[r][c]]);
      }
    }

    drawGhost();

    if (current && !gameOver) {
      for (let r = 0; r < current.shape.length; r++) {
        for (let c = 0; c < current.shape[r].length; c++) {
          if (current.shape[r][c]) {
            const x = current.x + c;
            const y = current.y + r;
            if (y >= 0) drawBlock(ctx, x, y, COLORS[current.type]);
          }
        }
      }
    }
  }

  function drawPreview(c, canvas, type) {
    c.clearRect(0, 0, canvas.width, canvas.height);
    if (!type) return;
    const shape = SHAPES[type][0];
    const rows = shape.filter((row) => row.some((v) => v));
    const w = rows[0].length;
    const h = rows.length;
    const offX = (canvas.width - w * PREVIEW_BLOCK) / 2 / PREVIEW_BLOCK;
    const offY = (canvas.height - h * PREVIEW_BLOCK) / 2 / PREVIEW_BLOCK;
    for (let r = 0; r < h; r++) {
      for (let col = 0; col < w; col++) {
        if (rows[r][col]) {
          drawBlock(c, offX + col, offY + r, COLORS[type], PREVIEW_BLOCK);
        }
      }
    }
  }

  function drawNext() { drawPreview(nextCtx, nextCanvas, nextPiece); }
  function drawHold() { drawPreview(holdCtx, holdCanvas, heldPiece); }

  function updateHUD() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
  }

  // ----------------------- LOOP -----------------------
  function update(time = 0) {
    if (!gameOver && !paused) {
      const delta = time - lastTime;
      lastTime = time;
      dropCounter += delta;
      if (dropCounter > dropInterval) {
        if (!collide(current, board, 0, 1)) current.y++;
        else lock();
        dropCounter = 0;
      }
    } else {
      lastTime = time;
    }
    drawBoard();
    updateHUD();
    rafId = requestAnimationFrame(update);
  }

  // ----------------------- OVERLAY -----------------------
  function showOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlay.classList.remove("hidden");
  }
  function hideOverlay() { overlay.classList.add("hidden"); }

  // ----------------------- INPUT -----------------------
  document.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") {
      reset();
      return;
    }
    if (e.key === "p" || e.key === "P") {
      if (gameOver) return;
      paused = !paused;
      if (paused) showOverlay("PAUSED", "Press P to resume");
      else hideOverlay();
      return;
    }
    if (gameOver || paused) return;

    switch (e.key) {
      case "ArrowLeft":
        if (!collide(current, board, -1, 0)) current.x--;
        break;
      case "ArrowRight":
        if (!collide(current, board, 1, 0)) current.x++;
        break;
      case "ArrowDown":
        softDrop();
        break;
      case "ArrowUp":
        rotate(current, 1);
        break;
      case " ":
        e.preventDefault();
        hardDrop();
        break;
      case "c":
      case "C":
        hold();
        break;
    }
  });

  // ----------------------- LIFECYCLE -----------------------
  function reset() {
    cancelAnimationFrame(rafId);
    board = makeBoard();
    bag = [];
    refillBag();
    nextPiece = takeFromBag();
    heldPiece = null;
    canHold = true;
    score = 0;
    level = 1;
    lines = 0;
    dropCounter = 0;
    dropInterval = 1000;
    lastTime = 0;
    gameOver = false;
    paused = false;
    spawn();
    drawHold();
    drawNext();
    hideOverlay();
    update();
  }

  reset();
})();
