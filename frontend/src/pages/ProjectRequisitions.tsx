import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Container,
  Paper,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  FileCopy as SnapshotIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { AuthContext, api } from '../context/AuthContext';

interface Requisition {
  id: string;
  projectId: string;
  version: string;
  status: 'PENDING' | 'FILLING' | 'COMPLETED';
  isReadOnly: boolean;
  createdAt: string;
}

export default function ProjectRequisitions() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [projectName, setProjectName] = useState('Carregando Projeto...');
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createVersion, setCreateVersion] = useState('');

  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSourceReqId, setCloneSourceReqId] = useState<string | null>(null);
  const [cloneVersion, setCloneVersion] = useState('');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReqId, setEditingReqId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState('');

  useEffect(() => {
    fetchData();
  }, [projectId]);

  useEffect(() => {
    if (!createDialogOpen) return;
    setCreateVersion(`V${requisitions.length + 1}`);
  }, [createDialogOpen, requisitions.length]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/projects/${projectId}`);
      setProjectName(res.data.name);
      setRequisitions(res.data.requisitions || []);
    } catch (err) {
      console.error('Failed to fetch project details', err);
      setProjectName('Projeto nao encontrado');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequisition = async () => {
    if (!createVersion.trim()) return;
    try {
      setActionLoading(true);
      await api.post(`/requisitions/project/${projectId}`, { version: createVersion.trim() });
      setCreateDialogOpen(false);
      setCreateVersion('');
      await fetchData();
    } catch (err) {
      console.error('Failed to create requisition', err);
      alert('Erro ao criar requisicao');
    } finally {
      setActionLoading(false);
    }
  };

  const openCloneDialog = (sourceReqId: string) => {
    setCloneSourceReqId(sourceReqId);
    setCloneVersion(`V${requisitions.length + 1}`);
    setCloneDialogOpen(true);
  };

  const handleCreateSnapshot = async () => {
    if (!cloneSourceReqId || !cloneVersion.trim()) return;
    try {
      setActionLoading(true);
      await api.post(`/requisitions/${cloneSourceReqId}/snapshot`, { version: cloneVersion.trim() });
      setCloneDialogOpen(false);
      setCloneSourceReqId(null);
      setCloneVersion('');
      await fetchData();
    } catch (err) {
      console.error('Failed to create snapshot', err);
      alert('Erro ao criar nova versao clonada');
    } finally {
      setActionLoading(false);
    }
  };

  const openEditVersionDialog = (req: Requisition) => {
    setEditingReqId(req.id);
    setEditingVersion(req.version || '');
    setEditDialogOpen(true);
  };

  const handleUpdateVersion = async () => {
    if (!editingReqId || !editingVersion.trim()) return;
    try {
      setActionLoading(true);
      await api.put(`/requisitions/${editingReqId}/version`, { version: editingVersion.trim() });
      setEditDialogOpen(false);
      setEditingReqId(null);
      setEditingVersion('');
      await fetchData();
    } catch (err) {
      console.error('Failed to update version', err);
      alert('Erro ao editar versao');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'default';
      case 'FILLING':
        return 'primary';
      case 'COMPLETED':
        return 'success';
      default:
        return 'default';
    }
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
          <IconButton edge="start" color="inherit" onClick={() => navigate('/')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            {projectName}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>
            Requisicoes e Versoes
          </Typography>

          {isAdminOrQuantifier && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
              disabled={actionLoading}
            >
              Nova Requisicao
            </Button>
          )}
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
            <CircularProgress />
          </Box>
        ) : requisitions.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
            <Typography color="text.secondary">Nenhuma requisicao iniciada para este projeto.</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} elevation={3} sx={{ borderRadius: 2 }}>
            <Table>
              <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Versao</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Modo</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    Acoes
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...requisitions]
                  .sort(
                    (a, b) =>
                      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
                  )
                  .map((req) => (
                    <TableRow key={req.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      <TableCell>
                        <Typography fontWeight="bold" color="primary.light">
                          {req.version}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={req.status}
                          color={getStatusColor(req.status) as any}
                          size="small"
                          variant={req.isReadOnly ? 'outlined' : 'filled'}
                        />
                      </TableCell>
                      <TableCell>
                        {req.isReadOnly ? (
                          <Typography variant="body2" color="error.light">
                            Somente Leitura
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="success.light">
                            Permite Edicao
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                          {isAdminOrQuantifier && (
                            <>
                              <Tooltip title="Editar versao">
                                <IconButton size="small" color="primary" onClick={() => openEditVersionDialog(req)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Button
                                variant="outlined"
                                size="small"
                                color="secondary"
                                startIcon={<SnapshotIcon />}
                                onClick={() => openCloneDialog(req.id)}
                                disabled={actionLoading}
                              >
                                Clonar Versao
                              </Button>
                            </>
                          )}
                          <Button
                            variant="contained"
                            size="small"
                            color="primary"
                            onClick={() => navigate(`/requisition/${req.id}`)}
                          >
                            Abrir Itens
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nova Requisicao</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Versao"
            value={createVersion}
            onChange={(e) => setCreateVersion(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button color="inherit" onClick={() => setCreateDialogOpen(false)}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleCreateRequisition} disabled={!createVersion.trim() || actionLoading}>
            Criar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cloneDialogOpen} onClose={() => setCloneDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Clonar Requisicao</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Nova versao"
            value={cloneVersion}
            onChange={(e) => setCloneVersion(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button color="inherit" onClick={() => setCloneDialogOpen(false)}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleCreateSnapshot} disabled={!cloneVersion.trim() || actionLoading}>
            Clonar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Editar Versao</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Versao"
            value={editingVersion}
            onChange={(e) => setEditingVersion(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button color="inherit" onClick={() => setEditDialogOpen(false)}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleUpdateVersion} disabled={!editingVersion.trim() || actionLoading}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
