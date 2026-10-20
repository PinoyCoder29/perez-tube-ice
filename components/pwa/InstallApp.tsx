"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform?: string;
  }>;
}

export function InstallApp({ compact = false }: { compact?: boolean }) {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [android, setAndroid] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const ua = navigator.userAgent;
    setAndroid(/Android/i.test(ua));

    const isIOS =
      /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const isSafari =
      /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);

    setIosSafari(isIOS && isSafari);

    const checkInstalled = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

      setInstalled(standalone);
    };

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      setMessage("Perez Ice was installed successfully.");
    };

    checkInstalled();

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!installEvent) {
      setMessage(
        "Install is not available yet. Open Perez Ice in Chrome and check the browser menu.",
      );
      return;
    }

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;

      if (choice.outcome === "accepted") {
        setMessage(
          "Installation accepted. Check your home screen or app drawer.",
        );
      } else {
        setMessage("Installation was cancelled.");
      }
    } catch {
      setMessage("Installation failed. Please try again in Chrome.");
    } finally {
      setInstallEvent(null);
    }
  }

  if (installed) {
    return (
      <div className="d-flex align-items-center gap-2">
        <CheckCircle2 size={18} aria-hidden="true" />
        <span>Perez Ice is running in app mode.</span>
      </div>
    );
  }

  return (
    <div className={compact ? "small" : ""}>
      <div className="fw-semibold mb-2">Install Perez Ice</div>

      {installEvent ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleInstall}
        >
          <Download size={15} className="me-1" aria-hidden="true" />
          Install app
        </button>
      ) : android ? (
        <div>
          <p className="mb-2">
            Open this website in Google Chrome. If Chrome supports installation,
            use its menu to install Perez Ice.
          </p>
          <p className="mb-0 text-muted">
            If the install option is missing, check the website manifest, icons,
            HTTPS, and Chrome installability requirements.
          </p>
        </div>
      ) : iosSafari ? (
        <p className="mb-0">
          Tap <Share size={14} aria-hidden="true" /> <strong>Share</strong>,
          then <strong>Add to Home Screen</strong>.
        </p>
      ) : (
        <p className="mb-0">
          Open Perez Ice in a supported browser and look for its install option.
        </p>
      )}

      {message && (
        <div className="alert alert-info mt-2 mb-0" role="status">
          {message}
        </div>
      )}

      {!compact && (
        <p className="text-muted small mt-2 mb-0">
          Perez Ice is a Progressive Web App, not an APK. It uses the same
          website and requires an internet connection.
        </p>
      )}
    </div>
  );
}
