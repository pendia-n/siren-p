import * as THREE from "three";

export type Place = "lowland" | "pacific" | "sky";
type Mood = "dawn" | "day" | "dusk" | "night";

const seeded = (n: number) => {
  const value = Math.sin(n * 127.1 + 41.7) * 43758.5453;
  return value - Math.floor(value);
};

function softTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 62);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.52, color.replace(/,[^,]*\)$/, ", 0.16)"));
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function irregularLand(
  radiusX: number,
  radiusZ: number,
  depth: number,
  top: THREE.ColorRepresentation,
  side: THREE.ColorRepresentation,
) {
  const points = 40;
  const vertices: number[] = [];
  const topColor = new THREE.Color(top);
  const sideColor = new THREE.Color(side);
  const colors: number[] = [];
  const add = (x: number, y: number, z: number, color: THREE.Color) => {
    vertices.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  };
  const edge = Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2;
    const jitter = 0.94 + seeded(i + 7) * 0.1 + Math.sin(angle * 7) * 0.04;
    return { x: Math.cos(angle) * radiusX * jitter, z: Math.sin(angle) * radiusZ * jitter };
  });
  for (let i = 0; i < points; i++) {
    const a = edge[i];
    const b = edge[(i + 1) % points];
    add(0, 0, 0, topColor);
    add(b.x, 0, b.z, topColor);
    add(a.x, 0, a.z, topColor);
    const lowerA = { x: a.x * 0.81, z: a.z * 0.81 };
    const lowerB = { x: b.x * 0.81, z: b.z * 0.81 };
    add(a.x, 0, a.z, sideColor);
    add(b.x, 0, b.z, sideColor);
    add(lowerB.x, -depth, lowerB.z, sideColor);
    add(a.x, 0, a.z, sideColor);
    add(lowerB.x, -depth, lowerB.z, sideColor);
    add(lowerA.x, -depth, lowerA.z, sideColor);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export function createEnvironment(scene: THREE.Scene) {
  const ground = new THREE.Group();
  const sea = new THREE.Group();
  const highland = new THREE.Group();
  scene.add(ground, sea, highland);

  const terrainGeometry = new THREE.PlaneGeometry(16, 16, 72, 72);
  const terrainPosition = terrainGeometry.attributes.position;
  const terrainColors: number[] = [];
  const grassBase = new THREE.Color("#365f3f");
  for (let i = 0; i < terrainPosition.count; i++) {
    const x = terrainPosition.getX(i);
    const z = terrainPosition.getY(i);
    const distance = Math.hypot(x, z);
    const height = Math.min(1, Math.max(0, (distance - 2.4) / 3));
    terrainPosition.setZ(
      i,
      height * (Math.sin(x * 0.27) * 0.18 + Math.cos(z * 0.31) * 0.14),
    );
    const shade = 0.83 + seeded(i + 82) * 0.28;
    const opacity = Math.min(1, Math.max(0, (7.5 - distance) / 2.8));
    terrainColors.push(grassBase.r * shade, grassBase.g * shade, grassBase.b * shade, opacity);
  }
  terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(terrainColors, 4));
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 1, side: THREE.DoubleSide }),
  );
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  ground.add(terrain);

  const bladeGeometry = new THREE.ConeGeometry(0.008, 0.075, 3);
  const blades = new THREE.InstancedMesh(
    bladeGeometry,
    new THREE.MeshStandardMaterial({ color: "#6e8b56", roughness: 1, side: THREE.DoubleSide }),
    650,
  );
  const bladeDummy = new THREE.Object3D();
  const bladePositions: Array<{ x: number; z: number; height: number; phase: number }> = [];
  for (let i = 0; i < blades.count; i++) {
    const angle = seeded(i * 2 + 1) * Math.PI * 2;
    const radius = 2.05 + Math.sqrt(seeded(i * 2 + 2)) * 4.7;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    bladePositions.push({ x, z, height: 0.55 + seeded(i * 3 + 4) * 0.65, phase: seeded(i * 5 + 3) * 6.28 });
    bladeDummy.position.set(x, 0.035, z);
    bladeDummy.scale.set(1, bladePositions[i].height, 1);
    bladeDummy.rotation.y = angle;
    bladeDummy.updateMatrix();
    blades.setMatrixAt(i, bladeDummy.matrix);
  }
  blades.instanceMatrix.needsUpdate = true;
  blades.frustumCulled = false;
  ground.add(blades);
  const windShadowTexture = softTexture("rgba(25,61,55,0.28)");
  const windShadows: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8 + i, 2.5 + i * 0.6),
      new THREE.MeshBasicMaterial({ map: windShadowTexture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(i ? 3 : -4, 0.018, i ? 2.4 : -2.2);
    ground.add(shadow);
    windShadows.push(shadow);
  }

  const seaGeometry = new THREE.PlaneGeometry(32, 32, 72, 72);
  const seaBase = seaGeometry.attributes.position.array.slice() as Float32Array;
  const waterColors: number[] = [];
  const seaPosition = seaGeometry.attributes.position;
  for (let i = 0; i < seaPosition.count; i++) {
    const x = seaPosition.getX(i);
    const z = seaPosition.getY(i);
    const alpha = Math.min(1, Math.max(0, (15.2 - Math.max(Math.abs(x), Math.abs(z))) / 4));
    waterColors.push(1, 1, 1, alpha);
  }
  seaGeometry.setAttribute("color", new THREE.Float32BufferAttribute(waterColors, 4));
  const seaMaterial = new THREE.MeshStandardMaterial({
    color: "#205a75", roughness: 0.42, metalness: 0.06,
    side: THREE.DoubleSide, flatShading: true, vertexColors: true, transparent: true, depthWrite: false,
  });
  const water = new THREE.Mesh(seaGeometry, seaMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.16;
  water.receiveShadow = true;
  sea.add(water);
  const sandbar = irregularLand(2.05, 1.86, 0.28, "#827c5f", "#5f6757");
  sea.add(sandbar);
  const foam = new THREE.Group();
  for (let i = 0; i < 34; i++) {
    const angle = (i / 34) * Math.PI * 2;
    const radius = 2.2 + seeded(i + 211) * 0.24;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1 + seeded(i + 99) * 0.22, 0.013),
      new THREE.MeshBasicMaterial({ color: "#dbe9e7", transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    );
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = angle;
    line.position.set(Math.cos(angle) * radius, -0.105, Math.sin(angle) * radius);
    foam.add(line);
  }
  sea.add(foam);
  const tideLines: THREE.LineLoop[] = [];
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.BufferGeometry();
    const points = new Float32Array(84 * 3);
    for (let j = 0; j < 84; j++) {
      const angle = (j / 84) * Math.PI * 2;
      const radius = 2.18 + i * 0.15;
      points[j * 3] = Math.cos(angle) * radius;
      points[j * 3 + 1] = -0.025;
      points[j * 3 + 2] = Math.sin(angle) * radius * 0.91;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    const line = new THREE.LineLoop(
      geometry,
      new THREE.LineBasicMaterial({ color: "#e6f1ea", transparent: true, opacity: 0.38 - i * 0.08, depthWrite: false }),
    );
    sea.add(line);
    tideLines.push(line);
  }

  const plateau = irregularLand(2.05, 1.9, 1.1, "#696e72", "#454f60");
  highland.add(plateau);
  const clouds: THREE.Group[] = [];
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: "#edf1ef", transparent: true, opacity: 0.82, roughness: 1, depthWrite: false,
  });
  const cloudGeometry = new THREE.SphereGeometry(1, 10, 8);
  const cloudOrigins: number[] = [];
  for (let i = 0; i < 15; i++) {
    const group = new THREE.Group();
    const angle = seeded(i + 7) * Math.PI * 2;
    const radius = 3.1 + seeded(i + 19) * 11;
    group.position.set(Math.cos(angle) * radius, -0.95 - seeded(i + 15) * 0.6, Math.sin(angle) * radius);
    cloudOrigins.push(group.position.x);
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(cloudGeometry, cloudMaterial);
      puff.scale.set(0.55 + seeded(i * 7 + j) * 0.4, 0.16 + seeded(i * 9 + j) * 0.12, 0.36 + seeded(i * 5 + j) * 0.2);
      puff.position.x = (j - 1.5) * 0.48;
      puff.position.y = Math.sin(j * 2.1) * 0.12;
      group.add(puff);
    }
    highland.add(group);
    clouds.push(group);
  }
  const mistTexture = softTexture("rgba(245,249,245,0.68)");
  const mists: THREE.Sprite[] = [];
  for (let i = 0; i < 7; i++) {
    const mist = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: mistTexture, color: "#eef5f4", transparent: true, opacity: 0.42, depthWrite: false }),
    );
    mist.position.set(-3.2 + i * 1.05, -0.33 - (i % 3) * 0.13, 2.15 + (i % 2) * 0.35);
    mist.scale.set(2.8 + (i % 3) * 0.5, 0.68 + (i % 2) * 0.25, 1);
    highland.add(mist);
    mists.push(mist);
  }

  let place: Place = "lowland";
  let mood: Mood = "day";
  let floorY = -0.9;
  let clock = 0;
  const setFloor = (value: number) => {
    floorY = value;
    ground.position.y = floorY;
    sea.position.y = floorY;
    highland.position.y = floorY;
  };
  const setPlace = (value: Place) => {
    place = value;
    ground.visible = value === "lowland";
    sea.visible = value === "pacific";
    highland.visible = value === "sky";
  };
  const setMood = (value: Mood) => {
    mood = value;
    const dark = value === "night";
    seaMaterial.color.set(dark ? "#183c58" : value === "dusk" ? "#325f7d" : "#205a75");
    cloudMaterial.color.set(dark ? "#9eabc2" : value === "dusk" ? "#e5dae0" : "#edf1ef");
    (blades.material as THREE.MeshStandardMaterial).color.set(dark ? "#587056" : "#6e8b56");
  };
  setFloor(floorY);
  setPlace(place);
  const animate = (seconds: number, reducedMotion: boolean) => {
    if (reducedMotion) return false;
    clock = seconds;
    if (place === "lowland") {
      for (let i = 0; i < blades.count; i++) {
        const blade = bladePositions[i];
        bladeDummy.position.set(blade.x, 0.035, blade.z);
        bladeDummy.scale.set(1, blade.height, 1);
        bladeDummy.rotation.set(0, blade.phase, Math.sin(clock * 1.8 + blade.phase) * 0.16);
        bladeDummy.updateMatrix();
        blades.setMatrixAt(i, bladeDummy.matrix);
      }
      blades.instanceMatrix.needsUpdate = true;
    } else if (place === "pacific") {
      const positions = seaGeometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = seaBase[i * 3];
        const z = seaBase[i * 3 + 1];
        positions.setZ(i, Math.sin(x * 0.42 + clock * 0.75) * 0.055 + Math.sin(z * 0.75 - clock * 0.95) * 0.032);
      }
      positions.needsUpdate = true;
      seaGeometry.computeVertexNormals();
      foam.rotation.y = Math.sin(clock * 0.3) * 0.03;
      tideLines.forEach((line, index) => {
        const positions = line.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const angle = (i / positions.count) * Math.PI * 2;
          const swell = Math.sin(clock * 1.2 - index * 1.5 + angle * 5) * 0.04;
          const radius = 2.18 + index * 0.15 + swell;
          positions.setXYZ(i, Math.cos(angle) * radius, -0.025 + Math.sin(clock * 1.2 + angle * 4) * 0.012, Math.sin(angle) * radius * 0.91);
        }
        positions.needsUpdate = true;
        (line.material as THREE.LineBasicMaterial).opacity = 0.26 + Math.max(0, Math.sin(clock * 1.2 - index * 1.5)) * 0.22;
      });
    } else {
      clouds.forEach((cloud, i) => {
        cloud.position.x = cloudOrigins[i] + Math.sin(clock * 0.23 + i * 1.7) * (0.16 + (i % 3) * 0.05);
        cloud.position.y = -0.95 - seeded(i + 15) * 0.6 + Math.sin(clock * 0.45 + i * 2) * 0.035;
      });
      mists.forEach((mist, i) => {
        mist.position.x = -3.2 + i * 1.05 + Math.sin(clock * 0.43 + i * 0.7) * 0.34;
        mist.position.y = -0.33 - (i % 3) * 0.13 + Math.sin(clock * 0.57 + i) * 0.045;
        (mist.material as THREE.SpriteMaterial).opacity = 0.3 + Math.sin(clock * 0.75 + i * 0.8) * 0.13;
      });
    }
    if (place === "lowland") {
      windShadows.forEach((shadow, i) => {
        shadow.position.x = ((clock * (0.34 + i * 0.12) + i * 5) % 16) - 8;
        shadow.position.z = (i ? 2.4 : -2.2) + Math.sin(clock * 0.22 + i) * 0.3;
      });
    }
    return true;
  };
  return { setFloor, setPlace, setMood, animate, get place() { return place; }, get mood() { return mood; } };
}
