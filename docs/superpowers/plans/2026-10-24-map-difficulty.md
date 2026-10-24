# 困难地图与计时赛道 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 FPV-ONLINE 中新增一张带 8 道顺序穿门、计时、碰撞反馈的困难地图，并在页面右上角提供地图切换入口。

**Architecture:** 拆出 `src/maps.js`（两套地图构建 + 资源释放）与 `src/race.js`（计时、顺序穿门、HUD 状态），`src/engine.js` 保留场景环境、飞行物理、碰撞和 UI 连线。地图障碍放在独立 `THREE.Group` 中，切换时整体销毁重建。

**Tech Stack:** Three.js 0.160.1（CDN importmap）、原生 JavaScript ES Modules、HTML/CSS、Playwright + Chrome 做浏览器验证。

**Spec:** `docs/superpowers/specs/2026-10-24-map-difficulty-design.md`

---

## 文件结构

- `index.html`：新增地图切换按钮、赛道 HUD、完成浮层。
- `assets/css/index.css`：新增上述 UI 样式。
- `src/maps.js`（新建）：简单/困难地图构建、门与 AABB 数据、`disposeGroup`。
- `src/race.js`（新建）：`Race` 类与 `formatRaceTime`。
- `src/engine.js`：环境保留，接入地图加载、切换 UI、赛道更新、碰撞。
- `/tmp/fpv-verify/verify-race.js`（不提交）：浏览器端验证脚本。

### Task 1: 页面结构与样式

**Files:**
- Modify: `index.html:3`（lang）、`index.html:35-39`
- Modify: `assets/css/index.css`

- [ ] **Step 1: 修改 `index.html`**

把 `<html lang="ua">` 改为 `<html lang="zh-CN">`，并在 `<canvas id="interface"></canvas>` 之后插入：

```html
    <div id="map-switcher" aria-label="地图难度">
        <button type="button" class="map-button active" data-map="easy">简单地图</button>
        <button type="button" class="map-button" data-map="hard">困难地图</button>
    </div>
    <div id="race-hud" hidden>
        <span id="gate-progress">穿门 0 / 8</span>
        <span id="race-time">等待开始 — 推油门或拨动摇杆</span>
    </div>
    <div id="race-result" hidden>
        <p class="result-title">赛道完成！</p>
        <p id="final-time">00:00.00</p>
        <button type="button" id="restart-race">再来一次</button>
    </div>
```

- [ ] **Step 2: 在 `assets/css/index.css` 末尾追加样式**

```css
#map-switcher {
    position: fixed;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 8px;
    z-index: 20;
}

.map-button {
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    color: #ddd;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.35);
    padding: 8px 14px;
    cursor: pointer;
}

.map-button:hover {
    border-color: #fff;
}

.map-button.active {
    color: #0f0;
    border-color: #0f0;
    background: rgba(0, 0, 0, 0.7);
}

#race-hud {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 28px;
    padding: 8px 18px;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
    z-index: 20;
}

#race-hud[hidden] {
    display: none;
}

#gate-progress {
    color: #0f0;
}

#race-result {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    z-index: 30;
}

#race-result[hidden] {
    display: none;
}

.result-title {
    font-size: 32px;
    font-weight: 700;
    color: #0f0;
}

#final-time {
    font-size: 48px;
    font-weight: 700;
}

#restart-race {
    font-family: inherit;
    font-size: 16px;
    font-weight: 700;
    padding: 10px 22px;
    color: #0f0;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #0f0;
    cursor: pointer;
}
```

- [ ] **Step 3: 启动服务并截图检查**

```bash
cd /Users/enmonster/orca/workspaces/FPV-ONLINE/urchin
python3 -m http.server 8765
```

另开终端：

```bash
npx --no-install playwright screenshot --channel chrome --wait-for-timeout 2000 --viewport-size "1280,720" http://localhost:8765 /tmp/map-ui.png
```

Expected: 页面右上角出现两个按钮，简单地图绿色高亮；赛道 HUD 与完成浮层不可见。

- [ ] **Step 4: 提交**

```bash
git add index.html assets/css/index.css
git commit -m "Add map switcher and race UI scaffolding"
```

### Task 2: 地图模块与切换

**Files:**
- Create: `src/maps.js`
- Modify: `src/engine.js:1`、删除 `src/engine.js:53-65` 的旧柱子循环、在飞行状态之后加入地图加载逻辑、文件末尾改为先 `loadMap('easy')` 再 `animate()`

- [ ] **Step 1: 新建 `src/maps.js`**

```js
import * as THREE from 'three';

const upAxis = new THREE.Vector3(0, 1, 0);

const GATE_DEFINITIONS = [
    { position: [0, 3, 10], type: 'square', yaw: 0 },
    { position: [-10, 6, 2], type: 'ring', yaw: 25 },
    { position: [8, 3, -8], type: 'square', yaw: -25 },
    { position: [-6, 8, -16], type: 'ring', yaw: 20 },
    { position: [10, 5, -25], type: 'square', yaw: -30 },
    { position: [-10, 7, -32], type: 'ring', yaw: 25 },
    { position: [4, 4, -38], type: 'square', yaw: -15 },
    { position: [0, 6, -44], type: 'ring', yaw: 0 },
];

const BOX_OBSTACLES = [
    { position: [6, 2, 14], size: [4, 4, 4] },
    { position: [-6, 2.5, -4], size: [5, 5, 5] },
    { position: [3, 2, -14], size: [4, 4, 4] },
    { position: [-3, 2.5, -24], size: [5, 5, 5] },
    { position: [10, 2, -35], size: [4, 4, 4] },
];

const PILLARS = [
    [-3, 10, 16],
    [3, 12, 12],
    [-14, 9, 8],
    [12, 11, 4],
    [-2, 13, -2],
    [2, 9, -12],
    [-14, 10, -20],
    [12, 14, -20],
    [-2, 12, -28],
    [6, 10, -32],
    [-12, 11, -38],
    [10, 9, -42],
];

export function buildEasyMap() {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 30, 1);
    const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });

    for (let i = 0; i < 10; i++) {
        const pillar = new THREE.Mesh(geometry, material);
        pillar.position.set(
            Math.random() * 50 - 25,
            0.5,
            Math.random() * 50 - 25
        );
        group.add(pillar);
    }

    return {
        group,
        spawn: {
            position: new THREE.Vector3(0, 0.1, 0),
            rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
        },
        obstacles: [],
        gates: [],
    };
}

export function buildHardMap() {
    const group = new THREE.Group();
    const gates = GATE_DEFINITIONS.map((definition, index) => createGate(definition, index, group));
    const obstacles = [];

    const boxMaterial = new THREE.MeshPhongMaterial({ color: 0x7a2c2c });
    for (const definition of BOX_OBSTACLES) {
        addBoxObstacle(group, obstacles, definition.position, definition.size, boxMaterial);
    }

    const pillarMaterial = new THREE.MeshPhongMaterial({ color: 0x1e6b1e });
    for (const [x, height, z] of PILLARS) {
        addBoxObstacle(group, obstacles, [x, height / 2, z], [1, height, 1], pillarMaterial);
    }

    return {
        group,
        spawn: {
            position: new THREE.Vector3(0, 2, 20),
            rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
        },
        obstacles,
        gates,
    };
}

function addBoxObstacle(group, obstacles, position, size, material) {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    group.add(mesh);

    const center = new THREE.Vector3(position[0], position[1], position[2]);
    const halfSize = new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2);
    obstacles.push({
        min: center.clone().sub(halfSize),
        max: center.clone().add(halfSize),
    });
}

function createGate(definition, index, parent) {
    const gateGroup = new THREE.Group();
    const center = new THREE.Vector3(...definition.position);
    gateGroup.position.copy(center);
    gateGroup.rotation.y = THREE.MathUtils.degToRad(definition.yaw);

    const frameMaterial = new THREE.MeshPhongMaterial({ color: 0xff8800 });

    if (definition.type === 'square') {
        const horizontalBar = new THREE.BoxGeometry(6.5, 0.5, 0.5);
        const verticalBar = new THREE.BoxGeometry(0.5, 6, 0.5);
        const bars = [
            { geometry: horizontalBar, position: [0, 3.25, 0] },
            { geometry: horizontalBar, position: [0, -3.25, 0] },
            { geometry: verticalBar, position: [-3.25, 0, 0] },
            { geometry: verticalBar, position: [3.25, 0, 0] },
        ];

        for (const bar of bars) {
            const mesh = new THREE.Mesh(bar.geometry, frameMaterial);
            mesh.position.set(bar.position[0], bar.position[1], bar.position[2]);
            gateGroup.add(mesh);
        }
    } else {
        const torus = new THREE.Mesh(new THREE.TorusGeometry(3, 0.3, 12, 48), frameMaterial);
        gateGroup.add(torus);
    }

    const numberSprite = createNumberSprite(index + 1);
    numberSprite.position.set(0, 5.8, 0);
    gateGroup.add(numberSprite);
    parent.add(gateGroup);

    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(upAxis, gateGroup.rotation.y);
    const lateral = new THREE.Vector3(1, 0, 0).applyAxisAngle(upAxis, gateGroup.rotation.y);

    return {
        center,
        normal,
        lateral,
        halfWidth: 3,
        halfHeight: 3,
        type: definition.type,
        frameMaterial,
        group: gateGroup,
    };
}

function createNumberSprite(number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 64, 68);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3, 3, 1);
    return sprite;
}

export function disposeGroup(group) {
    const geometries = new Set();
    const materials = new Set();

    group.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (!object.material) return;
        if (Array.isArray(object.material)) {
            object.material.forEach((material) => materials.add(material));
        } else {
            materials.add(object.material);
        }
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
    });

    group.clear();
}
```

- [ ] **Step 2: 修改 `src/engine.js` 的地图部分**

在文件顶部改为：

```js
import * as THREE from 'three';
import { buildEasyMap, buildHardMap, disposeGroup } from './maps.js';
```

删除原来的柱子创建代码（旧文件 53–65 行）：

```js
// Орієнтири
const boxGeometry = new THREE.BoxGeometry(1, 30, 1);
const boxMaterial = new THREE.MeshPhongMaterial({ color: 0x00FF0080, wireframe: false });

for (let i = 0; i < 10; i++) {
    const cube = new THREE.Mesh(boxGeometry, boxMaterial);
    cube.position.set(
        Math.random() * 50 - 25,
        0.5,
        Math.random() * 50 - 25
    );
    scene.add(cube);
}
```

在 `cameraTarget.add(camera);` 之后加入：

```js
const mapButtons = document.querySelectorAll('.map-button');
const raceHud = document.getElementById('race-hud');

let currentMapName = 'easy';
let currentMap = null;
let currentMapGroup = null;
let raceActive = false;

function resetFlight() {
    cameraTarget.position.copy(currentMap.spawn.position);
    rotation.copy(currentMap.spawn.rotation);
    cameraTarget.rotation.copy(rotation);
    velocity.set(0, 0, 0);
    keyboardThrottle = 0.5;
}

function loadMap(name) {
    if (currentMapGroup) {
        scene.remove(currentMapGroup);
        disposeGroup(currentMapGroup);
    }

    currentMapName = name;
    currentMap = name === 'hard' ? buildHardMap() : buildEasyMap();
    currentMapGroup = currentMap.group;
    scene.add(currentMapGroup);

    resetFlight();
    raceActive = name === 'hard';
    raceHud.hidden = !raceActive;

    mapButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.map === name);
    });
}

mapButtons.forEach((button) => {
    button.addEventListener('click', () => {
        if (button.dataset.map !== currentMapName) {
            loadMap(button.dataset.map);
        }
    });
});
```

把文件末尾的 `animate();` 改为：

```js
loadMap('easy');
animate();
```

- [ ] **Step 3: 验证切换**

启动服务后，用浏览器打开页面：

```bash
python3 -m http.server 8765
```

Expected:
- 默认简单地图仍是随机柱阵。
- 点击「困难地图」后出现 8 道门（带编号牌）、柱阵和方箱，右上角按钮高亮切换。
- 点击「简单地图」能切回，无控制台报错。
- 困难地图的赛道 HUD 此时显示静态内容（计时逻辑下一 Task 接入）。

截图检查：

```bash
npx --no-install playwright screenshot --channel chrome --wait-for-timeout 2000 --viewport-size "1280,720" http://localhost:8765 /tmp/map-easy.png
```

- [ ] **Step 4: 提交**

```bash
git add src/maps.js src/engine.js
git commit -m "Add easy and hard map builders with map switching"
```

### Task 3: 计时与顺序穿门

**Files:**
- Create: `src/race.js`
- Modify: `src/engine.js`：引入 `Race`、初始化 DOM 引用、`loadMap` 内接入赛道、键盘/手柄首次输入触发计时、动画循环更新赛道

- [ ] **Step 1: 新建 `src/race.js`**

```js
import * as THREE from 'three';

export function formatRaceTime(milliseconds) {
    const total = Math.max(0, milliseconds);
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const centiseconds = Math.floor((total % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

export class Race {
    constructor({ gateProgress, timeDisplay, resultPanel, finalTime }) {
        this.gateProgress = gateProgress;
        this.timeDisplay = timeDisplay;
        this.resultPanel = resultPanel;
        this.finalTime = finalTime;

        this.gates = [];
        this.currentGate = 0;
        this.state = 'idle';
        this.startTime = 0;
        this.finishTime = 0;
        this.active = false;
        this.prevPosition = new THREE.Vector3();
        this.prevDistance = null;
    }

    load(gates) {
        this.gates = gates;
        this.active = true;
        this.state = 'idle';
        this.currentGate = 0;
        this.startTime = 0;
        this.finishTime = 0;
        this.prevDistance = null;
        this.resultPanel.hidden = true;
        this.timeDisplay.textContent = '等待开始 — 推油门或拨动摇杆';
        this.gateProgress.textContent = `穿门 0 / ${this.gates.length}`;
        this.paintGates();
    }

    unload() {
        this.active = false;
        this.gates = [];
        this.currentGate = 0;
        this.state = 'idle';
        this.prevDistance = null;
        this.resultPanel.hidden = true;
    }

    noteInput() {
        if (!this.active || this.state !== 'idle') return;
        this.state = 'running';
        this.startTime = performance.now();
        this.prevDistance = null;
    }

    reset() {
        if (!this.active) return;
        this.state = 'idle';
        this.currentGate = 0;
        this.startTime = 0;
        this.finishTime = 0;
        this.prevDistance = null;
        this.resultPanel.hidden = true;
        this.timeDisplay.textContent = '等待开始 — 推油门或拨动摇杆';
        this.gateProgress.textContent = `穿门 0 / ${this.gates.length}`;
        this.paintGates();
    }

    update(position) {
        if (!this.active || this.state !== 'running') return;

        this.timeDisplay.textContent = `用时 ${formatRaceTime(performance.now() - this.startTime)}`;
        this.checkGate(position);
        this.prevPosition.copy(position);
    }

    checkGate(position) {
        const gate = this.gates[this.currentGate];
        if (!gate) return;

        const distance = position.clone().sub(gate.center).dot(gate.normal);
        if (this.prevDistance !== null && this.prevDistance * distance < 0) {
            const denominator = this.prevDistance - distance;
            const t = denominator === 0 ? 0 : this.prevDistance / denominator;
            const crossing = this.prevPosition.clone().lerp(position, t);
            const local = crossing.sub(gate.center);
            const lateral = local.dot(gate.lateral);
            const vertical = local.y;

            if (Math.abs(lateral) <= gate.halfWidth && Math.abs(vertical) <= gate.halfHeight) {
                this.passGate();
                return;
            }
        }

        this.prevDistance = distance;
    }

    passGate() {
        const passedGate = this.gates[this.currentGate];
        passedGate.frameMaterial.color.setHex(0x555555);
        this.currentGate += 1;
        this.gateProgress.textContent = `穿门 ${this.currentGate} / ${this.gates.length}`;

        if (this.currentGate >= this.gates.length) {
            this.finish();
            return;
        }

        this.prevDistance = null;
        this.paintGates();
    }

    finish() {
        this.state = 'finished';
        this.finishTime = performance.now() - this.startTime;
        const formatted = formatRaceTime(this.finishTime);
        this.timeDisplay.textContent = `用时 ${formatted}`;
        this.finalTime.textContent = formatted;
        this.resultPanel.hidden = false;
    }

    paintGates() {
        this.gates.forEach((gate, index) => {
            if (index === this.currentGate) {
                gate.frameMaterial.color.setHex(0x00ff66);
            } else if (index < this.currentGate) {
                gate.frameMaterial.color.setHex(0x555555);
            } else {
                gate.frameMaterial.color.setHex(0xff8800);
            }
        });
    }
}
```

- [ ] **Step 2: 在 `src/engine.js` 接入赛道**

顶部加入：

```js
import { Race } from './race.js';
```

在 `const raceHud = document.getElementById('race-hud');` 之后加入：

```js
const race = new Race({
    gateProgress: document.getElementById('gate-progress'),
    timeDisplay: document.getElementById('race-time'),
    resultPanel: document.getElementById('race-result'),
    finalTime: document.getElementById('final-time'),
});

document.getElementById('restart-race').addEventListener('click', () => {
    resetFlight();
    race.reset();
});
```

把 `loadMap` 中的：

```js
raceActive = name === 'hard';
raceHud.hidden = !raceActive;
```

替换为：

```js
raceActive = name === 'hard';
raceHud.hidden = !raceActive;
if (raceActive) {
    race.load(currentMap.gates);
} else {
    race.unload();
}
```

在键盘监听中触发计时。把现有：

```js
const controlledKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
```

改为：

```js
const controlledKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const flightKeys = ["KeyW", "KeyA", "KeyS", "KeyD", ...controlledKeys];
```

并把 `keydown` 监听改为：

```js
window.addEventListener("keydown", (e) => {
    if (controlledKeys.includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (raceActive && flightKeys.includes(e.code)) {
        race.noteInput();
    }
});
```

在 `updateFlight` 的手柄分支 `if (gp) {` 开头加入：

```js
    if (!gamepadAxisBaseline) {
        gamepadAxisBaseline = gp.axes.slice();
    } else if (raceActive && race.state === 'idle') {
        const moved = gp.axes.some((value, index) =>
            Math.abs(value - (gamepadAxisBaseline[index] || 0)) > 0.1
        );
        if (moved) race.noteInput();
    }
```

在 `let raceActive = false;` 旁边加入：

```js
let gamepadAxisBaseline = null;
```

并在 `resetFlight` 的 `velocity.set(0, 0, 0);` 之后加入：

```js
    gamepadAxisBaseline = null;
```

并把 `animate` 改为：

```js
function animate() {
    requestAnimationFrame(animate);
    updateFlight();
    if (raceActive) {
        race.update(cameraTarget.position);
    }
    renderer.render(scene, camera);
    drawHUD();
}
```

- [ ] **Step 3: 写验证脚本**

创建 `/tmp/fpv-verify/verify-race.js`：

```js
const { chromium } = require('/Users/enmonster/.npm/_npx/13ab0715f9f30c2e/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('http://localhost:8765');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('#race-hud').isVisible(), false, 'easy map must hide race HUD');

    await page.locator('button[data-map="hard"]').click();
    assert.equal(await page.locator('#race-hud').isVisible(), true, 'hard map must show race HUD');
    assert.match(await page.locator('#gate-progress').textContent(), /穿门 0 \/ 8/);
    assert.match(await page.locator('#race-time').textContent(), /等待开始/);
    await page.screenshot({ path: '/tmp/fpv-hard.png' });

    await page.keyboard.down('w');
    await page.waitForTimeout(2500);
    await page.keyboard.up('w');
    assert.match(await page.locator('#race-time').textContent(), /用时/);
    assert.match(await page.locator('#gate-progress').textContent(), /穿门 1 \/ 8/);
    await page.screenshot({ path: '/tmp/fpv-gate1.png' });

    await page.locator('button[data-map="easy"]').click();
    assert.equal(await page.locator('#race-hud').isVisible(), false);
    await page.locator('button[data-map="hard"]').click();
    assert.match(await page.locator('#gate-progress').textContent(), /穿门 0 \/ 8/);
    assert.match(await page.locator('#race-time').textContent(), /等待开始/);

    assert.deepEqual(errors, [], 'no page errors');
    console.log('race verification passed');
    await browser.close();
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
```

- [ ] **Step 4: 先运行验证，确认失败**

```bash
python3 -m http.server 8765
node /tmp/fpv-verify/verify-race.js
```

Expected: FAIL，计时文案不会变成「用时」，或进度停在 0/8。

- [ ] **Step 5: 接入后运行验证，确认通过**

完成 Step 2 后重新加载页面并执行：

```bash
node /tmp/fpv-verify/verify-race.js
```

Expected:

```text
race verification passed
```

- [ ] **Step 6: 提交**

```bash
git add src/race.js src/engine.js
git commit -m "Add sequential gate timing and race HUD"
```

### Task 4: 困难地图碰撞

**Files:**
- Modify: `src/engine.js`：新增碰撞函数，在位置更新后调用

- [ ] **Step 1: 增加碰撞函数**

在 `updateFlight` 之前加入：

```js
const droneRadius = 0.5;
const worldUp = new THREE.Vector3(0, 1, 0);

function resolveMapCollisions() {
    for (const box of currentMap.obstacles) {
        resolveAABBCollision(box);
    }
    for (const gate of currentMap.gates) {
        resolveGateCollision(gate);
    }
}

function resolveAABBCollision(box) {
    const position = cameraTarget.position;
    const closest = new THREE.Vector3(
        THREE.MathUtils.clamp(position.x, box.min.x, box.max.x),
        THREE.MathUtils.clamp(position.y, box.min.y, box.max.y),
        THREE.MathUtils.clamp(position.z, box.min.z, box.max.z)
    );
    const delta = position.clone().sub(closest);
    const distance = delta.length();

    if (distance > droneRadius) return;

    let normal;
    let depth;
    if (distance > 1e-6) {
        normal = delta.divideScalar(distance);
        depth = droneRadius - distance;
    } else {
        const penXMin = position.x - box.min.x;
        const penXMax = box.max.x - position.x;
        const penYMin = position.y - box.min.y;
        const penYMax = box.max.y - position.y;
        const penZMin = position.z - box.min.z;
        const penZMax = box.max.z - position.z;
        const smallest = Math.min(penXMin, penXMax, penYMin, penYMax, penZMin, penZMax);

        if (smallest === penXMin) normal = new THREE.Vector3(-1, 0, 0);
        else if (smallest === penXMax) normal = new THREE.Vector3(1, 0, 0);
        else if (smallest === penYMin) normal = new THREE.Vector3(0, -1, 0);
        else if (smallest === penYMax) normal = new THREE.Vector3(0, 1, 0);
        else if (smallest === penZMin) normal = new THREE.Vector3(0, 0, -1);
        else normal = new THREE.Vector3(0, 0, 1);

        depth = smallest + droneRadius;
    }

    applyBounce(normal, depth);
}

function resolveGateCollision(gate) {
    if (gate.type === 'square') {
        const halfDepth = 0.25;
        const inner = 3;
        const outer = 3.25;
        collideLocalBox(gate, -outer, outer, inner, outer, halfDepth);
        collideLocalBox(gate, -outer, outer, -outer, -inner, halfDepth);
        collideLocalBox(gate, -outer, -inner, -inner, inner, halfDepth);
        collideLocalBox(gate, inner, outer, -inner, inner, halfDepth);
        return;
    }

    const offset = cameraTarget.position.clone().sub(gate.center);
    const lateral = offset.dot(gate.lateral);
    const vertical = offset.y;
    const along = offset.dot(gate.normal);
    const radial = Math.hypot(lateral, vertical);
    const ringRadius = 3;
    const tubeRadius = 0.3;
    const clearance = tubeRadius + droneRadius;

    if (Math.abs(radial - ringRadius) > clearance || Math.abs(along) > clearance) {
        return;
    }

    const radialX = radial > 1e-6 ? lateral / radial : 0;
    const radialY = radial > 1e-6 ? vertical / radial : 1;
    const normal = gate.lateral.clone()
        .multiplyScalar(radialX)
        .addScaledVector(worldUp, radialY);
    const depth = clearance - Math.abs(radial - ringRadius);
    applyBounce(normal, depth);
}

function collideLocalBox(gate, minX, maxX, minY, maxY, halfDepth) {
    const offset = cameraTarget.position.clone().sub(gate.center);
    const localX = offset.dot(gate.lateral);
    const localY = offset.y;
    const localZ = offset.dot(gate.normal);

    const closestX = THREE.MathUtils.clamp(localX, minX, maxX);
    const closestY = THREE.MathUtils.clamp(localY, minY, maxY);
    const closestZ = THREE.MathUtils.clamp(localZ, -halfDepth, halfDepth);

    const dx = localX - closestX;
    const dy = localY - closestY;
    const dz = localZ - closestZ;
    const distanceSq = dx * dx + dy * dy + dz * dz;

    if (distanceSq > droneRadius * droneRadius) return;

    let localNormal;
    let depth;
    if (distanceSq > 1e-8) {
        const distance = Math.sqrt(distanceSq);
        localNormal = new THREE.Vector3(dx / distance, dy / distance, dz / distance);
        depth = droneRadius - distance;
    } else {
        const penX = Math.min(localX - minX, maxX - localX);
        const penY = Math.min(localY - minY, maxY - localY);
        const penZ = Math.min(localZ + halfDepth, halfDepth - localZ);
        const smallest = Math.min(penX, penY, penZ);

        if (smallest === penX) {
            localNormal = new THREE.Vector3(localX < (minX + maxX) / 2 ? -1 : 1, 0, 0);
            depth = penX + droneRadius;
        } else if (smallest === penY) {
            localNormal = new THREE.Vector3(0, localY < (minY + maxY) / 2 ? -1 : 1, 0);
            depth = penY + droneRadius;
        } else {
            localNormal = new THREE.Vector3(0, 0, localZ < 0 ? -1 : 1);
            depth = penZ + droneRadius;
        }
    }

    const worldNormal = gate.lateral.clone()
        .multiplyScalar(localNormal.x)
        .addScaledVector(worldUp, localNormal.y)
        .addScaledVector(gate.normal, localNormal.z);
    applyBounce(worldNormal, depth);
}

function applyBounce(normal, depth) {
    cameraTarget.position.addScaledVector(normal, depth + 0.001);

    const normalSpeed = velocity.dot(normal);
    if (normalSpeed < 0) {
        velocity.addScaledVector(normal, -normalSpeed * 1.35);
    }

    const tangent = velocity.clone().addScaledVector(normal, -velocity.dot(normal));
    velocity.addScaledVector(tangent, -0.3);
}
```

- [ ] **Step 2: 在位置更新后调用碰撞**

在 `updateFlight` 中把：

```js
    velocity.add(acceleration);
    velocity.multiplyScalar(damping);
    cameraTarget.position.add(velocity);
```

改为：

```js
    velocity.add(acceleration);
    velocity.multiplyScalar(damping);
    cameraTarget.position.add(velocity);

    if (raceActive) {
        resolveMapCollisions();
    }
```

- [ ] **Step 3: 手动验证碰撞**

1. 打开困难地图，向前飞，撞向起点右前方 `(6, 2, 14)` 的方箱，确认被弹开而不是穿过去，计时继续。
2. 穿过 1 号门时贴边撞门框，确认会被弹开且不计入穿门。
3. 撞击后继续能操控，不抖动卡死。

- [ ] **Step 4: 提交**

```bash
git add src/engine.js
git commit -m "Add collision response for hard map obstacles and gates"
```

### Task 5: 完整验证

**Files:**
- No code changes

- [ ] **Step 1: 重新运行赛道验证脚本**

```bash
python3 -m http.server 8765
node /tmp/fpv-verify/verify-race.js
```

Expected: `race verification passed`

- [ ] **Step 2: 检查控制台与截图**

查看 `/tmp/fpv-hard.png`、`/tmp/fpv-gate1.png`：

- 困难地图有 8 道带编号的门，当前门绿色、其余橙色。
- 穿过 1 号门后，1 号门变暗，2 号门变绿。
- HUD 显示 `穿门 1 / 8` 和运行中的用时。

- [ ] **Step 3: 手动完成赛道**

用键盘或手柄按顺序飞完 8 道门，确认：

- 完成浮层出现，显示最终用时。
- 点击「再来一次」后回到起点，进度归零，计时等待首次操控。
- 切换简单/困难地图后状态正确重置。

---

## 自检记录

- 规格覆盖：UI、简单地图、困难地图布局、顺序穿门、计时起点、碰撞、资源释放、验证方式均有对应 Task。
- 命名一致性：`buildEasyMap` / `buildHardMap` / `disposeGroup`、`Race.load/unload/noteInput/reset/update`、`gate.frameMaterial` 在各 Task 中一致。
- 无占位符；所有代码步骤都给出了可直接使用的实现。
