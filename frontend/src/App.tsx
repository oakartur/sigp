import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectRequisitions from './pages/ProjectRequisitions';
import RequisitionGrid from './pages/RequisitionGrid';
import PrivateRoute from './components/PrivateRoute';

// Paleta de Cores Premium Elegante Requisitada nas Instruções Mestre
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6C63FF', // Roxo vibrante dinâmico
    },
    secondary: {
      main: '#FF6584', // Rosa vibrante para highlights
    },
    background: {
      default: '#121212',
      paper: '#1E1E1E',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter basename="/sigp">
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route 
              path="/" 
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              } 
            />

            <Route 
              path="/project/:projectId" 
              element={
                <PrivateRoute>
                  <ProjectRequisitions />
                </PrivateRoute>
              } 
            />

            <Route 
              path="/requisition/:reqId" 
              element={
                <PrivateRoute>
                  <RequisitionGrid />
                </PrivateRoute>
              } 
            />
            
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
