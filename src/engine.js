import * as THREE from 'three';
import { buildEasyMap, buildHardMap, disposeGroup } from './maps.js';
import { Race } from './race.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0a0a0);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('threeCanvas') });
renderer.setSize(window.innerWidth, window.innerHeight);

// Світло
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 7.5);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambientLight);

// Земля як зелена шахматна дошка
// Створення canvas для генерації текстури
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 512;
const ctx = canvas.getContext('2d');

const squares = 8; // шахова дошка 8x8
const squareSize = canvas.width / squares;
const darkGreen = '#228822'; // темно-зелений
const lightGreen = '#88bb88'; // світло-зелений

// Малюємо шаховий паттерн
for (let i = 0; i < squares; i++) {
  for (let j = 0; j < squares; j++) {
    ctx.fillStyle = (i + j) % 2 === 0 ? darkGreen : lightGreen;
    ctx.fillRect(i * squareSize, j * squareSize, squareSize, squareSize);
  }
}

// Створення текстури з canvas
const texture = new THREE.CanvasTexture(canvas);
texture.wrapS = THREE.RepeatWrapping;
texture.wrapT = THREE.RepeatWrapping;
texture.repeat.set(10, 10); // регулюємо кількість повторень текстури

const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshPhongMaterial({ map: texture, side: THREE.DoubleSide });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Сонце – яскрава куля в небі
const sunGeo = new THREE.SphereGeometry(5, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const sun = new THREE.Mesh(sunGeo, sunMat);
sun.position.set(50, 80, -100); // налаштуйте позицію за потреби
scene.add(sun);

// Камера над сценою
let angle = 0;
const radius = 30;
const height = 20;

const info = document.getElementById("info");
let gamepadConnected = false;

// Обробка підключення геймпада
window.addEventListener("gamepadconnected", (e) => {
    console.log("Геймпад підключено:", e.gamepad.id);
    gamepadConnected = true;
    info.style.display = "block";
});

window.addEventListener("gamepaddisconnected", (e) => {
    console.log("Геймпад відключено");
    gamepadConnected = false;
    info.style.display = "block";
});

// Керування з клавіатури, якщо геймпад не підключений
const keys = new Set();
const controlledKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const flightKeys = ["KeyW", "KeyA", "KeyS", "KeyD", ...controlledKeys];
let keyboardThrottle = 0.5;

window.addEventListener("keydown", (e) => {
    if (controlledKeys.includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (raceActive && flightKeys.includes(e.code)) {
        race.noteInput();
    }
});

window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
});

window.addEventListener("blur", () => {
    keys.clear();
});

// Початкові параметри FPV
let velocity = new THREE.Vector3(0, 0, 0);
let acceleration = new THREE.Vector3(0, 0, 0);
const gravity = -0.002;
const damping = 0.98; // гальмування
let rotation = new THREE.Euler(0, 0, 0, 'YXZ');
let cameraTarget = new THREE.Object3D();
scene.add(cameraTarget);
cameraTarget.add(camera);

const mapButtons = document.querySelectorAll('.map-button');
const raceHud = document.getElementById('race-hud');
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

let currentMapName = 'easy';
let currentMap = null;
let currentMapGroup = null;
let raceActive = false;
let gamepadAxisBaseline = null;

function resetFlight() {
    cameraTarget.position.copy(currentMap.spawn.position);
    rotation.copy(currentMap.spawn.rotation);
    cameraTarget.rotation.copy(rotation);
    velocity.set(0, 0, 0);
    keyboardThrottle = 0.5;
    gamepadAxisBaseline = null;
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
    if (raceActive) {
        race.load(currentMap.gates);
    } else {
        race.unload();
    }

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

function animate() {
    requestAnimationFrame(animate);
    updateFlight();
    if (raceActive) {
        race.update(cameraTarget.position);
    }
    renderer.render(scene, camera);
    drawHUD();
}

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
    if (gate.center.y + minY < 0) return;

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

function updateFlight() {
    const gp = gamepadConnected ? navigator.getGamepads()[0] : null;

    let yawInput = 0;
    let pitchInput = 0;
    let rollInput = 0;
    let throttle = 0;

    if (gp) {
        if (!gamepadAxisBaseline) {
            gamepadAxisBaseline = gp.axes.slice();
        } else if (raceActive && race.state === 'idle') {
            const moved = gp.axes.some((value, index) =>
                Math.abs(value - (gamepadAxisBaseline[index] || 0)) > 0.1
            );
            if (moved) race.noteInput();
        }

        const rx = gp.axes[0] || 0; // правий стік X
        const ry = gp.axes[1] || 0; // правий стік Y
        const ly = gp.axes[2] || 0; // лівий стік X
        const lx = gp.axes[3] || 0; // лівий стік Y

        yawInput = lx * 0.05;
        throttle = ((ly + 1) / 2) * 0.1; // [0, 1]
        pitchInput = -ry * 0.03;
        rollInput = rx * 0.03;
    } else {
        yawInput = ((keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0)) * 0.03;
        pitchInput = ((keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0)) * 0.02;
        rollInput = ((keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0)) * 0.02;

        const throttleStep = ((keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0)) * 0.01;
        keyboardThrottle = THREE.MathUtils.clamp(keyboardThrottle + throttleStep, 0, 1);
        throttle = keyboardThrottle * 0.1;
    }

    if (raceActive && race.state === 'idle') {
        velocity.set(0, 0, 0);
        return;
    }

    // Оновлення обертання
    rotation.y -= yawInput;
    rotation.x = THREE.MathUtils.clamp(rotation.x + pitchInput, -Math.PI / 2, Math.PI / 2);
    rotation.z = THREE.MathUtils.clamp(rotation.z - rollInput, -Math.PI / 2, Math.PI / 2);
    cameraTarget.rotation.copy(rotation);

    // Гравітація та рух
    acceleration.set(0, gravity, 0); // вниз
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(rotation).multiplyScalar(throttle * 0.1);
    acceleration.add(forward);

    // Оновлюємо швидкість та позицію
    velocity.add(acceleration);
    velocity.multiplyScalar(damping); // гальмування
    cameraTarget.position.add(velocity);

    if (raceActive) {
        resolveMapCollisions();
    }

    // Колізія з землею
    if (cameraTarget.position.y < 0.1) {
        cameraTarget.position.y = 0.1;
        velocity.y = Math.max(0, velocity.y); // не падати вниз
    }
}


const hudCanvas = document.getElementById('interface');
const hudCtx = hudCanvas.getContext('2d');
hudCanvas.width = window.innerWidth;
hudCanvas.height = window.innerHeight;
hudCtx.lineWidth = 2;
hudCtx.strokeStyle = 'white';
hudCtx.font = '16px monospace';
hudCtx.fillStyle = 'lime';

function drawHUD() {
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);

    const centerX = hudCanvas.width / 2;
    const centerY = hudCanvas.height / 2;

    // Обчислення нахилу та обертання (roll і pitch)
    const pitch = THREE.MathUtils.radToDeg(rotation.x);
    const roll = THREE.MathUtils.radToDeg(rotation.z);

    // Горизонтальна лінія (штучний горизонт)
    hudCtx.save();
    hudCtx.translate(centerX, centerY - 160);
    hudCtx.rotate(rotation.z); // обертання горизонту відповідно до roll
    hudCtx.strokeStyle = "#ccc";
    hudCtx.setLineDash([5, 5]);
    hudCtx.beginPath();
    hudCtx.moveTo(-150, pitch);
    hudCtx.lineTo(150, pitch);
    hudCtx.stroke();
    hudCtx.restore();

    // Центрувальний хрестик з чистим стилем (без dash)
    hudCtx.save();
    hudCtx.setLineDash([]); // скидаємо dash
    hudCtx.strokeStyle = "#ccc";
    hudCtx.beginPath();
    hudCtx.moveTo(centerX - 10, centerY);
    hudCtx.lineTo(centerX + 10, centerY);
    hudCtx.moveTo(centerX, centerY - 10);
    hudCtx.lineTo(centerX, centerY + 10);
    hudCtx.stroke();
    hudCtx.restore();

    // Бокові вертикальні лінії FPV-інтерфейсу
    hudCtx.save();
    hudCtx.strokeStyle = "#ccc";
    hudCtx.setLineDash([5, 5]);
    hudCtx.beginPath();
    // Ліва лінія
    hudCtx.moveTo(centerX - 200, 320);
    hudCtx.lineTo(centerX - 200, 600);
    // Права лінія
    hudCtx.moveTo(centerX + 200, 320);
    hudCtx.lineTo(centerX + 200, 600);
    hudCtx.stroke();
    hudCtx.restore();

    // Текстові елементи
    hudCtx.fillText("FPV ONLINE", 20, 30);
    hudCtx.fillText("HEIGHT: " + Math.round(cameraTarget.position.y.toFixed(1)) + "m", 20, 55);

    // Індикатор швидкості (обчислюємо швидкість як довжину velocity)
    const speed = velocity.length();
    hudCtx.fillText("SPEED: " + Math.round(speed.toFixed(2) * 150) + " m/s", 20, 80);
}

loadMap('easy');
animate();

