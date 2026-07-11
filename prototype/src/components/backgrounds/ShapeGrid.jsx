import { useEffect, useRef } from "react";
import "./ShapeGrid.css";

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function canUseCanvas(canvas) {
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return false;
  }

  return Boolean(canvas && typeof canvas.getContext === "function");
}

export function ShapeGrid({
  borderColor = "#999",
  className = "",
  direction = "right",
  hoverFillColor = "#222",
  hoverTrailAmount = 0,
  paused = false,
  shape = "square",
  speed = 1,
  squareSize = 40,
}) {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const gridOffset = useRef({ x: 0, y: 0 });
  const hoveredCell = useRef(null);
  const trailCells = useRef([]);
  const cellOpacities = useRef(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canUseCanvas(canvas) || typeof window === "undefined") {
      return undefined;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return undefined;
    }

    const tileSize = Math.max(squareSize, 12);
    const isHex = shape === "hexagon";
    const isTriangle = shape === "triangle";
    const hexHorizontal = tileSize * 1.5;
    const hexVertical = tileSize * Math.sqrt(3);

    let canvasWidth = 0;
    let canvasHeight = 0;

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(Math.floor(rect.width || canvas.offsetWidth), 1);
      const nextHeight = Math.max(Math.floor(rect.height || canvas.offsetHeight), 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvasWidth = nextWidth;
      canvasHeight = nextHeight;
      canvas.width = Math.floor(nextWidth * dpr);
      canvas.height = Math.floor(nextHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawHexagon(cx, cy, size) {
      ctx.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const angle = (Math.PI / 3) * index;
        const x = cx + size * Math.cos(angle);
        const y = cy + size * Math.sin(angle);

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
    }

    function drawCircle(cx, cy, size) {
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.closePath();
    }

    function drawTriangle(cx, cy, size, flip) {
      ctx.beginPath();
      if (flip) {
        ctx.moveTo(cx, cy + size / 2);
        ctx.lineTo(cx + size / 2, cy - size / 2);
        ctx.lineTo(cx - size / 2, cy - size / 2);
      } else {
        ctx.moveTo(cx, cy - size / 2);
        ctx.lineTo(cx + size / 2, cy + size / 2);
        ctx.lineTo(cx - size / 2, cy + size / 2);
      }
      ctx.closePath();
    }

    function fillActiveCell(cellKey, drawCell) {
      const alpha = cellOpacities.current.get(cellKey);

      if (!alpha) {
        return;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = hoverFillColor;
      ctx.beginPath();
      drawCell();
      ctx.fill();
      ctx.restore();
    }

    function updateCellOpacities() {
      const targets = new Map();

      if (hoveredCell.current) {
        targets.set(`${hoveredCell.current.x},${hoveredCell.current.y}`, 1);
      }

      if (hoverTrailAmount > 0) {
        trailCells.current.forEach((cell, index) => {
          const key = `${cell.x},${cell.y}`;
          if (!targets.has(key)) {
            targets.set(key, (trailCells.current.length - index) / (trailCells.current.length + 1));
          }
        });
      }

      targets.forEach((_, key) => {
        if (!cellOpacities.current.has(key)) {
          cellOpacities.current.set(key, 0);
        }
      });

      cellOpacities.current.forEach((opacity, key) => {
        const target = targets.get(key) || 0;
        const nextOpacity = opacity + (target - opacity) * 0.15;

        if (nextOpacity < 0.005) {
          cellOpacities.current.delete(key);
        } else {
          cellOpacities.current.set(key, nextOpacity);
        }
      });
    }

    function drawGrid() {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.lineWidth = 1;
      ctx.strokeStyle = borderColor;

      if (isHex) {
        const colShift = Math.floor(gridOffset.current.x / hexHorizontal);
        const offsetX = positiveModulo(gridOffset.current.x, hexHorizontal);
        const offsetY = positiveModulo(gridOffset.current.y, hexVertical);
        const cols = Math.ceil(canvasWidth / hexHorizontal) + 3;
        const rows = Math.ceil(canvasHeight / hexVertical) + 3;

        for (let col = -2; col < cols; col += 1) {
          for (let row = -2; row < rows; row += 1) {
            const cx = col * hexHorizontal + offsetX;
            const cy = row * hexVertical + ((col + colShift) % 2 !== 0 ? hexVertical / 2 : 0) + offsetY;
            const cellKey = `${col},${row}`;
            const drawCell = () => drawHexagon(cx, cy, tileSize);

            fillActiveCell(cellKey, drawCell);
            drawCell();
            ctx.stroke();
          }
        }
      } else if (isTriangle) {
        const halfWidth = tileSize / 2;
        const colShift = Math.floor(gridOffset.current.x / halfWidth);
        const rowShift = Math.floor(gridOffset.current.y / tileSize);
        const offsetX = positiveModulo(gridOffset.current.x, halfWidth);
        const offsetY = positiveModulo(gridOffset.current.y, tileSize);
        const cols = Math.ceil(canvasWidth / halfWidth) + 4;
        const rows = Math.ceil(canvasHeight / tileSize) + 4;

        for (let col = -2; col < cols; col += 1) {
          for (let row = -2; row < rows; row += 1) {
            const cx = col * halfWidth + offsetX;
            const cy = row * tileSize + tileSize / 2 + offsetY;
            const flip = ((col + colShift + row + rowShift) % 2 + 2) % 2 !== 0;
            const cellKey = `${col},${row}`;
            const drawCell = () => drawTriangle(cx, cy, tileSize, flip);

            fillActiveCell(cellKey, drawCell);
            drawCell();
            ctx.stroke();
          }
        }
      } else if (shape === "circle") {
        const offsetX = positiveModulo(gridOffset.current.x, tileSize);
        const offsetY = positiveModulo(gridOffset.current.y, tileSize);
        const cols = Math.ceil(canvasWidth / tileSize) + 3;
        const rows = Math.ceil(canvasHeight / tileSize) + 3;

        for (let col = -2; col < cols; col += 1) {
          for (let row = -2; row < rows; row += 1) {
            const cx = col * tileSize + tileSize / 2 + offsetX;
            const cy = row * tileSize + tileSize / 2 + offsetY;
            const cellKey = `${col},${row}`;
            const drawCell = () => drawCircle(cx, cy, tileSize);

            fillActiveCell(cellKey, drawCell);
            drawCell();
            ctx.stroke();
          }
        }
      } else {
        const offsetX = positiveModulo(gridOffset.current.x, tileSize);
        const offsetY = positiveModulo(gridOffset.current.y, tileSize);
        const cols = Math.ceil(canvasWidth / tileSize) + 3;
        const rows = Math.ceil(canvasHeight / tileSize) + 3;

        for (let col = -2; col < cols; col += 1) {
          for (let row = -2; row < rows; row += 1) {
            const x = col * tileSize + offsetX;
            const y = row * tileSize + offsetY;
            const cellKey = `${col},${row}`;

            fillActiveCell(cellKey, () => ctx.rect(x, y, tileSize, tileSize));
            ctx.strokeRect(x, y, tileSize, tileSize);
          }
        }
      }
    }

    function updateAnimation() {
      const effectiveSpeed = Math.max(speed, 0.1);
      const wrapX = isHex ? hexHorizontal * 2 : tileSize;
      const wrapY = isHex ? hexVertical : isTriangle ? tileSize * 2 : tileSize;

      if (!paused) {
        switch (direction) {
          case "right":
            gridOffset.current.x = positiveModulo(gridOffset.current.x - effectiveSpeed, wrapX);
            break;
          case "left":
            gridOffset.current.x = positiveModulo(gridOffset.current.x + effectiveSpeed, wrapX);
            break;
          case "up":
            gridOffset.current.y = positiveModulo(gridOffset.current.y + effectiveSpeed, wrapY);
            break;
          case "down":
            gridOffset.current.y = positiveModulo(gridOffset.current.y - effectiveSpeed, wrapY);
            break;
          case "diagonal":
            gridOffset.current.x = positiveModulo(gridOffset.current.x - effectiveSpeed, wrapX);
            gridOffset.current.y = positiveModulo(gridOffset.current.y - effectiveSpeed, wrapY);
            break;
          default:
            break;
        }
      }

      updateCellOpacities();
      drawGrid();

      if (!paused) {
        requestRef.current = requestAnimationFrame(updateAnimation);
      }
    }

    function pushTrailCell() {
      if (hoveredCell.current && hoverTrailAmount > 0) {
        trailCells.current.unshift({ ...hoveredCell.current });
        if (trailCells.current.length > hoverTrailAmount) {
          trailCells.current.length = hoverTrailAmount;
        }
      }
    }

    function setHoveredCell(nextCell) {
      if (
        nextCell &&
        (!hoveredCell.current || hoveredCell.current.x !== nextCell.x || hoveredCell.current.y !== nextCell.y)
      ) {
        pushTrailCell();
        hoveredCell.current = nextCell;
      } else if (!nextCell && hoveredCell.current) {
        pushTrailCell();
        hoveredCell.current = null;
      }

      if (paused) {
        updateAnimation();
      }
    }

    function cellFromPoint(mouseX, mouseY) {
      if (isHex) {
        const colShift = Math.floor(gridOffset.current.x / hexHorizontal);
        const offsetX = positiveModulo(gridOffset.current.x, hexHorizontal);
        const offsetY = positiveModulo(gridOffset.current.y, hexVertical);
        const adjustedX = mouseX - offsetX;
        const adjustedY = mouseY - offsetY;
        const col = Math.round(adjustedX / hexHorizontal);
        const rowOffset = (col + colShift) % 2 !== 0 ? hexVertical / 2 : 0;

        return { x: col, y: Math.round((adjustedY - rowOffset) / hexVertical) };
      }

      if (isTriangle) {
        const halfWidth = tileSize / 2;
        const adjustedX = mouseX - positiveModulo(gridOffset.current.x, halfWidth);
        const adjustedY = mouseY - positiveModulo(gridOffset.current.y, tileSize);

        return { x: Math.round(adjustedX / halfWidth), y: Math.floor(adjustedY / tileSize) };
      }

      if (shape === "circle") {
        const adjustedX = mouseX - positiveModulo(gridOffset.current.x, tileSize);
        const adjustedY = mouseY - positiveModulo(gridOffset.current.y, tileSize);

        return { x: Math.round(adjustedX / tileSize), y: Math.round(adjustedY / tileSize) };
      }

      const adjustedX = mouseX - positiveModulo(gridOffset.current.x, tileSize);
      const adjustedY = mouseY - positiveModulo(gridOffset.current.y, tileSize);

      return { x: Math.floor(adjustedX / tileSize), y: Math.floor(adjustedY / tileSize) };
    }

    function handleMouseMove(event) {
      const rect = canvas.getBoundingClientRect();

      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        setHoveredCell(null);
        return;
      }

      setHoveredCell(cellFromPoint(event.clientX - rect.left, event.clientY - rect.top));
    }

    function handleMouseLeave() {
      setHoveredCell(null);
    }

    resizeCanvas();
    updateAnimation();

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseout", handleMouseLeave);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handleMouseLeave);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [borderColor, direction, hoverFillColor, hoverTrailAmount, paused, shape, speed, squareSize]);

  return <canvas ref={canvasRef} className={`shapegrid-canvas ${className}`.trim()} />;
}
