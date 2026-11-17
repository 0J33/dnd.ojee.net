// Every stylesheet loads here, in this order, before any component. Order is
// the cascade: a rule with the same specificity as one in an earlier sheet
// wins. Stylesheets imported only by a lazy chunk (GameBoard) or by a module
// App pulls in (Training, QuickCampaign) would otherwise land wherever that
// module happens to load: the HUD's after the Tavern theme (so its flat
// fills beat the oak boards), training's before index.css (so `.modal`
// squeezed the handbook). The components still import their own sheet, which
// is a no-op once it is here.
//   hud, Map3D       - the v2 table HUD; the Tavern theme restyles it, so first
//   index … explain  - base sheets, then the theme layer (tavern) and home
//   dmquick, training - scoped component sheets that refine the above, so last
//   ai               - the DM's AI dock (components/ai), scoped, after everything
import './components/Map3D.css';
import './styles/hud.css';
import './styles/index.css';
import './styles/app.css';
import './styles/builder.css';
import './styles/sheet.css';
import './styles/board.css';
import './styles/tutorial.css';
import './styles/scenes.css';
import './styles/mobile.css';
import './styles/tavern.css';
import './styles/home.css';
import './styles/explain.css';
import './styles/dmquick.css';
import './styles/training.css';
import './styles/items.css';
import './styles/ai.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DialogProvider } from './utils';
import { reloadIfStale, UpdateBanner } from './freshness';

reloadIfStale();

const worldPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('world3d');
const Preview = worldPreview ? React.lazy(() => import('./world/Preview')) : null;

createRoot(document.getElementById('root')).render(worldPreview ? (
  <React.Suspense fallback={null}><Preview sceneKey={worldPreview} /></React.Suspense>
) : (
  <React.StrictMode>
    <DialogProvider>
      <App />
      <UpdateBanner />
    </DialogProvider>
  </React.StrictMode>
));
