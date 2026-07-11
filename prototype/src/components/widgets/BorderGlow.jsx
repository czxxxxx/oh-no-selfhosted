import { useCallback, useEffect, useRef } from "react";
import "./BorderGlow.css";

function parseHSL(hslStr) {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);

  if (!match) {
    return { h: 40, s: 80, l: 80 };
  }

  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildGlowVars(glowColor, intensity) {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ["", "-60", "-50", "-40", "-30", "-20", "-10"];
  const vars = {};

  for (let i = 0; i < opacities.length; i += 1) {
    vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`;
  }

  return vars;
}

const GRADIENT_POSITIONS = ["80% 55%", "69% 34%", "8% 6%", "41% 38%", "86% 85%", "82% 18%", "51% 4%"];
const GRADIENT_KEYS = [
  "--gradient-one",
  "--gradient-two",
  "--gradient-three",
  "--gradient-four",
  "--gradient-five",
  "--gradient-six",
  "--gradient-seven",
];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildGradientVars(colors) {
  const vars = {};

  for (let i = 0; i < GRADIENT_KEYS.length; i += 1) {
    const color = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${color} 0px, transparent 50%)`;
  }

  vars["--gradient-base"] = `linear-gradient(${colors[0]} 0 100%)`;

  return vars;
}

function easeOutCubic(x) {
  return 1 - (1 - x) ** 3;
}

function easeInCubic(x) {
  return x * x * x;
}

function animateValue({ start = 0, end = 100, duration = 1000, delay = 0, ease = easeOutCubic, onUpdate, onEnd }) {
  const t0 = performance.now() + delay;

  function tick() {
    const elapsed = performance.now() - t0;
    const t = Math.min(elapsed / duration, 1);
    onUpdate(start + (end - start) * ease(t));

    if (t < 1) {
      requestAnimationFrame(tick);
    } else if (onEnd) {
      onEnd();
    }
  }

  setTimeout(() => requestAnimationFrame(tick), delay);
}

export function BorderGlow({
  as: Component = "div",
  animated = false,
  backgroundColor = "var(--widget-glow-card-bg, rgba(255, 255, 255, 0.62))",
  borderRadius = 28,
  children,
  className = "",
  colors = ["#c084fc", "#67e8f9", "#f0b56a"],
  coneSpread = 18,
  edgeSensitivity = 36,
  fillOpacity = 0.1,
  glowColor = "200 86 72",
  glowIntensity = 0.62,
  glowRadius = 26,
  onPointerMove,
  style,
  ...rest
}) {
  const cardRef = useRef(null);

  const getCenterOfElement = useCallback((el) => {
    const { width, height } = el.getBoundingClientRect();

    return [width / 2, height / 2];
  }, []);

  const getEdgeProximity = useCallback(
    (el, x, y) => {
      const [cx, cy] = getCenterOfElement(el);
      const dx = x - cx;
      const dy = y - cy;
      let kx = Infinity;
      let ky = Infinity;

      if (dx !== 0) {
        kx = cx / Math.abs(dx);
      }

      if (dy !== 0) {
        ky = cy / Math.abs(dy);
      }

      return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    },
    [getCenterOfElement],
  );

  const getCursorAngle = useCallback(
    (el, x, y) => {
      const [cx, cy] = getCenterOfElement(el);
      const dx = x - cx;
      const dy = y - cy;

      if (dx === 0 && dy === 0) {
        return 0;
      }

      const radians = Math.atan2(dy, dx);
      let degrees = radians * (180 / Math.PI) + 90;

      if (degrees < 0) {
        degrees += 360;
      }

      return degrees;
    },
    [getCenterOfElement],
  );

  const handlePointerMove = useCallback(
    (event) => {
      onPointerMove?.(event);

      const card = cardRef.current;

      if (!card) {
        return;
      }

      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const edge = getEdgeProximity(card, x, y);
      const angle = getCursorAngle(card, x, y);

      card.style.setProperty("--edge-proximity", `${(edge * 100).toFixed(3)}`);
      card.style.setProperty("--cursor-angle", `${angle.toFixed(3)}deg`);
    },
    [getCursorAngle, getEdgeProximity, onPointerMove],
  );

  useEffect(() => {
    if (!animated || !cardRef.current) {
      return undefined;
    }

    const card = cardRef.current;
    const angleStart = 110;
    const angleEnd = 465;
    card.classList.add("sweep-active");
    card.style.setProperty("--cursor-angle", `${angleStart}deg`);

    animateValue({ duration: 500, onUpdate: (value) => card.style.setProperty("--edge-proximity", value) });
    animateValue({
      duration: 1500,
      ease: easeInCubic,
      end: 50,
      onUpdate: (value) => {
        card.style.setProperty("--cursor-angle", `${(angleEnd - angleStart) * (value / 100) + angleStart}deg`);
      },
    });
    animateValue({
      delay: 1500,
      duration: 2250,
      ease: easeOutCubic,
      end: 100,
      start: 50,
      onUpdate: (value) => {
        card.style.setProperty("--cursor-angle", `${(angleEnd - angleStart) * (value / 100) + angleStart}deg`);
      },
    });
    animateValue({
      delay: 2500,
      duration: 1500,
      ease: easeInCubic,
      end: 0,
      onEnd: () => card.classList.remove("sweep-active"),
      onUpdate: (value) => card.style.setProperty("--edge-proximity", value),
      start: 100,
    });

    return undefined;
  }, [animated]);

  return (
    <Component
      className={`border-glow-card ${className}`.trim()}
      onPointerMove={handlePointerMove}
      ref={cardRef}
      style={{
        "--card-bg": backgroundColor,
        "--edge-sensitivity": edgeSensitivity,
        "--border-radius": `${borderRadius}px`,
        "--glow-padding": `${glowRadius}px`,
        "--cone-spread": coneSpread,
        "--fill-opacity": fillOpacity,
        ...buildGlowVars(glowColor, glowIntensity),
        ...buildGradientVars(colors),
        ...style,
      }}
      {...rest}
    >
      <span aria-hidden="true" className="edge-light" />
      <div className="border-glow-inner">{children}</div>
    </Component>
  );
}
