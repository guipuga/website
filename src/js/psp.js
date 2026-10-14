/* ============================================================
   THE MACHINE — PS Vita UI & Interactive 3D Model
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import vitaModelUrl from '../assets/models/ps_vita_slim_model_pch-2000.glb?url';

const WORKS = window.SK_WORKS || [];
const SK = window.SK || { fireReady() {}, onReady(f) { f(); } };
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('pspCanvas');
const stage = document.querySelector('.machine__stage');
const section = document.querySelector('.machine');
const loadingEl = document.getElementById('pspLoading');

const railIdx = document.getElementById('railIdx');
const railTot = document.getElementById('railTot');
const railOpen = document.getElementById('railOpen');
const railEl = document.getElementById('rail');

if (canvas) init();

function init() {
  /* ---------------------------------------------------------- */
  /* RENDERER / SCENE                                            */
  /* ---------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  camera.position.set(0, 0, 30);

  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  scene.add(root);

  /* Iluminação */
  const hemi = new THREE.HemisphereLight(0x2a3a4d, 0x05070a, 0.55);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xbcd4e8, 0.85);
  keyLight.position.set(-8, 9, 12);
  scene.add(keyLight);

  const rimIce = new THREE.DirectionalLight(0x7fe3ff, 1.15);
  rimIce.position.set(11, 4, -9);
  scene.add(rimIce);

  const rimHot = new THREE.DirectionalLight(0xff2e7e, 0.75);
  rimHot.position.set(-12, -5, -7);
  scene.add(rimHot);

  const spillA = new THREE.PointLight(0xffffff, 0, 28, 2);
  spillA.visible = false;
  scene.add(spillA);

  const pressLight = new THREE.PointLight(0x7fe3ff, 0, 9, 2);
  pressLight.visible = false;
  scene.add(pressLight);
  let pressLightLife = 0;

  /* ---------------------------------------------------------- */
  /* SCREEN CANVAS                                              */
  /* ---------------------------------------------------------- */
  const SW = 960, SH = 544; // Resolução nativa da PS Vita
  const sc = document.createElement('canvas');
  sc.width = SW;
  sc.height = SH;
  const sctx = sc.getContext('2d', { willReadFrequently: false });
  sctx.fillStyle = '#05070a';
  sctx.fillRect(0, 0, SW, SH);

  const screenTex = new THREE.CanvasTexture(sc);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.minFilter = THREE.LinearFilter;
  screenTex.magFilter = THREE.LinearFilter;
  screenTex.generateMipmaps = false;

  const av = document.createElement('canvas');
  av.width = 8;
  av.height = 5;
  const avctx = av.getContext('2d', { willReadFrequently: true });

  /* ---------------------------------------------------------- */
  /* SCREEN MATERIAL (PS Vita OLED/LCD limpo e nítido)          */
  /* ---------------------------------------------------------- */
  const crtMat = new THREE.ShaderMaterial({
    uniforms: {
      uTex:    { value: screenTex },
      uTime:   { value: 0 },
      uPower:  { value: 0 },       // 0 = desligado, 1 = ligado
      uWarp:   { value: 0 },       // transição de mudança
      uBright: { value: 1.0 }
    },
    transparent: false,
    toneMapped: false,
    vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
    fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D uTex;
    uniform float uTime, uPower, uWarp, uBright;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;

      // Rasgo subtil apenas durante transições rápidas (uWarp)
      if (uWarp > 0.001) {
        float band = step(0.5, hash(vec2(floor(uv.y * 30.0), floor(uTime * 20.0))));
        uv.x += uWarp * (band - 0.5) * 0.04;
      }

      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.02, 0.03, 0.05, 1.0);
        return;
      }

      // Amostragem direta em alta definição (limpa e sem filtros escuros)
      vec3 col = texture2D(uTex, uv).rgb;

      // Animação de arranque: linha horizontal que expande
      float open = smoothstep(0.0, 1.0, uPower);
      float slit = smoothstep(open * 0.65 + 0.002, 0.0, abs(uv.y - 0.5));
      col = mix(vec3(0.6, 0.85, 1.0) * slit * 2.0, col, open);
      col *= open;

      gl_FragColor = vec4(col * uBright, 1.0);
    }`
  });

  /* ---------------------------------------------------------- */
  /* MODEL LOAD & SETUP                                         */
  /* ---------------------------------------------------------- */
  let screenMesh = null;
  const buttons = {};
  const pressable = [];
  let modelReady = false;
  const shellMats = [];
  let dirtyFrames = 30;
  function markDirty(n = 6) { dirtyFrames = Math.max(dirtyFrames, n); }

  function tintable(m) {
    m.userData.uInv = { value: 0 };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uInv = m.userData.uInv;
      shader.fragmentShader = 'uniform float uInv;\n' + shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0) - diffuseColor.rgb, uInv);'
      );
    };
    return m;
  }

  let shellInverted = false;
  SK.setShellInvert = function (on) {
    shellInverted = !!on;
    shellMats.forEach((m) => { if (m.userData.uInv) m.userData.uInv.value = on ? 1 : 0; });
    keyLight.visible = rimIce.visible = rimHot.visible = !on;
    hemi.intensity = on ? 3.1 : 0.55;
    markDirty(15);
  };

  new GLTFLoader().load(
      vitaModelUrl,
      (gltf) => { setup(gltf.scene); },
      undefined,
      (err) => {
        console.error('[psvita] model failed', err);
        if (loadingEl) loadingEl.textContent = 'HARDWARE UNAVAILABLE - PS Vita model did not load';
        SK.fireReady();
      }
  );

  function setup(src) {
    model.add(src);
    src.updateWorldMatrix(true, true);

    const parts = {};
    const bin = [];
    src.traverse((o) => {
      if (!o.isMesh) return;
      const n = o.name.toLowerCase();
      if (n.indexOf('ground') === 0) { bin.push(o); return; }
      if (n.indexOf('screen') === 0 || /(display|lcd|glass|panel)/.test(n) || (o.material && o.material.name === 'Screen')) screenMesh = o;
      const m = n.match(/^button(\d+)/);
      if (m) parts['b' + m[1]] = o;
      if (o.material) {
        o.material = o.material.clone();
        // Disable physical transmission pass to eliminate expensive offscreen render target & GPU mipmap passes
        if (o.material.transmission !== undefined && o.material.transmission > 0) {
          o.material.transmission = 0;
          o.material.transparent = true;
          o.material.opacity = 0.55;
          o.material.roughness = 0.15;
          o.material.metalness = 0.1;
        }
        shellMats.push(tintable(o.material));
        o.material.envMapIntensity = 1.25;
        if (o.material.metalness !== undefined) {
          o.material.metalness = Math.min(1, (o.material.metalness ?? 0.5) * 0.9 + 0.18);
          o.material.roughness = Math.max(0.12, (o.material.roughness ?? 0.5) * 0.82);
        }
      }
    });

    bin.forEach((o) => { o.parent && o.parent.remove(o); });

    if (!screenMesh) screenMesh = findScreenMesh(src);
    if (!screenMesh) { console.warn('[psvita] no screen mesh'); SK.fireReady(); return; }

    const nrm = largestFaceNormal(screenMesh);
    const centreOf = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    const centre = centreOf(src);
    const sCentre = centreOf(screenMesh);
    if (nrm.dot(sCentre.clone().sub(centre)) < 0) nrm.negate();

    const rowKeys = ['b9', 'b10', 'b11', 'b12', 'b13', 'b14', 'b15'];
    const row = new THREE.Vector3();
    let rowN = 0;
    rowKeys.forEach((k) => { if (parts[k]) { row.add(centreOf(parts[k])); rowN++; } });

    let up;
    if (rowN) {
      row.divideScalar(rowN);
      const down = row.sub(sCentre).projectOnPlane(nrm).normalize();
      up = down.negate();
    } else {
      up = new THREE.Vector3(0, 1, 0).projectOnPlane(nrm).normalize();
    }
    const right = new THREE.Vector3().crossVectors(up, nrm).normalize();
    up.crossVectors(nrm, right).normalize();

    const basis = new THREE.Matrix4().makeBasis(right, up, nrm);
    model.quaternion.setFromRotationMatrix(basis).invert();
    model.updateWorldMatrix(true, true);

    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar(10 / Math.max(size.x, size.y, size.z));
    model.updateWorldMatrix(true, true);
    model.position.sub(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
    model.updateWorldMatrix(true, true);
    fitToView();

    const sNrm = largestFaceNormal(screenMesh);
    if (sNrm.z < 0) sNrm.negate();
    buildScreenUVs(screenMesh, sNrm, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
    if (screenMesh.material && screenMesh.material !== crtMat) {
      const oldMat = screenMesh.material;
      if (oldMat.map) oldMat.map.dispose();
      if (oldMat.normalMap) oldMat.normalMap.dispose();
      if (oldMat.roughnessMap) oldMat.roughnessMap.dispose();
      if (oldMat.metalnessMap) oldMat.metalnessMap.dispose();
      if (oldMat.emissiveMap) oldMat.emissiveMap.dispose();
      oldMat.dispose();
    }
    screenMesh.material = crtMat;
    screenMesh.renderOrder = 2;

    mapButton('up', parts.b1);
    mapButton('right', parts.b2);
    mapButton('down', parts.b3);
    mapButton('left', parts.b4);
    mapButton('triangle', parts.b5);
    mapButton('circle', parts.b6);
    mapButton('cross', parts.b7);
    mapButton('square', parts.b8);
    mapButton('home', parts.b9);
    mapButton('select', parts.b14);
    mapButton('start', parts.b15);
    ['b10', 'b11', 'b12', 'b13'].forEach((k2, i) => mapButton('aux' + i, parts[k2]));

    function mapButton(role, mesh) {
      if (!mesh) return;
      const parent = mesh.parent || model;
      const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq);
      const ps = new THREE.Vector3(); parent.getWorldScale(ps);
      const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(pq.invert());
      axis.set(
          axis.x / (ps.x || 1),
          axis.y / (ps.y || 1),
          axis.z / (ps.z || 1)
      );
      buttons[role] = { role, mesh, home: mesh.position.clone(), axis, t: 0 };
      if (['up', 'right', 'down', 'left', 'cross', 'circle', 'triangle', 'square', 'start', 'select', 'home'].indexOf(role) > -1) {
        mesh.userData.role = role;
        pressable.push(mesh);
      }
    }

    const sb = new THREE.Box3().setFromObject(screenMesh);
    const sc2 = sb.getCenter(new THREE.Vector3());
    const halfW = (sb.max.x - sb.min.x) / 2;
    spillA.position.set(sc2.x, sc2.y, sc2.z + 2.0);

    screenMesh.userData.role = 'screen';
    pressable.push(screenMesh);

    modelReady = true;
    if (loadingEl) loadingEl.classList.add('is-off');
    SK.fireReady();
    select(0, true);
    setTimeout(() => powerOn(), reduce ? 0 : 260);
    markDirty(40);
  }

  function largestFaceNormal(mesh) {
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    const count = idx ? idx.count : pos.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cr = new THREE.Vector3();
    let best = -1;
    const out = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < count; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      ab.subVectors(b, a); ac.subVectors(c, a);
      cr.crossVectors(ab, ac);
      const area = cr.lengthSq();
      if (area > best) { best = area; out.copy(cr).normalize(); }
    }
    return out.applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();
  }

  function findScreenMesh(rootNode) {
    let best = null;
    let bestScore = -Infinity;
    rootNode.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      if (!bb) return;
      const s = bb.getSize(new THREE.Vector3());
      const dims = [s.x, s.y, s.z].sort((a, b) => a - b);
      const thickness = dims[0], h = dims[1], w = dims[2];
      if (h <= 0 || w <= 0) return;
      const area = h * w;
      const ratio = w / h;
      const flatness = thickness / Math.max(w, h);
      const ratioScore = 1 / (1 + Math.abs(ratio - (16 / 9)));
      const thinScore = 1 / (1 + flatness * 18);
      const score = area * ratioScore * thinScore;
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    });
    return best;
  }

  function buildScreenUVs(mesh, nrm, right, up) {
    const geo = mesh.geometry;
    const p = geo.getAttribute('position');
    const mw = mesh.matrixWorld;
    const wp = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mw);
      wp.push(v.clone());
    }

    const e1 = right.clone().projectOnPlane(nrm).normalize();
    const e2 = new THREE.Vector3().crossVectors(nrm, e1).normalize();

    const a = [], b = [];
    let ma = 0, mb = 0;
    for (let i = 0; i < wp.length; i++) {
      const x = wp[i].dot(e1), y = wp[i].dot(e2);
      a.push(x); b.push(y); ma += x; mb += y;
    }
    ma /= a.length; mb /= b.length;

    let Saa = 0, Sbb = 0, Sab = 0;
    for (let i = 0; i < a.length; i++) {
      const da = a[i] - ma, db = b[i] - mb;
      Saa += da * da; Sbb += db * db; Sab += da * db;
    }
    const th = 0.5 * Math.atan2(2 * Sab, Saa - Sbb);
    const cs = Math.cos(th), sn = Math.sin(th);

    const U = e1.clone().multiplyScalar(cs).addScaledVector(e2, sn).normalize();
    const V = e1.clone().multiplyScalar(-sn).addScaledVector(e2, cs).normalize();
    if (U.dot(right) < 0) U.negate();
    if (V.dot(up) < 0) V.negate();

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    const us = [], vs = [];
    for (let i = 0; i < wp.length; i++) {
      const u = wp[i].dot(U), w = wp[i].dot(V);
      us.push(u); vs.push(w);
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (w < minV) minV = w; if (w > maxV) maxV = w;
    }
    const du = (maxU - minU) || 1, dv = (maxV - minV) || 1;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = (us[i] - minU) / du;
      uv[i * 2 + 1] = (vs[i] - minV) / dv;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  /* ---------------------------------------------------------- */
  /* SCREEN CONTENT & LAYOUT                                    */
  /* ---------------------------------------------------------- */
  const cache = new Map();
  function getImage(src) {
    if (cache.has(src)) return cache.get(src);
    const p = new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
    cache.set(src, p);
    return p;
  }

  const vcache = new Map();
  function getVideo(src) {
    if (!src) return Promise.resolve(null);
    if (vcache.has(src)) return vcache.get(src);
    const p = new Promise((res) => {
      const v = document.createElement('video');
      v.src = src;
      v.muted = true; v.defaultMuted = true; v.volume = 0;
      v.loop = true; v.playsInline = true; v.autoplay = false;
      v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      let done = false;
      const ok = () => { if (done) return; done = true; res(v); };
      v.addEventListener('canplaythrough', ok, { once: true });
      v.addEventListener('canplay', ok, { once: true });
      v.addEventListener('error', () => { if (!done) { done = true; res(null); } }, { once: true });
      v.load();
    });
    vcache.set(src, p);
    return p;
  }

  let current = 0;
  let currentView = 'home';
  let currentImage = null;
  let powerT = 0, powerTarget = 0, warpT = 0;
  let live = null;

  function preloadWorkIcons() {
    WORKS.forEach((w) => {
      if (w && w.icon && typeof w.icon === 'string' && (/\.(png|jpg|jpeg|svg|webp)$/i.test(w.icon) || w.icon.startsWith('/') || w.icon.startsWith('data:'))) {
        const img = new Image();
        img.onload = () => {
          w._iconImg = img;
          w._iconLoaded = true;
          if (currentView === 'home' || currentView === 'livearea') {
            drawFrame(WORKS[current] || null, currentImage);
            updateSpill();
          }
          markDirty(15);
        };
        img.onerror = () => { w._iconLoaded = 'error'; };
        img.src = w.icon;
        w._iconLoaded = 'loading';
      }
    });
  }
  preloadWorkIcons();

  const srcW = (s) => (s && (s.videoWidth || s.width)) || 0;
  const srcH = (s) => (s && (s.videoHeight || s.height)) || 0;

  const bg = document.createElement('canvas');
  bg.width = SW; bg.height = SH;
  const bgctx = bg.getContext('2d');

  function paintBackdrop(img) {
    bgctx.setTransform(1, 0, 0, 1, 0, 0);
    bgctx.fillStyle = '#04070b';
    bgctx.fillRect(0, 0, SW, SH);
    if (!img || !srcW(img)) return;
    const ar = srcW(img) / srcH(img), sar = SW / SH;
    bgctx.save();
    try { bgctx.filter = 'blur(34px) saturate(1) brightness(1)'; } catch (e) {}
    let cw, ch;
    if (ar > sar) { ch = SH * 1.28; cw = ch * ar; } else { cw = SW * 1.28; ch = cw / ar; }
    bgctx.drawImage(img, (SW - cw) / 2, (SH - ch) / 2, cw, ch);
    bgctx.restore();
    bgctx.filter = 'none';
  }

  /* PS Vita Colmeia: 10 ícones por página (3 - 4 - 3) */
  const ICONS_PER_PAGE = 10;
  const BUBBLE_RADIUS = 52;
  const ICON_POSITIONS = [
    [255, 115], [480, 115], [705, 115],
    [140, 260], [365, 260], [595, 260], [820, 260],
    [255, 405], [480, 405], [705, 405]
  ];

  /* Mapeamento de navegação D-Pad na grelha 3 - 4 - 3 */
  const STAGGERED_NAV = {
    // slot: [left, right, up, down]
    0: [null, 1, null, 3],
    1: [0, 2, null, 4],
    2: [1, null, null, 6],
    3: [null, 4, 0, 7],
    4: [3, 5, 1, 8],
    5: [4, 6, 1, 8],
    6: [5, null, 2, 9],
    7: [null, 8, 3, null],
    8: [7, 9, 4, null],
    9: [8, null, 6, null]
  };

  function drawScreenBackground(isHome) {
    if (isHome) {
      const bgGrad = sctx.createLinearGradient(0, 0, 0, SH);
      bgGrad.addColorStop(0, '#0a2771');
      bgGrad.addColorStop(0.35, '#134ba8');
      bgGrad.addColorStop(0.7, '#0f3c8f');
      bgGrad.addColorStop(1, '#061747');
      sctx.fillStyle = bgGrad;
      sctx.fillRect(0, 0, SW, SH);

      sctx.save();
      const wave1 = sctx.createLinearGradient(0, 180, SW, 380);
      wave1.addColorStop(0, 'rgba(80, 190, 255, 0.0)');
      wave1.addColorStop(0.4, 'rgba(120, 215, 255, 0.28)');
      wave1.addColorStop(0.7, 'rgba(255, 255, 255, 0.42)');
      wave1.addColorStop(1, 'rgba(100, 180, 255, 0.0)');

      sctx.fillStyle = wave1;
      sctx.beginPath();
      sctx.moveTo(0, 310);
      sctx.bezierCurveTo(SW * 0.25, 280, SW * 0.55, 340, SW, 210);
      sctx.bezierCurveTo(SW * 0.7, 390, SW * 0.3, 440, 0, 390);
      sctx.closePath();
      sctx.fill();

      const wave2 = sctx.createLinearGradient(0, 260, SW, 320);
      wave2.addColorStop(0, 'rgba(255, 255, 255, 0)');
      wave2.addColorStop(0.5, 'rgba(255, 255, 255, 0.38)');
      wave2.addColorStop(1, 'rgba(255, 255, 255, 0)');

      sctx.fillStyle = wave2;
      sctx.beginPath();
      sctx.moveTo(0, 340);
      sctx.bezierCurveTo(SW * 0.35, 320, SW * 0.65, 300, SW, 230);
      sctx.bezierCurveTo(SW * 0.65, 310, SW * 0.35, 335, 0, 355);
      sctx.closePath();
      sctx.fill();

      sctx.restore();
      return;
    }

    sctx.fillStyle = '#060709';
    sctx.fillRect(0, 0, SW, SH);

    if (bg) {
      sctx.save();
      sctx.globalAlpha = 0.35;
      sctx.drawImage(bg, 0, 0);
      sctx.restore();
    }

    const shade = sctx.createLinearGradient(0, 0, 0, SH);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.40)');
    shade.addColorStop(0.6, 'rgba(0, 0, 0, 0.65)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.92)');
    sctx.fillStyle = shade;
    sctx.fillRect(0, 0, SW, SH);
  }

  function drawStatusBar(pageIndex) {
    sctx.save();

    const topGrad = sctx.createLinearGradient(0, 0, 0, 36);
    topGrad.addColorStop(0, 'rgba(0, 10, 35, 0.5)');
    topGrad.addColorStop(1, 'rgba(0, 10, 35, 0)');
    sctx.fillStyle = topGrad;
    sctx.fillRect(0, 0, SW, 36);

    // Sinal Wi-Fi
    sctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    for (let i = 0; i < 4; i++) {
      const h = 5 + i * 4;
      sctx.fillRect(18 + i * 6, 23 - h, 3.5, h);
    }

    // Multitasking / Home icons
    const cx = SW / 2;
    const cy = 16;
    sctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    sctx.beginPath();
    sctx.moveTo(cx - 24, cy - 2);
    sctx.lineTo(cx - 17, cy - 8);
    sctx.lineTo(cx - 10, cy - 2);
    sctx.lineTo(cx - 12, cy - 2);
    sctx.lineTo(cx - 12, cy + 5);
    sctx.lineTo(cx - 22, cy + 5);
    sctx.lineTo(cx - 22, cy - 2);
    sctx.closePath();
    sctx.fill();

    const miniApps = ['#4489eb', '#d94b83', '#3bb175', '#f3a838'];
    miniApps.forEach((col, idx) => {
      const mx = cx + idx * 16 - 2;
      sctx.fillStyle = col;
      sctx.beginPath();
      sctx.arc(mx, cy, 6, 0, Math.PI * 2);
      sctx.fill();
      sctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      sctx.lineWidth = 1;
      sctx.stroke();
    });

    // Orelha de Página (Canto superior direito)
    sctx.beginPath();
    sctx.moveTo(SW, 0);
    sctx.lineTo(SW - 72, 0);
    sctx.bezierCurveTo(SW - 66, 44, SW - 42, 64, SW, 68);
    sctx.closePath();

    const peelGrad = sctx.createLinearGradient(SW - 70, 0, SW, 70);
    peelGrad.addColorStop(0, 'rgba(240, 248, 255, 0.82)');
    peelGrad.addColorStop(1, 'rgba(175, 210, 255, 0.62)');
    sctx.fillStyle = peelGrad;
    sctx.shadowColor = 'rgba(0, 15, 50, 0.35)';
    sctx.shadowBlur = 9;
    sctx.fill();

    sctx.shadowColor = 'transparent';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillStyle = '#0f3680';
    sctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText(String(pageIndex + 1), SW - 26, 26);

    sctx.restore();
  }

  function drawBubble(work, index, x, y, selected) {
    const r = selected ? BUBBLE_RADIUS + 3 : BUBBLE_RADIUS;
    const title = work?.title || '';

    // Sombra projetada
    sctx.save();
    sctx.shadowColor = 'rgba(2, 10, 30, 0.58)';
    sctx.shadowBlur = selected ? 24 : 14;
    sctx.shadowOffsetY = selected ? 9 : 6;
    sctx.beginPath();
    sctx.arc(x, y, r, 0, Math.PI * 2);
    sctx.fillStyle = '#000000';
    sctx.fill();

    if (selected) {
      sctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
      sctx.shadowBlur = 18;
      sctx.strokeStyle = '#ffffff';
      sctx.lineWidth = 3.5;
      sctx.beginPath();
      sctx.arc(x, y, r + 4, 0, Math.PI * 2);
      sctx.stroke();
    }
    sctx.restore();

    // Clip esférico
    sctx.save();
    sctx.beginPath();
    sctx.arc(x, y, r, 0, Math.PI * 2);
    sctx.clip();

    // Interior da esfera
    if (work && work.imgLoaded) {
      sctx.drawImage(work.imgLoaded, x - r, y - r, r * 2, r * 2);
    } else if (work && work.theme) {
      const bgGrad = sctx.createLinearGradient(x, y - r, x, y + r);
      bgGrad.addColorStop(0, work.theme);
      bgGrad.addColorStop(1, '#091c44');
      sctx.fillStyle = bgGrad;
      sctx.fillRect(x - r, y - r, r * 2, r * 2);
    } else {
      const sphereGrad = sctx.createRadialGradient(
          x - r * 0.35, y - r * 0.42, r * 0.08,
          x, y, r
      );
      sphereGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      sphereGrad.addColorStop(0.22, 'rgba(165, 202, 255, 0.7)');
      sphereGrad.addColorStop(0.68, 'rgba(38, 92, 185, 0.88)');
      sphereGrad.addColorStop(1, 'rgba(10, 32, 82, 0.96)');
      sctx.fillStyle = sphereGrad;
      sctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    if (work && work.icon) {
      const isImgIcon = typeof work.icon === 'string' && (/\.(png|jpg|jpeg|svg|webp)$/i.test(work.icon) || work.icon.startsWith('/') || work.icon.startsWith('data:'));
      if (isImgIcon) {
        if (!work._iconLoaded) {
          const img = new Image();
          img.onload = () => {
            work._iconImg = img;
            work._iconLoaded = true;
            if (currentView === 'home' || currentView === 'livearea') {
              drawFrame(WORKS[current] || null, currentImage);
              updateSpill();
            }
            markDirty(15);
          };
          img.onerror = () => {
            work._iconLoaded = 'error';
          };
          img.src = work.icon;
          work._iconLoaded = 'loading';
        }
        if (work._iconImg) {
          const iw = work._iconImg.naturalWidth || 48;
          const ih = work._iconImg.naturalHeight || 48;
          const maxDim = Math.round(r * 1.15);
          let dw = maxDim, dh = maxDim;
          if (iw > ih) dh = Math.round(maxDim * (ih / iw));
          else dw = Math.round(maxDim * (iw / ih));
          sctx.drawImage(work._iconImg, x - dw / 2, y - dh / 2, dw, dh);
        }
      } else {
        sctx.fillStyle = '#ffffff';
        sctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText(work.icon, x, y);
      }
    }

    // Ressalto de luz inferior
    const bottomGlow = sctx.createRadialGradient(x, y + r * 0.9, 0, x, y + r * 0.8, r * 0.65);
    bottomGlow.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    bottomGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    sctx.fillStyle = bottomGlow;
    sctx.fillRect(x - r, y, r * 2, r);

    // Reflexo especular superior
    sctx.beginPath();
    sctx.ellipse(x, y - r * 0.43, r * 0.65, r * 0.32, 0, 0, Math.PI * 2);
    const specGrad = sctx.createLinearGradient(x, y - r * 0.75, x, y - r * 0.1);
    specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    specGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    sctx.fillStyle = specGrad;
    sctx.fill();

    // Vinheta de profundidade
    const rimDark = sctx.createRadialGradient(x, y, r * 0.72, x, y, r);
    rimDark.addColorStop(0, 'rgba(0, 10, 30, 0)');
    rimDark.addColorStop(1, 'rgba(0, 15, 45, 0.45)');
    sctx.fillStyle = rimDark;
    sctx.fillRect(x - r, y - r, r * 2, r * 2);

    sctx.restore();

    // Borda exterior
    sctx.save();
    sctx.beginPath();
    sctx.arc(x, y, r - 0.75, 0, Math.PI * 2);
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    sctx.lineWidth = 1.5;
    sctx.stroke();

    // Título inferior
    if (title) {
      sctx.textAlign = 'center';
      sctx.textBaseline = 'top';
      sctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sctx.shadowColor = 'rgba(0, 8, 25, 0.85)';
      sctx.shadowBlur = 4;
      sctx.shadowOffsetY = 1.5;
      sctx.fillStyle = '#ffffff';
      sctx.fillText(title, x, y + r + 8);
    }
    sctx.restore();
  }

  function drawHome(work, img) {
    drawScreenBackground(true);
    const page = Math.floor(current / ICONS_PER_PAGE);
    drawStatusBar(page);

    const first = page * ICONS_PER_PAGE;
    for (let slot = 0; slot < ICONS_PER_PAGE; slot++) {
      const itemIdx = first + slot;
      const [x, y] = ICON_POSITIONS[slot];
      const itemData = WORKS[itemIdx] || null;
      drawBubble(itemData, itemIdx, x, y, itemIdx === current);
    }

    if (work && img && srcW(img) && currentView === 'home') {
      currentImage = img;
    }
  }

  function drawLiveArea(work, img) {
    drawScreenBackground(false);
    drawStatusBar(Math.floor(current / ICONS_PER_PAGE));
    const posterX = 78, posterY = 96, posterW = 384, posterH = 330;

    // Card drop shadow
    sctx.save();
    sctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    sctx.shadowBlur = 24;
    sctx.shadowOffsetY = 8;
    sctx.fillStyle = '#0c0d12';
    sctx.beginPath();
    sctx.roundRect(posterX, posterY, posterW, posterH, 14);
    sctx.fill();
    sctx.restore();

    // Check for image or avatar
    let posterImg = img;
    if (!posterImg && work?.appType === 'about' && avatarLoaded && userAvatarImg.complete && userAvatarImg.naturalWidth > 0) {
      posterImg = userAvatarImg;
    }

    if (posterImg && srcW(posterImg)) {
      const ar = srcW(posterImg) / srcH(posterImg);
      const boxAr = posterW / posterH;
      let fw = posterW, fh = posterH;
      if (ar > boxAr) fw = posterH * ar;
      else fh = posterW / ar;
      sctx.save();
      sctx.beginPath();
      sctx.roundRect(posterX, posterY, posterW, posterH, 14);
      sctx.clip();
      sctx.drawImage(posterImg, posterX + (posterW - fw) / 2, posterY + (posterH - fh) / 2, fw, fh);
      sctx.restore();
    } else {
      // Dark sleek card with gradient and icon
      const posterGrad = sctx.createLinearGradient(posterX, posterY, posterX + posterW, posterY + posterH);
      posterGrad.addColorStop(0, '#151722');
      posterGrad.addColorStop(1, '#090a0f');
      sctx.fillStyle = posterGrad;
      sctx.beginPath();
      sctx.roundRect(posterX, posterY, posterW, posterH, 14);
      sctx.fill();

      if (work?._iconImg) {
        const iw = work._iconImg.naturalWidth || 48;
        const ih = work._iconImg.naturalHeight || 48;
        const maxDim = 96;
        let dw = maxDim, dh = maxDim;
        if (iw > ih) dh = Math.round(maxDim * (ih / iw));
        else dw = Math.round(maxDim * (iw / ih));
        sctx.drawImage(work._iconImg, posterX + (posterW - dw) / 2, posterY + (posterH - dh) / 2, dw, dh);
      } else {
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillStyle = '#ffffff';
        sctx.font = '300 96px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        sctx.fillText(work?.icon || '✦', posterX + posterW / 2, posterY + posterH / 2);
      }
    }

    // Card border
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.roundRect(posterX, posterY, posterW, posterH, 14);
    sctx.stroke();

    // Corner App Icon Badge on Poster
    if (work?._iconImg) {
      const badgeSz = 38, badgePad = 14;
      const bx = posterX + badgePad, by = posterY + badgePad;
      sctx.save();
      sctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      sctx.shadowBlur = 8;
      sctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
      sctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.roundRect(bx, by, badgeSz, badgeSz, 10);
      sctx.fill();
      sctx.stroke();
      sctx.restore();
      sctx.drawImage(work._iconImg, bx + 5, by + 5, badgeSz - 10, badgeSz - 10);
    }

    // Right Content Column: Metadata Tag Badge
    const metaX = 516, metaY = 114;
    const metaText = (work?.meta || 'PROJECT').toUpperCase();
    sctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    const metaW = sctx.measureText(metaText).width;

    sctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.roundRect(metaX, metaY, metaW + 18, 22, 11);
    sctx.fill();
    sctx.stroke();

    sctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    sctx.textAlign = 'left';
    sctx.textBaseline = 'middle';
    sctx.fillText(metaText, metaX + 9, metaY + 11);

    // Title
    sctx.textAlign = 'left';
    sctx.textBaseline = 'top';
    sctx.fillStyle = '#ffffff';
    sctx.font = '700 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText(work?.title || 'Untitled', 516, 148);

    // Subtle underline separator
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.moveTo(516, 196);
    sctx.lineTo(516 + 80, 196);
    sctx.stroke();

    // Description text
    sctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
    sctx.font = '400 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    wrapText(sctx, work?.description || work?.meta || '', 516, 214, 360, 22);

    // Redesigned START Gate Button (Sleek High-Tech Monochrome)
    const btnX = 516, btnY = 336, btnW = 356, btnH = 56;
    sctx.save();
    sctx.shadowColor = 'rgba(255, 255, 255, 0.28)';
    sctx.shadowBlur = 16;
    sctx.beginPath();
    sctx.roundRect(btnX, btnY, btnW, btnH, 28);
    const btnGrad = sctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    btnGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
    sctx.fillStyle = btnGrad;
    sctx.fill();

    sctx.strokeStyle = '#ffffff';
    sctx.lineWidth = 1.8;
    sctx.stroke();

    sctx.shadowColor = 'transparent';
    sctx.fillStyle = '#ffffff';
    sctx.font = '700 15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    let btnText = '✕   START APPLICATION';
    if (work?.appType === 'about') btnText = '✕   START PROFILE';
    else if (work?.appType === 'cv') btnText = '✕   OPEN RESUME / CV';
    else if (work?.appType === 'skills') btnText = '✕   EXPLORE SKILLS';
    else if (work?.appType === 'reviews') btnText = '✕   OPEN REVIEWS';
    else if (work?.appType === 'project') btnText = '✕   START PROJECT';
    sctx.fillText(btnText, btnX + btnW / 2, btnY + btnH / 2);
    sctx.restore();

    // Bottom Navigation Bar
    sctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.roundRect(78, SH - 36, 126, 24, 12);
    sctx.fill();
    sctx.stroke();

    sctx.fillStyle = 'rgba(255, 255, 255, 0.60)';
    sctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('O  BACK TO HOME', 78 + 63, SH - 24);

    sctx.textAlign = 'right';
    sctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    sctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText('‹   PREV   ·   NEXT   ›', SW - 48, SH - 24);
  }

  /* ---------------------------------------------------------- */
  /* RUNNING APPS (PS Vita Game/App Screens)                    */
  /* ---------------------------------------------------------- */
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    if (!text) return y;
    const words = text.split(/\s+/);
    let line = '';
    let curY = y;
    for (let n = 0; n < words.length; n++) {
      const testLine = line ? `${line} ${words[n]}` : words[n];
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, curY);
        line = words[n] + ' ';
        curY += lineHeight;
      } else {
        line = testLine + ' ';
      }
    }
    if (line) ctx.fillText(line.trim(), x, curY);
    return curY + lineHeight;
  }

  const DEFAULT_REVIEWS = [
    {
      id: 'rev-1',
      author: 'Tiago Mendes',
      role: 'Product Designer',
      rating: 5,
      date: '23 Set 2026',
      comment: 'Trabalho impecável e super profissional. O modelo 3D da Vita no site ficou incrível e extremamente fluido!'
    },
    {
      id: 'rev-2',
      author: 'Sofia Ribeiro',
      role: 'Tech Lead',
      rating: 5,
      date: '15 Set 2026',
      comment: 'Great attention to performance and clean code. Guilherme delivers intuitive user experiences every time.'
    },
    {
      id: 'rev-3',
      author: 'Carlos Barreto',
      role: 'Startup Founder',
      rating: 5,
      date: '02 Set 2026',
      comment: 'Comunicação excelente e entrega rápida. Muito recomendado para projetos web e soluções com IA.'
    }
  ];

  let reviewsList = DEFAULT_REVIEWS.slice();
  let reviewPage = 0;
  try {
    const saved = localStorage.getItem('sk_reviews');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) reviewsList = parsed;
    }
  } catch {}

  async function checkSupabaseReviews() {
    const cfg = window.SK_SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) return;
    try {
      const res = await fetch(`${cfg.url}/rest/v1/${cfg.table || 'reviews'}?select=*&order=created_at.desc&limit=10`, {
        headers: {
          'apikey': cfg.anonKey,
          'Authorization': `Bearer ${cfg.anonKey}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length) {
          reviewsList = data;
          if (currentView === 'app') {
            drawFrame(WORKS[current], currentImage);
            markDirty(5);
          }
        }
      }
    } catch (err) {
      console.warn('[supabase] could not fetch reviews', err);
    }
  }
  checkSupabaseReviews();

  window.__skAddReview = async function({ author, role, rating, comment }) {
    const newRev = {
      id: 'rev-' + Date.now(),
      author: (author && author.trim()) || 'Visitante',
      role: (role && role.trim()) || 'Visitante',
      rating: Number(rating) || 5,
      date: 'Agora',
      comment: (comment && comment.trim()) || ''
    };

    reviewsList.unshift(newRev);
    reviewPage = 0;
    try { localStorage.setItem('sk_reviews', JSON.stringify(reviewsList)); } catch {}

    const cfg = window.SK_SUPABASE_CONFIG;
    if (cfg && cfg.url && cfg.anonKey) {
      try {
        await fetch(`${cfg.url}/rest/v1/${cfg.table || 'reviews'}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': cfg.anonKey,
            'Authorization': `Bearer ${cfg.anonKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            author: newRev.author,
            role: newRev.role,
            rating: newRev.rating,
            comment: newRev.comment
          })
        });
      } catch (err) {
        console.warn('[supabase] could not post review', err);
      }
    }

    if (currentView === 'app') {
      drawFrame(WORKS[current], currentImage);
      markDirty(15);
    }
    return newRev;
  };

  function promptAddReview() {
    if (typeof window.openReviewModal === 'function') {
      window.openReviewModal();
    }
  }

  function drawAppHeader(work) {
    sctx.save();
    const barGrad = sctx.createLinearGradient(0, 0, 0, 42);
    barGrad.addColorStop(0, 'rgba(10, 20, 45, 0.88)');
    barGrad.addColorStop(1, 'rgba(6, 12, 28, 0.75)');
    sctx.fillStyle = barGrad;
    sctx.fillRect(0, 0, SW, 42);

    sctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.moveTo(0, 42);
    sctx.lineTo(SW, 42);
    sctx.stroke();

    // Back pill (clickable: x 14 to 120, y 7 to 35)
    sctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    sctx.beginPath();
    sctx.roundRect(14, 7, 106, 28, 14);
    sctx.fill();
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    sctx.stroke();

    sctx.fillStyle = '#ffffff';
    sctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('◀  O  BACK', 67, 21);

    // App Title in Center
    sctx.fillStyle = '#ffffff';
    sctx.font = '700 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.textAlign = 'center';
    sctx.fillText(work.title ? work.title.toUpperCase() : 'APPLICATION', SW / 2, 21);

    // Top Right status / battery / wifi
    sctx.textAlign = 'right';
    sctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    sctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('100%  ▮▮▮   ᯤ', SW - 20, 21);

    sctx.restore();
  }

  function drawAppFooter(work) {
    sctx.save();
    const barY = SH - 38;
    sctx.fillStyle = 'rgba(6, 12, 25, 0.88)';
    sctx.fillRect(0, barY, SW, 38);
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    sctx.beginPath();
    sctx.moveTo(0, barY);
    sctx.lineTo(SW, barY);
    sctx.stroke();

    sctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.textBaseline = 'middle';

    // Left action
    sctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    sctx.textAlign = 'left';
    sctx.fillText('O  BACK TO LIVEAREA        PS  HOME', 24, barY + 19);

    // Right action hint
    sctx.textAlign = 'right';
    let rightHint = '✕  CONFIRM / ACTION';
    if (work.appType === 'about') rightHint = '✉  pugadim123@gmail.com';
    else if (work.appType === 'skills') rightHint = '✕  SWITCH HARD / SOFT';
    else if (work.appType === 'cv') rightHint = '↗  PDF RESUME AVAILABLE';
    else if (work.appType === 'reviews') rightHint = '✕  WRITE A REVIEW';
    else if (work.link) rightHint = '✕  OPEN EXTERNAL LINK';
    sctx.fillText(rightHint, SW - 24, barY + 19);

    sctx.restore();
  }

  let aboutTab = 'overview'; // 'overview' | 'skills' | 'timeline'
  const userAvatarImg = new Image();
  let avatarLoaded = false;
  userAvatarImg.src = '/assets/avatar.jpg';
  userAvatarImg.onload = () => {
    avatarLoaded = true;
    if (currentView === 'app') {
      drawFrame(WORKS[current], currentImage);
      updateSpill();
    }
    markDirty(15);
  };
  userAvatarImg.onerror = () => {
    avatarLoaded = false;
  };

  function drawAboutApp(work) {
    sctx.save();

    // ── Background: deep black matching the site ──
    sctx.fillStyle = '#000000';
    sctx.fillRect(0, 0, SW, SH);

    // ── LEFT: Large photo area (0 → 380px) ──
    const photoW = 380, photoH = SH;
    sctx.save();
    sctx.beginPath();
    sctx.rect(0, 0, photoW, photoH);
    sctx.clip();

    if (avatarLoaded && userAvatarImg.complete && userAvatarImg.naturalWidth > 0) {
      // Zoomed-in crop: fill the area and center on the face
      const imgAr = userAvatarImg.naturalWidth / userAvatarImg.naturalHeight;
      const boxAr = photoW / photoH;
      let dw, dh;
      // Always fill + zoom in ~25% extra
      if (imgAr > boxAr) {
        dh = photoH;
        dw = dh * imgAr;
      } else {
        dw = photoW;
        dh = dw / imgAr;
      }
      const dx = (photoW - dw) / 2 - dw * 0.12;
      const dy = (photoH - dh) / 2 + dh * 0.12;
      sctx.drawImage(userAvatarImg, dx, dy, dw, dh);
    } else {
      // Fallback: initials
      const avGrad = sctx.createLinearGradient(0, 0, 0, photoH);
      avGrad.addColorStop(0, '#111111');
      avGrad.addColorStop(1, '#000000');
      sctx.fillStyle = avGrad;
      sctx.fillRect(0, 0, photoW, photoH);

      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillStyle = '#ffffff';
      sctx.font = '300 96px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sctx.fillText('GP', photoW / 2, photoH / 2);
    }

    // Right-edge gradient fade into black content area
    const fadeGrad = sctx.createLinearGradient(photoW - 120, 0, photoW, 0);
    fadeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fadeGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
    sctx.fillStyle = fadeGrad;
    sctx.fillRect(photoW - 120, 0, 120, photoH);
    // Bottom gradient for readability
    const btmGrad = sctx.createLinearGradient(0, photoH - 180, 0, photoH);
    btmGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    btmGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    sctx.fillStyle = btmGrad;
    sctx.fillRect(0, photoH - 180, photoW, 180);
    sctx.restore();

    // ── Thin vertical separator ──
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.moveTo(photoW, 40);
    sctx.lineTo(photoW, SH - 20);
    sctx.stroke();

    // ── TOP BAR ──
    // Back pill
    sctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.roundRect(144, 11, 74, 22, 11);
    sctx.fill();
    sctx.stroke();

    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    sctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText('O  BACK', 181, 22);

    // ABOUT ME label top-left
    sctx.textAlign = 'left';
    sctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
    sctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText('A B O U T   M E', 28, 22);

    // Time + Battery top-right
    sctx.textAlign = 'right';
    sctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    sctx.font = '500 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    sctx.fillText(timeStr, SW - 64, 22);

    const bx = SW - 52, by = 16, bw = 24, bh = 12;
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    sctx.lineWidth = 1.2;
    sctx.beginPath();
    sctx.roundRect(bx, by, bw, bh, 3);
    sctx.stroke();
    sctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    sctx.beginPath();
    sctx.roundRect(bx + bw + 1.5, by + 3.5, 2, bh - 7, 1);
    sctx.fill();
    sctx.fillStyle = '#ffffff';
    sctx.beginPath();
    sctx.roundRect(bx + 2.5, by + 2.5, bw - 7, bh - 5, 1.5);
    sctx.fill();

    // ── RIGHT CONTENT AREA ──
    const rx = 410; // right content start x
    const rw = SW - rx - 40; // available width

    // ── Tab bar ──
    const tabs = [
      { id: 'overview', label: 'OVERVIEW', x: 363, w: 74 },
      { id: 'skills',   label: 'SKILLS',   x: 472, w: 54 },
      { id: 'timeline', label: 'TIMELINE', x: 562, w: 74 }
    ];

    sctx.textBaseline = 'middle';
    sctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    for (const tab of tabs) {
      const isActive = (aboutTab === tab.id);
      sctx.fillStyle = isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
      sctx.textAlign = 'left';
      sctx.fillText(tab.label, tab.x, 86);
    }

    // Baseline
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.moveTo(363, 104);
    sctx.lineTo(909, 104);
    sctx.stroke();

    // Active underline
    const activeTabObj = tabs.find(t => t.id === aboutTab) || tabs[0];
    sctx.strokeStyle = '#ffffff';
    sctx.lineWidth = 2;
    sctx.beginPath();
    sctx.moveTo(activeTabObj.x, 104);
    sctx.lineTo(activeTabObj.x + activeTabObj.w, 104);
    sctx.stroke();

    // ── Name badge at bottom-left of photo ──
    const badgeX = 20, badgeY = SH - 84, badgeW = 230, badgeH = 64;
    sctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.roundRect(badgeX, badgeY, badgeW, badgeH, 10);
    sctx.fill();
    sctx.stroke();

    sctx.textAlign = 'left';
    sctx.textBaseline = 'top';
    sctx.fillStyle = '#ffffff';
    sctx.font = '700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('Guilherme Puga', badgeX + 16, badgeY + 12);

    // Status badge: ● open to work
    sctx.fillStyle = '#22c55e';
    sctx.shadowColor = '#22c55e';
    sctx.shadowBlur = 6;
    sctx.beginPath();
    sctx.arc(badgeX + 20, badgeY + 44, 3.5, 0, Math.PI * 2);
    sctx.fill();
    sctx.shadowColor = 'transparent';

    sctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
    sctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText('open to work', badgeX + 32, badgeY + 38);

    // ──────────────────────────────────────────────
    // TAB CONTENT
    // ──────────────────────────────────────────────
    if (aboutTab === 'overview') {
      // Headline
      sctx.textAlign = 'left';
      sctx.textBaseline = 'top';
      sctx.font = '700 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sctx.fillStyle = '#ffffff';
      sctx.fillText('I build things', rx - 47, 132);
      sctx.fillText('for the web.', rx - 47, 172);

      // Thin accent line
      sctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.moveTo(rx - 47, 220);
      sctx.lineTo(rx - 47 + 80, 220);
      sctx.stroke();

      // Paragraph
      sctx.font = '400 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
      const bio = 'Product-minded engineer crafting modern web applications and interactive 3D experiences. Focusing on technical precision, artificial intelligence, and thoughtful user-centric architecture. Based in Lisbon, working globally.';
      wrapText(sctx, bio, rx - 47, 240, 540, 23);

      // Bottom 3 Cards Row
      const cardY = 442, cardH = 66, cardW = 170, cardGap = 10;
      const bottomCards = [
        { label: 'EMAIL', icon: '@', val: 'pugadim123@gmail.com' },
        { label: 'INSTAGRAM', icon: '↗', val: '@ufound.gui' },
        { label: 'BASED', icon: '◎', val: 'Lisbon · UTC+0' }
      ];

      bottomCards.forEach((c, idx) => {
        const cx = 363 + idx * (cardW + cardGap);
        sctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        sctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        sctx.lineWidth = 1;
        sctx.beginPath();
        sctx.roundRect(cx, cardY, cardW, cardH, 10);
        sctx.fill();
        sctx.stroke();

        sctx.textAlign = 'left';
        sctx.textBaseline = 'top';
        sctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
        sctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        sctx.fillText(c.label, cx + 14, cardY + 12);

        sctx.textAlign = 'right';
        sctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        sctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        sctx.fillText(c.icon, cx + cardW - 14, cardY + 12);

        sctx.textAlign = 'left';
        sctx.fillStyle = '#ffffff';
        sctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        sctx.fillText(c.val, cx + 14, cardY + 38);
      });
    } else if (aboutTab === 'skills') {
      const skillsList = [
        { name: 'Cloud Infrastructure & Servers', score: 88 },
        { name: 'Computer Networks & Systems', score: 86 },
        { name: 'Full-Stack Web Development', score: 90 },
        { name: 'Python & AI / NLP', score: 88 },
        { name: 'Java & Software Architecture', score: 84 }
      ];

      const barTotalW = 546;
      skillsList.forEach((sk, i) => {
        const curY = 138 + i * 53;

        sctx.textAlign = 'left';
        sctx.textBaseline = 'top';
        sctx.fillStyle = '#ffffff';
        sctx.font = '600 15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        sctx.fillText(sk.name, 363, curY);

        sctx.textAlign = 'right';
        sctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        sctx.font = '400 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        sctx.fillText(String(sk.score), 909, curY + 2);

        const lineY = curY + 26;
        sctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        sctx.lineWidth = 1.5;
        sctx.beginPath();
        sctx.moveTo(363, lineY);
        sctx.lineTo(909, lineY);
        sctx.stroke();

        const fillW = barTotalW * (sk.score / 100);
        sctx.strokeStyle = '#ffffff';
        sctx.lineWidth = 2;
        sctx.beginPath();
        sctx.moveTo(363, lineY);
        sctx.lineTo(363 + fillW, lineY);
        sctx.stroke();
      });
    } else if (aboutTab === 'timeline') {
      const timelineItems = [
        {
          year: '2026',
          role: 'MSc in Applied AI & Computing',
          context: 'Initiating a Master\'s degree in Applied Artificial Intelligence & Computing.',
          active: true
        },
        {
          year: '2023-2026',
          role: 'BSc in Computer Engineering',
          context: 'Undergraduate degree in Computer Engineering & Software Development.',
          active: false
        },
        {
          year: '2026',
          role: 'AI / NLP on Portuguese PTARD-L',
          context: 'Target identification during political debates.',
          active: false
        },
        {
          year: '2025',
          role: 'Freelance Developer',
          context: 'Building modern web applications and managing servers & infrastructure.',
          active: false
        }
      ];

      const rowGap = 76;
      timelineItems.forEach((item, i) => {
        const rowY = 136 + i * rowGap;

        // Year dot
        sctx.fillStyle = item.active ? '#ffffff' : 'rgba(255, 255, 255, 0.35)';
        if (item.active) {
          sctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
          sctx.shadowBlur = 6;
        }
        sctx.beginPath();
        sctx.arc(368, rowY + 8, item.active ? 4 : 3, 0, Math.PI * 2);
        sctx.fill();
        sctx.shadowColor = 'transparent';

        // Connecting line
        if (i < timelineItems.length - 1) {
          sctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
          sctx.lineWidth = 1;
          sctx.beginPath();
          sctx.moveTo(368, rowY + 14);
          sctx.lineTo(368, rowY + rowGap + 2);
          sctx.stroke();
        }

        sctx.textAlign = 'left';
        sctx.textBaseline = 'top';
        sctx.fillStyle = item.active ? '#ffffff' : 'rgba(255, 255, 255, 0.50)';
        sctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        sctx.fillText(item.year, 382, rowY);

        sctx.fillStyle = '#ffffff';
        sctx.font = '600 15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        sctx.fillText(item.role, 485, rowY);

        sctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        sctx.font = '400 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        wrapText(sctx, item.context, 485, rowY + 20, 420, 16);
      });
    }

    sctx.restore();
  }

  // ── Skills App State ──
  let skillsView = 'hard'; // 'hard' or 'soft'

  function drawSkillsApp(work) {
    sctx.save();

    // ── Two Top Tab Buttons (y: 52 to 90) ──
    const tabY = 52, tabH = 38;
    const tabs = [
      { id: 'hard', label: '⚡  HARD SKILLS  [ TECHNICAL ]', x: 32, w: 436 },
      { id: 'soft', label: '◈  SOFT SKILLS  [ INTERPERSONAL ]', x: 492, w: 436 }
    ];

    for (const tab of tabs) {
      const isActive = (skillsView === tab.id);
      // Tab background
      sctx.fillStyle = isActive ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.04)';
      sctx.strokeStyle = isActive ? 'rgba(255, 255, 255, 0.60)' : 'rgba(255, 255, 255, 0.16)';
      sctx.lineWidth = isActive ? 1.5 : 1;
      sctx.beginPath();
      sctx.roundRect(tab.x, tabY, tab.w, tabH, 9);
      sctx.fill();
      sctx.stroke();

      // Active accent bottom highlight
      if (isActive) {
        sctx.fillStyle = '#ffffff';
        sctx.beginPath();
        sctx.roundRect(tab.x + 28, tabY + tabH - 3, tab.w - 56, 2, 1);
        sctx.fill();
      }

      // Tab label
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillStyle = isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.65)';
      sctx.font = `${isActive ? '700' : '600'} 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      sctx.fillText(tab.label, tab.x + tab.w / 2, tabY + tabH / 2 - (isActive ? 1 : 0));
    }

    // Helper to render a pill badge
    function renderPill(text, px, py) {
      sctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      const pw = sctx.measureText(text).width + 16;
      sctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      sctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.roundRect(px, py, pw, 22, 5);
      sctx.fill();
      sctx.stroke();

      sctx.fillStyle = '#ffffff';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText(text, px + pw / 2, py + 11);
      return pw;
    }

    // ── 2x2 Grid Coordinates ──
    const cardW = 436, cardH = 188;
    const cards = [
      { x: 32,  y: 104 }, // Top-Left
      { x: 492, y: 104 }, // Top-Right
      { x: 32,  y: 304 }, // Bottom-Left
      { x: 492, y: 304 }, // Bottom-Right
    ];

    if (skillsView === 'hard') {
      const hardData = [
        {
          num: '01',
          category: 'INFRASTRUCTURE & SERVERS',
          title: 'Cloud Systems & DevOps',
          pills: ['AWS', 'Terraform', 'GitHub Actions', 'Docker', 'Linux / Bash', 'Cloud Infra'],
          desc: 'Infrastructure as Code, automated CI/CD workflows, containerization, and production cloud/server administration.'
        },
        {
          num: '02',
          category: 'NETWORKS & PROTOCOLS',
          title: 'Computer Networks & Systems',
          pills: ['TCP/IP', 'Routing & DNS', 'Sockets / HTTP', 'Network Architecture', 'C / Low-Level'],
          desc: 'Deep grasp of network protocol stacks, packet flow, socket-level communication, and distributed system design.'
        },
        {
          num: '03',
          category: 'APPLIED AI & RESEARCH',
          title: 'NLP & Intelligent Systems',
          pills: ['Python', 'NLP Pipelines', 'Transformers', 'PTARD-L Target Resolution', 'MSc AI (2026)'],
          desc: 'Master’s student in Applied AI. Built NLP models for political debate dialogue target resolution and conversational analysis.'
        },
        {
          num: '04',
          category: 'SOFTWARE & FULL-STACK',
          title: 'Web Platforms & Architecture',
          pills: ['Java / OOP', 'JavaScript / TypeScript', 'React', 'Three.js / WebGL', 'SQL / Supabase'],
          desc: 'Engineering interactive 3D web experiences, robust backend business logic, and real-time database integrations.'
        }
      ];

      for (let i = 0; i < 4; i++) {
        const c = cards[i];
        const d = hardData[i];

        // Card container
        sctx.fillStyle = 'rgba(14, 18, 28, 0.78)';
        sctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        sctx.lineWidth = 1;
        sctx.beginPath();
        sctx.roundRect(c.x, c.y, cardW, cardH, 12);
        sctx.fill();
        sctx.stroke();

        // Top Category header
        sctx.textAlign = 'left';
        sctx.textBaseline = 'top';
        sctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        sctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        sctx.fillText(`[ ${d.num} // ${d.category} ]`, c.x + 18, c.y + 14);

        // Title (spaced further down from category header)
        sctx.fillStyle = '#ffffff';
        sctx.font = '700 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        sctx.fillText(d.title, c.x + 18, c.y + 38);

        // Divider
        sctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        sctx.beginPath();
        sctx.moveTo(c.x + 18, c.y + 61);
        sctx.lineTo(c.x + cardW - 18, c.y + 61);
        sctx.stroke();

        // Pills (wrapped nicely)
        let px = c.x + 18;
        let py = c.y + 71;
        for (const pill of d.pills) {
          sctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
          const pw = sctx.measureText(pill).width + 16;
          if (px + pw > c.x + cardW - 18) {
            px = c.x + 18;
            py += 26;
          }
          renderPill(pill, px, py);
          px += pw + 6;
        }

        // Description
        sctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
        sctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        sctx.textAlign = 'left';
        sctx.textBaseline = 'top';
        const descY = Math.max(c.y + 128, py + 26);
        wrapText(sctx, d.desc, c.x + 18, descY, cardW - 36, 17);
      }
    } else {
      // Soft Skills View
      const softData = [
        {
          num: '01',
          category: 'ANALYTICAL RIGOR',
          title: 'Problem Solving & First Principles',
          pills: ['Root-Cause Analysis', 'First Principles', 'Algorithmic Thinking'],
          points: [
            'Deconstructs complex engineering bottlenecks into clear, manageable steps.',
            'Thorough debugging mindset with high attention to edge cases and system performance.'
          ]
        },
        {
          num: '02',
          category: 'EXECUTION & AUTONOMY',
          title: 'Project Ownership & Reliability',
          pills: ['End-to-End Delivery', 'Proactive Initiative', 'Self-Directed'],
          points: [
            'Proven track record as a freelance developer delivering complete web solutions.',
            'Autonomous server management, database configuration, and technical troubleshooting.'
          ]
        },
        {
          num: '03',
          category: 'COMMUNICATION & TEAM',
          title: 'Collaboration & Clear Dialogue',
          pills: ['Transparent Comms', 'Code Reviews', 'Active Listening'],
          points: [
            'Clear and constructive communication with clients, peers, and non-technical stakeholders.',
            'Values structured documentation, readable codebase conventions, and mutual feedback.'
          ]
        },
        {
          num: '04',
          category: 'GROWTH MINDSET',
          title: 'Continuous Learning & Research',
          pills: ['Fast Ramp-Up', 'MSc AI Research', 'High Adaptability'],
          points: [
            'Quickly masters emerging frameworks, cloud tools, and machine learning models.',
            'Combines academic theoretical depth with pragmatic, production-ready execution.'
          ]
        }
      ];

      for (let i = 0; i < 4; i++) {
        const c = cards[i];
        const d = softData[i];

        // Card container
        sctx.fillStyle = 'rgba(14, 18, 28, 0.78)';
        sctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        sctx.lineWidth = 1;
        sctx.beginPath();
        sctx.roundRect(c.x, c.y, cardW, cardH, 12);
        sctx.fill();
        sctx.stroke();

        // Top Category header
        sctx.textAlign = 'left';
        sctx.textBaseline = 'top';
        sctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        sctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        sctx.fillText(`[ ${d.num} // ${d.category} ]`, c.x + 18, c.y + 14);

        // Title (spaced further down from category header)
        sctx.fillStyle = '#ffffff';
        sctx.font = '700 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        sctx.fillText(d.title, c.x + 18, c.y + 38);

        // Divider
        sctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        sctx.beginPath();
        sctx.moveTo(c.x + 18, c.y + 61);
        sctx.lineTo(c.x + cardW - 18, c.y + 61);
        sctx.stroke();

        // Pills (wrapped nicely)
        let px = c.x + 18;
        let py = c.y + 71;
        for (const pill of d.pills) {
          sctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
          const pw = sctx.measureText(pill).width + 16;
          if (px + pw > c.x + cardW - 18) {
            px = c.x + 18;
            py += 26;
          }
          renderPill(pill, px, py);
          px += pw + 6;
        }

        // Bullet points
        sctx.textAlign = 'left';
        sctx.textBaseline = 'top';
        sctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

        let by = Math.max(c.y + 106, py + 26);
        for (const pt of d.points) {
          sctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          sctx.fillText('•', c.x + 18, by);
          sctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
          wrapText(sctx, pt, c.x + 30, by, cardW - 48, 16);
          by += 32;
        }
      }
    }

    sctx.restore();
  }

  function drawCvApp(work) {
    sctx.save();

    const cardY = 56, cardH = 432;
    // Left Column: Work Experience & Education (x: 32, y: 56, w: 435, h: 432)
    sctx.fillStyle = 'rgba(18, 12, 38, 0.78)';
    sctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
    sctx.lineWidth = 1.5;
    sctx.beginPath();
    sctx.roundRect(32, cardY, 435, cardH, 16);
    sctx.fill();
    sctx.stroke();

    sctx.textAlign = 'left';
    sctx.textBaseline = 'top';
    sctx.fillStyle = '#c084fc';
    sctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('WORK EXPERIENCE', 52, 74);

    sctx.fillStyle = '#ffffff';
    sctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('Full-Stack & Frontend Developer', 52, 96);
    sctx.fillStyle = '#a855f7';
    sctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('Independent & Client Projects  •  2023 - Present', 52, 114);

    sctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    sctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    wrapText(sctx, "• Building interactive 3D web interfaces, WebGL simulations, and high-performance apps.", 52, 132, 395, 17);
    wrapText(sctx, "• Designing real-time database integrations with Supabase and modern cloud tooling.", 52, 168, 395, 17);
    wrapText(sctx, "• Applying AI models to enhance workflows and create automated intelligent features.", 52, 204, 395, 17);

    // Education
    sctx.fillStyle = '#c084fc';
    sctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('EDUCATION & STUDIES', 52, 256);

    sctx.fillStyle = '#ffffff';
    sctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('Computer Science & Software Development', 52, 278);
    sctx.fillStyle = '#a855f7';
    sctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('Lisbon, Portugal', 52, 296);

    sctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    sctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    wrapText(sctx, "Focus on software architecture, front-end ecosystems, algorithms, and artificial intelligence integration.", 52, 314, 395, 18);

    // Right Column: Technical Competencies & Actions (x: 485, y: 56, w: 443, h: 432)
    sctx.fillStyle = 'rgba(18, 12, 38, 0.78)';
    sctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
    sctx.beginPath();
    sctx.roundRect(485, cardY, 443, cardH, 16);
    sctx.fill();
    sctx.stroke();

    sctx.fillStyle = '#c084fc';
    sctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('TECHNICAL COMPETENCIES', 505, 74);

    const compGroups = [
      { cat: 'Frontend', items: 'React 19, JavaScript ESNext, TypeScript, Three.js, Canvas 2D' },
      { cat: 'Backend & Data', items: 'Node.js, REST APIs, Supabase, PostgreSQL' },
      { cat: 'Tools & DevOps', items: 'Vite, Git, GitHub Actions, ESLint, Chrome DevTools' },
      { cat: 'Specialties', items: '3D Web Experiences, Zero-Reflow Performance, AI Workflows' }
    ];

    let cy = 96;
    for (const cg of compGroups) {
      sctx.fillStyle = '#ffffff';
      sctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sctx.fillText(cg.cat, 505, cy);
      sctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      sctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sctx.fillText(cg.items, 505, cy + 18);
      cy += 44;
    }

    // Action Box / Download Button
    sctx.fillStyle = '#c084fc';
    sctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('ACTIONS & CONTACT', 505, 288);

    // Download CV Button (x: 505, y: 312, w: 403, h: 44)
    sctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
    sctx.strokeStyle = '#c084fc';
    sctx.beginPath();
    sctx.roundRect(505, 312, 403, 44, 10);
    sctx.fill();
    sctx.stroke();
    sctx.fillStyle = '#ffffff';
    sctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('↗  REQUEST / DOWNLOAD FULL CV (PDF)', 505 + 403 / 2, 334);

    // Email Button (x: 505, y: 368, w: 403, h: 44)
    sctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    sctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    sctx.beginPath();
    sctx.roundRect(505, 368, 403, 44, 10);
    sctx.fill();
    sctx.stroke();
    sctx.fillStyle = '#ffffff';
    sctx.fillText('✉  CONTACT GUILHERME (pugadim123@gmail.com)', 505 + 403 / 2, 390);

    sctx.restore();
  }

  function drawReviewsApp(work) {
    sctx.save();

    const cardY = 56, cardH = 432;
    const cx = 162;

    // ── LEFT COLUMN: Rating & Action Panel (x: 32, y: 56, w: 260, h: 432) ──
    sctx.fillStyle = 'rgba(14, 18, 28, 0.78)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.roundRect(32, cardY, 260, cardH, 14);
    sctx.fill();
    sctx.stroke();

    // Top Category Tag
    sctx.textAlign = 'center';
    sctx.textBaseline = 'top';
    sctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
    sctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText('[ COMMUNITY SCORE ]', cx, cardY + 16);

    // Big Score: 5.0
    sctx.fillStyle = '#ffffff';
    sctx.font = '800 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('5.0', cx, cardY + 36);

    // Monochrome Star Rating
    sctx.fillStyle = '#ffffff';
    sctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('★ ★ ★ ★ ★', cx, cardY + 94);

    // Recommended Pill
    sctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
    sctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText('100% RECOMMENDATION RATE', cx, cardY + 120);

    // Divider
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    sctx.beginPath();
    sctx.moveTo(48, cardY + 146);
    sctx.lineTo(276, cardY + 146);
    sctx.stroke();

    // Supabase Status Card (x: 48, y: cardY + 158, w: 228, h: 72)
    const cfg = window.SK_SUPABASE_CONFIG;
    const isConnected = !!(cfg && cfg.url && cfg.anonKey);

    sctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    sctx.beginPath();
    sctx.roundRect(48, cardY + 158, 228, 72, 8);
    sctx.fill();
    sctx.stroke();

    // Status Indicator Dot
    sctx.fillStyle = isConnected ? '#22c55e' : 'rgba(255, 255, 255, 0.45)';
    if (isConnected) {
      sctx.shadowColor = '#22c55e';
      sctx.shadowBlur = 6;
    }
    sctx.beginPath();
    sctx.arc(64, cardY + 176, 3.5, 0, Math.PI * 2);
    sctx.fill();
    sctx.shadowColor = 'transparent';

    sctx.textAlign = 'left';
    sctx.fillStyle = '#ffffff';
    sctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText(isConnected ? 'SUPABASE CLOUD SYNC' : 'DATABASE READY', 76, cardY + 170);

    sctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    sctx.font = '400 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText('Table: "reviews"', 64, cardY + 192);
    sctx.fillText(isConnected ? 'Live real-time subscription' : 'Local cache & cloud schema', 64, cardY + 208);

    // Write Review Button (x: 48, y: cardY + 244, w: 228, h: 44)
    sctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.roundRect(48, cardY + 244, 228, 44, 9);
    sctx.fill();
    sctx.stroke();

    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillStyle = '#ffffff';
    sctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText('+ WRITE A REVIEW', cx, cardY + 266);

    // Trust / Info bullets at bottom of left panel
    sctx.textAlign = 'left';
    sctx.textBaseline = 'top';
    sctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    sctx.font = '400 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

    const bullets = [
      '• Instant guest feedback',
      '• Persisted in cloud schema',
      '• Verified peer contributions'
    ];
    let by = cardY + 306;
    for (const b of bullets) {
      sctx.fillText(b, 54, by);
      by += 20;
    }

    // Mini stats pill
    sctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    sctx.beginPath();
    sctx.roundRect(48, cardY + 374, 228, 40, 8);
    sctx.fill();
    sctx.stroke();

    sctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
    sctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText('TOTAL VERIFIED REVIEWS', 62, cardY + 383);
    sctx.fillStyle = '#ffffff';
    sctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText(String(reviewsList.length).padStart(2, '0') + ' ENTRIES', 62, cardY + 397);


    // ── RIGHT COLUMN: Reviews Feed (x: 312, y: 56, w: 616, h: 432) ──
    sctx.fillStyle = 'rgba(14, 18, 28, 0.78)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.roundRect(312, cardY, 616, cardH, 14);
    sctx.fill();
    sctx.stroke();

    const totalPages = Math.max(1, Math.ceil(reviewsList.length / 3));
    if (reviewPage >= totalPages) reviewPage = 0;

    // Header Bar
    sctx.textAlign = 'left';
    sctx.textBaseline = 'middle';
    sctx.fillStyle = '#ffffff';
    sctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sctx.fillText(`[ TESTIMONIALS // 0${reviewsList.length} TOTAL ]`, 336, cardY + 22);

    // Pagination controls on right side of header
    if (totalPages > 1) {
      // Prev button
      sctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      sctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
      sctx.beginPath();
      sctx.roundRect(770, cardY + 11, 26, 22, 5);
      sctx.fill();
      sctx.stroke();

      sctx.textAlign = 'center';
      sctx.fillStyle = '#ffffff';
      sctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      sctx.fillText('◀', 783, cardY + 22);

      // Page counter
      sctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      sctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      sctx.fillText(`${reviewPage + 1} / ${totalPages}`, 832, cardY + 22);

      // Next button
      sctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      sctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
      sctx.beginPath();
      sctx.roundRect(868, cardY + 11, 26, 22, 5);
      sctx.fill();
      sctx.stroke();

      sctx.fillStyle = '#ffffff';
      sctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      sctx.fillText('▶', 881, cardY + 22);
    } else {
      sctx.textAlign = 'right';
      sctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
      sctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      sctx.fillText('VERIFIED RECOMMENDATIONS', 900, cardY + 22);
    }

    // Divider line
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    sctx.beginPath();
    sctx.moveTo(330, cardY + 40);
    sctx.lineTo(910, cardY + 40);
    sctx.stroke();

    // 3 Reviews on current page
    let ry = cardY + 48;
    const startIndex = reviewPage * 3;
    const endIndex = Math.min(startIndex + 3, reviewsList.length);

    for (let i = startIndex; i < endIndex; i++) {
      const rev = reviewsList[i];

      // Review card container
      sctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      sctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.roundRect(330, ry, 580, 114, 10);
      sctx.fill();
      sctx.stroke();

      // Initials Avatar box (e.g. "TM", "SR")
      const words = (rev.author || 'User').trim().split(/\s+/);
      const initials = (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();

      sctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      sctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      sctx.beginPath();
      sctx.roundRect(346, ry + 14, 30, 30, 6);
      sctx.fill();
      sctx.stroke();

      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillStyle = '#ffffff';
      sctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      sctx.fillText(initials, 361, ry + 29);

      // Author Name
      sctx.textAlign = 'left';
      sctx.textBaseline = 'top';
      sctx.fillStyle = '#ffffff';
      sctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sctx.fillText(rev.author, 386, ry + 12);

      // Role & Date
      sctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
      sctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      sctx.fillText(`${(rev.role || 'Client').toUpperCase()}  //  ${(rev.date || 'Recent').toUpperCase()}`, 386, ry + 29);

      // Stars top right
      sctx.textAlign = 'right';
      sctx.fillStyle = '#ffffff';
      sctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sctx.fillText('★ ★ ★ ★ ★', 894, ry + 14);

      // Comment
      sctx.textAlign = 'left';
      sctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      sctx.font = '400 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      wrapText(sctx, `“${rev.comment}”`, 346, ry + 54, 548, 18);

      ry += 124;
    }

    sctx.restore();
  }

  function drawProjectApp(work, img) {
    sctx.save();

    const cardY = 56, cardH = 432;
    // Left Pane: Poster / Visual Frame (x: 32, y: 56, w: 380, h: 432)
    sctx.fillStyle = 'rgba(15, 20, 35, 0.8)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    sctx.lineWidth = 1.5;
    sctx.beginPath();
    sctx.roundRect(32, cardY, 380, cardH, 16);
    sctx.fill();
    sctx.stroke();

    if (img && srcW(img)) {
      sctx.save();
      sctx.beginPath();
      sctx.roundRect(46, cardY + 14, 352, cardH - 28, 12);
      sctx.clip();
      sctx.drawImage(img, 46, cardY + 14, 352, cardH - 28);
      sctx.restore();
    } else {
      const posterGrad = sctx.createLinearGradient(32, cardY, 412, cardY + cardH);
      posterGrad.addColorStop(0, work.theme || '#4f46e5');
      posterGrad.addColorStop(1, '#0f172a');
      sctx.fillStyle = posterGrad;
      sctx.beginPath();
      sctx.roundRect(46, cardY + 14, 352, cardH - 28, 12);
      sctx.fill();

      sctx.fillStyle = '#ffffff';
      sctx.font = '300 96px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText(work.icon || '✦', 46 + 176, cardY + cardH / 2);
    }

    // Right Pane: Details & Launch Actions (x: 436, y: 56, w: 492, h: 432)
    sctx.fillStyle = 'rgba(15, 20, 35, 0.8)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    sctx.beginPath();
    sctx.roundRect(436, cardY, 492, cardH, 16);
    sctx.fill();
    sctx.stroke();

    sctx.textAlign = 'left';
    sctx.textBaseline = 'top';

    sctx.fillStyle = work.theme || '#38bdf8';
    sctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText(work.meta || 'PROJECT DETAILS', 462, 78);

    sctx.fillStyle = '#ffffff';
    sctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText(work.title || 'Untitled Project', 462, 102);

    sctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    sctx.font = '400 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const desc = work.description || 'Project details, features, and source code will be updated here.';
    wrapText(sctx, desc, 462, 146, 440, 22);

    // Tech Stack
    sctx.fillStyle = work.theme || '#38bdf8';
    sctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('STACK & TECHNOLOGIES', 462, 230);

    const techTags = ['React', 'JavaScript', 'Tailwind', 'REST API', 'Responsive'];
    let tx = 462, ty = 254;
    for (const t of techTags) {
      sctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const tw = sctx.measureText(t).width + 16;
      sctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      sctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      sctx.beginPath();
      sctx.roundRect(tx, ty, tw, 24, 6);
      sctx.fill();
      sctx.stroke();
      sctx.fillStyle = '#ffffff';
      sctx.fillText(t, tx + 8, ty + 6);
      tx += tw + 8;
    }

    // Launch Project Action (x: 462, y: 320, w: 440, h: 50)
    sctx.fillStyle = work.link ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.08)';
    sctx.strokeStyle = work.link ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)';
    sctx.beginPath();
    sctx.roundRect(462, 320, 440, 50, 12);
    sctx.fill();
    sctx.stroke();

    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillStyle = '#ffffff';
    sctx.font = '700 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText(work.link ? '▶  LAUNCH / VISIT LIVE PROJECT' : 'PROJECT IN DEVELOPMENT', 462 + 220, 345);

    // Source Code Button (x: 462, y: 382, w: 440, h: 42)
    sctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    sctx.beginPath();
    sctx.roundRect(462, 382, 440, 42, 10);
    sctx.fill();
    sctx.stroke();

    sctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sctx.fillText('↗  VIEW ON GITHUB / SOURCE', 462 + 220, 403);

    sctx.restore();
  }

  function drawApp(work, img) {
    if (work.appType === 'about') {
      drawAboutApp(work);
      return;
    }

    sctx.fillStyle = '#050a14';
    sctx.fillRect(0, 0, SW, SH);

    const glow = sctx.createRadialGradient(SW / 2, SH / 2, 50, SW / 2, SH / 2, 450);
    glow.addColorStop(0, work.theme ? `${work.theme}22` : 'rgba(40, 90, 180, 0.15)');
    glow.addColorStop(1, 'rgba(5, 10, 20, 0)');
    sctx.fillStyle = glow;
    sctx.fillRect(0, 0, SW, SH);

    drawAppHeader(work);

    if (work.appType === 'skills') {
      drawSkillsApp(work);
    } else if (work.appType === 'cv') {
      drawCvApp(work);
    } else if (work.appType === 'reviews') {
      drawReviewsApp(work);
    } else {
      drawProjectApp(work, img);
    }

    drawAppFooter(work);
  }

  function handleAppClick(x, y) {
    const w = WORKS[current];
    if (!w) return true;

    // App-specific clicks for About Me
    if (w.appType === 'about') {
      // Back button pill / top-left area: x: 0 to 235, y: 0 to 45
      if (x <= 235 && y <= 45) {
        returnLiveArea();
        return true;
      }

      // Top-right status / Home area
      if (x >= SW - 65 && y <= 45) {
        returnHome();
        return true;
      }

      // Tab switcher clicks: OVERVIEW (330-455), SKILLS (456-545), TIMELINE (546-690) at y: 50-125
      if (y >= 50 && y <= 125) {
        let changed = false;
        if (x >= 330 && x <= 455 && aboutTab !== 'overview') {
          aboutTab = 'overview';
          changed = true;
        } else if (x >= 456 && x <= 545 && aboutTab !== 'skills') {
          aboutTab = 'skills';
          changed = true;
        } else if (x >= 546 && x <= 690 && aboutTab !== 'timeline') {
          aboutTab = 'timeline';
          changed = true;
        }
        if (changed) {
          drawFrame(w, currentImage);
          updateSpill();
          markDirty(20);
          return true;
        }
        if (x >= 330 && x <= 690) return true;
      }

      // Overview Tab bottom cards
      if (aboutTab === 'overview') {
        // Card 1: Email (x: 363 to 537, y: 440 to 512)
        if (x >= 363 && x <= 537 && y >= 440 && y <= 512) {
          window.open('mailto:pugadim123@gmail.com', '_blank');
          return true;
        }
        // Card 2: Instagram (x: 549 to 723, y: 440 to 512)
        if (x >= 549 && x <= 723 && y >= 440 && y <= 512) {
          window.open('https://www.instagram.com/ufound.gui/', '_blank', 'noopener');
          return true;
        }
        // Card 3: Based
        if (x >= 735 && x <= 909 && y >= 440 && y <= 512) {
          return true;
        }
      }

      // Left Profile column click: Avatar or open to work pill
      if (x >= 80 && x <= 235 && y >= 75 && y <= 315) {
        window.open('mailto:pugadim123@gmail.com', '_blank');
        return true;
      }

      return true;
    }

    // Generic Back pill in top-left (x: 14 to 120, y: 7 to 37)
    if (x >= 14 && x <= 130 && y >= 6 && y <= 40) {
      returnLiveArea();
      return true;
    }

    // Bottom-left "O BACK TO LIVEAREA"
    if (y > SH - 45 && x < 260) {
      returnLiveArea();
      return true;
    }

    // Top Right Home icon or PS button
    if (x > SW - 60 && y < 45) {
      returnHome();
      return true;
    }

    // App-specific clicks for other apps
    if (w.appType === 'skills') {
      // Tab clicks: Hard Skills (x: 32 to 468, y: 50 to 92) / Soft Skills (x: 492 to 928, y: 50 to 92)
      if (y >= 50 && y <= 94) {
        if (x >= 32 && x <= 470) {
          skillsView = 'hard';
          drawFrame(w, currentImage);
          updateSpill();
          markDirty(10);
          return true;
        }
        if (x >= 490 && x <= 930) {
          skillsView = 'soft';
          drawFrame(w, currentImage);
          updateSpill();
          markDirty(10);
          return true;
        }
      }
      return true;
    } else if (w.appType === 'cv') {
      // Download CV button: x: 505, y: 312, w: 403, h: 44
      if (x >= 505 && x <= 908 && y >= 312 && y <= 356) {
        if (w.link && w.link !== '#') window.open(w.link, '_blank');
        else window.open('mailto:pugadim123@gmail.com?subject=Pedido%20de%20CV%20-%20Guilherme%20Puga', '_blank');
        return true;
      }
      // Contact button: x: 505, y: 368, w: 403, h: 44
      if (x >= 505 && x <= 908 && y >= 368 && y <= 412) {
        window.open('mailto:pugadim123@gmail.com', '_blank');
        return true;
      }
    } else if (w.appType === 'reviews') {
      // Write a Review button: x: 48 to 276, y: 300 to 348
      if (x >= 48 && x <= 276 && y >= 300 && y <= 348) {
        promptAddReview();
        return true;
      }
      // Pagination Prev: x: 765 to 800, y: 65 to 92
      if (x >= 765 && x <= 800 && y >= 65 && y <= 92) {
        const totalPages = Math.max(1, Math.ceil(reviewsList.length / 3));
        reviewPage = (reviewPage - 1 + totalPages) % totalPages;
        drawFrame(w, currentImage);
        updateSpill();
        markDirty(10);
        return true;
      }
      // Pagination Next: x: 865 to 900, y: 65 to 92
      if (x >= 865 && x <= 900 && y >= 65 && y <= 92) {
        const totalPages = Math.max(1, Math.ceil(reviewsList.length / 3));
        reviewPage = (reviewPage + 1) % totalPages;
        drawFrame(w, currentImage);
        updateSpill();
        markDirty(10);
        return true;
      }
    } else {
      // Project Launch: x: 462, y: 320, w: 440, h: 50
      if (x >= 462 && x <= 902 && y >= 320 && y <= 370) {
        if (w.link) window.open(w.link, '_blank', 'noopener');
        else alert(`Projeto "${w.title}" em desenvolvimento. Link demo estará disponível em breve!`);
        return true;
      }
      // GitHub / Source: x: 462, y: 382, w: 440, h: 42
      if (x >= 462 && x <= 902 && y >= 382 && y <= 424) {
        window.open('https://github.com', '_blank', 'noopener');
        return true;
      }
    }

    return true;
  }

  function handleAppAction() {
    const w = WORKS[current];
    if (!w) return;
    if (w.appType === 'about') {
      if (aboutTab === 'overview') {
        window.open('mailto:pugadim123@gmail.com', '_blank');
      } else {
        const tabs = ['overview', 'skills', 'timeline'];
        let idx = (tabs.indexOf(aboutTab) + 1) % tabs.length;
        aboutTab = tabs[idx];
        drawFrame(w, currentImage);
        updateSpill();
        markDirty(20);
      }
    } else if (w.appType === 'skills') {
      skillsView = skillsView === 'hard' ? 'soft' : 'hard';
      drawFrame(w, currentImage);
      updateSpill();
      markDirty(20);
    } else if (w.appType === 'cv') {
      window.open('mailto:pugadim123@gmail.com?subject=Pedido%20de%20CV%20-%20Guilherme%20Puga', '_blank');
    } else if (w.appType === 'reviews') {
      promptAddReview();
    } else if (w.link) {
      window.open(w.link, '_blank', 'noopener');
    } else {
      alert(`Projeto "${w.title}" em desenvolvimento.`);
    }
  }

  function drawFrame(work, img) {
    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    if (currentView === 'app' && work) drawApp(work, img);
    else if (currentView === 'livearea' && work) drawLiveArea(work, img);
    else drawHome(work, img);
    sctx.restore();
    screenTex.needsUpdate = true;
  }

  let spillDue = 0;
  function updateSpillThrottled(t) {
    if (t < spillDue) return;
    spillDue = t + 0.16;
    updateSpill();
  }

  function updateSpill() {
    avctx.drawImage(sc, 0, 0, av.width, av.height);
    let r = 0, g = 0, b = 0;
    try {
      const d = avctx.getImageData(0, 0, av.width, av.height).data;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      r /= n * 255; g /= n * 255; b /= n * 255;
    } catch (e) { r = g = b = 0.6; }

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mx = Math.max(r, g, b) || 1;
    const col = new THREE.Color(
        Math.min(1, 0.30 + (r / mx) * 0.70),
        Math.min(1, 0.30 + (g / mx) * 0.70),
        Math.min(1, 0.30 + (b / mx) * 0.70)
    );
    spillTargetColor.copy(col);
    spillTargetIntensity = 16 + lum * 46;
  }

  const spillTargetColor = new THREE.Color(0.6, 0.8, 1);
  let spillTargetIntensity = 0;
  let selectToken = 0;

  async function select(i, instant) {
    const totalSlots = Math.max(WORKS.length, ICONS_PER_PAGE);
    current = ((i % totalSlots) + totalSlots) % totalSlots;
    const w = WORKS[current] || null;

    if (railIdx) railIdx.textContent = String(current + 1).padStart(2, '0');
    if (railTot) railTot.textContent = '/' + String(Math.max(WORKS.length, 1)).padStart(2, '0');
    if (railOpen) {
      if (w && w.link) {
        railOpen.href = w.link;
        railOpen.removeAttribute('aria-disabled');
      } else {
        railOpen.href = '#';
        railOpen.setAttribute('aria-disabled', 'true');
      }
    }
    if (railEl && !instant && !reduce) {
      railEl.classList.remove('is-swap');
      void railEl.offsetWidth;
      railEl.classList.add('is-swap');
    }
    if (!instant && !reduce) warpT = 1;

    if (live) { try { live.pause(); } catch (_) {} live = null; }

    const token = ++selectToken;
    const img = (w && w.img) ? await getImage(w.img) : null;
    if (token !== selectToken) return;
    currentImage = img;
    paintBackdrop(img);
    drawFrame(w, img);
    updateSpill();
    markDirty(20);

    if (currentView !== 'livearea' || !w) return;
    if (!w.vid || reduce) { prefetchNeighbours(); return; }

    const v = await getVideo(w.vid);
    if (token !== selectToken || !v) { prefetchNeighbours(); return; }
    try { v.currentTime = 0; } catch (_) {}
    const play = v.play();
    if (play && play.catch) play.catch(() => {});
    live = v;
    prefetchNeighbours();
  }

  let prefetched = false;
  function prefetchNeighbours() {
    if (!WORKS.length) return;
    const run = () => {
      [current + 1, current - 1].forEach((i) => {
        const w = WORKS[((i % WORKS.length) + WORKS.length) % WORKS.length];
        if (w && w.vid) getVideo(w.vid);
      });
    };
    if (prefetched) { run(); return; }
    prefetched = true;
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1200);
  }

  function powerOn() { powerTarget = 1; markDirty(30); }

  function open() {
    launchApp();
  }

  function launchApp() {
    if (!WORKS[current]) return;
    currentView = 'app';
    warpT = 0.8;
    drawFrame(WORKS[current] || null, currentImage);
    updateSpill();
    markDirty(25);
  }

  function returnLiveArea() {
    if (!WORKS[current]) return;
    currentView = 'livearea';
    warpT = 0.5;
    drawFrame(WORKS[current] || null, currentImage);
    updateSpill();
    markDirty(20);
  }

  function openLiveArea() {
    if (!WORKS[current]) return;
    currentView = 'livearea';
    select(current, true);
  }

  function returnHome() {
    currentView = 'home';
    selectToken++;
    if (live) { try { live.pause(); } catch (_) {} live = null; }
    drawFrame(WORKS[current] || null, currentImage);
    updateSpill();
    markDirty(20);
  }

  function navDpad(direction) {
    if (currentView === 'app') {
      const w = WORKS[current];
      if (w && w.appType === 'about') {
        const tabs = ['overview', 'skills', 'timeline'];
        let idx = tabs.indexOf(aboutTab);
        if (direction === 'left' || direction === 'up') {
          idx = (idx - 1 + tabs.length) % tabs.length;
        } else {
          idx = (idx + 1) % tabs.length;
        }
        aboutTab = tabs[idx];
        drawFrame(WORKS[current], currentImage);
        markDirty(15);
        return;
      }
      if (direction === 'left' || direction === 'up') select(current - 1);
      else select(current + 1);
      return;
    }
    if (currentView === 'livearea') {
      if (direction === 'left' || direction === 'up') select(current - 1);
      else select(current + 1);
      return;
    }
    const slot = current % ICONS_PER_PAGE;
    const pageBase = Math.floor(current / ICONS_PER_PAGE) * ICONS_PER_PAGE;
    const dirIdx = { left: 0, right: 1, up: 2, down: 3 }[direction];
    const nextSlot = STAGGERED_NAV[slot][dirIdx];
    if (nextSlot !== null && nextSlot !== undefined) {
      select(pageBase + nextSlot);
    }
  }

  /* ---------------------------------------------------------- */
  /* BUTTON PRESSES                                              */
  /* ---------------------------------------------------------- */
  const PRESS_DEPTH = 0.17;

  function press(role) {
    const b = buttons[role];
    if (b) {
      b.t = 1;
      const wp = new THREE.Box3().setFromObject(b.mesh).getCenter(new THREE.Vector3());
      pressLight.position.copy(wp).add(new THREE.Vector3(0, 0, 1.4));
      pressLight.color.set(role === 'cross' ? 0xc8ff3c : 0x7fe3ff);
      pressLightLife = 1;
    }
    markDirty(20);

    if (['left', 'right', 'up', 'down'].includes(role)) {
      navDpad(role);
    } else if (role === 'cross' || role === 'screen') {
      if (currentView === 'home') openLiveArea();
      else if (currentView === 'livearea') launchApp();
      else if (currentView === 'app') handleAppAction();
    } else if (role === 'start') {
      if (currentView === 'home') openLiveArea();
      else if (currentView === 'livearea') launchApp();
      else if (currentView === 'app') handleAppAction();
    } else if (role === 'circle') {
      if (currentView === 'app') returnLiveArea();
      else if (currentView === 'livearea') returnHome();
      else select(current - 1);
    } else if (role === 'triangle') {
      select(current + 1);
    } else if (role === 'home') {
      returnHome();
    } else if (role === 'square' || role === 'select') {
      if (currentView === 'app') returnLiveArea();
      else if (currentView === 'livearea') returnHome();
      else {
        const a = document.getElementById('about');
        a && a.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      }
    }
  }

  /* ---------------------------------------------------------- */
  /* INTERACTION & RAYCAST                                      */
  /* ---------------------------------------------------------- */
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hovered = null;
  let dragging = false, dragged = false, lastX = 0, lastY = 0;
  let spinY = 0, spinX = 0, spinVY = 0, spinVX = 0;

  let canvasRect = canvas.getBoundingClientRect();
  const updateCanvasRect = () => { canvasRect = canvas.getBoundingClientRect(); };
  window.addEventListener('resize', updateCanvasRect, { passive: true });
  canvas.addEventListener('pointerenter', updateCanvasRect, { passive: true });

  function toNDC(e) {
    if (!canvasRect || !canvasRect.width) updateCanvasRect();
    const t = e.touches ? e.touches[0] : e;
    ptr.x = ((t.clientX - canvasRect.left) / (canvasRect.width || 1)) * 2 - 1;
    ptr.y = -((t.clientY - canvasRect.top) / (canvasRect.height || 1)) * 2 + 1;
  }

  function pick() {
    if (!modelReady) return null;
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pressable, false)[0];
    return hit ? hit.object : null;
  }

  function screenPoint() {
    if (!modelReady || !screenMesh) return null;
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObject(screenMesh, false)[0];
    if (!hit || !hit.uv) return null;
    return { x: hit.uv.x * SW, y: (1 - hit.uv.y) * SH };
  }

  function activateScreenPoint() {
    const point = screenPoint();
    if (!point) return false;
    const { x, y } = point;

    if (currentView === 'home') {
      const page = Math.floor(current / ICONS_PER_PAGE);
      const first = page * ICONS_PER_PAGE;

      // Toque na orelha de página superior direita
      if (x > SW - 80 && y < 75) {
        const totalPages = Math.max(1, Math.ceil(Math.max(WORKS.length, 1) / ICONS_PER_PAGE));
        select(((page + 1) % totalPages) * ICONS_PER_PAGE);
        return true;
      }

      // Toque nas bolhas
      for (let slot = 0; slot < ICON_POSITIONS.length; slot++) {
        const [cx, cy] = ICON_POSITIONS[slot];
        if (Math.hypot(x - cx, y - cy) <= BUBBLE_RADIUS + 8) {
          const targetIdx = first + slot;
          select(targetIdx);
          if (WORKS[targetIdx]) openLiveArea();
          return true;
        }
      }
      return true;
    }

    if (currentView === 'livearea') {
      if ((y < 78 && x < 145) || (y > SH - 55 && x < 300)) {
        returnHome();
        return true;
      }
      if (y > SH - 55 && x > SW - 315) {
        select(x > SW - 165 ? current + 1 : current - 1);
        return true;
      }
      // START Button or Poster click launches the app!
      if ((x > 490 && y > 320 && y < 415) || (x >= 78 && x <= 462 && y >= 100 && y <= 428)) {
        launchApp();
        return true;
      }
      return true;
    }

    if (currentView === 'app') {
      return handleAppClick(x, y);
    }

    return true;
  }

  canvas.addEventListener('pointerdown', (e) => {
    updateCanvasRect();
    toNDC(e);
    dragging = true; dragged = false;
    lastX = e.clientX; lastY = e.clientY;
    markDirty(10);
  });

  let pickRaf = 0;
  canvas.addEventListener('pointermove', (e) => {
    toNDC(e);
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        if (!dragged) {
          dragged = true;
          try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch (_) {}
        }
      }
      spinVY += dx * 0.00042;
      spinVX += dy * 0.00030;
      lastX = e.clientX; lastY = e.clientY;
      markDirty(5);
      return;
    }
    if (!pickRaf) {
      pickRaf = requestAnimationFrame(() => {
        pickRaf = 0;
        const o = pick();
        if (o !== hovered) {
          hovered = o;
          canvas.style.cursor = o ? 'pointer' : 'grab';
        }
      });
    }
  });

  function endDrag() { dragging = false; }
  canvas.addEventListener('pointerup', (e) => {
    if (!dragged) {
      toNDC(e);
      const o = pick();
      if (o && o.userData.role === 'screen') activateScreenPoint();
      else if (o && o.userData.role) press(o.userData.role);
    }
    endDrag();
    markDirty(15);
  });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { endDrag(); hovered = null; canvas.style.cursor = 'grab'; });
  canvas.style.cursor = 'grab';

  window.addEventListener('keydown', (e) => {
    if (!inView) return;
    const k = e.key;
    if (k === 'ArrowLeft') { press('left'); e.preventDefault(); }
    else if (k === 'ArrowRight') { press('right'); e.preventDefault(); }
    else if (k === 'ArrowUp') { press('up'); e.preventDefault(); }
    else if (k === 'ArrowDown') { press('down'); e.preventDefault(); }
    else if (k === 'Enter' || k === 'x' || k === 'X') { press('cross'); }
    else if (k === 'Escape' || k === 'o' || k === 'O') { press('circle'); }
    else if (k === 't' || k === 'T') { press('triangle'); }
  });

  function fitToView() {
    if (!modelBox()) return;
    const b = modelBox();
    const size = b.getSize(new THREE.Vector3());
    // Scaled down to make the PS Vita model a bit smaller with clean margins
    const fill = window.innerWidth < 720 ? 0.78 : 0.70;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distH = (size.y / 2) / Math.tan(vFov / 2);
    const distW = (size.x / 2) / (Math.tan(vFov / 2) * camera.aspect);
    camera.position.set(0, 0, Math.max(distH, distW) / fill + size.z);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    markDirty(5);
  }

  function modelBox() {
    if (!modelReady && !model.children.length) return null;
    return new THREE.Box3().setFromObject(model);
  }

  function resize() {
    if (!stage) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 720 ? 42 : 32;
    camera.updateProjectionMatrix();
    updateCanvasRect();
    if (modelReady) fitToView();
    markDirty(5);
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  let inView = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      inView = es[0].isIntersecting;
      if (inView) markDirty(15);
      if (live) {
        if (inView) { const p = live.play(); if (p && p.catch) p.catch(() => {}); }
        else live.pause();
      }
    }, { threshold: 0.01, rootMargin: '100px 0px' }).observe(section || canvas);
  } else {
    inView = true;
  }

  document.addEventListener('visibilitychange', () => {
    if (!live) return;
    if (document.hidden) live.pause();
    else if (inView) { const p = live.play(); if (p && p.catch) p.catch(() => {}); }
  });

  /* ---------------------------------------------------------- */
  /* RENDER LOOP                                                */
  /* ---------------------------------------------------------- */
  const clock = new THREE.Clock();

  function tick() {
    requestAnimationFrame(tick);
    if (!inView) return;

    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    const wasMoving = Math.abs(spinVY) > 0.00001 || Math.abs(spinVX) > 0.00001;
    spinVY *= 0.90; spinVX *= 0.90;
    spinY += spinVY; spinX += spinVX;
    spinX = Math.max(-0.55, Math.min(0.55, spinX));
    if (!dragging) {
      spinY += (0 - spinY) * Math.min(1, dt * 3.2);
      spinX += (0 - spinX) * Math.min(1, dt * 3.2);
      if (Math.abs(spinY) < 0.0008) spinY = 0;
      if (Math.abs(spinX) < 0.0008) spinX = 0;
    }

    root.rotation.y = spinY;
    root.rotation.x = spinX;

    const powerDiff = Math.abs(powerTarget - powerT);
    powerT += (powerTarget - powerT) * Math.min(1, dt * 2.4);
    crtMat.uniforms.uPower.value = powerT;
    warpT *= Math.pow(0.0025, dt);
    if (warpT < 0.001) warpT = 0;
    crtMat.uniforms.uWarp.value = warpT;
    crtMat.uniforms.uTime.value = t;

    const on = powerT;
    spillA.color.lerp(spillTargetColor, 0.12);
    spillA.intensity += ((shellInverted ? 0 : spillTargetIntensity * on) - spillA.intensity) * 0.14;
    spillA.visible = (spillA.intensity > 0.01 && !shellInverted);

    let btnActive = false;
    for (const k in buttons) {
      const b = buttons[k];
      if (b.t <= 0.0005 && b.mesh.position.equals(b.home)) continue;
      btnActive = true;
      b.t *= Math.pow(0.004, dt);
      if (b.t < 0.0005) b.t = 0;
      const d = b.axis.clone().multiplyScalar(-PRESS_DEPTH * b.t);
      b.mesh.position.copy(b.home).add(d);
    }

    if (pressLightLife > 0) {
      pressLightLife -= dt * 3.4;
      pressLight.intensity = Math.max(0, pressLightLife) * 26;
      pressLight.visible = true;
    } else {
      pressLight.intensity = 0;
      pressLight.visible = false;
    }

    if (live && !live.paused && !live.ended && live.readyState >= 2) {
      drawFrame(WORKS[current] || null, live);
      updateSpillThrottled(t);
      markDirty(2);
    }

    const isActive = dragging || wasMoving || Math.abs(spinY) > 0.0005 || Math.abs(spinX) > 0.0005 ||
      powerDiff > 0.001 || warpT > 0.001 || pressLightLife > 0 || btnActive;

    if (isActive) markDirty(2);

    if (dirtyFrames > 0) {
      dirtyFrames--;
      renderer.render(scene, camera);
    }
  }
  tick();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (modelReady) select(current, true); });
  }
}