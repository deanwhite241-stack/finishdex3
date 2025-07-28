import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { WalletProvider } from './contexts/WalletContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Layout from './components/Layout/Layout'
import NetworkSwitcher from './components/NetworkSwitcher'
import Swap from './pages/Swap'
import Pools from './pages/Pools'
import Bridge from './pages/Bridge'
import Stake from './pages/Stake'
import Farm from './pages/Farm'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import AdminRewards from './pages/AdminRewards'
import AdminPanel from './components/AdminPanel'

function App() {
  const [testnetMode, setTestnetMode] = useState(false)

  // Initialize testnet mode from localStorage if available
  useEffect(() => {
    const savedMode = localStorage.getItem('testnetMode');
    if (savedMode !== null) {
      setTestnetMode(savedMode === 'true');
    }
  }, []);

  // Save testnet mode to localStorage when it changes
  const handleSetTestnetMode = useCallback((mode: boolean) => {
    setTestnetMode(mode);
    localStorage.setItem('testnetMode', mode.toString());
  }, []);

  // Global error handler
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error?.message || 'Unknown error', event.error)
      // We don't set the error state here to avoid re-rendering the entire app
      // Instead, we'll let the individual components handle their errors
      
      // Prevent default browser error handling
      event.preventDefault()
      
      // Log to analytics or monitoring service in production
      if (process.env.NODE_ENV === 'production') {
        // Example: logErrorToService(event.error)
      }
    }

    window.addEventListener('error', handleError)
    
    // Handle unhandled promise rejections
    const handlePromiseRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason)
      event.preventDefault()
      
      // Log to analytics or monitoring service in production
      if (process.env.NODE_ENV === 'production') {
        // Example: logErrorToService(event.reason)
      }
    }
    
    window.addEventListener('unhandledrejection', handlePromiseRejection)
    
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handlePromiseRejection)
    }
  }, [])

  return (
    <ThemeProvider>
      <WalletProvider>
        <Router>
          <Layout testnetMode={testnetMode} setTestnetMode={handleSetTestnetMode}>
            <NetworkSwitcher testnetMode={testnetMode} />
            <Routes>
              <Route path="/" element={<Swap testnetMode={testnetMode} />} />
              <Route path="/pools" element={<Pools testnetMode={testnetMode} />} />
              <Route path="/bridge" element={<Bridge testnetMode={testnetMode} />} />
              <Route path="/stake" element={<Stake testnetMode={testnetMode} />} />
              <Route path="/farm" element={<Farm testnetMode={testnetMode} />} />
              <Route path="/analytics" element={<Analytics testnetMode={testnetMode} />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin/rewards" element={<AdminRewards />} />
              <Route path="/admin" element={<AdminPanel />} />
            </Routes>
          </Layout>
        </Router>
      </WalletProvider>
    </ThemeProvider>
  )
}

export default App
