import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Container,
  IconButton,
  Paper,
  Toolbar,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Button,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import { api } from '../context/AuthContext';
import { format } from 'date-fns';

type LogItem = {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: any;
  newValue: any;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export default function SystemLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [loading, setLoading] = useState(true);

  const [filterAction, setFilterAction] = useState<string>('');
  const [filterEntity, setFilterEntity] = useState<string>('');

  const [selectedLog, setSelectedLog] = useState<LogItem | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('skip', String(page * rowsPerPage));
      params.append('take', String(rowsPerPage));
      if (filterAction) params.append('action', filterAction);
      if (filterEntity) params.append('entityType', filterEntity);

      const response = await api.get(`/system-logs?${params.toString()}`);
      setLogs(response.data.items || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Failed to fetch system logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, filterAction, filterEntity]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'success';
      case 'UPDATE':
        return 'primary';
      case 'DELETE':
        return 'error';
      case 'BATCH_UPDATE':
        return 'warning';
      default:
        return 'default';
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
            Auditoria / Logs do Sistema
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ flex: 1, py: 3, display: 'flex', flexDirection: 'column' }}>
        <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mr: 2 }}>
            Filtros
          </Typography>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Ação</InputLabel>
            <Select
              value={filterAction}
              label="Ação"
              onChange={(e) => {
                setFilterAction(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value=""><em>Todas</em></MenuItem>
              <MenuItem value="CREATE">Criação</MenuItem>
              <MenuItem value="UPDATE">Edição</MenuItem>
              <MenuItem value="DELETE">Exclusão</MenuItem>
              <MenuItem value="BATCH_UPDATE">Lote (Importação)</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Entidade</InputLabel>
            <Select
              value={filterEntity}
              label="Entidade"
              onChange={(e) => {
                setFilterEntity(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value=""><em>Todas</em></MenuItem>
              <MenuItem value="PROJECT">Projeto</MenuItem>
              <MenuItem value="REQUISITION">Requisição / Versão</MenuItem>
              <MenuItem value="EQUIPMENT">Equipamento</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" onClick={() => fetchLogs()} disabled={loading}>
            Atualizar
          </Button>
        </Paper>

        <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TableContainer sx={{ flex: 1 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Data / Hora</TableCell>
                  <TableCell>Usuário</TableCell>
                  <TableCell>Ação</TableCell>
                  <TableCell>Entidade</TableCell>
                  <TableCell>ID Entidade</TableCell>
                  <TableCell align="center">Detalhes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      Nenhum log encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id} hover>
                      <TableCell>{format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm:ss')}</TableCell>
                      <TableCell>
                        {log.user ? (
                          <Stack>
                            <Typography variant="body2">{log.user.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{log.user.email}</Typography>
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.secondary">Sistema</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip label={log.action} size="small" color={getActionColor(log.action) as any} />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{log.entityType}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.entityId}</TableCell>
                      <TableCell align="center">
                        <IconButton size="small" color="primary" onClick={() => setSelectedLog(log)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[15, 50, 100]}
            labelRowsPerPage="Linhas por página:"
          />
        </Paper>
      </Container>


      {/* Modal de Detalhes */}
      <Dialog open={!!selectedLog} onClose={() => setSelectedLog(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          Detalhes do Log
        </DialogTitle>
        <DialogContent dividers>
          {selectedLog && (
            <Stack spacing={3}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Data/Hora</Typography>
                  <Typography variant="body2">{format(new Date(selectedLog.createdAt), 'dd/MM/yyyy HH:mm:ss')}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Usuário</Typography>
                  <Typography variant="body2">{selectedLog.user ? `${selectedLog.user.name} (${selectedLog.user.email})` : 'Sistema'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Tipo da Ação</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip label={selectedLog.action} size="small" color={getActionColor(selectedLog.action) as any} />
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Entidade Afeada</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{selectedLog.entityType} ({selectedLog.entityId})</Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, '& > *': { flex: 1, overflow: 'hidden' } }}>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: '#fafafa' }}>
                  <Typography variant="subtitle2" color="error.main" sx={{ mb: 1 }}>Valor Antigo {selectedLog.action === 'CREATE' && '(N/A)'}</Typography>
                  <Box sx={{ 
                    maxHeight: 300, 
                    overflow: 'auto', 
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}>
                    {selectedLog.oldValue ? JSON.stringify(selectedLog.oldValue, null, 2) : <em>Não se aplica</em>}
                  </Box>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f5f9ff' }}>
                  <Typography variant="subtitle2" color="primary.main" sx={{ mb: 1 }}>Valor Novo {selectedLog.action === 'DELETE' && '(N/A)'}</Typography>
                  <Box sx={{ 
                    maxHeight: 300, 
                    overflow: 'auto', 
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}>
                    {selectedLog.newValue ? JSON.stringify(selectedLog.newValue, null, 2) : <em>Não se aplica</em>}
                  </Box>
                </Paper>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedLog(null)} color="primary">Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
