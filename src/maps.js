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
