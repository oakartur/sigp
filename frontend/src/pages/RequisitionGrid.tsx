import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRenderCellParams, GridRowModel, GridRowSelectionModel } from '@mui/x-data-grid';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { api } from '../context/AuthContext';
import type { AxiosError } from 'axios';

interface ProjectConfig {
  id: string;
  fieldId: string;
  value: string;
  field: {
    id: string;
    label: string;
    type: 'TEXT' | 'NUMBER' | 'SELECT' | 'COMPUTED';
    options?: string[] | null;
    defaultValue?: string | null;
    formulaExpression?: string | null;
  };
}

interface RequisitionItemRow {
  id: string;
  localName?: string | null;
  operationName?: string | null;
  equipmentCode?: string | null;
  equipmentName: string;
  manualQuantity?: number | null;
  calculatedValue?: number | null;
  overrideValue?: number | null;
  status: 'PENDING' | 'RECEIVED';
  versionLock: number;
}

export default function RequisitionGrid() {
  const { reqId } = useParams();
  const navigate = useNavigate();

  const [rows, setRows] = useState<RequisitionItemRow[]>([]);
  const [configs, setConfigs] = useState<ProjectConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConfigs, setSavingConfigs] = useState(false);
  const [savingQuantities, setSavingQuantities] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoSyncError, setAutoSyncError] = useState<string | null>(null);
  const [quantitySyncError, setQuantitySyncError] = useState<string | null>(null);
  const [lastAutoSyncAt, setLastAutoSyncAt] = useState<number | null>(null);
  const [dirtyRowIds, setDirtyRowIds] = useState<string[]>([]);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({
    type: 'include',
    ids: new Set(),
  });
  const [bulkQuantity, setBulkQuantity] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);

  const latestConfigsRef = useRef<ProjectConfig[]>([]);
  const autoSyncTimerRef = useRef<number | null>(null);
  const quantitySyncTimerRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const pendingResyncRef = useRef(false);
  const configDirtyRef = useRef(false);
  const quantitySyncInFlightRef = useRef(false);
  const quantityPendingResyncRef = useRef(false);
  const quantityQueueRef = useRef<Map<string, { manualQuantity: number | null; currentLock: number }>>(new Map());

  const [filterLocal, setFilterLocal] = useState('');
  const [filterOperation, setFilterOperation] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    latestConfigsRef.current = configs;
  }, [configs]);

  useEffect(() => {
    return () => {
      if (autoSyncTimerRef.current !== null) {
        window.clearTimeout(autoSyncTimerRef.current);
      }
      if (quantitySyncTimerRef.current !== null) {
        window.clearTimeout(quantitySyncTimerRef.current);
      }
    };
  }, []);

  const parseApiErrorMessage = (error: unknown, fallback: string) => {
    const apiError = error as AxiosError<{ message?: string | string[] }>;
    const backendMessage = apiError.response?.data?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(' ');
    return backendMessage || fallback;
  };

  const mapProjectConfigs = (list: any[]): ProjectConfig[] =>
    list.map((config: any) => ({
      id: config.id,
      fieldId: config.fieldId,
      value: config.value ?? '',
      field: config.field,
    }));

  const normalizeManualQuantity = (value: unknown): number | null => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const markRowDirty = (rowId: string, dirty: boolean) => {
    setDirtyRowIds((previous) => {
      const exists = previous.includes(rowId);
      if (dirty && !exists) return [...previous, rowId];
      if (!dirty && exists) return previous.filter((id) => id !== rowId);
      return previous;
    });
  };

  const flushQuantityQueue = async () => {
    if (!reqId) return;
    if (quantitySyncInFlightRef.current) {
      quantityPendingResyncRef.current = true;
      return;
    }
    if (quantityQueueRef.current.size === 0) return;

    quantitySyncInFlightRef.current = true;
    setSavingQuantities(true);
    setQuantitySyncError(null);

    const queueBatch = Array.from(quantityQueueRef.current.entries());
    quantityQueueRef.current.clear();
    let hasSuccessfulQuantityUpdate = false;

    for (const [rowId, payload] of queueBatch) {
      try {
        const response = await api.put(`/requisitions/items/${rowId}/quantity`, {
          manualQuantity: payload.manualQuantity,
          currentLock: payload.currentLock,
        });
        const updatedRow = response.data as RequisitionItemRow;
        setRows((previous) => previous.map((row) => (row.id === rowId ? updatedRow : row)));
        markRowDirty(rowId, false);
        hasSuccessfulQuantityUpdate = true;
      } catch (error) {
        const message = parseApiErrorMessage(error, 'Erro ao salvar quantidade.');
        setQuantitySyncError(message);
        markRowDirty(rowId, true);
      }
    }

    if (hasSuccessfulQuantityUpdate) {
      setAutoFilling(true);
      try {
        const autoFillResponse = await api.post(`/requisitions/${reqId}/items/auto-fill`);
        setRows(autoFillResponse.data || []);
        setAutoSyncError(null);
      } catch (error) {
        const message = parseApiErrorMessage(error, 'Erro ao recalcular quantidades automaticas.');
        setAutoSyncError(message);
      } finally {
        setAutoFilling(false);
      }
    }

    quantitySyncInFlightRef.current = false;
    setSavingQuantities(false);
    setLastAutoSyncAt(Date.now());

    if (quantityPendingResyncRef.current || quantityQueueRef.current.size > 0) {
      quantityPendingResyncRef.current = false;
      void flushQuantityQueue();
    }
  };

  const scheduleQuantitySync = () => {
    if (quantitySyncTimerRef.current !== null) {
      window.clearTimeout(quantitySyncTimerRef.current);
    }

    quantitySyncTimerRef.current = window.setTimeout(() => {
      void flushQuantityQueue();
    }, 450);
  };

  const enqueueQuantitySave = (row: RequisitionItemRow, manualQuantity: number | null) => {
    quantityQueueRef.current.set(row.id, {
      manualQuantity,
      currentLock: row.versionLock,
    });
    markRowDirty(row.id, true);
    scheduleQuantitySync();
  };

  const performAutoSync = async () => {
    if (!reqId) return;
    if (!configDirtyRef.current) return;

    if (syncInFlightRef.current) {
      pendingResyncRef.current = true;
      return;
    }

    syncInFlightRef.current = true;
    configDirtyRef.current = false;
    setSavingConfigs(true);
    setAutoFilling(true);
    setAutoSyncError(null);

    try {
      const editable = latestConfigsRef.current.filter((config) => config.field?.type !== 'COMPUTED');
      const saveResponse = await api.put(`/requisitions/${reqId}/project-configs`, {
        configs: editable.map((config) => ({
          fieldId: config.fieldId,
          value: config.value ?? '',
        })),
      });

      const updatedConfigs = mapProjectConfigs(saveResponse.data || []);
      latestConfigsRef.current = updatedConfigs;
      setConfigs(updatedConfigs);

      const autoFillResponse = await api.post(`/requisitions/${reqId}/items/auto-fill`);
      setRows(autoFillResponse.data || []);
      setLastAutoSyncAt(Date.now());
    } catch (error) {
      console.error('Failed to auto sync project configuration', error);
      const message = parseApiErrorMessage(error, 'Erro na sincronizacao automatica.');
      setAutoSyncError(message);
    } finally {
      setSavingConfigs(false);
      setAutoFilling(false);
      syncInFlightRef.current = false;

      if (pendingResyncRef.current || configDirtyRef.current) {
        pendingResyncRef.current = false;
        void performAutoSync();
      }
    }
  };

  const scheduleAutoSync = () => {
    if (autoSyncTimerRef.current !== null) {
      window.clearTimeout(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = window.setTimeout(() => {
      void performAutoSync();
    }, 700);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void performAutoSync();
        void flushQuantityQueue();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reqId]);

  const loadAll = async () => {
    if (!reqId) return;

    if (autoSyncTimerRef.current !== null) {
      window.clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
    if (quantitySyncTimerRef.current !== null) {
      window.clearTimeout(quantitySyncTimerRef.current);
      quantitySyncTimerRef.current = null;
    }
    quantityQueueRef.current.clear();
    quantityPendingResyncRef.current = false;
    quantitySyncInFlightRef.current = false;

    setLoading(true);
    try {
      const [itemsResponse, configsResponse] = await Promise.all([
        api.get(`/requisitions/${reqId}/items`),
        api.get(`/requisitions/${reqId}/project-configs`),
      ]);

      setRows(itemsResponse.data || []);
      const loadedConfigs = mapProjectConfigs(configsResponse.data || []);
      latestConfigsRef.current = loadedConfigs;
      setConfigs(loadedConfigs);
      configDirtyRef.current = false;
      pendingResyncRef.current = false;
      setAutoSyncError(null);
      setQuantitySyncError(null);
      setDirtyRowIds([]);
      setRowSelectionModel({ type: 'include', ids: new Set() });
    } catch (error) {
      console.error('Failed to fetch requisition data', error);
      const errorMessage = parseApiErrorMessage(error, 'Erro ao carregar requisicao.');
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [reqId]);

  const localOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.localName || '').filter(Boolean))).sort(),
    [rows],
  );

  const operationOptions = useMemo(() => {
    const sourceRows = filterLocal ? rows.filter((row) => (row.localName || '') === filterLocal) : rows;
    return Array.from(new Set(sourceRows.map((row) => row.operationName || '').filter(Boolean))).sort();
  }, [rows, filterLocal]);

  useEffect(() => {
    if (filterOperation && !operationOptions.includes(filterOperation)) {
      setFilterOperation('');
    }
  }, [filterOperation, operationOptions]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return rows.filter((row) => {
      const localMatch = !filterLocal || (row.localName || '') === filterLocal;
      const operationMatch = !filterOperation || (row.operationName || '') === filterOperation;
      const textMatch =
        !normalizedSearch ||
        (row.equipmentName || '').toLowerCase().includes(normalizedSearch) ||
        (row.equipmentCode || '').toLowerCase().includes(normalizedSearch);

      return localMatch && operationMatch && textMatch;
    });
  }, [rows, filterLocal, filterOperation, searchTerm]);

  const getFinalQuantity = (row: RequisitionItemRow) =>
    row.manualQuantity ?? row.overrideValue ?? row.calculatedValue ?? 0;

  const selectedIdsSet = useMemo(
    () => new Set(Array.from(rowSelectionModel.ids).map((id) => String(id))),
    [rowSelectionModel],
  );

  const selectedFilteredRows = useMemo(
    () => filteredRows.filter((row) => selectedIdsSet.has(row.id)),
    [filteredRows, selectedIdsSet],
  );

  const targetRowsForBulk = selectedFilteredRows.length > 0 ? selectedFilteredRows : filteredRows;

  const summary = useMemo(() => {
    const filteredPending = filteredRows.filter((row) => row.status === 'PENDING').length;
    const filteredReceived = filteredRows.filter((row) => row.status === 'RECEIVED').length;
    const filteredTotalQuantity = filteredRows.reduce((acc, row) => acc + getFinalQuantity(row), 0);
    return {
      total: rows.length,
      filtered: filteredRows.length,
      pending: filteredPending,
      received: filteredReceived,
      filteredTotalQuantity,
    };
  }, [rows, filteredRows]);

  const columns: GridColDef[] = [
    { field: 'localName', headerName: 'Local', width: 180 },
    { field: 'operationName', headerName: 'Operacao', width: 200 },
    { field: 'equipmentCode', headerName: 'Codigo', width: 130 },
    { field: 'equipmentName', headerName: 'Equipamento', flex: 1, minWidth: 280 },
    {
      field: 'manualQuantity',
      headerName: 'Qtd Manual',
      width: 130,
      editable: true,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'calculatedValue',
      headerName: 'Qtd Auto',
      width: 120,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'finalQuantity',
      headerName: 'Qtd Final',
      width: 120,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
      valueGetter: (_value, row) => getFinalQuantity(row as RequisitionItemRow),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (params: GridRenderCellParams) => {
        const isReceived = params.value === 'RECEIVED';
        return (
          <Chip
            label={params.value}
            size="small"
            color={isReceived ? 'success' : 'warning'}
            variant={isReceived ? 'filled' : 'outlined'}
          />
        );
      },
    },
  ];

  const processRowUpdate = (newRow: GridRowModel, oldRow: GridRowModel) => {
    const previousValue = normalizeManualQuantity(oldRow.manualQuantity);
    const nextValue = normalizeManualQuantity(newRow.manualQuantity);
    if (previousValue === nextValue) {
      return oldRow;
    }

    const optimisticRow = {
      ...(oldRow as RequisitionItemRow),
      ...(newRow as RequisitionItemRow),
      manualQuantity: nextValue,
    };

    setRows((previous) => previous.map((row) => (row.id === optimisticRow.id ? optimisticRow : row)));
    enqueueQuantitySave(oldRow as RequisitionItemRow, nextValue);

    return optimisticRow;
  };

  const handleApplyBulkQuantity = async () => {
    const targetRows = targetRowsForBulk;
    if (targetRows.length === 0) return;

    const value = normalizeManualQuantity(bulkQuantity);
    if (bulkQuantity.trim() && value === null) {
      alert('Informe uma quantidade numerica valida para aplicar em lote.');
      return;
    }

    const targetIds = new Set(targetRows.map((row) => row.id));
    setBulkApplying(true);

    setRows((previous) =>
      previous.map((row) => (targetIds.has(row.id) ? { ...row, manualQuantity: value } : row)),
    );

    for (const row of targetRows) {
      enqueueQuantitySave(row, value);
    }

    setBulkApplying(false);
    void flushQuantityQueue();
  };

  const handleConfigChange = (fieldId: string, value: string) => {
    configDirtyRef.current = true;
    if (syncInFlightRef.current) {
      pendingResyncRef.current = true;
    }

    setConfigs((previous) =>
      previous.map((config) => (config.fieldId === fieldId ? { ...config, value } : config)),
    );
    scheduleAutoSync();
  };

  const parseOptions = (options: unknown): string[] => {
    if (!Array.isArray(options)) return [];
    return options.map((option) => String(option ?? '').trim()).filter(Boolean);
  };

  const renderConfigInput = (config: ProjectConfig) => {
    const fieldType = config.field?.type || 'TEXT';

    if (fieldType === 'COMPUTED') {
      return (
        <TextField
          key={config.id || config.fieldId}
          fullWidth
          size="small"
          label={config.field?.label || 'Campo calculado'}
          value={config.value || ''}
          InputProps={{ readOnly: true }}
        />
      );
    }

    if (fieldType === 'SELECT') {
      const options = parseOptions(config.field?.options);
      return (
        <TextField
          key={config.id || config.fieldId}
          fullWidth
          size="small"
          select
          label={config.field?.label || 'Campo'}
          value={config.value || ''}
          onChange={(event) => handleConfigChange(config.fieldId, event.target.value)}
        >
          <MenuItem value="">Selecione</MenuItem>
          {options.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      );
    }

    return (
      <TextField
        key={config.id || config.fieldId}
        fullWidth
        size="small"
        type={fieldType === 'NUMBER' ? 'number' : 'text'}
        label={config.field?.label || 'Campo'}
        value={config.value || ''}
        onChange={(event) => handleConfigChange(config.fieldId, event.target.value)}
      />
    );
  };

  const handleExport = async () => {
    if (!reqId) return;
    await api.post(`/tasks/excel/${reqId}`);
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton edge="start" color="primary" onClick={() => navigate(-1)}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, fontFamily: '"IBM Plex Mono", monospace' }}>
            Requisicao {reqId?.slice(0, 10)}
          </Typography>

          <Typography
            variant="body2"
            sx={{
              color: autoSyncError || quantitySyncError ? 'error.main' : 'text.secondary',
              minWidth: { xs: 0, md: 260 },
              textAlign: 'right',
            }}
          >
            {savingConfigs || autoFilling || savingQuantities
              ? 'Sincronizando automaticamente...'
              : autoSyncError
                ? autoSyncError
                : quantitySyncError
                  ? quantitySyncError
                : lastAutoSyncAt
                  ? `Sincronizado as ${new Date(lastAutoSyncAt).toLocaleTimeString('pt-BR')}`
                  : 'Sincronizacao automatica ativa'}
          </Typography>

          <Button variant="outlined" onClick={handleExport} disabled={loading}>
            Gerar export
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 2.5 }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
            <Chip label={`Itens totais: ${summary.total}`} color="primary" variant="outlined" />
            <Chip label={`Itens filtrados: ${summary.filtered}`} variant="outlined" />
            <Chip label={`Pendentes (filtro): ${summary.pending}`} color="warning" variant="outlined" />
            <Chip label={`Recebidos (filtro): ${summary.received}`} color="success" variant="outlined" />
            <Chip label={`Qtd final filtrada: ${summary.filteredTotalQuantity.toLocaleString('pt-BR')}`} color="secondary" />
          </Stack>
        </Paper>

        {(autoSyncError || quantitySyncError) && (
          <Stack spacing={1.25} sx={{ mb: 2 }}>
            {autoSyncError && <Alert severity="warning">Falha ao sincronizar configuracoes: {autoSyncError}</Alert>}
            {quantitySyncError && <Alert severity="warning">Falha ao sincronizar quantidades: {quantitySyncError}</Alert>}
          </Stack>
        )}

        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
            Configuracoes de Projeto
          </Typography>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  lg: 'repeat(4, minmax(0, 1fr))',
                },
                gap: 1.5,
              }}
            >
              {configs.map((config) => (
                renderConfigInput(config)
              ))}
            </Box>
          )}
        </Paper>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField
              select
              size="small"
              label="Local"
              value={filterLocal}
              onChange={(event) => setFilterLocal(event.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">Todos</MenuItem>
              {localOptions.map((local) => (
                <MenuItem key={local} value={local}>
                  {local}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Operacao"
              value={filterOperation}
              onChange={(event) => setFilterOperation(event.target.value)}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="">Todas</MenuItem>
              {operationOptions.map((operation) => (
                <MenuItem key={operation} value={operation}>
                  {operation}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              size="small"
              label="Buscar equipamento ou codigo"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              sx={{ flexGrow: 1 }}
            />

            <Button
              color="inherit"
              onClick={() => {
                setFilterLocal('');
                setFilterOperation('');
                setSearchTerm('');
              }}
            >
              Limpar
            </Button>
          </Stack>

          <Divider sx={{ my: 1.5 }} />

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
            <TextField
              size="small"
              type="number"
              label="Quantidade em lote"
              value={bulkQuantity}
              onChange={(event) => setBulkQuantity(event.target.value)}
              sx={{ minWidth: 200 }}
            />
            <Button variant="contained" onClick={handleApplyBulkQuantity} disabled={bulkApplying || loading}>
              {bulkApplying
                ? 'Aplicando...'
                : `Aplicar em ${targetRowsForBulk.length} ${selectedFilteredRows.length > 0 ? 'selecionado(s)' : 'item(ns) filtrado(s)'}`}
            </Button>
            <Button
              color="inherit"
              onClick={() => {
                setRowSelectionModel({ type: 'include', ids: new Set() });
              }}
              disabled={rowSelectionModel.ids.size === 0}
            >
              Limpar selecao
            </Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 1.5, height: 660 }}>
          <DataGrid
            rows={filteredRows}
            columns={columns}
            loading={loading}
            processRowUpdate={processRowUpdate}
            onProcessRowUpdateError={() => alert('Erro local de edicao. Atualize a tela e tente novamente.')}
            checkboxSelection
            disableRowSelectionOnClick
            rowSelectionModel={rowSelectionModel}
            onRowSelectionModelChange={(model) => setRowSelectionModel(model)}
            getRowClassName={(params) => (dirtyRowIds.includes(String(params.id)) ? 'row-dirty' : '')}
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: {
                paginationModel: { page: 0, pageSize: 50 },
              },
            }}
            sx={{
              border: 'none',
              '& .MuiDataGrid-columnHeaders': {
                borderBottom: '1px solid',
                borderColor: 'divider',
                backgroundColor: '#F8FAFD',
              },
              '& .MuiDataGrid-cell': {
                borderColor: 'divider',
              },
              '& .MuiDataGrid-row:nth-of-type(even)': {
                backgroundColor: 'rgba(16, 42, 67, 0.02)',
              },
              '& .MuiDataGrid-row.row-dirty': {
                backgroundColor: 'rgba(255, 224, 130, 0.25)',
              },
            }}
          />
        </Paper>
      </Container>
    </Box>
  );
}
