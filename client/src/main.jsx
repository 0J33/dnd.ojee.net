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
import './styles/ledger.css';

reloadIfStale();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DialogProvider>
      <App />
      <UpdateBanner />
    </DialogProvider>
  </React.StrictMode>
);
