import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DialogProvider } from './utils';
import './styles/index.css';
import './styles/app.css';
import './styles/builder.css';
import './styles/sheet.css';
import './styles/board.css';
import './styles/tutorial.css';
import './styles/scenes.css';
import './styles/mobile.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </React.StrictMode>
);
