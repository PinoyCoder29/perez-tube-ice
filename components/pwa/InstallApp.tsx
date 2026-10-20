"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, Share } from "lucide-react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Install action + honest, platform-specific instructions. It is a progressive web app, not a native app. */
export function InstallApp({ compact }: { compact?: boolean }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<
    "ios-safari" | "ios-other" | "android" | "other"
  >("other");

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    setPlatform(
      ios
        ? safari
          ? "ios-safari"
          : "ios-other"
        : /Android/.test(ua)
          ? "android"
          : "other",
    );
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const r = await evt.userChoice.catch(() => null);
    if (r?.outcome === "accepted") setInstalled(true);
    setEvt(null);
  }

  const small = compact ? "small" : "";
  if (installed)
    return (
      <div className={`d-flex align-items-center gap-2 ${small}`}>
        <CheckCircle2 size={18} aria-hidden /> Installed — you are using the app
        from your home screen.
      </div>
    );
  return (
    <div className={small}>
      <div className="fw-semibold mb-1">Install Perez Ice on this device</div>
      {evt ? (
        <button className="btn btn-primary btn-sm" onClick={install}>
          <Download size={14} aria-hidden /> Install app
        </button>
      ) : platform === "ios-safari" ? (
        <ol className="ps-3 mb-0">
          <li>
            Tap the <Share size={13} aria-hidden /> <strong>Share</strong>{" "}
            button in Safari.
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>, then{" "}
            <strong>Add</strong>.
          </li>
        </ol>
      ) : platform === "ios-other" ? (
        <div>
          On iPhone, installing only works from <strong>Safari</strong>. Open
          this page in Safari, tap <strong>Share</strong>, then{" "}
          <strong>Add to Home Screen</strong>.
        </div>
      ) : platform === "android" ? (
        <div>
          Open the browser menu (⋮) and choose <strong>Install app</strong> or{" "}
          <strong>Add to Home screen</strong>. (Your browser has not offered the
          one-tap install yet — it appears once the site has been used for a
          moment over HTTPS.)
        </div>
      ) : (
        <div>
          On a computer, look for the install icon in the address bar of Chrome
          or Edge. On a phone, open this site in your phone’s browser.
        </div>
      )}
      {!compact && (
        <div className="text-muted-2 mt-2">
          This is a web app that installs to your home screen — not a Play Store
          / App Store app. It uses the same live data and logins as the website
          and needs an internet connection to record anything.
        </div>
      )}
    </div>
  );
}
