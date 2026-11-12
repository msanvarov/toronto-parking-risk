import { useEffect, useRef, useState, type CSSProperties } from "react";

// Chrome, Edge and Samsung Internet fire this when the app can be installed. We hold on to it so our
// own button can open the browser's install dialog. Safari never fires it: there we show the steps.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedThisVisit = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

// Listen at import time: the event can fire before React has mounted anything.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedThisVisit = true;
    notify();
  });
}

export type Platform = "ios" | "android" | "mac-safari" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|Firefox/.test(ua)) return "mac-safari";
  return "other";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const DISMISS_KEY = "install-card-dismissed";
const DISMISS_DAYS = 14;

function readDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 864e5;
  } catch {
    return false;
  }
}

/** Everything the header pill and the intro card need to know. */
export function useInstall() {
  const [, force] = useState(0);
  const [platform] = useState(detectPlatform);
  const [standalone, setStandalone] = useState(isStandalone);

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setStandalone(isStandalone());
    mq.addEventListener?.("change", onMode);
    return () => {
      listeners.delete(fn);
      mq.removeEventListener?.("change", onMode);
    };
  }, []);

  const canPrompt = deferred !== null;
  // Show it where the browser can install (the event fired) or where we can explain how by hand.
  const available =
    !standalone && !installedThisVisit && (canPrompt || platform === "ios" || platform === "android" || platform === "mac-safari");

  const prompt = async () => {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    await e.prompt();
    await e.userChoice.catch(() => null);
    notify();
    return true;
  };

  return { available, canPrompt, platform, prompt };
}

/* ---------- The steps, per platform ---------- */

function Steps({ platform }: { platform: Platform }) {
  if (platform === "ios") {
    return (
      <ol className="install-steps">
        <li>
          <span className="step-icon" aria-hidden>
            <ShareIcon />
          </span>
          <span>
            Tap <strong>Share</strong> in Safari's toolbar.{" "}
            <span className="muted">No Share button? Tap ••• first.</span>
          </span>
        </li>
        <li>
          <span className="step-icon" aria-hidden>
            <PlusSquareIcon />
          </span>
          <span>
            Scroll down and tap <strong>Add to Home Screen</strong>.
          </span>
        </li>
      </ol>
    );
  }
  if (platform === "android") {
    return (
      <ol className="install-steps">
        <li>
          <span className="step-icon" aria-hidden>
            <DotsIcon />
          </span>
          <span>
            Open your browser's <strong>menu</strong> (⋮ at the top right).
          </span>
        </li>
        <li>
          <span className="step-icon" aria-hidden>
            <PlusSquareIcon />
          </span>
          <span>
            Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </span>
        </li>
      </ol>
    );
  }
  if (platform === "mac-safari") {
    return (
      <ol className="install-steps">
        <li>
          <span className="step-icon" aria-hidden>
            <PlusSquareIcon />
          </span>
          <span>
            In Safari's menu bar choose <strong>File › Add to Dock</strong>.
          </span>
        </li>
      </ol>
    );
  }
  return null;
}

/* ---------- Intro card ---------- */

export function InstallCard({ style }: { style?: CSSProperties }) {
  const { available, canPrompt, platform, prompt } = useInstall();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!available || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage unavailable: it just shows again next visit */
    }
  };

  return (
    <section className="card install" style={style} aria-labelledby="install-title">
      <button type="button" className="install-close" onClick={dismiss} aria-label="Hide this tip">
        ×
      </button>
      <div className="install-head">
        <img className="install-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width="48" height="48" />
        <div>
          <h2 id="install-title">Add Ticket Risk to your home screen</h2>
          <p className="muted small">It opens full screen like an app, so it's one tap away when you park.</p>
        </div>
      </div>
      {canPrompt ? (
        <button type="button" className="cta install-cta" onClick={() => void prompt()}>
          <DownloadIcon />
          Install the app
        </button>
      ) : (
        <Steps platform={platform} />
      )}
    </section>
  );
}

/* ---------- Header pill + sheet ---------- */

export function InstallButton() {
  const { available, canPrompt, platform, prompt } = useInstall();
  const sheet = useRef<HTMLDialogElement>(null);
  if (!available) return null;

  const open = async () => {
    if (canPrompt && (await prompt())) return;
    sheet.current?.showModal();
  };

  return (
    <>
      <button type="button" className="install-pill" onClick={() => void open()}>
        <DownloadIcon size={16} />
        Install
      </button>
      <dialog
        ref={sheet}
        className="install-sheet"
        aria-labelledby="install-sheet-title"
        onClick={(e) => {
          // a tap on the backdrop closes it
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="install-sheet-body">
          <div className="install-head">
            <img className="install-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width="48" height="48" />
            <div>
              <h2 id="install-sheet-title">Add Ticket Risk to your home screen</h2>
              <p className="muted small">Free, no app store, works offline for streets you've checked.</p>
            </div>
          </div>
          <Steps platform={platform} />
          <form method="dialog">
            <button type="submit" className="install-done">
              Got it
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}

/* ---------- Icons ---------- */

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
      <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" />
    </svg>
  );
}

function PlusSquareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function DownloadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </svg>
  );
}
