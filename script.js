(function(){
"use strict";

const $ = id => document.getElementById(id);
const stage = $("stage"), cv = $("cv"), ctx = cv.getContext("2d");

// ===== Tela =====
let W = 0, H = 0, U = 40, groundY = 0;
function resize(){
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const oldW = W || r.width;
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  U = Math.max(26, Math.min(52, Math.min(W / 9.5, H / 15)));
  groundY = H - U * 1.3;
  if(ship){ ship.x = ship.x / oldW * W; ship.tx = ship.x; ship.y = groundY; }
  if(state !== "play") draw();
}

// ===== Estado =====
let state = "start";
let ship = null, enemies, form, pBullets, eBullets, drops, parts, texts, bunkers, boss;
let score, lives, wave, kills, fireT, eFireT, power, powerT, shieldOn, invul, banner, flash, shake, time, nextWaveT, reason;
let best = 0, muted = false;
try{ best = +(localStorage.getItem("defesa-rede-best") || 0) || 0; muted = localStorage.getItem("defesa-rede-mute") === "1"; }catch(e){}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

const TYPES = {
  virus:  {hp:1, pts:10, color:"#4BE37A", dark:"#1E8A45"},
  bug:    {hp:2, pts:20, color:"#FF6B7D", dark:"#B42335"},
  hacker: {hp:3, pts:30, color:"#22164A", dark:"#4BE3A1"},
};

function reset(){
  ship = {x:W / 2, tx:W / 2, y:groundY, vx:0};
  score = 0; lives = 3; wave = 0; kills = 0; fireT = 0; eFireT = 1.5;
  power = null; powerT = 0; shieldOn = false; invul = 0; banner = null; flash = 0; shake = 0; time = 0; nextWaveT = 0; reason = "";
  enemies = []; pBullets = []; eBullets = []; drops = []; parts = []; texts = []; boss = null;
  buildBunkers();
  startWave();
}

function buildBunkers(){
  bunkers = [];
  const n = W < 520 ? 3 : 4, bw = 7, bh = 4, cell = Math.max(5, U * 0.2);
  for(let b = 0; b < n; b++){
    const cx = W * (b + 1) / (n + 1), x0 = cx - bw * cell / 2, y0 = groundY - U * 2.4;
    for(let i = 0; i < bw; i++) for(let j = 0; j < bh; j++){
      if(j === bh - 1 && (i >= 2 && i <= 4)) continue;          // abertura embaixo
      if(j === 0 && (i === 0 || i === bw - 1)) continue;         // cantos arredondados
      bunkers.push({x:x0 + i * cell, y:y0 + j * cell, s:cell, hp:2});
    }
  }
}

function startWave(){
  wave++;
  enemies = []; boss = null;
  if(wave % 3 === 0){
    const hp = 26 + wave * 6;
    boss = {x:W / 2, y:U * 3.2 + 50, w:U * 3.2, h:U * 2.4, hp, max:hp, t:0, fire:1.2};
    banner = {text:"CHEFÃO: RANSOMWARE!", sub:"Ele quer sequestrar seus arquivos", t:2.2};
  } else {
    const cols = W < 520 ? 6 : 8, rows = Math.min(5, 3 + Math.floor(wave / 2));
    const gap = Math.min(U * 1.15, (W - U * 1.6) / cols);
    for(let r = 0; r < rows; r++){
      const type = r === 0 && wave >= 2 ? "hacker" : r <= 1 && wave >= 1 && rows > 3 ? "bug" : (r === 0 ? "bug" : "virus");
      for(let c = 0; c < cols; c++){
        enemies.push({type, hp:TYPES[type].hp, c, r, ox:c * gap, oy:r * gap * 0.9, hit:0});
      }
    }
    form = {x:(W - (cols - 1) * gap) / 2, y:Math.max(U * 2.6, 104), dir:1, w:(cols - 1) * gap, step:U * 0.45};
    banner = {text:"ONDA " + wave, sub:wave === 1 ? "Proteja a rede!" : "Eles estão mais rápidos!", t:1.6};
  }
  if(wave > 1 && wave % 3 === 1) buildBunkers();                // firewalls refeitos depois do chefão
}

// ===== Controles =====
const keys = {left:false, right:false};
document.addEventListener("keydown", e => {
  if((state === "start" || state === "over") && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); start(); return; }
  if(e.key === "p" || e.key === "P" || e.key === "Escape"){ togglePause(); return; }
  if(e.key === "ArrowLeft" || e.key === "a" || e.key === "A"){ keys.left = true; e.preventDefault(); }
  if(e.key === "ArrowRight" || e.key === "d" || e.key === "D"){ keys.right = true; e.preventDefault(); }
});
document.addEventListener("keyup", e => {
  if(e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.left = false;
  if(e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.right = false;
});
let usingPointer = false, dragging = false;
function px(e){ return e.clientX - cv.getBoundingClientRect().left; }
cv.addEventListener("pointerdown", e => { if(state !== "play") return; dragging = true; usingPointer = true; ship.tx = px(e); });
cv.addEventListener("pointermove", e => {
  if(state !== "play") return;
  if(dragging || e.pointerType === "mouse"){ usingPointer = true; ship.tx = px(e); }
});
cv.addEventListener("pointerup", () => { dragging = false; });
cv.addEventListener("pointercancel", () => { dragging = false; });

// ===== Som =====
let ac = null;
function sfx(kind){
  if(muted) return;
  try{
    if(!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    const S = {shoot:["square",900,500,0.05,0.025], hit:["square",300,200,0.05,0.04], boom:["sawtooth",260,60,0.25,0.07],
               hurt:["sawtooth",200,50,0.45,0.12], power:["sine",500,1500,0.3,0.08], wave:["triangle",440,880,0.35,0.08], boss:["sawtooth",120,80,0.6,0.1]}[kind];
    if(!S) return;
    o.type = S[0]; o.frequency.setValueAtTime(S[1], t); o.frequency.exponentialRampToValueAtTime(S[2], t + S[3]);
    g.gain.setValueAtTime(S[4], t); g.gain.exponentialRampToValueAtTime(0.0001, t + S[3]);
    o.start(t); o.stop(t + S[3] + 0.02);
  }catch(e){}
}
function setMuteUI(){ $("btnSound").textContent = muted ? "🔇" : "🔊"; $("btnSound").setAttribute("aria-label", muted ? "Som desligado" : "Som ligado"); }
$("btnSound").addEventListener("click", () => { muted = !muted; setMuteUI(); try{ localStorage.setItem("defesa-rede-mute", muted ? "1" : "0"); }catch(e){} });

// ===== Fluxo =====
function start(){
  reset(); state = "play"; sfx("wave");
  $("startScreen").hidden = true; $("overScreen").hidden = true; $("pauseScreen").hidden = true; $("hud").hidden = false;
  last = performance.now();
  if(ac && ac.state === "suspended") ac.resume();
}
function togglePause(){
  if(state === "play"){ state = "pause"; keys.left = keys.right = false; $("pauseScreen").hidden = false; }
  else if(state === "pause"){ state = "play"; $("pauseScreen").hidden = true; last = performance.now(); }
}
function gameOver(why){
  if(state !== "play") return;
  state = "over"; reason = why; sfx("hurt"); shake = 0.4;
  const rec = score > best;
  if(rec){ best = score; try{ localStorage.setItem("defesa-rede-best", String(best)); }catch(e){} }
  setTimeout(() => {
    $("overTitle").textContent = rec ? "Novo recorde!" : pick(["Rede invadida!", "Sistema comprometido!", "Hackers venceram!"]);
    $("overTag").textContent = rec ? "Parabéns" : "Fim de jogo";
    $("overReason").textContent = reason;
    $("overScore").textContent = score.toLocaleString("pt-BR");
    $("overWave").textContent = wave;
    $("overKills").textContent = kills;
    $("overBest").textContent = "Recorde: " + best.toLocaleString("pt-BR");
    $("overScreen").hidden = false;
    $("btnAgain").focus({preventScroll:true});
  }, 800);
}
$("btnPlay").addEventListener("click", start);
$("btnAgain").addEventListener("click", start);
$("btnPause").addEventListener("click", togglePause);
$("btnResume").addEventListener("click", togglePause);
document.addEventListener("visibilitychange", () => { if(document.hidden && state === "play") togglePause(); });

// ===== Efeitos =====
function burst(x, y, color, n, sp){
  for(let i = 0; i < n; i++){
    const a = Math.random() * 6.28, v = rnd(40, sp || 260);
    parts.push({x, y, vx:Math.cos(a) * v, vy:Math.sin(a) * v, life:rnd(0.3, 0.7), color, s:rnd(2, 4.5)});
  }
}
function float(x, y, text, color){ texts.push({x, y, text, color, life:1}); }

function hurtShip(){
  if(invul > 0) return;
  if(shieldOn){ shieldOn = false; invul = 1; flash = 0.3; burst(ship.x, ship.y, "#5EC2FF", 18); sfx("hit"); return; }
  lives--; invul = 1.8; flash = 0.45; shake = 0.3; sfx("hurt");
  burst(ship.x, ship.y, "#FF6B7D", 26, 320);
  if(lives <= 0) gameOver("Seu antivírus foi atingido e a rede ficou desprotegida.");
}

// ===== Atualização =====
function enemyPos(e){ return [form.x + e.ox, form.y + e.oy]; }

function update(dt){
  time += dt;
  if(invul > 0) invul -= dt;
  if(flash > 0) flash -= dt;
  if(banner){ banner.t -= dt; if(banner.t <= 0) banner = null; }
  if(power){ powerT -= dt; if(powerT <= 0) power = null; }

  // nave
  const maxV = W * 1.4;
  if(keys.left || keys.right){ usingPointer = false; ship.x += ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * maxV * 0.75 * dt; ship.tx = ship.x; }
  else { const d = ship.tx - ship.x; ship.x += Math.sign(d) * Math.min(Math.abs(d), maxV * dt); }
  ship.x = Math.max(U * 0.7, Math.min(W - U * 0.7, ship.x));
  ship.y = groundY;

  // tiro automático
  fireT -= dt;
  if(fireT <= 0){
    fireT = 0.3;
    const v = -H * 1.15;
    pBullets.push({x:ship.x, y:ship.y - U * 0.6, vx:0, vy:v});
    if(power === "triplo"){ pBullets.push({x:ship.x - U * 0.3, y:ship.y - U * 0.5, vx:-U * 2.2, vy:v}); pBullets.push({x:ship.x + U * 0.3, y:ship.y - U * 0.5, vx:U * 2.2, vy:v}); }
    sfx("shoot");
  }

  // formação
  const alive = enemies.length;
  if(alive && form){
    const total = (W < 520 ? 6 : 8) * Math.min(5, 3 + Math.floor(wave / 2));
    const speed = U * (0.9 + wave * 0.28) * (1 + (1 - alive / total) * 1.6);
    form.x += form.dir * speed * dt;
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const e of enemies){ const [x, y] = enemyPos(e); minX = Math.min(minX, x); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    if(maxX > W - U * 0.6 && form.dir > 0){ form.dir = -1; form.y += form.step; }
    if(minX < U * 0.6 && form.dir < 0){ form.dir = 1; form.y += form.step; }
    if(maxY + U * 0.4 >= ship.y - U * 0.5){ gameOver("Os vírus chegaram até a rede da escola."); return; }

    // inimigos atiram
    eFireT -= dt;
    if(eFireT <= 0){
      eFireT = rnd(0.5, 1.3) / (1 + wave * 0.18);
      const cols = {};
      for(const e of enemies){ if(!cols[e.c] || e.r > cols[e.c].r) cols[e.c] = e; }
      const shooters = Object.values(cols);
      const s = shooters.reduce((a, b) => Math.abs(enemyPos(b)[0] - ship.x) < Math.abs(enemyPos(a)[0] - ship.x) && Math.random() < 0.5 ? b : a, pick(shooters));
      const [x, y] = enemyPos(s);
      eBullets.push({x, y:y + U * 0.4, vx:0, vy:H * (0.38 + wave * 0.025)});
    }
    // inimigo encosta no firewall
    for(const e of enemies){ const [x, y] = enemyPos(e); for(const b of bunkers) if(b.hp > 0 && Math.abs(b.x - x) < U * 0.45 && Math.abs(b.y - y) < U * 0.45) b.hp = 0; }
  }

  // chefão
  if(boss){
    boss.t += dt;
    boss.x = W / 2 + Math.sin(boss.t * (0.8 + wave * 0.04)) * (W / 2 - boss.w / 2 - U * 0.3);
    boss.y = U * 3.2 + 50 + Math.sin(boss.t * 1.7) * U * 0.4;
    boss.fire -= dt;
    if(boss.fire <= 0){
      boss.fire = Math.max(0.55, 1.3 - wave * 0.05);
      for(const a of [-0.35, 0, 0.35]) eBullets.push({x:boss.x, y:boss.y + boss.h * 0.45, vx:Math.sin(a) * H * 0.4, vy:Math.cos(a) * H * 0.42});
      sfx("boss");
    }
  }

  // balas
  for(const b of pBullets){ b.x += b.vx * dt; b.y += b.vy * dt; }
  for(const b of eBullets){ b.x += b.vx * dt; b.y += b.vy * dt; }

  // colisões: tiros do jogador
  for(const b of pBullets){
    if(b.dead) continue;
    for(const k of bunkers){ if(k.hp > 0 && b.x > k.x && b.x < k.x + k.s && b.y > k.y && b.y < k.y + k.s){ k.hp--; b.dead = true; break; } }
    if(b.dead) continue;
    for(const e of enemies){
      if(e.dead) continue;
      const [x, y] = enemyPos(e);
      if(Math.abs(b.x - x) < U * 0.42 && Math.abs(b.y - y) < U * 0.42){
        b.dead = true; e.hp--; e.hit = 0.12; sfx("hit");
        if(e.hp <= 0){
          e.dead = true; kills++; score += TYPES[e.type].pts;
          burst(x, y, e.type === "hacker" ? "#4BE3A1" : TYPES[e.type].color, 14);
          sfx("boom");
          if(Math.random() < 0.07) drops.push({x, y, kind:Math.random() < 0.55 ? "triplo" : "escudo"});
        }
        break;
      }
    }
    if(!b.dead && boss && Math.abs(b.x - boss.x) < boss.w / 2 && Math.abs(b.y - boss.y) < boss.h / 2){
      b.dead = true; boss.hp--; boss.hit = 0.08; burst(b.x, b.y, "#FFC93C", 3, 120); sfx("hit");
      if(boss.hp <= 0){
        score += 300 + wave * 20; kills++;
        burst(boss.x, boss.y, "#FFC93C", 60, 420); burst(boss.x, boss.y, "#FF6B7D", 40, 360);
        float(boss.x, boss.y, "+" + (300 + wave * 20), "#FFC93C");
        drops.push({x:boss.x, y:boss.y, kind:"escudo"});
        boss = null; shake = 0.4; sfx("boom");
      }
    }
  }
  if(boss && boss.hit > 0) boss.hit -= dt;
  for(const e of enemies) if(e.hit > 0) e.hit -= dt;

  // colisões: tiros inimigos
  for(const b of eBullets){
    if(b.dead) continue;
    for(const k of bunkers){ if(k.hp > 0 && b.x > k.x - 2 && b.x < k.x + k.s + 2 && b.y > k.y && b.y < k.y + k.s){ k.hp--; b.dead = true; break; } }
    if(b.dead) continue;
    if(Math.abs(b.x - ship.x) < U * 0.5 && Math.abs(b.y - ship.y) < U * 0.45){ b.dead = true; hurtShip(); if(state !== "play") return; }
  }

  // bônus caindo
  for(const d of drops){
    d.y += H * 0.25 * dt;
    if(Math.abs(d.x - ship.x) < U * 0.7 && Math.abs(d.y - ship.y) < U * 0.7){
      d.dead = true; sfx("power");
      if(d.kind === "triplo"){ power = "triplo"; powerT = 9; float(d.x, d.y - U, "TIRO TRIPLO!", "#FFC93C"); }
      else { shieldOn = true; float(d.x, d.y - U, "ESCUDO!", "#5EC2FF"); }
    }
    if(d.y > H + 20) d.dead = true;
  }

  enemies = enemies.filter(e => !e.dead);
  pBullets = pBullets.filter(b => !b.dead && b.y > -20 && b.x > -20 && b.x < W + 20);
  eBullets = eBullets.filter(b => !b.dead && b.y < H + 20);
  drops = drops.filter(d => !d.dead);
  bunkers = bunkers.filter(k => k.hp > 0);

  for(const p of parts){ p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  for(const t of texts){ t.y -= 30 * dt; t.life -= dt; }
  texts = texts.filter(t => t.life > 0);

  // onda concluída
  if(!enemies.length && !boss){
    if(nextWaveT <= 0){ nextWaveT = 1.6; float(W / 2, H * 0.45, "Onda " + wave + " concluída!", "#4BE3A1"); score += 50 * wave; eBullets = []; }
    nextWaveT -= dt;
    if(nextWaveT <= 0){ startWave(); sfx("wave"); nextWaveT = 0; }
  }

  // placar
  $("hudScore").textContent = score.toLocaleString("pt-BR");
  $("hudWave").textContent = wave;
  $("hudLives").textContent = "❤".repeat(Math.max(0, lives)) + "♡".repeat(Math.max(0, 3 - Math.max(0, lives)));
  const pw = $("hudPower");
  if(power || shieldOn){
    pw.hidden = false;
    $("hudPowerIcon").textContent = power ? "⚡" + Math.ceil(powerT) : "🛡️";
    $("hudPowerText").textContent = power ? "triplo" : "escudo";
  } else pw.hidden = true;
}

// ===== Desenho =====
let bits = [];
function drawBg(dt){
  ctx.fillStyle = "#061541"; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(12,42,114,0)"); g.addColorStop(1, "rgba(18,52,127,.9)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // chuva de bits ao fundo
  if(bits.length < Math.floor(W / 22)) bits.push({x:Math.random() * W, y:Math.random() * H, v:rnd(20, 60), c:Math.random() < 0.5 ? "0" : "1"});
  ctx.font = "500 13px JetBrains Mono, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(94,194,255,.16)";
  for(const b of bits){ b.y += b.v * (dt || 0); if(b.y > H){ b.y = -10; b.x = Math.random() * W; } ctx.fillText(b.c, b.x, b.y); }
  // linha de defesa (rede)
  ctx.strokeStyle = "rgba(94,194,255,.5)"; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY + U * 0.55); ctx.lineTo(W, groundY + U * 0.55); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "rgba(94,194,255,.55)"; ctx.font = "700 11px JetBrains Mono, monospace"; ctx.textAlign = "left";
  ctx.fillText("REDE DA ESCOLA", 10, groundY + U * 0.85);
}

function drawShip(){
  if(invul > 0 && Math.floor(invul * 12) % 2) return;
  const x = ship.x, y = ship.y, r = U * 0.55;
  ctx.save(); ctx.translate(x, y);
  // propulsor
  ctx.fillStyle = "rgba(255,201,60," + (0.6 + Math.random() * 0.4).toFixed(2) + ")";
  ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.75); ctx.lineTo(r * 0.3, r * 0.75); ctx.lineTo(0, r * (1.15 + Math.random() * 0.25)); ctx.fill();
  // asas
  ctx.fillStyle = "#12347F";
  ctx.beginPath(); ctx.moveTo(-r * 1.25, r * 0.6); ctx.lineTo(-r * 0.4, -r * 0.1); ctx.lineTo(r * 0.4, -r * 0.1); ctx.lineTo(r * 1.25, r * 0.6); ctx.closePath(); ctx.fill();
  // escudo (corpo)
  ctx.fillStyle = "#5EC2FF";
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, -r * 0.6); ctx.lineTo(r * 0.72, r * 0.25); ctx.quadraticCurveTo(r * 0.45, r * 0.8, 0, r * 0.95);
  ctx.quadraticCurveTo(-r * 0.45, r * 0.8, -r * 0.72, r * 0.25); ctx.lineTo(-r * 0.8, -r * 0.6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = r * 0.16; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(-r * 0.32, 0); ctx.lineTo(-r * 0.05, r * 0.28); ctx.lineTo(r * 0.38, -r * 0.3); ctx.stroke();
  ctx.restore();
  if(shieldOn){
    ctx.strokeStyle = "rgba(94,194,255," + (0.55 + Math.sin(time * 8) * 0.3).toFixed(2) + ")"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, U * 0.95, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawEnemy(e){
  const [x, y] = enemyPos(e), r = U * 0.38, T = TYPES[e.type];
  const bob = Math.sin(time * 6 + e.c) * r * 0.08;
  ctx.save(); ctx.translate(x, y + bob);
  if(e.hit > 0){ ctx.globalAlpha = 0.6; }
  if(e.type === "virus"){
    ctx.strokeStyle = T.dark; ctx.lineWidth = r * 0.16; ctx.lineCap = "round";
    for(let i = 0; i < 8; i++){ const a = i / 8 * 6.28 + time; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); ctx.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2); ctx.stroke(); }
    ctx.fillStyle = T.color; ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, 7); ctx.fill();
    eyes(r, "#0B3A1C");
  } else if(e.type === "bug"){
    ctx.strokeStyle = T.dark; ctx.lineWidth = r * 0.14; ctx.lineCap = "round";
    const leg = Math.sin(time * 10) * r * 0.15;
    for(const s of [-1, 1]) for(const dy of [-0.3, 0.1, 0.5]){ ctx.beginPath(); ctx.moveTo(s * r * 0.6, dy * r); ctx.lineTo(s * r * 1.15, dy * r + (dy === 0.1 ? leg : -leg)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-r * 0.25, -r * 0.75); ctx.lineTo(-r * 0.45, -r * 1.1); ctx.moveTo(r * 0.25, -r * 0.75); ctx.lineTo(r * 0.45, -r * 1.1); ctx.stroke();
    ctx.fillStyle = T.color; ctx.beginPath(); ctx.ellipse(0, r * 0.05, r * 0.7, r * 0.85, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = T.dark; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.moveTo(0, -r * 0.2); ctx.lineTo(0, r * 0.85); ctx.stroke();
    eyes(r, "#3A0710", -0.35);
  } else {
    // hacker de capuz
    ctx.fillStyle = "#22164A";
    ctx.beginPath(); ctx.moveTo(-r, r); ctx.lineTo(-r * 0.95, -r * 0.2); ctx.quadraticCurveTo(-r * 0.9, -r * 1.1, 0, -r * 1.1); ctx.quadraticCurveTo(r * 0.9, -r * 1.1, r * 0.95, -r * 0.2); ctx.lineTo(r, r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0A0620"; ctx.beginPath(); ctx.ellipse(0, r * 0.05, r * 0.6, r * 0.62, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#4BE3A1"; ctx.shadowColor = "#4BE3A1"; ctx.shadowBlur = 8;
    ctx.fillRect(-r * 0.38, -r * 0.08, r * 0.24, r * 0.12); ctx.fillRect(r * 0.14, -r * 0.08, r * 0.24, r * 0.12);
    ctx.shadowBlur = 0;
    if(e.hp < T.hp){ ctx.fillStyle = "#FF6B7D"; ctx.fillRect(-r * 0.5, r * 1.1, r * (e.hp / T.hp), r * 0.12); }
  }
  if(e.type === "bug" && e.hp < T.hp){ ctx.fillStyle = "#FFC93C"; ctx.fillRect(-r * 0.5, r * 1.1, r * (e.hp / T.hp), r * 0.12); }
  ctx.restore();
}
function eyes(r, pupil, dy){
  dy = dy || -0.1;
  ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(-r * 0.3, dy * r, r * 0.22, 0, 7); ctx.arc(r * 0.3, dy * r, r * 0.22, 0, 7); ctx.fill();
  ctx.fillStyle = pupil; ctx.beginPath(); ctx.arc(-r * 0.26, dy * r + r * 0.05, r * 0.1, 0, 7); ctx.arc(r * 0.26, dy * r + r * 0.05, r * 0.1, 0, 7); ctx.fill();
  ctx.strokeStyle = pupil; ctx.lineWidth = r * 0.09;
  ctx.beginPath(); ctx.moveTo(-r * 0.52, dy * r - r * 0.28); ctx.lineTo(-r * 0.12, dy * r - r * 0.15); ctx.moveTo(r * 0.52, dy * r - r * 0.28); ctx.lineTo(r * 0.12, dy * r - r * 0.15); ctx.stroke();
}

function drawBoss(){
  const b = boss, w = b.w, h = b.h;
  ctx.save(); ctx.translate(b.x, b.y);
  if(b.hit > 0) ctx.globalAlpha = 0.7;
  // alça do cadeado
  ctx.strokeStyle = "#B42335"; ctx.lineWidth = w * 0.09;
  ctx.beginPath(); ctx.arc(0, -h * 0.15, w * 0.28, Math.PI, 0); ctx.stroke();
  // corpo
  ctx.fillStyle = "#FFC93C"; ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(-w / 2, -h * 0.18, w, h * 0.68, w * 0.08); else ctx.rect(-w / 2, -h * 0.18, w, h * 0.68);
  ctx.fill();
  ctx.fillStyle = "#B42335"; ctx.fillRect(-w / 2, h * 0.36, w, h * 0.14);
  // olhos e boca
  ctx.fillStyle = "#3A0710";
  ctx.beginPath(); ctx.moveTo(-w * 0.32, -h * 0.02); ctx.lineTo(-w * 0.08, h * 0.08); ctx.lineTo(-w * 0.3, h * 0.14); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w * 0.32, -h * 0.02); ctx.lineTo(w * 0.08, h * 0.08); ctx.lineTo(w * 0.3, h * 0.14); ctx.closePath(); ctx.fill();
  ctx.fillRect(-w * 0.18, h * 0.22, w * 0.36, h * 0.06);
  ctx.fillStyle = "#FFFFFF"; ctx.font = "900 " + Math.round(h * 0.11) + "px Archivo, Arial Black, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("PAGUE $$$", 0, h * 0.43);
  ctx.restore();
  // barra de vida
  const bw = Math.min(W * 0.6, 320), bx = W / 2 - bw / 2, by = 92;
  ctx.fillStyle = "rgba(6,21,65,.85)"; ctx.fillRect(bx - 3, by - 3, bw + 6, 16);
  ctx.fillStyle = "#3A0710"; ctx.fillRect(bx, by, bw, 10);
  ctx.fillStyle = "#FF6B7D"; ctx.fillRect(bx, by, bw * Math.max(0, b.hp / b.max), 10);
  ctx.fillStyle = "#FFFFFF"; ctx.font = "800 11px JetBrains Mono, monospace"; ctx.textAlign = "center"; ctx.fillText("RANSOMWARE", W / 2, by + 24);
}

function draw(dt){
  ctx.save();
  if(shake > 0) ctx.translate((Math.random() - 0.5) * 12 * shake, (Math.random() - 0.5) * 12 * shake);
  drawBg(dt);
  if(ship && enemies){
    ctx.fillStyle = "#5EC2FF";
    for(const k of bunkers){ ctx.globalAlpha = k.hp === 2 ? 1 : 0.5; ctx.fillRect(k.x, k.y, k.s - 1, k.s - 1); }
    ctx.globalAlpha = 1;
    for(const e of enemies) drawEnemy(e);
    if(boss) drawBoss();
    // tiros
    for(const b of pBullets){ ctx.fillStyle = "#5EC2FF"; ctx.fillRect(b.x - 2, b.y - U * 0.3, 4, U * 0.3); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(b.x - 1, b.y - U * 0.3, 2, U * 0.12); }
    for(const b of eBullets){ ctx.fillStyle = "#FF6B7D"; ctx.beginPath(); ctx.arc(b.x, b.y, U * 0.11, 0, 7); ctx.fill(); ctx.fillStyle = "#FFC93C"; ctx.beginPath(); ctx.arc(b.x, b.y, U * 0.05, 0, 7); ctx.fill(); }
    for(const d of drops){
      ctx.fillStyle = d.kind === "triplo" ? "#FFC93C" : "#5EC2FF";
      ctx.beginPath(); ctx.arc(d.x, d.y, U * 0.32, 0, 7); ctx.fill();
      ctx.font = Math.round(U * 0.36) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(d.kind === "triplo" ? "⚡" : "🛡️", d.x, d.y + 1);
    }
    if(state !== "over" || lives > 0) drawShip();
    for(const p of parts){ ctx.globalAlpha = Math.max(0, p.life * 1.6); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.s, p.s); }
    ctx.globalAlpha = 1;
    for(const t of texts){
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.font = "900 " + Math.round(Math.max(16, U * 0.55)) + "px Archivo, Arial Black, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 5; ctx.strokeStyle = "#061541"; ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    if(banner && state === "play"){
      const a = Math.min(1, banner.t * 2);
      ctx.globalAlpha = a;
      ctx.font = "900 " + Math.round(Math.min(W * 0.09, U * 1.1)) + "px Archivo, Arial Black, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 6; ctx.strokeStyle = "#061541"; ctx.strokeText(banner.text, W / 2, H * 0.5);
      ctx.fillStyle = "#FFFFFF"; ctx.fillText(banner.text, W / 2, H * 0.5);
      ctx.font = "600 " + Math.round(Math.max(13, U * 0.4)) + "px Inter, sans-serif"; ctx.fillStyle = "#A9C1EE";
      ctx.fillText(banner.sub, W / 2, H * 0.5 + U * 0.9);
      ctx.globalAlpha = 1;
    }
  }
  if(flash > 0){ ctx.fillStyle = "rgba(255,107,125," + (flash * 0.5).toFixed(2) + ")"; ctx.fillRect(-20, -20, W + 40, H + 40); }
  ctx.restore();
}

// ===== Laço =====
let last = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if(state === "play") update(dt);
  else if(state === "over"){ for(const p of parts){ p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; } parts = parts.filter(p => p.life > 0); }
  if(shake > 0) shake = Math.max(0, shake - dt);
  if(flash > 0 && state !== "play") flash -= dt;
  if(state !== "pause") draw(dt);
}

setMuteUI();
$("bestStart").textContent = "Recorde: " + best.toLocaleString("pt-BR");
new ResizeObserver(resize).observe(stage);
resize();
reset();
requestAnimationFrame(loop);
})();
