import { useState } from 'react';
import { BrokerProvider } from './context/BrokerContext';
import { TaxonomyProvider } from './context/TaxonomyContext';
import { VerticalProvider } from './context/VerticalContext';
import { CanvasProvider } from './context/CanvasContext';
import { LeftNav, type PanelId } from './components/LeftNav';
import { Canvas } from './components/canvas/Canvas';
import { BrokerConnectionPanel } from './components/panels/BrokerConnectionPanel';
import { TaxonomyPanel } from './components/panels/TaxonomyPanel';
import { AddPublisherPanel } from './components/panels/AddPublisherPanel';
import { AddConsumerPanel } from './components/panels/AddConsumerPanel';
import { SunburstPanel } from './components/sunburst/SunburstPanel';
import { StatsBanner } from './components/StatsBanner';
import { Footer } from './components/Footer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RestoreSessionBanner } from './components/RestoreSessionBanner';

function AppShell() {
  const [panel, setPanel] = useState<PanelId>('broker');
  const [sunburstOpen, setSunburstOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <LeftNav active={panel} onSelect={setPanel} sunburstOpen={sunburstOpen} onToggleSunburst={() => setSunburstOpen((v) => !v)} />
        {/* Banner sits above canvas AND the Sunburst panel - it's VPN-wide
            activity, not scoped to either view. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <StatsBanner />
          <div className="flex min-h-0 flex-1">
            <main className="relative min-w-0 flex-1 bg-solace-blue-dark">
              <ErrorBoundary label="Canvas">
                <Canvas sunburstOpen={sunburstOpen} onOpenBrokerConnection={() => setPanel('broker')} />
              </ErrorBoundary>
              <RestoreSessionBanner />
              {/* Keyed on the open panel so switching panels from the nav
                  also clears a crashed one. */}
              <ErrorBoundary key={panel ?? 'none'} label="This panel" className="absolute inset-y-0 left-0 z-20 w-96 bg-solace-blue-dark/95">
                {panel === 'broker' && <BrokerConnectionPanel onClose={() => setPanel(null)} />}
                {panel === 'taxonomy' && <TaxonomyPanel onClose={() => setPanel(null)} />}
                {panel === 'publisher' && <AddPublisherPanel onClose={() => setPanel(null)} />}
                {panel === 'consumer' && <AddConsumerPanel onClose={() => setPanel(null)} />}
              </ErrorBoundary>
            </main>
            {/* A real flex sibling, not an overlay, so the canvas actually
                shrinks and re-fits when this opens rather than being covered
                on top of a canvas that still thinks it owns the full width. */}
            {sunburstOpen && (
              <ErrorBoundary label="Topic Explorer" className="w-[560px] shrink-0 border-l border-white/10">
                <SunburstPanel onClose={() => setSunburstOpen(false)} />
              </ErrorBoundary>
            )}
          </div>
        </div>
      </div>
      {/* Spans the full page width, under the left nav too - a page-level
          credit, not scoped to canvas/broker activity like StatsBanner is. */}
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrokerProvider>
      <TaxonomyProvider>
        <VerticalProvider>
          <CanvasProvider>
            <AppShell />
          </CanvasProvider>
        </VerticalProvider>
      </TaxonomyProvider>
    </BrokerProvider>
  );
}
