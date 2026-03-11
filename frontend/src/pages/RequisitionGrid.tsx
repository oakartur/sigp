import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRenderCellParams, GridRowModel } from '@mui/x-data-grid';
import { Box, Typography, Button, Paper, Chip, IconButton } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { api } from '../context/AuthContext';

export default function RequisitionGrid() {
  const { reqId } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Busca a requisição para poder voltar ao projeto
    // E depois os itens
    api.get(`/requisitions/${reqId}/items`)
      .then(res => { setRows(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [reqId]);

  const columns: GridColDef[] = [
    { field: 'equipmentName', headerName: 'Equipamento', width: 200 },
    { field: 'calculatedValue', headerName: 'Qtd Calculada (Fórmula)', width: 200 },
    { 
      field: 'overrideValue', 
      headerName: 'Sobrescrita Admin', 
      width: 200, 
      editable: true,
      renderCell: (params: GridRenderCellParams) => {
        return (
          <Box sx={{ color: params.value ? 'secondary.main' : 'inherit', fontWeight: params.value ? 'bold' : 'normal' }}>
            {params.value || '-'}
          </Box>
        );
      }
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        const isReceived = params.value === 'RECEIVED';
        return <Chip label={params.value} color={isReceived ? 'success' : 'warning'} variant="outlined" />;
      }
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

  return (
    <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default', p: { xs: 1, md: 3 } }}>
      <Paper sx={{ height: 600, width: '100%', p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton edge="start" onClick={() => navigate(-1)} sx={{ mr: 2 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5" color="primary" fontWeight={700}>
              Edição em Massa - Requisição {reqId?.substring(0, 8)}...
            </Typography>
          </Box>
        <Button
          variant="contained"
          color="secondary"
          onClick={() => api.post(`/tasks/excel/${reqId}`)}
        >
          Gerar Export Nimbi
        </Button>
      </Box>
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
