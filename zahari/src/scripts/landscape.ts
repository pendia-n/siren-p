type Location = "neutral" | "lowland" | "pacific" | "sky";
type Mood = "dawn" | "day" | "dusk" | "night";

const colors: Record<
  Mood,
  { top: string; horizon: string; water: string; hill: string; near: string }
> = {
  dawn: {
    top: "#718fbd",
    horizon: "#f5d8bb",
    water: "#6794a1",
    hill: "#9da793",
    near: "#6f8a69",
  },
  day: {
    top: "#a4d4e9",
    horizon: "#f4f0d9",
    water: "#5a9daf",
    hill: "#a1b89b",
    near: "#78966e",
  },
  dusk: {
    top: "#666d9d",
    horizon: "#edc2ab",
    water: "#617a9d",
    hill: "#828a89",
    near: "#62756c",
  },
  night: {
    top: "#202a4d",
    horizon: "#626b91",
    water: "#334d6d",
    hill: "#39485d",
    near: "#334755",
  },
};

export function createLandscape(host: HTMLElement, initial: Location) {
  const canvas = document.createElement("canvas");
  canvas.className = "landscape-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("The scene background is unavailable.");
  let location = initial;
  let mood: Mood = "dusk";
  let parallax = 0;
  let phase = 0;
  const paint = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.7);
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const palette = colors[mood];
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(
      0,
      location === "neutral"
        ? mood === "night"
          ? "#55506d"
          : "#d8d2e5"
        : palette.top,
    );
    sky.addColorStop(
      1,
      location === "neutral"
        ? mood === "night"
          ? "#7c7692"
          : "#eee7eb"
        : palette.horizon,
    );
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    if (location === "neutral") return;

    const glowX = width * (mood === "dusk" ? 0.74 : 0.24) + parallax * 0.35;
    const glowY = height * (mood === "night" ? 0.24 : 0.33);
    const light = ctx.createRadialGradient(glowX, glowY, 5, glowX, glowY, width * 0.36);
    light.addColorStop(0, mood === "night" ? "#d7deff45" : "#fff5ce94");
    light.addColorStop(1, "#ffffff00");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height * 0.75);
    ctx.fillStyle = mood === "night" ? "#e5e8e6" : "#fff7dc";
    ctx.beginPath();
    ctx.arc(glowX, glowY, mood === "night" ? 11 : 20, 0, Math.PI * 2);
    ctx.fill();

    const drawCloud = (x: number, y: number, scale: number, opacity: number) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      const shadow = mood === "night" ? "#7484a5" : "#8299ad";
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(x, y + scale * 10, scale * 85, scale * 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mood === "night" ? "#cbd5e5" : "#fffdf5";
      for (const [dx, dy, rx, ry] of [
        [-42, 0, 42, 14], [0, -11, 45, 24], [38, -4, 44, 18], [3, 3, 81, 15],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x + dx * scale, y + dy * scale, rx * scale, ry * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    for (let i = 0; i < 8; i++) {
      const drift = phase * (3 + (i % 3) * 1.5);
      const x = ((i * 239 + drift) % (width + 360)) - 180 + parallax * 0.22;
      const y = height * (0.12 + ((i * 13) % 38) / 100);
      drawCloud(x, y, 0.45 + (i % 4) * 0.16, location === "sky" ? 0.85 : 0.44);
    }

    // The horizon, middle and foreground move by different amounts as the model orbits.
    const far = parallax * 0.35;
    const near = parallax;
    if (location === "lowland") {
      ctx.fillStyle = mood === "night" ? "#414e69" : "#8097a2";
      ctx.beginPath();
      ctx.moveTo(0, height * 0.73);
      for (let x = 0; x <= width + 20; x += 20) {
        ctx.lineTo(x, height * (0.68 + Math.sin(x * 0.011 + parallax * 0.001) * 0.04));
      }
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fill();
      ctx.fillStyle = palette.hill;
      ctx.beginPath();
      ctx.moveTo(-50, height * 0.79);
      ctx.bezierCurveTo(
        width * 0.18 + far,
        height * 0.57,
        width * 0.34 + far,
        height * 0.73,
        width * 0.55 + far,
        height * 0.67,
      );
      ctx.bezierCurveTo(
        width * 0.75 + far,
        height * 0.59,
        width * 0.9 + far,
        height * 0.65,
        width + 50,
        height * 0.72,
      );
      ctx.lineTo(width + 50, height);
      ctx.lineTo(-50, height);
      ctx.fill();
      ctx.fillStyle = palette.near;
      ctx.beginPath();
      ctx.moveTo(-50, height * 0.85);
      ctx.bezierCurveTo(
        width * 0.3 + near,
        height * 0.77,
        width * 0.59 + near,
        height * 0.91,
        width + 50,
        height * 0.78,
      );
      ctx.lineTo(width + 50, height);
      ctx.lineTo(-50, height);
      ctx.fill();
      ctx.strokeStyle = mood === "night" ? "#607167" : "#89a578";
      ctx.lineWidth = 1;
      for (let i = 0; i < 105; i++) {
        const x = ((i * 79.7 + 27) % (width + 30)) - 15 + near;
        const y = height * (0.84 + ((i * 13) % 15) / 100);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(phase * 1.8 + i) * 2.5, y - 3 - (i % 4));
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const x = ((i * 177 + 53) % width) + far;
        const y = height * (0.71 + (i % 3) * 0.025);
        ctx.fillStyle = mood === "night" ? "#364c57" : "#587a72";
        ctx.fillRect(x - 2, y, 4, 27);
        ctx.beginPath();
        ctx.ellipse(x + Math.sin(phase * 0.7 + i) * 3, y - 5, 13 + (i % 3) * 3, 22, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (location === "pacific") {
      ctx.fillStyle = mood === "night" ? "#546b7c" : "#8da5aa";
      for (let i = 0; i < 3; i++) {
        const x = width * (0.16 + i * 0.36) + far;
        ctx.beginPath();
        ctx.ellipse(x, height * 0.682, 28 + (i % 2) * 25, 7 + (i % 2) * 3, 0, Math.PI, 0);
        ctx.fill();
      }
      const ocean = ctx.createLinearGradient(0, height * 0.68, 0, height);
      ocean.addColorStop(0, palette.water);
      ocean.addColorStop(1, mood === "night" ? "#1b354e" : "#336e83");
      ctx.fillStyle = ocean;
      ctx.fillRect(0, height * 0.68, width, height * 0.32);
      ctx.strokeStyle = mood === "night" ? "#a6b4c76b" : "#eff6ea88";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 48; i++) {
        const y = height * (0.71 + ((i * 19) % 28) / 100);
        const x = ((i * 119 + phase * (7 + i % 4)) % (width + 80)) - 40 + far * (i % 3);
        ctx.beginPath();
        ctx.moveTo(x, y + Math.sin(phase + i) * 1.4);
        ctx.quadraticCurveTo(x + 12, y - 2 - Math.sin(phase * 1.2 + i), x + 27 + (i % 4) * 7, y);
        ctx.stroke();
      }
    } else {
      for (let i = 0; i < 11; i++) {
        const x = ((i * 193 + phase * (4 + i % 3)) % (width + 280)) - 140 + (i % 2 ? near : far);
        const y = height * (0.62 + ((i * 17) % 34) / 100) + Math.sin(phase * 0.5 + i) * 3;
        const r = 40 + (i % 4) * 17;
        ctx.fillStyle = mood === "night" ? "#7082a5a3" : "#adc7d7b3";
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.55, r * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = mood === "night" ? "#d7dfebba" : "#fffdf5dc";
        ctx.beginPath();
        ctx.ellipse(
          x - r * 0.32,
          y - r * 0.2,
          r * 0.6,
          r * 0.34,
          0,
          0,
          Math.PI * 2,
        );
        ctx.ellipse(
          x + r * 0.35,
          y - r * 0.15,
          r * 0.68,
          r * 0.39,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    if (mood === "night") {
      ctx.fillStyle = "#f7ebdb99";
      for (let i = 0; i < 25; i++) {
        const x = (i * 127.3) % width;
        const y = (i * 53.7) % (height * 0.57);
        ctx.fillRect(x, y, 1.3, 1.3);
      }
    }
    if (location !== "sky") {
      ctx.strokeStyle = mood === "night" ? "#b8cad099" : "#485e6b99";
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 4; i++) {
        const x = ((i * 241 + phase * (5 + i)) % (width + 80)) - 40;
        const y = height * (0.3 + (i % 3) * 0.07);
        ctx.beginPath();
        ctx.arc(x - 4, y, 5, Math.PI * 1.1, Math.PI * 1.9);
        ctx.arc(x + 4, y, 5, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    }
  };
  return {
    canvas,
    paint,
    setMood(value: Mood) {
      mood = value;
      paint();
    },
    setLocation(value: Location) {
      location = value;
      paint();
    },
    setParallax(value: number) {
      parallax = Math.max(-28, Math.min(28, value));
      paint();
    },
    animate(seconds: number, reducedMotion: boolean) {
      if (reducedMotion) return false;
      phase = seconds;
      paint();
      return true;
    },
  };
}
