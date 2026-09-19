import React from 'react';
import { createRoot } from 'react-dom/client';
import { ScraperFilesPanel } from '../src/components/ScraperFilesPanel';
import '../src/index.css';

createRoot(document.getElementById('root')!).render(
  <ScraperFilesPanel serverUrl="" authToken="fixture-token" onImportSuccess={(name, count) => {
    document.title = `${name}:${count}`;
  }} />
);
