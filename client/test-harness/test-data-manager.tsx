import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { TestDataManagerView } from '../src/views/TestDataManagerView';

createRoot(document.getElementById('root')!).render(<main className="bg-background min-h-screen p-4"><TestDataManagerView onBack={() => {}} /></main>);
