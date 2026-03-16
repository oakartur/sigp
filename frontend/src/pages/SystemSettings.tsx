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
import {
  ArrowBack as ArrowBackIcon,
  Download as DownloadIcon,
  Settings as SettingsIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';
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

type ImportResponse = {
  summary?: {
    catalog?: {
      localsCreated?: number;
      operationsCreated?: number;
      equipmentsCreated?: number;
      updated?: number;
      skipped?: number;
    };
    projectHeaderFields?: {
      created?: number;
      updated?: number;
      skipped?: number;
    };
    projectsAndActiveVersions?: {
      projectsCreated?: number;
      projectsUpdated?: number;
      requisitionsCreated?: number;
      requisitionsUpdated?: number;
      projectConfigsCreated?: number;
      projectConfigsUpdated?: number;
      projectConfigsSkipped?: number;
      itemsCreated?: number;
      itemsUpdated?: number;
      itemsSkipped?: number;
    };
  };
};

function buildImportResultMessage(data: ImportResponse): string {
  const catalog = data.summary?.catalog;
  const fields = data.summary?.projectHeaderFields;
  const projects = data.summary?.projectsAndActiveVersions;

  if (!catalog && !fields && !projects) {
    return 'Importacao concluida.';
  }

  const lines = ['Importacao concluida.'];

  if (catalog) {
    lines.push(
      `Catalogo: locais +${catalog.localsCreated ?? 0}, operacoes +${catalog.operationsCreated ?? 0}, equipamentos +${catalog.equipmentsCreated ?? 0}, atualizados ${catalog.updated ?? 0}, ignorados ${catalog.skipped ?? 0}.`,
    );
  }

  if (fields) {
    lines.push(
      `Configuracoes de Projeto: criados ${fields.created ?? 0}, atualizados ${fields.updated ?? 0}, ignorados ${fields.skipped ?? 0}.`,
    );
  }

  if (projects) {
    lines.push(
      `Projetos/Versoes: projetos +${projects.projectsCreated ?? 0} (${projects.projectsUpdated ?? 0} atualizados), requisicoes +${projects.requisitionsCreated ?? 0} (${projects.requisitionsUpdated ?? 0} atualizadas), configs +${projects.projectConfigsCreated ?? 0} (${projects.projectConfigsUpdated ?? 0} atualizadas), itens +${projects.itemsCreated ?? 0} (${projects.itemsUpdated ?? 0} atualizados).`,
    );
  }

  return lines.join('\n');
}

export default function SystemSettings() {
  const navigate = useNavigate();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSelection, setExportSelection] = useState<ExportSelection>(defaultSelection);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSelection, setImportSelection] = useState<ExportSelection>(defaultSelection);
  const [importFile, setImportFile] = useState<File | null>(null);

  const canExport = useMemo(
    () =>
      exportSelection.includeCatalog ||
      exportSelection.includeProjectHeaderFields ||
      exportSelection.includeProjectsAndActiveVersions,
    [exportSelection],
  );

  const canImport = useMemo(
    () =>
      importSelection.includeCatalog ||
      importSelection.includeProjectHeaderFields ||
      importSelection.includeProjectsAndActiveVersions,
    [importSelection],
  );

  const toggleExportSelection = (field: keyof ExportSelection) => {
    setExportSelection((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const toggleImportSelection = (field: keyof ExportSelection) => {
    setImportSelection((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleExport = async () => {
    if (!canExport) return;

    try {
      setExporting(true);
      const response = await api.post('/settings/export', exportSelection);

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

  const handleImport = async () => {
    if (!canImport || !importFile) return;

    let parsedPayload: unknown;
    try {
      const fileContent = await importFile.text();
      parsedPayload = JSON.parse(fileContent);
    } catch (error) {
      console.error('Failed to parse import file', error);
      alert('Arquivo de importacao invalido. Use um JSON gerado na exportacao.');
      return;
    }

    try {
      setImporting(true);
      const response = await api.post('/settings/import', {
        ...importSelection,
        payload: parsedPayload,
      });

      alert(buildImportResultMessage(response.data as ImportResponse));
      setImportDialogOpen(false);
      setImportFile(null);
    } catch (error) {
      console.error('Failed to import settings', error);
      alert('Erro ao importar configuracoes.');
    } finally {
      setImporting(false);
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

            <Button
              variant="outlined"
              startIcon={<UploadFileIcon />}
              onClick={() => setImportDialogOpen(true)}
              sx={{ alignSelf: 'flex-start' }}
            >
              Importar configuracoes
            </Button>

            <Typography variant="caption" color="text.secondary">
              A exportacao gera um arquivo JSON. A importacao aplica merge sem duplicar os mesmos registros.
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
                <Checkbox
                  checked={exportSelection.includeCatalog}
                  onChange={() => toggleExportSelection('includeCatalog')}
                />
              }
              label="Catalogo (Locais, Operacoes e Equipamentos)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={exportSelection.includeProjectHeaderFields}
                  onChange={() => toggleExportSelection('includeProjectHeaderFields')}
                />
              }
              label="Configuracoes de Projeto (campos do cabecalho)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={exportSelection.includeProjectsAndActiveVersions}
                  onChange={() => toggleExportSelection('includeProjectsAndActiveVersions')}
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

      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon fontSize="small" />
          Importar configuracoes
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} sx={{ alignSelf: 'flex-start' }}>
              Selecionar arquivo JSON
              <input
                hidden
                type="file"
                accept=".json,application/json"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              />
            </Button>

            <Typography variant="body2" color="text.secondary">
              {importFile ? `Arquivo selecionado: ${importFile.name}` : 'Nenhum arquivo selecionado.'}
            </Typography>

            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={importSelection.includeCatalog}
                    onChange={() => toggleImportSelection('includeCatalog')}
                  />
                }
                label="Catalogo (Locais, Operacoes e Equipamentos)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={importSelection.includeProjectHeaderFields}
                    onChange={() => toggleImportSelection('includeProjectHeaderFields')}
                  />
                }
                label="Configuracoes de Projeto (campos do cabecalho)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={importSelection.includeProjectsAndActiveVersions}
                    onChange={() => toggleImportSelection('includeProjectsAndActiveVersions')}
                  />
                }
                label="Projetos e versoes ativas (nao concluidas)"
              />
            </FormGroup>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={() => setImportDialogOpen(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleImport} disabled={!canImport || !importFile || importing}>
            {importing ? 'Importando...' : 'Importar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
