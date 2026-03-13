import { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  FileCopy as SnapshotIcon,
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

  const [projectName, setProjectName] = useState('Carregando projeto...');
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

  const isAdminOrQuantifier = user?.role === 'ADMIN' || user?.role === 'QUANTIFIER';

  useEffect(() => {
    fetchData();
  }, [projectId]);

  useEffect(() => {
    if (!createDialogOpen) return;
    setCreateVersion(`V${requisitions.length + 1}`);
  }, [createDialogOpen, requisitions.length]);

  const sortedRequisitions = useMemo(
    () => [...requisitions].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [requisitions],
  );

  const completedCount = useMemo(
    () => requisitions.filter((requisition) => requisition.status === 'COMPLETED').length,
    [requisitions],
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/projects/${projectId}`);
      setProjectName(response.data.name);
      setRequisitions(response.data.requisitions || []);
    } catch (error) {
      console.error('Failed to fetch project details', error);
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
    } catch (error) {
      console.error('Failed to create requisition', error);
      alert('Erro ao criar requisicao.');
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
    } catch (error) {
      console.error('Failed to create snapshot', error);
      alert('Erro ao clonar versao.');
    } finally {
      setActionLoading(false);
    }
  };

  const openEditVersionDialog = (requisition: Requisition) => {
    setEditingReqId(requisition.id);
    setEditingVersion(requisition.version || '');
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
    } catch (error) {
      console.error('Failed to update version', error);
      alert('Erro ao atualizar versao.');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status: Requisition['status']) => {
    if (status === 'COMPLETED') return 'success';
    if (status === 'FILLING') return 'primary';
    return 'default';
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="primary" onClick={() => navigate('/')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {projectName}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Paper sx={{ p: { xs: 2, md: 3 }, mb: 2.5 }}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', lg: 'center' }}
            spacing={2}
          >
            <Box>
              <Typography variant="h5" sx={{ mb: 0.25 }}>
                Requisicoes e versoes
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Controle de versao da requisicao para cada etapa do projeto.
              </Typography>
            </Box>

            {isAdminOrQuantifier && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateDialogOpen(true)}
                disabled={actionLoading}
              >
                Nova requisicao
              </Button>
            )}
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            <Chip label={`Versoes: ${requisitions.length}`} variant="outlined" color="primary" />
            <Chip label={`Concluidas: ${completedCount}`} variant="outlined" color="success" />
            <Chip label={`Em preenchimento: ${requisitions.length - completedCount}`} variant="outlined" />
          </Stack>
        </Paper>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : sortedRequisitions.length === 0 ? (
          <Paper sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              Nenhuma requisicao para este projeto
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Crie a primeira versao para iniciar o levantamento de material.
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Versao</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Modo</TableCell>
                  <TableCell>Criada em</TableCell>
                  <TableCell align="right">Acoes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedRequisitions.map((requisition) => (
                  <TableRow
                    key={requisition.id}
                    hover
                    sx={{
                      '& td': {
                        borderColor: 'divider',
                      },
                    }}
                  >
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace' }}>
                        {requisition.version}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={requisition.status}
                        color={getStatusColor(requisition.status) as any}
                        variant={requisition.isReadOnly ? 'outlined' : 'filled'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={requisition.isReadOnly ? 'Somente leitura' : 'Editavel'}
                        color={requisition.isReadOnly ? 'default' : 'secondary'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(requisition.createdAt).toLocaleString('pt-BR')}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {isAdminOrQuantifier && (
                          <>
                            <Tooltip title="Editar versao">
                              <IconButton size="small" color="primary" onClick={() => openEditVersionDialog(requisition)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<SnapshotIcon />}
                              onClick={() => openCloneDialog(requisition.id)}
                              disabled={actionLoading}
                            >
                              Clonar
                            </Button>
                          </>
                        )}
                        <Button variant="contained" size="small" onClick={() => navigate(`/requisition/${requisition.id}`)}>
                          Abrir
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nova requisicao</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Versao"
            value={createVersion}
            onChange={(event) => setCreateVersion(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={() => setCreateDialogOpen(false)}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleCreateRequisition} disabled={!createVersion.trim() || actionLoading}>
            Criar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cloneDialogOpen} onClose={() => setCloneDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Clonar requisicao</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Nova versao"
            value={cloneVersion}
            onChange={(event) => setCloneVersion(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={() => setCloneDialogOpen(false)}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleCreateSnapshot} disabled={!cloneVersion.trim() || actionLoading}>
            Clonar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Editar versao</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Versao"
            value={editingVersion}
            onChange={(event) => setEditingVersion(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
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
