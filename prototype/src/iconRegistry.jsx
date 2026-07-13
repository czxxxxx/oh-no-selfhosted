import { useEffect, useState } from "react";
import { FiActivity, FiCloud, FiFileText, FiGlobe, FiHardDrive, FiWifi } from "react-icons/fi";
import {
  SiAdguard,
  SiGitea,
  SiGrafana,
  SiHomeassistant,
  SiImmich,
  SiJellyfin,
  SiNextcloud,
  SiPortainer,
  SiPrometheus,
  SiQbittorrent,
  SiQnap,
  SiSyncthing,
  SiVaultwarden,
} from "react-icons/si";

export function OpenAIIcon(props) {
  return (
    <svg
      data-openai-logomark="true"
      focusable="false"
      height="1em"
      viewBox="146 227 268 266"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M249.176 323.434V298.276C249.176 296.158 249.971 294.569 251.825 293.509L302.406 264.381C309.29 260.409 317.5 258.555 325.973 258.555C357.75 258.555 377.877 283.185 377.877 309.399C377.877 311.253 377.877 313.371 377.611 315.49L325.178 284.771C322.001 282.919 318.822 282.919 315.645 284.771L249.176 323.434ZM367.283 421.415V361.301C367.283 357.592 365.694 354.945 362.516 353.092L296.048 314.43L317.763 301.982C319.617 300.925 321.206 300.925 323.058 301.982L373.639 331.112C388.205 339.586 398.003 357.592 398.003 375.069C398.003 395.195 386.087 413.733 367.283 421.412V421.415ZM233.553 368.452L211.838 355.742C209.986 354.684 209.19 353.095 209.19 350.975V292.718C209.19 264.383 230.905 242.932 260.301 242.932C271.423 242.932 281.748 246.641 290.49 253.26L238.321 283.449C235.146 285.303 233.555 287.951 233.555 291.659V368.455L233.553 368.452ZM280.292 395.462L249.176 377.985V340.913L280.292 323.436L311.407 340.913V377.985L280.292 395.462ZM300.286 475.968C289.163 475.968 278.837 472.259 270.097 465.64L322.264 435.449C325.441 433.597 327.03 430.949 327.03 427.239V350.445L349.011 363.155C350.865 364.213 351.66 365.802 351.66 367.922V426.179C351.66 454.514 329.679 475.965 300.286 475.965V475.968ZM237.525 416.915L186.944 387.785C172.378 379.31 162.582 361.305 162.582 343.827C162.582 323.436 174.763 305.164 193.563 297.485V357.861C193.563 361.571 195.154 364.217 198.33 366.071L264.535 404.467L242.82 416.915C240.967 417.972 239.377 417.972 237.525 416.915ZM234.614 460.343C204.689 460.343 182.71 437.833 182.71 410.028C182.71 407.91 182.976 405.792 183.238 403.672L235.405 433.863C238.582 435.715 241.763 435.715 244.938 433.863L311.407 395.466V420.622C311.407 422.742 310.612 424.331 308.758 425.389L258.179 454.519C251.293 458.491 243.083 460.343 234.611 460.343H234.614ZM300.286 491.854C332.329 491.854 359.073 469.082 365.167 438.892C394.825 431.211 413.892 403.406 413.892 375.073C413.892 356.535 405.948 338.529 391.648 325.552C392.972 319.991 393.766 314.43 393.766 308.87C393.766 271.003 363.048 242.666 327.562 242.666C320.413 242.666 313.528 243.723 306.644 246.109C294.725 234.457 278.307 227.042 260.301 227.042C228.258 227.042 201.513 249.815 195.42 280.004C165.761 287.685 146.694 315.49 146.694 343.824C146.694 362.362 154.638 380.368 168.938 393.344C167.613 398.906 166.819 404.467 166.819 410.027C166.819 447.894 197.538 476.231 233.024 476.231C240.172 476.231 247.058 475.173 253.943 472.788C265.859 484.441 282.278 491.854 300.286 491.854Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SnapdropIcon(props) {
  return (
    <svg
      data-snapdrop-logomark="true"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M5.1 8.4A8.2 8.2 0 0 1 12 4.7a8.2 8.2 0 0 1 6.9 3.7M7.7 11.1A5.1 5.1 0 0 1 12 8.8a5.1 5.1 0 0 1 4.3 2.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 11.7a2.1 2.1 0 0 0-2.1 2.1c0 1.6 2.1 5.5 2.1 5.5s2.1-3.9 2.1-5.5a2.1 2.1 0 0 0-2.1-2.1Zm0 3a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export const iconComponents = {
  "adguard-home": SiAdguard,
  activity: FiActivity,
  codex: OpenAIIcon,
  custom: FiGlobe,
  gitea: SiGitea,
  grafana: SiGrafana,
  "home-assistant": SiHomeassistant,
  immich: SiImmich,
  jellyfin: SiJellyfin,
  nas: FiHardDrive,
  nextcloud: SiNextcloud,
  paperless: FiFileText,
  portainer: SiPortainer,
  prometheus: SiPrometheus,
  qbittorrent: SiQbittorrent,
  qnap: SiQnap,
  router: FiWifi,
  snapdrop: SnapdropIcon,
  syncthing: SiSyncthing,
  "uptime-kuma": FiActivity,
  vaultwarden: SiVaultwarden,
  weather: FiCloud,
};

export function ServiceIcon({ service, compact = false }) {
  const Icon = iconComponents[service.iconKey] || FiGlobe;
  const imageUrl = ["favicon", "url"].includes(service.iconKind) ? service.iconUrl : null;
  const isRemovedBundledIcon = String(imageUrl || "").startsWith("/heimdall-icons/");
  const [imageFailed, setImageFailed] = useState(false);
  const shouldUseImage = imageUrl && !isRemovedBundledIcon && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <span
      aria-hidden="true"
      className={`service-icon ${compact ? "service-icon-compact" : ""}`}
      data-icon-key={service.iconKey || "custom"}
      style={{ "--service-color": service.color || "#667085" }}
    >
      {shouldUseImage ? <img alt="" src={imageUrl} onError={() => setImageFailed(true)} /> : <Icon />}
    </span>
  );
}
