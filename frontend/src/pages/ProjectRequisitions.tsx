import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  Container, 
  Paper,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Add as AddIcon, FileCopy as SnapshotIcon } from '@mui/icons-material';
import { AuthContext, api } from '../context/AuthContext';

interface Requisition {
  id: string;
  projectId: string;
  version: number;
  status: 'PENDING' | 'FILLING' | 'COMPLETED';
  isReadOnly: boolean;
}

export default function ProjectRequisitions() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  
  const [projectName, setProjectName] = useState('Carregando Projeto...');
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // O backend /projects retorna um array ou um único objeto. A nossa rota findAll retorna array.
      // E findOne retorna o projeto com as suas requisições inclusas.
      const res = await api.get(`/projects/${projectId}`);
      setProjectName(res.data.name);
      
      // Assumindo que o GET /projects/:id retorna um objeto: { id, name, requisitions: [...] }
      setRequisitions(res.data.requisitions || []);
    } catch (err) {
      console.error('Failed to fetch project details', err);
      setProjectName('Projeto Não Encontrado');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInitial = async () => {
    try {
      setActionLoading(true);
      await api.post(`/requisitions/project/${projectId}`);
      fetchData();
    } catch (err) {
      console.error('Failed to create initial requisition', err);
      alert('Erro ao criar requisição inicial');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateSnapshot = async (existingId: string) => {
    try {
      setActionLoading(true);
      await api.post(`/requisitions/${existingId}/snapshot`);
      fetchData();
    } catch (err) {
      console.error('Failed to create snapshot', err);
      alert('Erro ao criar snapshot (Certifique-se que o atual está COMPLETED)');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'default';
      case 'FILLING': return 'primary';
      case 'COMPLETED': return 'success';
      default: return 'default';
    }
  };

  const isAdminOrQuantifier = user?.role === 'ADMIN' || user?.role === 'QUANTIFIER';

  return (
    <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => navigate('/')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            {projectName}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>
            Requisições e Versões
          </Typography>
          
          {isAdminOrQuantifier && requisitions.length === 0 && (
            <Button 
              variant="contained" 
              startIcon={<AddIcon />}
              onClick={handleCreateInitial}
              disabled={actionLoading}
            >
              Iniciar Requisição (V1)
            </Button>
          )}
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
            <CircularProgress />
          </Box>
        ) : requisitions.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
            <Typography color="text.secondary">Nenhuma requisição iniciada para este projeto.</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} elevation={3} sx={{ borderRadius: 2 }}>
            <Table>
              <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Versão</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Modo</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Ordenar versões decrescentes */}
                {[...requisitions]
                  .sort((a, b) => b.version - a.version)
                  .map((req) => (
                  <TableRow key={req.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell>
                      <Typography fontWeight="bold" color="primary.light">
                        V.{req.version}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={req.status} 
                        color={getStatusColor(req.status) as any} 
                        size="small" 
                        variant={req.isReadOnly ? "outlined" : "filled"}
                      />
                    </TableCell>
                    <TableCell>
                      {req.isReadOnly ? (
                        <Typography variant="body2" color="error.light">Somente Leitura</Typography>
                      ) : (
                        <Typography variant="body2" color="success.light">Permite Edição</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        {isAdminOrQuantifier && req.status === 'COMPLETED' && !requisitions.find(r => r.version > req.version) && (
                          <Button 
                            variant="outlined" 
                            size="small"
                            color="secondary"
                            startIcon={<SnapshotIcon />}
                            onClick={() => handleCreateSnapshot(req.id)}
                            disabled={actionLoading}
                          >
                            Nova Versão (Snap)
                          </Button>
                        )}
                        <Button 
                          variant="contained" 
                          size="small"
                          color="primary"
                          onClick={() => navigate(`/requisition/${req.id}`)}
                        >
                          Abrir Itens
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>
    </Box>
  );
}
