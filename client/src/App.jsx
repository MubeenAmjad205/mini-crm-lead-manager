import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { HomePage } from './pages/HomePage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';

const AppContent = () => {
  const { isAuthenticated, loading } = useAuth();
  const [view, setView] = useState('home');

  useEffect(() => {
    if (isAuthenticated && view === 'auth') {
      setView('dashboard');
    }
  }, [isAuthenticated, view]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (view === 'auth' && !isAuthenticated) {
    return <AuthPage onCancel={() => setView('home')} />;
  }

  if (view === 'dashboard') {
    if (!isAuthenticated) {
      return <AuthPage onCancel={() => setView('home')} />;
    }
    return <DashboardPage onNavigate={(newView) => setView(newView)} />;
  }

  return (
    <HomePage
      onNavigateToAuth={() => setView('auth')}
      onNavigateToDashboard={() => setView('dashboard')}
    />
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
