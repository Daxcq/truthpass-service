import { useRef, useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { Community } from "./components/Community";
import { EvidencePanel } from "./components/EvidencePanel";
import { Hero } from "./components/Hero";
import { ModalProvider } from "./components/ModalContext";
import { ObserverDrawer } from "./components/ObserverDrawer";
import { ProductPanel } from "./components/ProductPanel";
import { TopBar } from "./components/TopBar";

export default function App() {
  const [toast, setToast] = useState<string | null>(null);
  const [observerOpen, setObserverOpen] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  };

  return (
    <ModalProvider>
      <div className="bg-scene" aria-hidden="true">
        <div className="bg-rays" />
        <div className="bg-fish" />
        <div className="bg-depth" />
      </div>
      <TopBar onOpenObserver={() => setObserverOpen(true)} />
      <Hero />
      <main className="layout">
        <ChatPanel />
        <ProductPanel />
        <EvidencePanel />
      </main>
      <Community onToast={showToast} />
      <ObserverDrawer open={observerOpen} onClose={() => setObserverOpen(false)} />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </ModalProvider>
  );
}
