import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Checkbox,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Download as DownloadIcon, Settings as SettingsIcon } from '@mui/icons-material';
import { api } from '../context/AuthContext';

type ExportSelection = {
  includeCatalog: boolean;
  includeProjectHeaderFields: boolean;
  includeProjectsAndActiveVersions: boolean;
};

const defaultSelection: ExportSelection = {
  includeCatalog: true,
  includeProjectHeaderFields: true,
  includeProjectsAndActiveVersions: true,
};

export default function SystemSettings() {
  const navigate = useNavigate();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selection, setSelection] = useState<ExportSelection>(defaultSelection);

  const canExport = useMemo(
    () => selection.includeCatalog || selection.includeProjectHeaderFields || selection.includeProjectsAndActiveVersions,
    [selection],
  );

  const toggleSelection = (field: keyof ExportSelection) => {
    setSelection((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleExport = async () => {
    if (!canExport) return;

    try {
      setExporting(true);
      const response = await api.post('/settings/export', selection);

      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(
        2,
        '0',
      )}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

      const fileName = `sigp_export_configuracoes_${timestamp}.json`;
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportDialogOpen(false);
    } catch (error) {
      console.error('Failed to export settings', error);
      alert('Erro ao exportar configuracoes.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="primary" onClick={() => navigate('/')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Configuracao
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" sx={{ mb: 0.5 }}>
                Configuracoes de Sistema
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Exporte catalogo, configuracoes de projeto e projetos/versoes ativas para importar em outra instancia.
              </Typography>
            </Box>

            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={() => setExportDialogOpen(true)}
              sx={{ alignSelf: 'flex-start' }}
            >
              Exportar todas as configuracoes
            </Button>

            <Typography variant="caption" color="text.secondary">
              A exportacao gera um arquivo JSON com os blocos selecionados.
            </Typography>
          </Stack>
        </Paper>
      </Container>

      <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon fontSize="small" />
          Selecionar blocos para exportacao
        </DialogTitle>
        <DialogContent>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox checked={selection.includeCatalog} onChange={() => toggleSelection('includeCatalog')} />
              }
              label="Catalogo (Locais, Operacoes e Equipamentos)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={selection.includeProjectHeaderFields}
                  onChange={() => toggleSelection('includeProjectHeaderFields')}
                />
              }
              label="Configuracoes de Projeto (campos do cabecalho)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={selection.includeProjectsAndActiveVersions}
                  onChange={() => toggleSelection('includeProjectsAndActiveVersions')}
                />
              }
              label="Projetos e versoes ativas (nao concluidas)"
            />
          </FormGroup>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={() => setExportDialogOpen(false)} disabled={exporting}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleExport} disabled={!canExport || exporting}>
            {exporting ? 'Exportando...' : 'Exportar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
