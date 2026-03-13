import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRenderCellParams, GridRowModel } from '@mui/x-data-grid';
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, AutoAwesome as AutoAwesomeIcon, Save as SaveIcon } from '@mui/icons-material';
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
  const [autoFilling, setAutoFilling] = useState(false);

  const [filterLocal, setFilterLocal] = useState('');
  const [filterOperation, setFilterOperation] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const editableConfigs = useMemo(
    () => configs.filter((config) => config.field?.type !== 'COMPUTED'),
    [configs],
  );

  const loadAll = async () => {
    if (!reqId) return;

    setLoading(true);
    try {
      const [itemsResponse, configsResponse] = await Promise.all([
        api.get(`/requisitions/${reqId}/items`),
        api.get(`/requisitions/${reqId}/project-configs`),
      ]);

      setRows(itemsResponse.data || []);
      setConfigs(
        (configsResponse.data || []).map((config: any) => ({
          id: config.id,
          fieldId: config.fieldId,
          value: config.value ?? '',
          field: config.field,
        })),
      );
    } catch (error) {
      console.error('Failed to fetch requisition data', error);
      const apiError = error as AxiosError<{ message?: string | string[] }>;
      const backendMessage = apiError.response?.data?.message;
      const errorMessage = Array.isArray(backendMessage)
        ? backendMessage.join(' ')
        : backendMessage || 'Erro ao carregar requisicao.';
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
    },
    {
      field: 'calculatedValue',
      headerName: 'Qtd Auto',
      width: 120,
    },
    {
      field: 'finalQuantity',
      headerName: 'Qtd Final',
      width: 120,
      valueGetter: (_value, row) => row.manualQuantity ?? row.overrideValue ?? row.calculatedValue ?? 0,
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

  const processRowUpdate = async (newRow: GridRowModel, oldRow: GridRowModel) => {
    if (newRow.manualQuantity === oldRow.manualQuantity) {
      return oldRow;
    }

    const normalizedValue =
      newRow.manualQuantity === '' || newRow.manualQuantity === null || newRow.manualQuantity === undefined
        ? null
        : Number(newRow.manualQuantity);

    const response = await api.put(`/requisitions/items/${newRow.id}/quantity`, {
      manualQuantity: normalizedValue,
      currentLock: oldRow.versionLock,
    });

    return response.data;
  };

  const handleConfigChange = (fieldId: string, value: string) => {
    setConfigs((previous) =>
      previous.map((config) => (config.fieldId === fieldId ? { ...config, value } : config)),
    );
  };

  const handleSaveConfigs = async () => {
    if (!reqId) return;

    try {
      setSavingConfigs(true);
      const response = await api.put(`/requisitions/${reqId}/project-configs`, {
        configs: editableConfigs.map((config) => ({
          fieldId: config.fieldId,
          value: config.value ?? '',
        })),
      });

      setConfigs(
        (response.data || []).map((config: any) => ({
          id: config.id,
          fieldId: config.fieldId,
          value: config.value ?? '',
          field: config.field,
        })),
      );
    } catch (error) {
      console.error('Failed to save project configs', error);
      alert('Erro ao salvar configuracoes de projeto.');
    } finally {
      setSavingConfigs(false);
    }
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
          helperText={config.field?.formulaExpression ? `Formula: ${config.field.formulaExpression}` : 'Calculado automaticamente'}
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

  const handleAutoFill = async () => {
    if (!reqId) return;

    try {
      setAutoFilling(true);
      const response = await api.post(`/requisitions/${reqId}/items/auto-fill`);
      setRows(response.data || []);
    } catch (error) {
      console.error('Failed to auto fill quantities', error);
      alert('Erro ao auto preencher quantidades.');
    } finally {
      setAutoFilling(false);
    }
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

          <Tooltip title="Salvar configuracoes do projeto">
            <span>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveConfigs}
                disabled={savingConfigs || loading}
              >
                {savingConfigs ? 'Salvando...' : 'Salvar configuracoes'}
              </Button>
            </span>
          </Tooltip>

          <Button
            variant="outlined"
            startIcon={<AutoAwesomeIcon />}
            onClick={handleAutoFill}
            disabled={autoFilling || loading}
          >
            {autoFilling ? 'Preenchendo...' : 'Auto preencher'}
          </Button>

          <Button variant="outlined" onClick={handleExport} disabled={loading}>
            Gerar export
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 2.5 }}>
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
        </Paper>

        <Paper sx={{ p: 1.5, height: 660 }}>
          <DataGrid
            rows={filteredRows}
            columns={columns}
            loading={loading}
            processRowUpdate={processRowUpdate}
            onProcessRowUpdateError={() => alert('Erro ao salvar quantidade. Atualize a tela e tente novamente.')}
            disableRowSelectionOnClick
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
            }}
          />
        </Paper>
      </Container>
    </Box>
  );
}
