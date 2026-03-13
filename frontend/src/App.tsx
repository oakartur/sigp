import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectRequisitions from './pages/ProjectRequisitions';
import RequisitionGrid from './pages/RequisitionGrid';
import ProjectHeaderConfig from './pages/ProjectHeaderConfig';
import CatalogsConfig from './pages/CatalogsConfig';
import PrivateRoute from './components/PrivateRoute';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0B5FFF',
      light: '#4D8EFF',
      dark: '#0847C5',
    },
    secondary: {
      main: '#0F766E',
    },
    success: {
      main: '#2E7D32',
    },
    warning: {
      main: '#B45309',
    },
    error: {
      main: '#C62828',
    },
    background: {
      default: '#F2F5FA',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#102A43',
      secondary: '#486581',
    },
    divider: '#D9E2EC',
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Source Sans 3", "Segoe UI", sans-serif',
    h4: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h5: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          colorScheme: 'light',
        },
        body: {
          background:
            'radial-gradient(1200px 600px at 100% -20%, #D8E8FF 0%, rgba(216,232,255,0) 55%), radial-gradient(900px 500px at -10% 110%, #D7F5EE 0%, rgba(215,245,238,0) 60%), #F2F5FA',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #D9E2EC',
          color: '#102A43',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: '1px solid #D9E2EC',
          boxShadow: '0 8px 24px rgba(16, 42, 67, 0.06)',
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          minHeight: 38,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#F8FAFD',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          color: '#243B53',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
        },
      },
    },
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

            <Route
              path="/settings/project"
              element={
                <PrivateRoute allowedRoles={['ADMIN']}>
                  <ProjectHeaderConfig />
                </PrivateRoute>
              }
            />

            <Route
              path="/settings/catalogs"
              element={
                <PrivateRoute allowedRoles={['ADMIN']}>
                  <CatalogsConfig />
                </PrivateRoute>
              }
            />

            <Route
              path="/settings/header-fields"
              element={
                <PrivateRoute allowedRoles={['ADMIN']}>
                  <ProjectHeaderConfig />
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
