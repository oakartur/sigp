import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Logout as LogoutIcon,
  FolderOpen as FolderIcon,
  Settings as SettingsIcon,
  Inventory2 as InventoryIcon,
  Tune as TuneIcon,
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
  const [openModal, setOpenModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const canCreateProject = user?.role === 'ADMIN' || user?.role === 'QUANTIFIER';

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await api.get('/projects');
      setProjects(response.data || []);
    } catch (error) {
      console.error('Failed to fetch projects', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      setCreating(true);
      await api.post('/projects', { name: newProjectName.trim() });
      setOpenModal(false);
      setNewProjectName('');
      await fetchProjects();
    } catch (error) {
      console.error('Failed to create project', error);
      alert('Erro ao criar projeto.');
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 1.5, py: 0.5 }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            SIGP | Gestao de Requisicoes
          </Typography>

          <Chip size="small" label={user?.role || 'Sem perfil'} color="primary" variant="outlined" />

          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
            {user?.email}
          </Typography>

          <IconButton color="primary" onClick={handleLogout} title="Sair">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Paper
          sx={{
            p: { xs: 2, md: 3 },
            mb: 3,
            background:
              'linear-gradient(135deg, rgba(11,95,255,0.08) 0%, rgba(15,118,110,0.08) 100%), #FFFFFF',
          }}
        >
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            alignItems={{ xs: 'stretch', lg: 'center' }}
            justifyContent="space-between"
            spacing={2}
          >
            <Box>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                Painel de Projetos
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Central de operacao para configuracoes tecnicas, catalogo de equipamentos e versoes de requisicao.
              </Typography>
            </Box>

            {(isAdmin || canCreateProject) && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                {isAdmin && (
                  <>
                    <Button variant="outlined" startIcon={<InventoryIcon />} onClick={() => navigate('/settings/catalogs')}>
                      Catalogo
                    </Button>
                    <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => navigate('/settings/project')}>
                      Configuracoes de Projeto
                    </Button>
                  </>
                )}
                {isAdmin && (
                  <Tooltip title="Configuracoes de sistema em breve">
                    <span>
                      <Button variant="outlined" disabled startIcon={<SettingsIcon />}>
                        Configuracao
                      </Button>
                    </span>
                  </Tooltip>
                )}
                {canCreateProject && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenModal(true)}>
                    Novo Projeto
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        </Paper>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
          <Paper sx={{ p: 2, flex: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Projetos ativos
            </Typography>
            <Typography variant="h5">{projects.length}</Typography>
          </Paper>
          <Paper sx={{ p: 2, flex: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Perfil logado
            </Typography>
            <Typography variant="h5">{user?.role || '-'}</Typography>
          </Paper>
        </Stack>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : projects.length === 0 ? (
          <Paper sx={{ p: 6, textAlign: 'center' }}>
            <FolderIcon sx={{ fontSize: 52, color: 'text.disabled', mb: 1 }} />
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              Nenhum projeto cadastrado
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Crie um projeto para iniciar o fluxo de requisicoes e quantificacao.
            </Typography>
          </Paper>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                lg: 'repeat(3, minmax(0, 1fr))',
              },
              gap: 2,
            }}
          >
            {projects.map((project) => (
              <Card
                key={project.id}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 190,
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-3px)',
                    boxShadow: '0 14px 30px rgba(16,42,67,0.12)',
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Chip label="Projeto" size="small" color="secondary" sx={{ mb: 1.25 }} />
                  <Typography variant="h6" sx={{ mb: 0.75 }}>
                    {project.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                    ID: {project.id.slice(0, 12)}
                  </Typography>
                </CardContent>
                <CardActions sx={{ px: 2, pb: 2 }}>
                  <Button fullWidth variant="contained" onClick={() => navigate(`/project/${project.id}`)}>
                    Abrir requisicoes
                  </Button>
                </CardActions>
              </Card>
            ))}
          </Box>
        )}
      </Container>

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Novo Projeto</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nome do projeto"
            fullWidth
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={() => setOpenModal(false)}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleCreateProject} disabled={!newProjectName.trim() || creating}>
            {creating ? 'Criando...' : 'Criar projeto'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
