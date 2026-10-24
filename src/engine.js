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

