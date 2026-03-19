import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
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
  MenuItem,
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
} from '@mui/icons-material';
import { api } from '../context/AuthContext';

type BackofficeScaleArea = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type AreaDialogState = {
  open: boolean;
  id?: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
};

export default function BackofficeScalesConfig() {
  const navigate = useNavigate();

  const [areas, setAreas] = useState<BackofficeScaleArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<AreaDialogState>({
    open: false,
    name: '',
    sortOrder: '0',
    isActive: true,
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
      const response = await api.get('/backoffice-scales/catalog');
      setAreas(response.data || []);
    } catch (error) {
      console.error('Failed to fetch backoffice scales catalog', error);
      alert(parseApiErrorMessage(error, 'Erro ao carregar catalogo de balancas retaguarda.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const summary = useMemo(() => {
    const active = areas.filter((area) => area.isActive).length;
    const inactive = areas.length - active;
    return { total: areas.length, active, inactive };
  }, [areas]);

  const openCreateDialog = () => {
    const nextSortOrder = areas.reduce((max, area) => Math.max(max, area.sortOrder), -1) + 1;
    setDialog({
      open: true,
      name: '',
      sortOrder: String(nextSortOrder),
      isActive: true,
    });
  };

  const openEditDialog = (area: BackofficeScaleArea) => {
    setDialog({
      open: true,
      id: area.id,
      name: area.name,
      sortOrder: String(area.sortOrder),
      isActive: area.isActive,
    });
  };

  const closeDialog = () => {
    setDialog({
      open: false,
      name: '',
      sortOrder: '0',
      isActive: true,
    });
  };

  const saveArea = async () => {
    const name = dialog.name.trim();
    if (!name) return;

    const parsedOrder = Number(dialog.sortOrder);
    const sortOrder = Number.isFinite(parsedOrder) ? Math.trunc(parsedOrder) : 0;

    try {
      setSaving(true);
      if (dialog.id) {
        await api.put(`/backoffice-scales/catalog/${dialog.id}`, {
          name,
          sortOrder,
          isActive: dialog.isActive,
        });
      } else {
        await api.post('/backoffice-scales/catalog', {
          name,
          sortOrder,
        });
      }
      closeDialog();
      await fetchData();
    } catch (error) {
      console.error('Failed to save backoffice scale area', error);
      alert(parseApiErrorMessage(error, 'Erro ao salvar area de balancas retaguarda.'));
    } finally {
      setSaving(false);
    }
  };

  const removeArea = async (area: BackofficeScaleArea) => {
    const confirmed = window.confirm(
      `Desativar a area "${area.name}"?\n\nEla deixara de aparecer em novas requisicoes.`,
    );
    if (!confirmed) return;

    try {
      await api.delete(`/backoffice-scales/catalog/${area.id}`);
      await fetchData();
    } catch (error) {
      console.error('Failed to remove backoffice scale area', error);
      alert(parseApiErrorMessage(error, 'Erro ao desativar area de balancas retaguarda.'));
    }
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="primary" onClick={() => navigate('/settings/catalogs')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Catalogo de Areas de Balancas Retaguarda
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
            Nova area
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
            <Chip label={`Total de areas: ${summary.total}`} color="primary" variant="outlined" />
            <Chip label={`Ativas: ${summary.active}`} color="success" variant="outlined" />
            <Chip label={`Inativas: ${summary.inactive}`} color="default" variant="outlined" />
          </Stack>
        </Paper>

        <Paper sx={{ p: 1.5 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : areas.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">Nenhuma area cadastrada.</Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={110}>Ordem</TableCell>
                  <TableCell>Area</TableCell>
                  <TableCell width={140}>Status</TableCell>
                  <TableCell align="right" width={120}>
                    Acoes
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {areas.map((area) => (
                  <TableRow key={area.id}>
                    <TableCell>{area.sortOrder}</TableCell>
                    <TableCell>{area.name}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={area.isActive ? 'Ativa' : 'Inativa'}
                        color={area.isActive ? 'success' : 'default'}
                        variant={area.isActive ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton color="primary" size="small" onClick={() => openEditDialog(area)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton color="error" size="small" onClick={() => removeArea(area)}>
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

      <Dialog open={dialog.open} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{dialog.id ? 'Editar area' : 'Nova area'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="Nome da area"
              value={dialog.name}
              onChange={(event) => setDialog((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Ordem de exibicao"
              type="number"
              value={dialog.sortOrder}
              onChange={(event) => setDialog((prev) => ({ ...prev, sortOrder: event.target.value }))}
              fullWidth
            />
            {dialog.id && (
              <TextField
                select
                label="Status"
                value={dialog.isActive ? 'active' : 'inactive'}
                onChange={(event) => setDialog((prev) => ({ ...prev, isActive: event.target.value === 'active' }))}
                fullWidth
              >
                <MenuItem value="active">Ativa</MenuItem>
                <MenuItem value="inactive">Inativa</MenuItem>
              </TextField>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={closeDialog} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={saveArea} disabled={!dialog.name.trim() || saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
