import { useContext, useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
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
  MenuItem,
  Paper,
  Snackbar,
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
  ArrowDownward as ArrowDownIcon,
  ArrowUpward as ArrowUpIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { AuthContext, api } from '../context/AuthContext';

type HeaderFieldType = 'TEXT' | 'NUMBER' | 'SELECT' | 'COMPUTED';

interface HeaderField {
  id: string;
  label: string;
  type: HeaderFieldType;
  options?: string[] | null;
  defaultValue?: string | null;
  formulaExpression?: string | null;
  sortOrder: number;
  isActive: boolean;
}

const TYPE_LABEL: Record<HeaderFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  SELECT: 'Lista',
  COMPUTED: 'Calculado',
};

export default function ProjectHeaderConfig() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [fields, setFields] = useState<HeaderField[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingField, setEditingField] = useState<HeaderField | null>(null);

  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<HeaderFieldType>('TEXT');
  const [fieldOptionsText, setFieldOptionsText] = useState('');
  const [defaultValue, setDefaultValue] = useState('');
  const [formulaExpression, setFormulaExpression] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingField, setDeletingField] = useState<HeaderField | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    fetchFields();
  }, []);

  const fetchFields = async () => {
    try {
      setLoading(true);
      const response = await api.get('/project-header-fields');
      setFields(response.data || []);
    } catch (error) {
      console.error('Failed to fetch header fields', error);
      const apiError = error as AxiosError<{ message?: string | string[] }>;
      const backendMessage = apiError.response?.data?.message;
      const errorMessage = Array.isArray(backendMessage)
        ? backendMessage.join(' ')
        : backendMessage || 'Erro ao carregar configurações de projeto.';
      showSnackbar(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const optionsPreview = useMemo(() => {
    return fieldOptionsText
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [fieldOptionsText]);

  const resetDialogFields = () => {
    setFieldLabel('');
    setFieldType('TEXT');
    setFieldOptionsText('');
    setDefaultValue('');
    setFormulaExpression('');
  };

  const openCreateDialog = () => {
    setDialogMode('create');
    setEditingField(null);
    resetDialogFields();
    setDialogOpen(true);
  };

  const openEditDialog = (field: HeaderField) => {
    setDialogMode('edit');
    setEditingField(field);

    setFieldLabel(field.label);
    setFieldType(field.type || 'TEXT');
    setFieldOptionsText(Array.isArray(field.options) ? field.options.join('\n') : '');
    setDefaultValue(field.defaultValue || '');
    setFormulaExpression(field.formulaExpression || '');

    setDialogOpen(true);
  };

  const buildPayload = () => {
    return {
      label: fieldLabel.trim(),
      type: fieldType,
      options: fieldType === 'SELECT' ? optionsPreview : [],
      defaultValue: fieldType === 'COMPUTED' ? null : defaultValue.trim() || null,
      formulaExpression: fieldType === 'COMPUTED' ? formulaExpression.trim() || null : null,
    };
  };

  const handleSave = async () => {
    if (!fieldLabel.trim()) return;

    try {
      setSaving(true);
      const payload = buildPayload();

      if (dialogMode === 'create') {
        await api.post('/project-header-fields', payload);
        showSnackbar('Campo de configuração criado.', 'success');
      } else if (editingField) {
        await api.put(`/project-header-fields/${editingField.id}`, payload);
        showSnackbar('Campo atualizado.', 'success');
      }

      setDialogOpen(false);
      resetDialogFields();
      await fetchFields();
    } catch (error) {
      console.error('Failed to save field', error);
      const apiError = error as AxiosError<{ message?: string | string[] }>;
      const backendMessage = apiError.response?.data?.message;
      const errorMessage = Array.isArray(backendMessage)
        ? backendMessage.join(' ')
        : backendMessage || 'Erro ao salvar campo.';
      showSnackbar(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (field: HeaderField) => {
    setDeletingField(field);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingField) return;

    try {
      setDeleting(true);
      await api.delete(`/project-header-fields/${deletingField.id}`);
      showSnackbar('Campo excluído.', 'success');
      setDeleteDialogOpen(false);
      setDeletingField(null);
      await fetchFields();
    } catch (error) {
      console.error('Failed to delete field', error);
      showSnackbar('Erro ao excluir campo.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const saveOrder = async (orderedFields: HeaderField[]) => {
    try {
      await api.put('/project-header-fields/reorder', {
        orderedIds: orderedFields.map((field) => field.id),
      });
    } catch (error) {
      console.error('Failed to reorder fields', error);
      showSnackbar('Erro ao reordenar campos.', 'error');
      fetchFields();
    }
  };

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

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="primary" onClick={() => navigate('/')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Configurações de Projeto
          </Typography>
          {isAdmin && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
              Novo Campo
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 4 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : fields.length === 0 ? (
          <Paper sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6">Nenhuma configuração cadastrada.</Typography>
            <Typography variant="body2" color="text.secondary">
              Crie campos de projeto para liberar preenchimento nas requisições.
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 60 }}>#</TableCell>
                  <TableCell>Campo</TableCell>
                  <TableCell sx={{ width: 140 }}>Tipo</TableCell>
                  <TableCell sx={{ width: 200 }}>Padrão / Opções</TableCell>
                  <TableCell>Fórmula</TableCell>
                  {isAdmin && (
                    <>
                      <TableCell align="center" sx={{ width: 110 }}>
                        Ordem
                      </TableCell>
                      <TableCell align="right" sx={{ width: 130 }}>
                        Ações
                      </TableCell>
                    </>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map((field, index) => {
                  const options = Array.isArray(field.options) ? field.options : [];
                  return (
                    <TableRow key={field.id} hover>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600 }}>{field.label}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={TYPE_LABEL[field.type] || field.type} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        {field.type === 'SELECT' ? (
                          <Typography variant="body2" color="text.secondary">
                            {options.length > 0 ? options.join(', ') : '-'}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            {field.defaultValue || '-'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {field.formulaExpression || '-'}
                        </Typography>
                      </TableCell>
                      {isAdmin && (
                        <>
                          <TableCell align="center">
                            <Tooltip title="Mover para cima">
                              <span>
                                <IconButton size="small" color="primary" onClick={() => handleMoveUp(index)} disabled={index === 0}>
                                  <ArrowUpIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Mover para baixo">
                              <span>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => handleMoveDown(index)}
                                  disabled={index === fields.length - 1}
                                >
                                  <ArrowDownIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Editar">
                              <IconButton size="small" color="primary" onClick={() => openEditDialog(field)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Excluir">
                              <IconButton size="small" color="error" onClick={() => openDeleteDialog(field)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{dialogMode === 'create' ? 'Novo Campo de Projeto' : 'Editar Campo de Projeto'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 1 }}>
            <TextField
              autoFocus
              label="Nome do Campo"
              value={fieldLabel}
              onChange={(event) => setFieldLabel(event.target.value)}
              fullWidth
            />

            <TextField
              select
              label="Tipo"
              value={fieldType}
              onChange={(event) => setFieldType(event.target.value as HeaderFieldType)}
              fullWidth
            >
              <MenuItem value="TEXT">Texto</MenuItem>
              <MenuItem value="NUMBER">Número</MenuItem>
              <MenuItem value="SELECT">Lista dropdown</MenuItem>
              <MenuItem value="COMPUTED">Calculado por fórmula</MenuItem>
            </TextField>

            {fieldType === 'SELECT' && (
              <TextField
                label="Opções da lista"
                multiline
                minRows={4}
                fullWidth
                value={fieldOptionsText}
                onChange={(event) => setFieldOptionsText(event.target.value)}
                helperText="Uma opção por linha (ou separadas por vírgula)."
                sx={{ gridColumn: { xs: '1 / -1', md: '1 / 2' } }}
              />
            )}

            {fieldType !== 'COMPUTED' && (
              <TextField
                label="Valor padrão"
                type={fieldType === 'NUMBER' ? 'number' : 'text'}
                value={defaultValue}
                onChange={(event) => setDefaultValue(event.target.value)}
                fullWidth
                helperText={fieldType === 'SELECT' ? 'Para lista, deve ser uma opção válida.' : ''}
                sx={{ gridColumn: fieldType === 'SELECT' ? { xs: '1 / -1', md: '2 / 3' } : undefined }}
              />
            )}

            {fieldType === 'COMPUTED' && (
              <TextField
                label="Fórmula"
                multiline
                minRows={4}
                fullWidth
                value={formulaExpression}
                onChange={(event) => setFormulaExpression(event.target.value)}
                helperText={'Ex.: {{Qtd_Pontos}} + {{Qtd_Cameras}} ou Se(Obra="Nova", 1, 0)'}
                sx={{ gridColumn: '1 / -1' }}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button color="inherit" onClick={() => setDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              !fieldLabel.trim() ||
              saving ||
              (fieldType === 'SELECT' && optionsPreview.length === 0) ||
              (fieldType === 'COMPUTED' && !formulaExpression.trim())
            }
          >
            {saving ? 'Salvando...' : dialogMode === 'create' ? 'Criar' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Excluir Campo</DialogTitle>
        <DialogContent>
          <Typography>
            Confirmar exclusão do campo <strong>{deletingField?.label}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button color="inherit" onClick={() => setDeleteDialogOpen(false)}>
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3200}
        onClose={() => setSnackbar((previous) => ({ ...previous, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((previous) => ({ ...previous, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
