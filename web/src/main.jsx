import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import App from './App.jsx';
import './s1c/print.css';

createRoot(document.getElementById('root')).render(
  <MantineProvider defaultColorScheme="light">
    <App />
  </MantineProvider>,
);
