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

    // The horizon, middle and foreground move by different amounts as the model orbits.
    const far = parallax * 0.35;
    const near = parallax;
    if (location === "lowland") {
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
        ctx.lineTo(x + (i % 3) - 1, y - 3 - (i % 4));
        ctx.stroke();
      }
    } else if (location === "pacific") {
      const ocean = ctx.createLinearGradient(0, height * 0.68, 0, height);
      ocean.addColorStop(0, palette.water);
      ocean.addColorStop(1, mood === "night" ? "#1b354e" : "#336e83");
      ctx.fillStyle = ocean;
      ctx.fillRect(0, height * 0.68, width, height * 0.32);
      ctx.strokeStyle = mood === "night" ? "#a6b4c76b" : "#eff6ea88";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 48; i++) {
        const y = height * (0.71 + ((i * 19) % 28) / 100);
        const x = ((i * 119) % (width + 80)) - 40 + far * (i % 3);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 12, y - 2, x + 27 + (i % 4) * 7, y);
        ctx.stroke();
      }
    } else {
      for (let i = 0; i < 11; i++) {
        const x = ((i * 193) % (width + 280)) - 140 + (i % 2 ? near : far);
        const y = height * (0.62 + ((i * 17) % 34) / 100);
        const r = 40 + (i % 4) * 17;
        ctx.fillStyle = mood === "night" ? "#c8d5e077" : "#ffffffa8";
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.55, r * 0.36, 0, 0, Math.PI * 2);
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
  };
}
