import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { UserProvider } from './context/User';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { StatusProvider } from './context/Status';
import { RouterUIProvider } from './router-ui';
import ErrorBoundary from './components/ErrorBoundary';
import './i18n';

function AppShell() {
  return (
    <>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <ToastContainer />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RouterUIProvider>
      <StatusProvider>
        <UserProvider>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </UserProvider>
      </StatusProvider>
    </RouterUIProvider>
  </React.StrictMode>
);
