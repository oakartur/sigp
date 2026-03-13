import { useEffect, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Box,
  Container,
  Paper,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { api } from '../context/AuthContext';

interface HeaderField {
  id: string;
  label: string;
}

interface EquipmentCatalog {
  id: string;
  code: string;
  description: string;
  baseQuantity: number;
  autoConfigFieldId?: string | null;
  autoMultiplier: number;
  isActive: boolean;
}

interface OperationCatalog {
  id: string;
  name: string;
  isActive: boolean;
  equipments: EquipmentCatalog[];
}

interface LocalCatalog {
  id: string;
  name: string;
  isActive: boolean;
  operations: OperationCatalog[];
}

type LocalDialogState = { open: boolean; id?: string; name: string };
type OperationDialogState = { open: boolean; id?: string; localId?: string; name: string };
type EquipmentDialogState = {
  open: boolean;
  id?: string;
  operationId?: string;
  code: string;
  description: string;
  baseQuantity: string;
  autoConfigFieldId: string;
  autoMultiplier: string;
};

export default function CatalogsConfig() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [locals, setLocals] = useState<LocalCatalog[]>([]);
  const [headerFields, setHeaderFields] = useState<HeaderField[]>([]);
  const [filterLocalId, setFilterLocalId] = useState('');
  const [filterOperationId, setFilterOperationId] = useState('');

  const [localDialog, setLocalDialog] = useState<LocalDialogState>({ open: false, name: '' });
  const [operationDialog, setOperationDialog] = useState<OperationDialogState>({ open: false, name: '' });
  const [equipmentDialog, setEquipmentDialog] = useState<EquipmentDialogState>({
    open: false,
    code: '',
    description: '',
    baseQuantity: '0',
    autoConfigFieldId: '',
    autoMultiplier: '1',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [localsRes, fieldsRes] = await Promise.all([api.get('/catalog/locals'), api.get('/project-header-fields')]);
      setLocals(localsRes.data || []);
      setHeaderFields(fieldsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch catalogs', err);
      alert('Erro ao carregar catalogos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const operationOptions = locals
    .flatMap((local) =>
      local.operations.map((operation) => ({
        id: operation.id,
        name: operation.name,
        localId: local.id,
        localName: local.name,
      })),
    )
    .filter((operation) => !filterLocalId || operation.localId === filterLocalId);

  useEffect(() => {
    if (!filterOperationId) return;
    const operationStillValid = operationOptions.some((operation) => operation.id === filterOperationId);
    if (!operationStillValid) {
      setFilterOperationId('');
    }
  }, [filterOperationId, operationOptions]);

  const filteredLocals = locals
    .filter((local) => !filterLocalId || local.id === filterLocalId)
    .map((local) => ({
      ...local,
      operations: local.operations.filter((operation) => !filterOperationId || operation.id === filterOperationId),
    }))
    .filter((local) => !filterOperationId || local.operations.length > 0);

  const saveLocal = async () => {
    if (!localDialog.name.trim()) return;
    try {
      setSaving(true);
      if (localDialog.id) {
        await api.put(`/catalog/locals/${localDialog.id}`, { name: localDialog.name.trim() });
      } else {
        await api.post('/catalog/locals', { name: localDialog.name.trim() });
      }
      setLocalDialog({ open: false, name: '' });
      await fetchData();
    } catch (err) {
      console.error('Failed to save local', err);
      alert('Erro ao salvar local');
    } finally {
      setSaving(false);
    }
  };

  const saveOperation = async () => {
    if (!operationDialog.name.trim() || !operationDialog.localId) return;
    try {
      setSaving(true);
      if (operationDialog.id) {
        await api.put(`/catalog/operations/${operationDialog.id}`, { name: operationDialog.name.trim() });
      } else {
        await api.post('/catalog/operations', {
          localId: operationDialog.localId,
          name: operationDialog.name.trim(),
        });
      }
      setOperationDialog({ open: false, name: '' });
      await fetchData();
    } catch (err) {
      console.error('Failed to save operation', err);
      alert('Erro ao salvar operacao');
    } finally {
      setSaving(false);
    }
  };

  const saveEquipment = async () => {
    if (!equipmentDialog.operationId || !equipmentDialog.description.trim()) return;
    try {
      setSaving(true);
      const payload = {
        operationId: equipmentDialog.operationId,
        code: equipmentDialog.code.trim(),
        description: equipmentDialog.description.trim(),
        baseQuantity: Number(equipmentDialog.baseQuantity || 0),
        autoConfigFieldId: equipmentDialog.autoConfigFieldId || null,
        autoMultiplier: Number(equipmentDialog.autoMultiplier || 1),
      };
      if (equipmentDialog.id) {
        await api.put(`/catalog/equipments/${equipmentDialog.id}`, payload);
      } else {
        await api.post('/catalog/equipments', payload);
      }
      setEquipmentDialog({
        open: false,
        code: '',
        description: '',
        baseQuantity: '0',
        autoConfigFieldId: '',
        autoMultiplier: '1',
      });
      await fetchData();
    } catch (err) {
      console.error('Failed to save equipment', err);
      alert('Erro ao salvar equipamento');
    } finally {
      setSaving(false);
    }
  };

  const removeLocal = async (id: string) => {
    if (!window.confirm('Remover este local e todas as operacoes/equipamentos?')) return;
    await api.delete(`/catalog/locals/${id}`);
    await fetchData();
  };

  const removeOperation = async (id: string) => {
    if (!window.confirm('Remover esta operacao e seus equipamentos?')) return;
    await api.delete(`/catalog/operations/${id}`);
    await fetchData();
  };

  const removeEquipment = async (id: string) => {
    if (!window.confirm('Remover este equipamento do catalogo?')) return;
    await api.delete(`/catalog/equipments/${id}`);
    await fetchData();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/catalog/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = res.data || {};
      const message = [
        `Linhas processadas: ${data.rowsProcessed ?? 0}`,
        `Locais criados: ${data.localsCreated ?? 0}`,
        `Operacoes criadas: ${data.operationsCreated ?? 0}`,
        `Equipamentos criados: ${data.equipmentsCreated ?? 0}`,
        `Equipamentos atualizados: ${data.equipmentsUpdated ?? 0}`,
        `Linhas ignoradas: ${data.rowsSkipped ?? 0}`,
      ].join('\n');
      alert(`Importacao concluida.\n\n${message}`);

      if (Array.isArray(data.errors) && data.errors.length > 0) {
        console.warn('Import warnings:', data.errors);
      }

      await fetchData();
    } catch (err) {
      console.error('Failed to import catalog', err);
      const apiError = err as AxiosError<{ message?: string | string[] }>;
      const backendMessage = apiError.response?.data?.message;
      const errorMessage = Array.isArray(backendMessage)
        ? backendMessage.join(' ')
        : backendMessage || 'Erro ao importar catalogo. Verifique o formato do arquivo.';
      alert(errorMessage);
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

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
            Catalogo de Local, Operacao e Equipamentos
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.xlsx"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            <Button variant="outlined" color="secondary" onClick={handleImportClick} disabled={importing}>
              {importing ? 'Importando...' : 'Importar CSV/Excel'}
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setLocalDialog({ open: true, name: '' })}>
              Novo Local
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              select
              label="Filtrar por Local"
              value={filterLocalId}
              onChange={(e) => setFilterLocalId(e.target.value)}
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="">Todos</MenuItem>
              {locals.map((local) => (
                <MenuItem key={local.id} value={local.id}>
                  {local.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Filtrar por Operacao"
              value={filterOperationId}
              onChange={(e) => setFilterOperationId(e.target.value)}
              sx={{ minWidth: 300 }}
            >
              <MenuItem value="">Todas</MenuItem>
              {operationOptions.map((operation) => (
                <MenuItem key={operation.id} value={operation.id}>
                  {filterLocalId ? operation.name : `${operation.localName} / ${operation.name}`}
                </MenuItem>
              ))}
            </TextField>

            <Button
              variant="text"
              color="inherit"
              onClick={() => {
                setFilterLocalId('');
                setFilterOperationId('');
              }}
            >
              Limpar filtros
            </Button>
          </Box>
        </Paper>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
            <CircularProgress />
          </Box>
        ) : locals.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">Nenhum local cadastrado.</Typography>
          </Paper>
        ) : filteredLocals.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">Nenhum resultado para os filtros selecionados.</Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {filteredLocals.map((local) => (
              <Paper key={local.id} sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">{local.name}</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setOperationDialog({ open: true, localId: local.id, name: '' })}
                    >
                      Nova Operacao
                    </Button>
                    <IconButton
                      color="primary"
                      size="small"
                      onClick={() => setLocalDialog({ open: true, id: local.id, name: local.name })}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton color="error" size="small" onClick={() => removeLocal(local.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>

                {local.operations.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Nenhuma operacao cadastrada neste local.
                  </Typography>
                ) : (
                  local.operations.map((operation) => (
                    <Paper key={operation.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle1">{operation.name}</Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={() =>
                              setEquipmentDialog({
                                open: true,
                                operationId: operation.id,
                                code: '',
                                description: '',
                                baseQuantity: '0',
                                autoConfigFieldId: '',
                                autoMultiplier: '1',
                              })
                            }
                          >
                            Novo Equipamento
                          </Button>
                          <IconButton
                            color="primary"
                            size="small"
                            onClick={() =>
                              setOperationDialog({
                                open: true,
                                id: operation.id,
                                localId: local.id,
                                name: operation.name,
                              })
                            }
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton color="error" size="small" onClick={() => removeOperation(operation.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>

                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Codigo</TableCell>
                            <TableCell>Descricao</TableCell>
                            <TableCell align="right">Qtd Base</TableCell>
                            <TableCell>Auto por Campo Config.</TableCell>
                            <TableCell align="right">Multiplicador</TableCell>
                            <TableCell align="right">Acoes</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {operation.equipments.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6}>
                                <Typography variant="body2" color="text.secondary">
                                  Nenhum equipamento nesta operacao.
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ) : (
                            operation.equipments.map((equipment) => (
                              <TableRow key={equipment.id}>
                                <TableCell>{equipment.code}</TableCell>
                                <TableCell>{equipment.description}</TableCell>
                                <TableCell align="right">{equipment.baseQuantity}</TableCell>
                                <TableCell>
                                  {headerFields.find((field) => field.id === equipment.autoConfigFieldId)?.label || '-'}
                                </TableCell>
                                <TableCell align="right">{equipment.autoMultiplier}</TableCell>
                                <TableCell align="right">
                                  <IconButton
                                    color="primary"
                                    size="small"
                                    onClick={() =>
                                      setEquipmentDialog({
                                        open: true,
                                        id: equipment.id,
                                        operationId: operation.id,
                                        code: equipment.code,
                                        description: equipment.description,
                                        baseQuantity: String(equipment.baseQuantity ?? 0),
                                        autoConfigFieldId: equipment.autoConfigFieldId || '',
                                        autoMultiplier: String(equipment.autoMultiplier ?? 1),
                                      })
                                    }
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton color="error" size="small" onClick={() => removeEquipment(equipment.id)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </Paper>
                  ))
                )}
              </Paper>
            ))}
          </Box>
        )}
      </Container>

      <Dialog open={localDialog.open} onClose={() => setLocalDialog({ open: false, name: '' })} maxWidth="xs" fullWidth>
        <DialogTitle>{localDialog.id ? 'Editar Local' : 'Novo Local'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Nome do Local"
            value={localDialog.name}
            onChange={(e) => setLocalDialog((prev) => ({ ...prev, name: e.target.value }))}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button color="inherit" onClick={() => setLocalDialog({ open: false, name: '' })}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={saveLocal} disabled={!localDialog.name.trim() || saving}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={operationDialog.open}
        onClose={() => setOperationDialog({ open: false, name: '' })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{operationDialog.id ? 'Editar Operacao' : 'Nova Operacao'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Nome da Operacao"
            value={operationDialog.name}
            onChange={(e) => setOperationDialog((prev) => ({ ...prev, name: e.target.value }))}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button color="inherit" onClick={() => setOperationDialog({ open: false, name: '' })}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={saveOperation} disabled={!operationDialog.name.trim() || saving}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={equipmentDialog.open}
        onClose={() =>
          setEquipmentDialog({
            open: false,
            code: '',
            description: '',
            baseQuantity: '0',
            autoConfigFieldId: '',
            autoMultiplier: '1',
          })
        }
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{equipmentDialog.id ? 'Editar Equipamento' : 'Novo Equipamento'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
            <TextField
              autoFocus
              label="Codigo Nimbi (opcional)"
              value={equipmentDialog.code}
              onChange={(e) => setEquipmentDialog((prev) => ({ ...prev, code: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Descricao"
              value={equipmentDialog.description}
              onChange={(e) => setEquipmentDialog((prev) => ({ ...prev, description: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Quantidade Base"
              type="number"
              value={equipmentDialog.baseQuantity}
              onChange={(e) => setEquipmentDialog((prev) => ({ ...prev, baseQuantity: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Campo para Auto Preenchimento"
              select
              value={equipmentDialog.autoConfigFieldId}
              onChange={(e) => setEquipmentDialog((prev) => ({ ...prev, autoConfigFieldId: e.target.value }))}
              fullWidth
            >
              <MenuItem value="">Nenhum</MenuItem>
              {headerFields.map((field) => (
                <MenuItem key={field.id} value={field.id}>
                  {field.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Multiplicador do Auto"
              type="number"
              value={equipmentDialog.autoMultiplier}
              onChange={(e) => setEquipmentDialog((prev) => ({ ...prev, autoMultiplier: e.target.value }))}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button
            color="inherit"
            onClick={() =>
              setEquipmentDialog({
                open: false,
                code: '',
                description: '',
                baseQuantity: '0',
                autoConfigFieldId: '',
                autoMultiplier: '1',
              })
            }
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={saveEquipment}
            disabled={!equipmentDialog.description.trim() || saving}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
