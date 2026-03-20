import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import {
  AppBar,
  Box,
  Button,
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
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';
import { api } from '../context/AuthContext';

type UnitCost = {
  id: string;
  code: string;
  description: string;
  cost: number;
};

type CostDialogState = {
  open: boolean;
  id?: string;
  code: string;
  description: string;
  cost: string;
};

export default function UnitCostsConfig() {
  const navigate = useNavigate();

  const [costs, setCosts] = useState<UnitCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dialog, setDialog] = useState<CostDialogState>({
    open: false,
    code: '',
    description: '',
    cost: '',
  });

  const parseApiErrorMessage = (error: unknown, fallback: string) => {
    const apiError = error as AxiosError<{ message?: string | string[] }>;
    const backendMessage = apiError.response?.data?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(' ');
    return backendMessage || fallback;
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/unit-costs');
      setCosts(response.data || []);
    } catch (error) {
      console.error('Failed to fetch unit costs', error);
      alert(parseApiErrorMessage(error, 'Erro ao carregar custos unitários.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const openCreateDialog = () => {
    setDialog({
      open: true,
      code: '',
      description: '',
      cost: '',
    });
  };

  const openEditDialog = (costItem: UnitCost) => {
    setDialog({
      open: true,
      id: costItem.id,
      code: costItem.code,
      description: costItem.description,
      cost: costItem.cost.toString().replace('.', ','),
    });
  };

  const closeDialog = () => {
    setDialog({
      open: false,
      code: '',
      description: '',
      cost: '',
    });
  };

  const saveCost = async () => {
    const code = dialog.code.trim();
    if (!code) return;

    const parsedCost = parseFloat(dialog.cost.replace(',', '.'));
    const cost = isNaN(parsedCost) ? 0 : parsedCost;

    try {
      setSaving(true);
      await api.post('/unit-costs', {
        code,
        description: dialog.description.trim(),
        cost,
      });
      closeDialog();
      await fetchData();
    } catch (error) {
      console.error('Failed to save cost', error);
      alert(parseApiErrorMessage(error, 'Erro ao salvar o custo.'));
    } finally {
      setSaving(false);
    }
  };

  const removeCost = async (costItem: UnitCost) => {
    const confirmed = window.confirm(
      `Remover o custo unitário do equipamento "${costItem.description}"?`,
    );
    if (!confirmed) return;

    try {
      await api.delete(`/unit-costs/${costItem.id}`);
      await fetchData();
    } catch (error) {
      console.error('Failed to remove cost', error);
      alert(parseApiErrorMessage(error, 'Erro ao remover o custo.'));
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setImporting(true);
      const response = await api.post('/unit-costs/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      alert(`Importação concluída: ${response.data?.processed} registros processados.`);
      await fetchData();
    } catch (error) {
      console.error('Failed to import csv', error);
      alert(parseApiErrorMessage(error, 'Erro ao importar CSV de custos.'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="primary" onClick={() => navigate('/settings')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Custo Unitário
          </Typography>
          <input
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button
            variant="outlined"
            startIcon={importing ? <CircularProgress size={20} /> : <UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            sx={{ mr: 2, bgcolor: 'background.paper' }}
          >
            Importar CSV
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
            Novo custo
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Paper sx={{ p: 1.5 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : costs.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">Nenhum custo cadastrado.</Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width="15%">Código</TableCell>
                  <TableCell width="50%">Equipamento</TableCell>
                  <TableCell width="20%">Custo Unitário</TableCell>
                  <TableCell align="right" width="15%">
                    Ações
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {costs.map((cost) => (
                  <TableRow key={cost.id}>
                    <TableCell>{cost.code}</TableCell>
                    <TableCell>{cost.description}</TableCell>
                    <TableCell>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cost.cost)}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton color="primary" size="small" onClick={() => openEditDialog(cost)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton color="error" size="small" onClick={() => removeCost(cost)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Container>

      <Dialog open={dialog.open} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog.id ? 'Editar Custo' : 'Novo Custo'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="Código"
              value={dialog.code}
              onChange={(event) => setDialog((prev) => ({ ...prev, code: event.target.value }))}
              fullWidth
              disabled={!!dialog.id}
            />
            <TextField
              label="Equipamento"
              value={dialog.description}
              onChange={(event) => setDialog((prev) => ({ ...prev, description: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Custo"
              value={dialog.cost}
              onChange={(event) => setDialog((prev) => ({ ...prev, cost: event.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={closeDialog} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={saveCost} disabled={!dialog.code.trim() || saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
