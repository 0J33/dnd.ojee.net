import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DialogProvider } from './utils';
import { reloadIfStale, UpdateBanner } from './freshness';
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
