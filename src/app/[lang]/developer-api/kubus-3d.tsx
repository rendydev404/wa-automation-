"use client";

import { useEffect, useRef, useState } from "react";
import { PATH_TANDA } from "@/components/logo";

/**
 * Kubus Rubik 3D interaktif (WebGL, three.js) ala hero Resend, berwarna merek: 27 kubus kecil bersudut bulat dengan
 * material berbeda (mengilap, doff, karbon, jaring berlubang, kaca hijau, logo). Tarik dengan mouse/jari = memutar
 * kubus dengan inersia; klik/ketuk satu kubus = memutar lapisannya; diam = berputar pelan + lapisan berputar sendiri.
 *
 * Hemat resource: three.js (± 150 KB gzip) baru diunduh saat wadah terlihat & browser senggang; render hanya saat
 * terlihat dan tab aktif; pixel ratio maks 2; semua geometri/material/tekstur dibuang saat lepas.
 */
export function Kubus3D({ label }: { label: string }) {
  const wadah = useRef<HTMLDivElement>(null);
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    const el = wadah.current;
    if (!el) return;
    let batal = false;
    let hentikan: (() => void) | null = null;
    const mulai = async () => {
      const [THREE, { RoundedBoxGeometry }, { RoomEnvironment }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/geometries/RoundedBoxGeometry.js"),
        import("three/examples/jsm/environments/RoomEnvironment.js"),
      ]);
      if (batal) return;
      try {
        hentikan = bangun(el, THREE, RoundedBoxGeometry, RoomEnvironment);
        setSiap(true);
      } catch {
        // WebGL tidak tersedia: biarkan cahaya cadangan saja.
      }
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        if (ric) ric(() => void mulai(), { timeout: 1200 });
        else setTimeout(() => void mulai(), 200);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      batal = true;
      io.disconnect();
      hentikan?.();
    };
  }, []);

  return (
    <div ref={wadah} role="img" aria-label={label} className="ld-kubus3d relative h-full w-full">
      <div aria-hidden className={`pointer-events-none absolute inset-[18%] rounded-full bg-[#3ddc97]/10 blur-[60px] transition-opacity duration-1000 ${siap ? "opacity-60" : "opacity-100"}`} />
    </div>
  );
}

type Three = typeof import("three");
type RBG = typeof import("three/examples/jsm/geometries/RoundedBoxGeometry.js").RoundedBoxGeometry;
type RE = typeof import("three/examples/jsm/environments/RoomEnvironment.js").RoomEnvironment;

/** Generator acak berbenih (susunan material selalu sama tiap kunjungan). */
function acak(benih: number) {
  let s = benih;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function kanvas(ukuran: number, gambar: (g: CanvasRenderingContext2D, u: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = ukuran;
  gambar(c.getContext("2d")!, ukuran);
  return c;
}

function bangun(el: HTMLDivElement, THREE: Three, RoundedBoxGeometry: RBG, RoomEnvironment: RE): () => void {
  const kurangGerak = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  const kanvasGl = renderer.domElement;
  kanvasGl.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 1.2s ease;touch-action:pan-y;cursor:grab";
  el.appendChild(kanvasGl);

  const scene = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  kamera.position.set(0, 0, 12.5);

  // Pantulan lembut dari ruangan virtual + cahaya utama putih kiri atas & cahaya tepi hijau merek.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ruang = new RoomEnvironment();
  const env = pmrem.fromScene(ruang, 0.04).texture;
  scene.environment = env;
  scene.add(new THREE.AmbientLight(0xffffff, 0.05));
  const utama = new THREE.DirectionalLight(0xffffff, 1.7);
  utama.position.set(-5, 7, 6);
  scene.add(utama);
  const tepi = new THREE.PointLight(0x3ddc97, 30, 22, 1.6);
  tepi.position.set(5, -3, 4);
  scene.add(tepi);
  const belakang = new THREE.PointLight(0x9fe8c6, 14, 20, 1.8);
  belakang.position.set(-3, 2, -6);
  scene.add(belakang);

  // ---- Tekstur prosedural (kecil, dibuat sekali) ----
  const tekKarbon = new THREE.CanvasTexture(
    kanvas(128, (g, u) => {
      const k = u / 8;
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const gr = (x + y) % 2 ? g.createLinearGradient(x * k, y * k, x * k + k, y * k) : g.createLinearGradient(x * k, y * k, x * k, y * k + k);
          gr.addColorStop(0, "#202020");
          gr.addColorStop(0.5, "#bdbdbd");
          gr.addColorStop(1, "#202020");
          g.fillStyle = gr;
          g.fillRect(x * k, y * k, k, k);
        }
    }),
  );
  const tekJaring = new THREE.CanvasTexture(
    kanvas(128, (g, u) => {
      g.fillStyle = "#d0d0d0";
      g.fillRect(0, 0, u, u);
      g.fillStyle = "#101010";
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          g.beginPath();
          g.arc(x * 8 + 4 + (y % 2) * 4, y * 8 + 4, 2.3, 0, Math.PI * 2);
          g.fill();
        }
    }),
  );
  const tekBintik = new THREE.CanvasTexture(
    kanvas(128, (g, u) => {
      const r = acak(7);
      g.fillStyle = "#808080";
      g.fillRect(0, 0, u, u);
      for (let i = 0; i < 1800; i++) {
        const v = Math.floor(90 + r() * 120);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(r() * u, r() * u, 1, 1);
      }
    }),
  );
  const tekLogo = new THREE.CanvasTexture(
    kanvas(256, (g, u) => {
      g.fillStyle = "#06120d";
      g.fillRect(0, 0, u, u);
      g.save();
      g.translate(u * 0.2, u * 0.18);
      g.scale((u * 0.6) / 100, (u * 0.6) / 100);
      g.shadowColor = "#3ddc97";
      g.shadowBlur = 18;
      g.fillStyle = "#3ddc97";
      g.fill(new Path2D(PATH_TANDA));
      g.beginPath();
      g.arc(94.76, 75.68, 4.68, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }),
  );
  tekLogo.colorSpace = THREE.SRGBColorSpace;
  for (const t of [tekKarbon, tekJaring, tekBintik]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }

  // Hampir hitam seperti kubus Resend; kilau datang dari pantulan lembut + cahaya tepi hijau.
  const dasar = { color: 0x050a08, envMapIntensity: 0.45 };
  const mat = {
    kilap: new THREE.MeshPhysicalMaterial({ ...dasar, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.2 }),
    doff: new THREE.MeshPhysicalMaterial({ ...dasar, color: 0x070d0a, roughness: 0.8, metalness: 0.05 }),
    karbon: new THREE.MeshPhysicalMaterial({ ...dasar, roughness: 0.5, metalness: 0.25, roughnessMap: tekKarbon, bumpMap: tekKarbon, bumpScale: 0.6, clearcoat: 0.7, clearcoatRoughness: 0.3 }),
    jaring: new THREE.MeshPhysicalMaterial({ ...dasar, color: 0x060c09, roughness: 0.7, metalness: 0.3, bumpMap: tekJaring, bumpScale: 0.9 }),
    bintik: new THREE.MeshPhysicalMaterial({ ...dasar, roughness: 0.55, metalness: 0.3, bumpMap: tekBintik, bumpScale: 0.35, roughnessMap: tekBintik, clearcoat: 0.5 }),
    hijau: new THREE.MeshPhysicalMaterial({ color: 0x08261b, emissive: 0x1fae73, emissiveIntensity: 0.38, roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.6 }),
    logo: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: tekLogo, emissive: 0xffffff, emissiveMap: tekLogo, emissiveIntensity: 0.9, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
  };

  // ---- 27 kubus kecil ----
  const JARAK = 1.045;
  const geo = new RoundedBoxGeometry(1, 1, 1, 5, 0.1);
  const kubus = new THREE.Group();
  kubus.rotation.set(0.42, -0.62, 0.12);
  scene.add(kubus);
  const r = acak(20261111);
  const pilihan = [mat.kilap, mat.kilap, mat.kilap, mat.doff, mat.doff, mat.karbon, mat.jaring, mat.bintik, mat.bintik];
  const kecil: import("three").Mesh[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        let m: import("three").Material | import("three").Material[] = pilihan[Math.floor(r() * pilihan.length)];
        if ((x === 1 && y === -1 && z === 1) || (x === -1 && y === 1 && z === -1)) m = mat.hijau;
        // Logo merek di sisi depan kubus tengah depan (urutan grup BoxGeometry: +x, -x, +y, -y, +z, -z).
        if (x === 0 && y === 0 && z === 1) m = [mat.kilap, mat.kilap, mat.kilap, mat.kilap, mat.logo, mat.kilap];
        const c = new THREE.Mesh(geo, m);
        c.position.set(x * JARAK, y * JARAK, z * JARAK);
        kubus.add(c);
        kecil.push(c);
      }

  // ---- Ukuran ----
  const ukur = () => {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    kamera.aspect = w / h;
    // Layar sempit: mundurkan kamera supaya kubus tidak terpotong.
    kamera.position.z = w < 420 ? 14.5 : 12.5;
    kamera.updateProjectionMatrix();
  };
  ukur();
  const ro = new ResizeObserver(ukur);
  ro.observe(el);

  // ---- Interaksi: tarik = putar dengan inersia; klik = putar lapisan ----
  const vel = { x: 0, y: 0 };
  let tarik = false;
  let geser = 0;
  let akhir = { x: 0, y: 0 };
  let diamSejak = performance.now();
  const sumbuX = new THREE.Vector3(1, 0, 0);
  const sumbuY = new THREE.Vector3(0, 1, 0);
  const qTmp = new THREE.Quaternion();
  const putarDunia = (dx: number, dy: number) => {
    qTmp.setFromAxisAngle(sumbuY, dx);
    kubus.quaternion.premultiply(qTmp);
    qTmp.setFromAxisAngle(sumbuX, dy);
    kubus.quaternion.premultiply(qTmp);
  };
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const turun = (e: PointerEvent) => {
    tarik = true;
    geser = 0;
    akhir = { x: e.clientX, y: e.clientY };
    vel.x = vel.y = 0;
    kanvasGl.style.cursor = "grabbing";
    kanvasGl.setPointerCapture(e.pointerId);
    jalankan();
  };
  const gerak = (e: PointerEvent) => {
    if (!tarik) return;
    const dx = e.clientX - akhir.x;
    const dy = e.clientY - akhir.y;
    akhir = { x: e.clientX, y: e.clientY };
    geser += Math.abs(dx) + Math.abs(dy);
    vel.x = dx * 0.0065;
    vel.y = dy * 0.0065;
    putarDunia(vel.x, vel.y);
  };
  const naik = (e: PointerEvent) => {
    if (!tarik) return;
    tarik = false;
    diamSejak = performance.now();
    kanvasGl.style.cursor = "grab";
    if (kanvasGl.hasPointerCapture(e.pointerId)) kanvasGl.releasePointerCapture(e.pointerId);
    if (geser < 6) {
      // Klik/ketuk: putar lapisan kubus yang kena, pada sumbu acak.
      const b = kanvasGl.getBoundingClientRect();
      ptr.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(ptr, kamera);
      const kena = ray.intersectObjects(kecil, false)[0];
      if (kena) {
        const sumbu = (["x", "y", "z"] as const)[Math.floor(Math.random() * 3)];
        mulaiPutarLapisan(sumbu, Math.round((kena.object as import("three").Mesh).position[sumbu] / JARAK), Math.random() < 0.5 ? 1 : -1);
      }
    }
  };
  const batalTarik = () => {
    tarik = false;
    kanvasGl.style.cursor = "grab";
  };
  kanvasGl.addEventListener("pointerdown", turun);
  kanvasGl.addEventListener("pointermove", gerak);
  kanvasGl.addEventListener("pointerup", naik);
  kanvasGl.addEventListener("pointercancel", batalTarik);

  // ---- Putar lapisan (ala Rubik) ----
  const poros = new THREE.Object3D();
  kubus.add(poros);
  let lapisan: { sumbu: "x" | "y" | "z"; arah: number; mulai: number; anggota: import("three").Mesh[] } | null = null;
  const LAMA = 620;
  const mAtur = new THREE.Matrix4();
  function mulaiPutarLapisan(sumbu: "x" | "y" | "z", idx: number, arah: number) {
    if (lapisan) return;
    const anggota = kecil.filter((c) => Math.round(c.position[sumbu] / JARAK) === idx);
    poros.rotation.set(0, 0, 0);
    poros.updateMatrixWorld();
    for (const c of anggota) poros.attach(c);
    lapisan = { sumbu, arah, mulai: performance.now(), anggota };
    jalankan();
  }
  const selesaiLapisan = () => {
    if (!lapisan) return;
    poros.rotation[lapisan.sumbu] = (lapisan.arah * Math.PI) / 2;
    poros.updateMatrixWorld();
    for (const c of lapisan.anggota) {
      kubus.attach(c);
      // Rapikan ke kisi (hindari pergeseran pecahan setelah ratusan putaran).
      c.position.set(Math.round(c.position.x / JARAK) * JARAK, Math.round(c.position.y / JARAK) * JARAK, Math.round(c.position.z / JARAK) * JARAK);
      mAtur.makeRotationFromQuaternion(c.quaternion);
      const e = mAtur.elements;
      for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[i] = Math.round(e[i]);
      c.quaternion.setFromRotationMatrix(mAtur);
    }
    lapisan = null;
  };
  const halus = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---- Lingkaran render: hanya saat terlihat & tab aktif ----
  let raf = 0;
  let terlihat = true;
  let berikutLapisan = performance.now() + 1800;
  let lalu = performance.now();
  let tampil = false;
  const bingkai = (kini: number) => {
    raf = 0;
    const dt = Math.min(48, kini - lalu) / 16.67;
    lalu = kini;
    if (!tarik) {
      // Inersia meluruh, lalu kembali ke putaran pelan bawaan.
      vel.x *= Math.pow(0.94, dt);
      vel.y *= Math.pow(0.94, dt);
      const pelan = kurangGerak ? 0 : 0.0022;
      putarDunia((vel.x + pelan) * dt, vel.y * dt);
      if (!kurangGerak && !lapisan && kini > berikutLapisan && kini - diamSejak > 1200) {
        const sumbu = (["x", "y", "z"] as const)[Math.floor(Math.random() * 3)];
        mulaiPutarLapisan(sumbu, Math.floor(Math.random() * 3) - 1, Math.random() < 0.5 ? 1 : -1);
        berikutLapisan = kini + 2200 + Math.random() * 1600;
      }
    }
    if (lapisan) {
      const t = Math.min(1, (kini - lapisan.mulai) / LAMA);
      poros.rotation.set(0, 0, 0);
      poros.rotation[lapisan.sumbu] = halus(t) * lapisan.arah * (Math.PI / 2);
      if (t >= 1) selesaiLapisan();
    }
    renderer.render(scene, kamera);
    if (!tampil) {
      tampil = true;
      kanvasGl.style.opacity = "1";
    }
    if (terlihat && !document.hidden && (!kurangGerak || tarik || lapisan || Math.abs(vel.x) + Math.abs(vel.y) > 0.0001)) raf = requestAnimationFrame(bingkai);
  };
  function jalankan() {
    if (!raf) {
      lalu = performance.now();
      raf = requestAnimationFrame(bingkai);
    }
  }
  const io = new IntersectionObserver(([e]) => {
    terlihat = e.isIntersecting;
    if (terlihat) jalankan();
  });
  io.observe(el);
  const ubahTab = () => !document.hidden && jalankan();
  document.addEventListener("visibilitychange", ubahTab);
  jalankan();

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    document.removeEventListener("visibilitychange", ubahTab);
    kanvasGl.removeEventListener("pointerdown", turun);
    kanvasGl.removeEventListener("pointermove", gerak);
    kanvasGl.removeEventListener("pointerup", naik);
    kanvasGl.removeEventListener("pointercancel", batalTarik);
    geo.dispose();
    for (const m of Object.values(mat)) m.dispose();
    for (const t of [tekKarbon, tekJaring, tekBintik, tekLogo]) t.dispose();
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    kanvasGl.remove();
  };
}
