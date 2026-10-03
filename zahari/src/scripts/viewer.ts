import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

function startViewer(root: HTMLElement) {
  const host = root.querySelector<HTMLElement>("[data-canvas]")!;
  const loading = root.querySelector<HTMLElement>("[data-loading]")!;
  const progress = root.querySelector<HTMLElement>("[data-progress]")!;
  const retry = root.querySelector<HTMLButtonElement>("[data-retry]")!;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
  } catch {
    loading.classList.add("error");
    progress.textContent =
      "This browser cannot display 3D. Try a browser with WebGL enabled.";
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d8d2e5");
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.autoRotateSpeed = 0.45;
  controls.minDistance = 1.8;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.listenToKeyEvents(host);
  const hemisphere = new THREE.HemisphereLight("#f7e9ff", "#6e627f", 2.3);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight("#ffdcc4", 3.5);
  sun.position.set(4, 7, 5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#b3c9ff", 1.5);
  fill.position.set(-4, 2, -3);
  scene.add(fill);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.45;
  room.dispose();
  pmrem.dispose();
  const anchor = new THREE.Group();
  scene.add(anchor);
  let ground: THREE.Mesh | undefined;
  let alive = true;
  let visible = true;
  let loaded = false;
  let needsRender = true;
  controls.addEventListener("change", () => {
    needsRender = true;
  });
  const reset = () => {
    controls.target.set(0, -0.1, 0);
    camera.position
      .set(3.6, 2.4, 4.7)
      .multiplyScalar(1 / Math.min(1, camera.aspect))
      .add(controls.target);
    controls.update();
  };
  const resize = () => {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    const oldFit = 1 / Math.min(1, camera.aspect),
      newFit = 1 / Math.min(1, width / height);
    renderer.setSize(width, height, false);
    needsRender = true;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    controls.maxDistance = 12 * newFit;
    camera.position
      .sub(controls.target)
      .multiplyScalar(newFit / oldFit)
      .add(controls.target);
    controls.update();
  };
  reset();
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
  });
  intersection.observe(host);
  let frame = 0;
  let previous = 0;
  const animate = (time: number) => {
    if (!alive) return;
    frame = requestAnimationFrame(animate);
    if (!visible || document.hidden || time - previous < 30) return;
    previous = time;
    controls.update();
    // Static artwork should not continuously burn GPU/battery while idle.
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  };
  frame = requestAnimationFrame(animate);
  const loader = new GLTFLoader();
  async function load() {
    retry.hidden = true;
    loading.hidden = false;
    loading.classList.remove("error");
    progress.textContent = "Opening the fortress…";
    try {
      const gltf = await loader.loadAsync(
        "/media/btc/BTC_FORTRESS_01.glb",
        (event) => {
          if (event.total)
            progress.textContent = `Opening the fortress… ${Math.round((event.loaded / event.total) * 100)}%`;
        },
      );
      if (!alive) {
        disposeObject(gltf.scene);
        return;
      }
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const scale = 3 / Math.max(size.x, size.y, size.z);
      gltf.scene.position.sub(box.getCenter(new THREE.Vector3()));
      anchor.add(gltf.scene);
      anchor.scale.setScalar(scale);
      ground = new THREE.Mesh(
        new THREE.CircleGeometry(2.45, 80),
        new THREE.MeshStandardMaterial({
          color: "#c8bfd9",
          roughness: 1,
          metalness: 0,
        }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = (-size.y * scale) / 2 - 0.02;
      scene.add(ground);
      loaded = true;
      needsRender = true;
      loading.hidden = true;
      root.dataset.loaded = "true";
      renderer.render(scene, camera);
    } catch {
      loading.classList.add("error");
      progress.textContent =
        "The fortress did not load. Check your connection, then try again.";
      retry.hidden = false;
    }
  }
  retry.addEventListener("click", load);
  void load();
  const moods: Record<
    string,
    {
      bg: string;
      sun: string;
      power: number;
      exposure: number;
      ambient: number;
      floor: string;
    }
  > = {
    day: {
      bg: "#e5e5ef",
      sun: "#fff5df",
      power: 4,
      exposure: 1.4,
      ambient: 2.7,
      floor: "#d2cedc",
    },
    dusk: {
      bg: "#d8d2e5",
      sun: "#ffdcc4",
      power: 3.5,
      exposure: 1.3,
      ambient: 2.3,
      floor: "#c8bfd9",
    },
    night: {
      bg: "#55506d",
      sun: "#abc5ff",
      power: 2,
      exposure: 0.95,
      ambient: 1.2,
      floor: "#655c7c",
    },
  };
  root.querySelectorAll<HTMLButtonElement>("[data-light]").forEach((button) =>
    button.addEventListener("click", () => {
      root.dataset.mood = button.dataset.light;
      needsRender = true;
      const mood = moods[button.dataset.light!];
      scene.background = new THREE.Color(mood.bg);
      sun.color.set(mood.sun);
      sun.intensity = mood.power;
      hemisphere.intensity = mood.ambient;
      renderer.toneMappingExposure = mood.exposure;
      if (ground)
        (ground.material as THREE.MeshStandardMaterial).color.set(mood.floor);
      root
        .querySelectorAll("[data-light]")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
    }),
  );
  root
    .querySelector<HTMLButtonElement>('[data-view-action="reset"]')!
    .addEventListener("click", reset);
  const rotate = root.querySelector<HTMLButtonElement>(
    '[data-view-action="rotate"]',
  )!;
  rotate.addEventListener("click", () => {
    controls.autoRotate = !controls.autoRotate;
    rotate.setAttribute("aria-pressed", String(controls.autoRotate));
    rotate.setAttribute(
      "aria-label",
      controls.autoRotate ? "Pause rotation" : "Start rotation",
    );
    rotate.title = controls.autoRotate ? "Pause rotation" : "Start rotation";
  });
  root
    .querySelector<HTMLButtonElement>('[data-view-action="capture"]')!
    .addEventListener("click", () => {
      if (!loaded) return;
      renderer.render(scene, camera);
      renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `zahari-btc-fortress-${new Date().toISOString().slice(0, 10)}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    });
  window.addEventListener(
    "pagehide",
    (event) => {
      if (event.persisted) return;
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      controls.dispose();
      disposeObject(scene);
      environment.dispose();
      renderer.dispose();
    },
    { once: true },
  );
}
function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}
document.querySelectorAll<HTMLElement>("[data-viewer]").forEach(startViewer);
