import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRenderCellParams, GridRowModel } from '@mui/x-data-grid';
import { Box, Typography, Button, Paper, Chip, IconButton, TextField, CircularProgress } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { api } from '../context/AuthContext';

interface ProjectConfig {
  id: string;
  fieldId: string;
  value: string;
  field: {
    id: string;
    label: string;
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

  const loadAll = async () => {
    if (!reqId) return;

    setLoading(true);
    try {
      const [itemsRes, configsRes] = await Promise.all([
        api.get(`/requisitions/${reqId}/items`),
        api.get(`/requisitions/${reqId}/project-configs`),
      ]);
      setRows(itemsRes.data || []);
      setConfigs(
        (configsRes.data || []).map((config: any) => ({
          id: config.id,
          fieldId: config.fieldId,
          value: config.value ?? '',
          field: config.field,
        })),
      );
    } catch (err) {
      console.error('Failed to fetch requisition data', err);
      alert('Erro ao carregar requisicao');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [reqId]);

  const columns: GridColDef[] = [
    { field: 'localName', headerName: 'Local', width: 190 },
    { field: 'operationName', headerName: 'Operacao', width: 190 },
    { field: 'equipmentCode', headerName: 'Codigo', width: 140 },
    { field: 'equipmentName', headerName: 'Equipamento', width: 260 },
    {
      field: 'manualQuantity',
      headerName: 'Qtd Manual',
      width: 140,
      editable: true,
    },
    { field: 'calculatedValue', headerName: 'Qtd Auto', width: 130 },
    {
      field: 'finalQuantity',
      headerName: 'Qtd Final',
      width: 130,
      valueGetter: (_value, row) => row.manualQuantity ?? row.overrideValue ?? row.calculatedValue ?? 0,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: (params: GridRenderCellParams) => {
        const isReceived = params.value === 'RECEIVED';
        return <Chip label={params.value} color={isReceived ? 'success' : 'warning'} variant="outlined" />;
      },
    },
  ];

  const processRowUpdate = async (newRow: GridRowModel, oldRow: GridRowModel) => {
    if (newRow.manualQuantity !== oldRow.manualQuantity) {
      const normalizedValue =
        newRow.manualQuantity === '' || newRow.manualQuantity === null || newRow.manualQuantity === undefined
          ? null
          : Number(newRow.manualQuantity);

      const res = await api.put(`/requisitions/items/${newRow.id}/quantity`, {
        manualQuantity: normalizedValue,
        currentLock: oldRow.versionLock,
      });
      return res.data;
    }
    return oldRow;
  };

  const handleConfigChange = (fieldId: string, value: string) => {
    setConfigs((prev) => prev.map((config) => (config.fieldId === fieldId ? { ...config, value } : config)));
  };

  const handleSaveConfigs = async () => {
    if (!reqId) return;
    try {
      setSavingConfigs(true);
      const res = await api.put(`/requisitions/${reqId}/project-configs`, {
        configs: configs.map((config) => ({
          fieldId: config.fieldId,
          value: config.value ?? '',
        })),
      });
      setConfigs(
        (res.data || []).map((config: any) => ({
          id: config.id,
          fieldId: config.fieldId,
          value: config.value ?? '',
          field: config.field,
        })),
      );
    } catch (err) {
      console.error('Failed to save project configs', err);
      alert('Erro ao salvar configuracoes de projeto');
    } finally {
      setSavingConfigs(false);
    }
  };

  const handleAutoFill = async () => {
    if (!reqId) return;
    try {
      setAutoFilling(true);
      const res = await api.post(`/requisitions/${reqId}/items/auto-fill`);
      setRows(res.data || []);
    } catch (err) {
      console.error('Failed to auto fill quantities', err);
      alert('Erro ao preencher quantidades automaticamente');
    } finally {
      setAutoFilling(false);
    }
  };

  return (
    <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default', p: { xs: 1, md: 3 } }}>
      <Paper sx={{ width: '100%', p: 2, mb: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton edge="start" onClick={() => navigate(-1)} sx={{ mr: 2 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5" color="primary" fontWeight={700}>
              Requisicao {reqId?.substring(0, 8)}...
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" color="primary" onClick={handleSaveConfigs} disabled={savingConfigs || loading}>
              {savingConfigs ? 'Salvando...' : 'Salvar Configuracoes'}
            </Button>
            <Button variant="outlined" color="secondary" onClick={handleAutoFill} disabled={autoFilling || loading}>
              {autoFilling ? 'Auto preenchendo...' : 'Auto preencher Quantidades'}
            </Button>
            <Button variant="contained" color="secondary" onClick={() => api.post(`/tasks/excel/${reqId}`)} disabled={loading}>
              Gerar Export
            </Button>
          </Box>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {configs.map((config) => (
              <Box
                key={config.id || config.fieldId}
                sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}
              >
                <TextField
                  fullWidth
                  size="small"
                  label={config.field?.label || 'Campo'}
                  value={config.value || ''}
                  onChange={(e) => handleConfigChange(config.fieldId, e.target.value)}
                />
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      <Paper sx={{ height: 640, width: '100%', p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          processRowUpdate={processRowUpdate}
          sx={{
            boxShadow: 2,
            border: 2,
            borderColor: 'primary.light',
            '& .MuiDataGrid-cell:hover': {
              color: 'primary.main',
            },
          }}
        />
      </Paper>
    </Box>
  );
}
