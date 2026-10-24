<p align="center">
  <img src="./assets/images/logo.png" alt="FPV Simulator Logo" width="180"/>
</p>

<h1 align="center">FPV-ONLINE</h1>

<p align="center">
  <b>Browser-based FPV drone simulator built by Ukrainian developers 🇺🇦</b><br/>
  Fly freely. No installations. Just your browser and a controller.
</p>

<p align="center">
  <a href="https://vvriter.github.io/FPV-ONLINE/" target="_blank">
    <img src="https://img.shields.io/badge/Try%20it%20now-Fly-blue?style=for-the-badge&logo=airplane&logoColor=white"/>
  </a>
</p>

---

## ✨ Features

- 🧭 **FPV camera simulation** — experience FPV freedom
- 🎮 **Gamepad support** — works with RadioMaster (100% tested), Betaflight-compatible controllers & others
- 🌐 **Runs in browser** — no download, no install, just click & fly
- 🛠 **Custom scene in Three.js** — responsive and performant environment

---

## 🚀 Try it now
👉 [**Click here to launch the simulator**](https://vvriter.github.io/FPV-ONLINE/)

---

## 🖼 Gameplay Screenshots

<p align="center">
  <img src="https://github.com/user-attachments/assets/10ad7305-f6b8-4334-a080-39e25a95a1fa" alt="Gameplay screenshot" width="80%"/>
</p>

---

## 🛠 Tech Stack

- [Three.js](https://threejs.org/) — 3D rendering
- [JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
- HTML / CSS
- Native Gamepad API

---

## 📦 Run locally

The simulator uses ES modules, so it must be served over HTTP — opening `index.html` directly from disk won't work.

```bash
git clone https://github.com/javens0601/FPV-ONLINE.git
cd FPV-ONLINE
python3 -m http.server 8765
```

Then open **http://localhost:8765** in Chrome or Edge.

## 🐞 Known Issues
- Sometimes user need to reload page cuple of times to start simulator
- Physics is not good actualy
- Radiomaster only controller support
