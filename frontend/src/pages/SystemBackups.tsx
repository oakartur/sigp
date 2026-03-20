import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Typography,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material';
import { api } from '../context/AuthContext';
import { format } from 'date-fns';

interface BackupInfo {
  filename: string;
  type: 'daily' | 'weekly';
  sizeBytes: number;
  createdAt: string;
}

export default function SystemBackups() {
  const navigate = useNavigate();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const response = await api.get('/backups');
      setBackups(response.data || []);
    } catch (error) {
      console.error('Failed to fetch backups:', error);
      alert('Erro ao carregar backups de disco.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleRestore = async () => {
    if (!restoreTarget) return;

    try {
      setRestoring(true);
      await api.post('/backups/restore', {
        filename: restoreTarget.filename,
        type: restoreTarget.type,
      });
      alert('Banco de dados restaurado com sucesso! Você será deslogado preventivamente.');
      window.location.href = '/sigp/login'; // Força recarregar pra limpar estados cacheados do cliente
    } catch (error) {
      console.error('Error restoring backup:', error);
      alert('Ocorreu um problema ao restaurar o banco de dados. Verifique os logs.');
    } finally {
      setRestoring(false);
      setRestoreTarget(null);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="primary" onClick={() => navigate('/settings/system')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Gerenciamento de Backups Locais
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ flex: 1, py: 3, display: 'flex', flexDirection: 'column' }}>
        <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            Atenção: Os backups da base são salvos fisicamente dentro do Docker Engine pela rotina de agendamento (scripts em bash). Exclusões no disco não ocorrem por aqui, apenas restaurações (Rollbacks de emergência).
          </Typography>
          <Button variant="outlined" onClick={fetchBackups} disabled={loading}>
            Atualizar
          </Button>
        </Paper>

        <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TableContainer sx={{ flex: 1 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Arquivo</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Data/Hora</TableCell>
                  <TableCell align="right">Tamanho</TableCell>
                  <TableCell align="center">Ação Crítica</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                      Nenhum backup encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  backups.map((bkp) => (
                    <TableRow key={bkp.filename} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{bkp.filename}</TableCell>
                      <TableCell>
                        <Chip
                          label={bkp.type === 'daily' ? 'Diário / Horário' : 'Semanal'}
                          size="small"
                          color={bkp.type === 'daily' ? 'default' : 'secondary'}
                        />
                      </TableCell>
                      <TableCell>
                        {format(new Date(bkp.createdAt), 'dd/MM/yyyy HH:mm:ss')}
                      </TableCell>
                      <TableCell align="right">
                        {(bkp.sizeBytes / 1024 / 1024).toFixed(2)} MB
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          startIcon={<RestoreIcon />}
                          onClick={() => setRestoreTarget(bkp)}
                        >
                          Restaurar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>


      {/* Modal de Confirmação Extrema */}
      <Dialog open={!!restoreTarget} onClose={() => !restoring && setRestoreTarget(null)}>
        <DialogTitle sx={{ color: 'error.main' }}>
          Rollback e Substituição de Banco de Dados
        </DialogTitle>
        <DialogContent>
          <DialogContentText paragraph>
            Você está prestes a restaurar o backup <strong>{restoreTarget?.filename}</strong> datado de {restoreTarget && format(new Date(restoreTarget.createdAt), 'dd/MM/yyyy HH:mm:ss')}.
          </DialogContentText>
          <DialogContentText paragraph sx={{ fontWeight: 'bold' }}>
            ATENÇÃO: Este processo usa "pg_restore --clean", e irá DELETAR TODAS as informações atuais do banco de dados (Projetos, Catálogo, Usuários, etc), substituindo integralmente pelo momento em que este backup foi tirado.
          </DialogContentText>
          <DialogContentText>
            Todas as sessões ativas serão desconectadas e o sistema se reiniciará. Deseja mesmo prosseguir?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setRestoreTarget(null)} disabled={restoring} color="inherit">
            Cancelar e Manter Dados
          </Button>
          <Button onClick={handleRestore} disabled={restoring} color="error" variant="contained">
            {restoring ? 'Substituindo banco... (Aguarde)' : 'Sim, DESTRUIR ATUAL e Restaurar Backup'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
