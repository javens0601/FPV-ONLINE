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
