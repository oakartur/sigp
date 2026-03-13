import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRenderCellParams, GridRowModel } from '@mui/x-data-grid';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  IconButton,
  TextField,
  CircularProgress,
} from '@mui/material';
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

export default function RequisitionGrid() {
  const { reqId } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [configs, setConfigs] = useState<ProjectConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConfigs, setSavingConfigs] = useState(false);

  useEffect(() => {
    if (!reqId) return;

    setLoading(true);
    Promise.all([api.get(`/requisitions/${reqId}/items`), api.get(`/requisitions/${reqId}/project-configs`)])
      .then(([itemsRes, configsRes]) => {
        setRows(itemsRes.data);
        setConfigs(
          (configsRes.data || []).map((config: any) => ({
            id: config.id,
            fieldId: config.fieldId,
            value: config.value ?? '',
            field: config.field,
          })),
        );
      })
      .catch((err) => {
        console.error('Failed to fetch requisition data', err);
      })
      .finally(() => setLoading(false));
  }, [reqId]);

  const columns: GridColDef[] = [
    { field: 'equipmentName', headerName: 'Equipamento', width: 200 },
    { field: 'calculatedValue', headerName: 'Qtd Calculada (Formula)', width: 200 },
    {
      field: 'overrideValue',
      headerName: 'Sobrescrita Admin',
      width: 200,
      editable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ color: params.value ? 'secondary.main' : 'inherit', fontWeight: params.value ? 'bold' : 'normal' }}>
          {params.value || '-'}
        </Box>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        const isReceived = params.value === 'RECEIVED';
        return <Chip label={params.value} color={isReceived ? 'success' : 'warning'} variant="outlined" />;
      },
    },
  ];

  const processRowUpdate = async (newRow: GridRowModel, oldRow: GridRowModel) => {
    if (newRow.overrideValue !== oldRow.overrideValue) {
      await api.put(`/requisitions/items/${newRow.id}/override`, {
        overrideValue: newRow.overrideValue,
        currentLock: newRow.versionLock,
      });
      return newRow;
    }
    return oldRow;
  };

  const handleConfigChange = (fieldId: string, value: string) => {
    setConfigs((prev) =>
      prev.map((config) => (config.fieldId === fieldId ? { ...config, value } : config)),
    );
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
              {savingConfigs ? 'Salvando...' : 'Salvar Configuracoes de Projeto'}
            </Button>
            <Button variant="contained" color="secondary" onClick={() => api.post(`/tasks/excel/${reqId}`)} disabled={loading}>
              Gerar Export Nimbi
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

      <Paper sx={{ height: 600, width: '100%', p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
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
