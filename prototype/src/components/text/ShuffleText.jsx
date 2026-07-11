import { useEffect, useMemo, useState } from "react";
import "./ShuffleText.css";

const DEFAULT_SCRAMBLE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&+";

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(media.matches);

    updatePreference();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updatePreference);

      return () => media.removeEventListener("change", updatePreference);
    }

    media.addListener(updatePreference);

    return () => media.removeListener(updatePreference);
  }, []);

  return prefersReducedMotion;
}

function scrambleCharacter(character, index, roll, charset) {
  if (character.trim() === "") {
    return "\u00a0";
  }

  const seed = character.charCodeAt(0) * 17 + index * 31 + roll * 13;

  return charset.charAt(seed % charset.length) || character;
}

export function ShuffleText({
  animationMode = "evenodd",
  className = "",
  duration = 0.35,
  loop = false,
  loopDelay = 0,
  maxDelay = 0,
  respectReducedMotion = true,
  scrambleCharset = DEFAULT_SCRAMBLE_CHARSET,
  shuffleDirection = "right",
  shuffleTimes = 1,
  stagger = 0.03,
  style = {},
  tag: Tag = "span",
  text,
  textAlign = "left",
  triggerOnHover = true,
}) {
  const [animationKey, setAnimationKey] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldAnimate = !(respectReducedMotion && prefersReducedMotion);
  const characters = useMemo(() => Array.from(text || ""), [text]);
  const rolls = Math.max(1, Math.floor(shuffleTimes));
  const oddCount = Math.floor(characters.length / 2);
  const evenCount = Math.ceil(characters.length / 2);
  const oddTotal = duration + Math.max(0, oddCount - 1) * stagger;
  const evenStart = oddCount ? oddTotal * 0.7 : 0;
  const maxStaggerDelay =
    animationMode === "random"
      ? maxDelay
      : Math.max(Math.max(0, oddCount - 1) * stagger, evenStart + Math.max(0, evenCount - 1) * stagger);
  const animationCycleSeconds = duration + maxStaggerDelay + Math.max(loopDelay, 0);

  useEffect(() => {
    if (!loop || !shouldAnimate) {
      return undefined;
    }

    const interval = window.setInterval(
      () => setAnimationKey((currentKey) => currentKey + 1),
      Math.max(animationCycleSeconds * 1000, 100),
    );

    return () => window.clearInterval(interval);
  }, [animationCycleSeconds, loop, shouldAnimate]);

  function replayAnimation() {
    if (triggerOnHover && shouldAnimate) {
      setAnimationKey((currentKey) => currentKey + 1);
    }
  }

  return (
    <Tag
      aria-label={text}
      className={`shuffle-parent ${className}`.trim()}
      data-shuffle-direction={shuffleDirection}
      data-shuffle-loop={loop ? "true" : "false"}
      data-shuffle-loop-delay={String(loopDelay)}
      style={{ textAlign, ...style }}
      onMouseEnter={replayAnimation}
    >
      <span aria-hidden="true" className="shuffle-visual">
        {characters.map((character, index) => {
          const visualCharacter = character === " " ? "\u00a0" : character;
          const isOdd = index % 2 === 1;
          const orderedIndex = Math.floor(index / 2);
          const delay =
            animationMode === "random"
              ? ((character.charCodeAt(0) + index * 19) % 100) * (maxDelay / 100)
              : (isOdd ? orderedIndex * stagger : evenStart + orderedIndex * stagger);

          return (
            <span className="shuffle-char-wrapper" key={`${character}-${index}`}>
              <span
                className="shuffle-char-strip"
                key={`${animationKey}-${character}-${index}`}
                style={{
                  "--shuffle-delay": `${delay}s`,
                  "--shuffle-duration": `${duration}s`,
                  "--shuffle-steps": rolls,
                }}
              >
                <span className="shuffle-char">{visualCharacter}</span>
                {Array.from({ length: rolls }, (_, roll) => (
                  <span className="shuffle-char" key={roll}>
                    {scrambleCharacter(character, index, roll, scrambleCharset)}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </Tag>
  );
}
