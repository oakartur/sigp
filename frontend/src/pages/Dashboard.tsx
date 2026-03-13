import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Container,
  Card,
  CardContent,
  CardActions,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Logout as LogoutIcon,
  FolderOpen as FolderIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { AuthContext, api } from '../context/AuthContext';

interface Project {
  id: string;
  name: string;
}

export default function Dashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [openModal, setOpenModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      setCreating(true);
      await api.post('/projects', { name: newProjectName });
      setOpenModal(false);
      setNewProjectName('');
      fetchProjects();
    } catch (err) {
      console.error('Failed to create project', err);
      alert('Erro ao criar projeto');
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdminOrQuantifier = user?.role === 'ADMIN' || user?.role === 'QUANTIFIER';

  return (
    <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Toolbar>
          <Typography
            variant="h6"
            component="div"
            sx={{ flexGrow: 1, fontWeight: 'bold', color: 'primary.main' }}
          >
            SIGP Dashboard
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {user?.email} ({user?.role})
            </Typography>
            {user?.role === 'ADMIN' && (
              <>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => navigate('/settings/project')}
                  sx={{ borderRadius: 2 }}
                >
                  Configurações de Projeto
                </Button>
                <Tooltip title="Configurações de sistema (em breve)">
                  <span>
                    <IconButton color="primary" disabled>
                      <SettingsIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </>
            )}
            <IconButton color="secondary" onClick={handleLogout} title="Sair">
              <LogoutIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h4" fontWeight={700}>
            Meus Projetos
          </Typography>
          {isAdminOrQuantifier && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenModal(true)}
              sx={{ borderRadius: 2 }}
            >
              Novo Projeto
            </Button>
          )}
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
            <CircularProgress />
          </Box>
        ) : projects.length === 0 ? (
          <Box sx={{ textAlign: 'center', mt: 10, p: 4, bgcolor: 'background.paper', borderRadius: 3 }}>
            <FolderIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Nenhum projeto encontrado
            </Typography>
            <Typography variant="body2" color="text.disabled">
              Crie um novo projeto para começar a quantificação.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {projects.map((project) => (
              <Box
                key={project.id}
                sx={{
                  width: { xs: '100%', sm: 'calc(50% - 12px)', md: 'calc(33.333% - 16px)' },
                }}
              >
                <Card
                  elevation={2}
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: 6,
                      borderColor: 'primary.main',
                      borderWidth: 1,
                      borderStyle: 'solid',
                    },
                  }}
                >
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography gutterBottom variant="h5" component="h2" fontWeight={600}>
                      {project.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ID: {project.id.substring(0, 8)}...
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ p: 2, pt: 0 }}>
                    <Button
                      size="small"
                      color="primary"
                      variant="outlined"
                      fullWidth
                      onClick={() => navigate(`/project/${project.id}`)}
                    >
                      Acessar Requisições
                    </Button>
                  </CardActions>
                </Card>
              </Box>
            ))}
          </Box>
        )}
      </Container>

      {/* Modal Criar Projeto */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Criar Novo Projeto</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nome do Projeto"
            type="text"
            fullWidth
            variant="outlined"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setOpenModal(false)} color="inherit">
            Cancelar
          </Button>
          <Button onClick={handleCreateProject} variant="contained" disabled={!newProjectName.trim() || creating}>
            {creating ? 'Criando...' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
