import { useState, useEffect, useContext } from 'react';
import type { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Container,
  AppBar,
  Toolbar,
  IconButton,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Tooltip,
  Snackbar,
  Alert
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
} from '@mui/icons-material';
import { AuthContext, api } from '../context/AuthContext';

interface HeaderField {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export default function ProjectHeaderConfig() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [fields, setFields] = useState<HeaderField[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingField, setEditingField] = useState<HeaderField | null>(null);
  const [fieldLabel, setFieldLabel] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingField, setDeletingField] = useState<HeaderField | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => {
    fetchFields();
  }, []);

  const fetchFields = async () => {
    try {
      setLoading(true);
      const res = await api.get('/project-header-fields');
      setFields(res.data);
    } catch (err) {
      console.error('Failed to fetch header fields', err);
      const apiError = err as AxiosError<{ message?: string | string[] }>;
      const backendMessage = apiError.response?.data?.message;
      const errorMessage = Array.isArray(backendMessage)
        ? backendMessage.join(' ')
        : backendMessage || 'Erro ao carregar campos';
      showSnackbar(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  // --- CREATE / EDIT ---
  const openCreateDialog = () => {
    setDialogMode('create');
    setEditingField(null);
    setFieldLabel('');
    setDialogOpen(true);
  };

  const openEditDialog = (field: HeaderField) => {
    setDialogMode('edit');
    setEditingField(field);
    setFieldLabel(field.label);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!fieldLabel.trim()) return;
    try {
      setSaving(true);
      if (dialogMode === 'create') {
        await api.post('/project-header-fields', { label: fieldLabel.trim() });
        showSnackbar('Campo criado com sucesso!', 'success');
      } else if (editingField) {
        await api.put(`/project-header-fields/${editingField.id}`, { label: fieldLabel.trim() });
        showSnackbar('Campo atualizado com sucesso!', 'success');
      }
      setDialogOpen(false);
      setFieldLabel('');
      fetchFields();
    } catch (err) {
      console.error('Failed to save field', err);
      const apiError = err as AxiosError<{ message?: string | string[] }>;
      const backendMessage = apiError.response?.data?.message;
      const errorMessage = Array.isArray(backendMessage)
        ? backendMessage.join(' ')
        : backendMessage || 'Erro ao salvar campo';
      showSnackbar(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- DELETE ---
  const openDeleteDialog = (field: HeaderField) => {
    setDeletingField(field);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingField) return;
    try {
      setDeleting(true);
      await api.delete(`/project-header-fields/${deletingField.id}`);
      showSnackbar('Campo excluÃ­do com sucesso!', 'success');
      setDeleteDialogOpen(false);
      setDeletingField(null);
      fetchFields();
    } catch (err) {
      console.error('Failed to delete field', err);
      showSnackbar('Erro ao excluir campo', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // --- REORDER ---
  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newFields = [...fields];
    [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
    setFields(newFields);
    await saveOrder(newFields);
  };

  const handleMoveDown = async (index: number) => {
    if (index === fields.length - 1) return;
    const newFields = [...fields];
    [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];
    setFields(newFields);
    await saveOrder(newFields);
  };

  const saveOrder = async (orderedFields: HeaderField[]) => {
    try {
      await api.put('/project-header-fields/reorder', {
        orderedIds: orderedFields.map((f) => f.id),
      });
    } catch (err) {
      console.error('Failed to reorder fields', err);
      showSnackbar('Erro ao reordenar campos', 'error');
      fetchFields(); // Reverte para o estado do servidor
    }
  };

  const isAdmin = user?.role === 'ADMIN';

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
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', color: 'primary.main' }}>
            Configurações de Projeto
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>
            Configurações de Projeto
          </Typography>
          {isAdmin && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog} sx={{ borderRadius: 2 }}>
              Novo Campo
            </Button>
          )}
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
            <CircularProgress />
          </Box>
        ) : fields.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
            <Typography color="text.secondary">
              Nenhuma configuração cadastrada. Clique em "Novo Campo" para adicionar.
            </Typography>
          </Paper>
        ) : (
          <TableContainer
            component={Paper}
            elevation={3}
            sx={{
              borderRadius: 2,
              maxHeight: 'calc(100vh - 240px)',
              overflow: 'auto',
            }}
          >
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: 60 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Nome do Campo</TableCell>
                  {isAdmin && (
                    <>
                      <TableCell align="center" sx={{ fontWeight: 'bold', width: 120 }}>
                        Ordem
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', width: 120 }}>
                        AÃ§Ãµes
                      </TableCell>
                    </>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map((field, index) => (
                  <TableRow
                    key={field.id}
                    sx={{
                      '&:last-child td, &:last-child th': { border: 0 },
                      transition: 'background-color 0.15s',
                      '&:hover': { bgcolor: 'rgba(108, 99, 255, 0.08)' },
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" fontWeight={600}>
                        {index + 1}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body1">{field.label}</Typography>
                    </TableCell>
                    {isAdmin && (
                      <>
                        <TableCell align="center">
                          <Tooltip title="Mover para cima">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleMoveUp(index)}
                                disabled={index === 0}
                                color="primary"
                              >
                                <ArrowUpIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Mover para baixo">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleMoveDown(index)}
                                disabled={index === fields.length - 1}
                                color="primary"
                              >
                                <ArrowDownIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Editar">
                            <IconButton size="small" onClick={() => openEditDialog(field)} color="primary">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Excluir">
                            <IconButton size="small" onClick={() => openDeleteDialog(field)} color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>

      {/* Dialog Criar / Editar */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialogMode === 'create' ? 'Novo Campo' : 'Editar Campo'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nome do Campo"
            type="text"
            fullWidth
            variant="outlined"
            value={fieldLabel}
            onChange={(e) => setFieldLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setDialogOpen(false)} color="inherit">
            Cancelar
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={!fieldLabel.trim() || saving}>
            {saving ? 'Salvando...' : dialogMode === 'create' ? 'Criar' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Confirmar ExclusÃ£o */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirmar ExclusÃ£o</DialogTitle>
        <DialogContent>
          <Typography>
            Tem certeza que deseja excluir o campo <strong>"{deletingField?.label}"</strong>?
          </Typography>
          <Typography variant="body2" color="error.light" sx={{ mt: 1 }}>
            Esta aÃ§Ã£o nÃ£o pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} color="inherit">
            Cancelar
          </Button>
          <Button onClick={handleDelete} variant="contained" color="error" disabled={deleting}>
            {deleting ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar Feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

