import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type InstallPromptMode = 'installable' | 'ios' | 'unavailable';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const LOCAL_STORAGE_KEY = 'pwa_install_dismissed_v1';

const isDismissed = () => {
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const isIosDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
};

const isInstalledNow = () => {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = Boolean((navigator as any)?.standalone);
  return Boolean(standalone || iosStandalone);
};

export const usePwaInstallPrompt = () => {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const isOpenRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [mode, setMode] = useState<InstallPromptMode>('unavailable');

  const detectMode = useCallback((): InstallPromptMode => {
    if (deferredPromptRef.current) return 'installable';
    if (isIosDevice()) return 'ios';
    return 'unavailable';
  }, []);

  const openModalAutoIfEligible = useCallback(() => {
    if (isInstalledNow()) {
      setIsInstalled(true);
      console.info('[pwa] auto_open_skipped', { reason: 'installed' });
      return;
    }
    if (isDismissed()) {
      console.info('[pwa] auto_open_skipped', { reason: 'dismissed' });
      return;
    }
    const nextMode = detectMode();
    if (nextMode === 'unavailable') {
      console.info('[pwa] auto_open_skipped', { reason: 'not_installable' });
      return;
    }
    setMode(nextMode);
    setIsOpen(true);
    console.info('[pwa] auto_open');
  }, [detectMode]);

  const openModalManual = useCallback(() => {
    const nextMode = detectMode();
    setMode(nextMode);
    setIsOpen(true);
    console.info('[pwa] manual_open');
  }, [detectMode]);

  const closePwaModal = useCallback(() => {
    setIsOpen(false);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    console.info('[pwa] dismissed');
  }, []);

  const triggerInstall = useCallback(async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    console.info('[pwa] prompt result', { outcome: choice.outcome });
    deferredPromptRef.current = null;
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
      setIsOpen(false);
      return;
    }
    closePwaModal();
  }, [closePwaModal]);

  useEffect(() => {
    setIsInstalled(isInstalledNow());
  }, []);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      console.info('[pwa] beforeinstallprompt captured');
      if (isOpenRef.current) return;
      if (isInstalledNow()) return;
      if (isDismissed()) return;
      setMode('installable');
      setIsOpen(true);
      console.info('[pwa] auto_open');
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsOpen(false);
      console.info('[pwa] appinstalled');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    setMode(detectMode());
  }, [detectMode]);

  return useMemo(
    () => ({
      isOpen,
      isInstalled,
      mode,
      openModalAutoIfEligible,
      openModalManual,
      closePwaModal,
      triggerInstall
    }),
    [closePwaModal, isInstalled, isOpen, mode, openModalAutoIfEligible, openModalManual, triggerInstall]
  );
};
