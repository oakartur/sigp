import { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Delete as DeleteIcon, Edit as EditIcon, PersonAdd as PersonAddIcon } from '@mui/icons-material';
import type { AxiosError } from 'axios';
import { AuthContext, api } from '../context/AuthContext';

type Role = 'ADMIN' | 'MANAGER' | 'QUANTIFIER' | 'AUDITOR';

interface UserRow {
  id: string;
  email: string;
  role: Role;
}

const roleOptions: Role[] = ['ADMIN', 'MANAGER', 'QUANTIFIER', 'AUDITOR'];

export default function UsersSettings() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<Role>('QUANTIFIER');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUserId, setEditUserId] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<Role>('QUANTIFIER');

  const parseApiErrorMessage = (error: unknown, fallback: string) => {
    const apiError = error as AxiosError<{ message?: string | string[] }>;
    const backendMessage = apiError.response?.data?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(' ');
    return backendMessage || fallback;
  };

  const roleColor = (role: Role) => {
    if (role === 'ADMIN') return 'error';
    if (role === 'MANAGER') return 'secondary';
    if (role === 'AUDITOR') return 'info';
    return 'default';
  };

  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.email.localeCompare(b.email)), [users]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/users');
      setUsers(response.data || []);
    } catch (error) {
      console.error('Failed to load users', error);
      alert(parseApiErrorMessage(error, 'Erro ao carregar usuários.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const resetCreateForm = () => {
    setCreateEmail('');
    setCreatePassword('');
    setCreateRole('QUANTIFIER');
  };

  const openEditDialog = (selected: UserRow) => {
    setEditUserId(selected.id);
    setEditEmail(selected.email);
    setEditPassword('');
    setEditRole(selected.role);
    setEditDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!createEmail.trim() || !createPassword.trim()) return;

    try {
      setActionLoading(true);
      await api.post('/users', {
        email: createEmail.trim(),
        password: createPassword,
        role: createRole,
      });
      setCreateDialogOpen(false);
      resetCreateForm();
      await loadUsers();
    } catch (error) {
      console.error('Failed to create user', error);
      alert(parseApiErrorMessage(error, 'Erro ao criar usuário.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editUserId || !editEmail.trim()) return;

    try {
      setActionLoading(true);
      await api.put(`/users/${editUserId}`, {
        email: editEmail.trim(),
        role: editRole,
        password: editPassword.trim() ? editPassword : undefined,
      });
      setEditDialogOpen(false);
      setEditUserId('');
      setEditPassword('');
      await loadUsers();
    } catch (error) {
      console.error('Failed to update user', error);
      alert(parseApiErrorMessage(error, 'Erro ao atualizar usuário.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (selected: UserRow) => {
    const confirmed = window.confirm(`Excluir o usuário ${selected.email}?`);
    if (!confirmed) return;

    try {
      setActionLoading(true);
      await api.delete(`/users/${selected.id}`);
      await loadUsers();
    } catch (error) {
      console.error('Failed to delete user', error);
      alert(parseApiErrorMessage(error, 'Erro ao excluir usuário.'));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="primary" onClick={() => navigate('/settings/system')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Configuração - Usuários
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Paper sx={{ p: 3, mb: 2 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            spacing={2}
          >
            <Box>
              <Typography variant="h5" sx={{ mb: 0.5 }}>
                Gerenciamento de Usuários
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Criar, editar permissão e excluir usuários do sistema.
              </Typography>
            </Box>

            <Button
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={() => setCreateDialogOpen(true)}
              disabled={actionLoading}
            >
              Novo usuário
            </Button>
          </Stack>
        </Paper>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Permissão</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedUsers.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>
                      <Chip size="small" label={item.role} color={roleColor(item.role) as any} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Tooltip title="Editar usuário">
                          <span>
                            <IconButton size="small" color="primary" onClick={() => openEditDialog(item)} disabled={actionLoading}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={user?.id === item.id ? 'Você não pode excluir seu próprio usuário' : 'Excluir usuário'}>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDelete(item)}
                              disabled={actionLoading || user?.id === item.id}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Novo usuário</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Email"
              value={createEmail}
              onChange={(event) => setCreateEmail(event.target.value)}
            />
            <TextField
              fullWidth
              size="small"
              type="password"
              label="Senha"
              value={createPassword}
              onChange={(event) => setCreatePassword(event.target.value)}
              helperText="Minimo de 6 caracteres"
            />
            <TextField
              fullWidth
              size="small"
              select
              label="Permissão"
              value={createRole}
              onChange={(event) => setCreateRole(event.target.value as Role)}
            >
              {roleOptions.map((role) => (
                <MenuItem key={role} value={role}>
                  {role}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button
            color="inherit"
            onClick={() => {
              setCreateDialogOpen(false);
              resetCreateForm();
            }}
          >
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleCreate} disabled={actionLoading || !createEmail.trim() || !createPassword.trim()}>
            Criar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Editar usuário</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Email"
              value={editEmail}
              onChange={(event) => setEditEmail(event.target.value)}
            />
            <TextField
              fullWidth
              size="small"
              select
              label="Permissão"
              value={editRole}
              onChange={(event) => setEditRole(event.target.value as Role)}
            >
              {roleOptions.map((role) => (
                <MenuItem key={role} value={role}>
                  {role}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              size="small"
              type="password"
              label="Nova senha (opcional)"
              value={editPassword}
              onChange={(event) => setEditPassword(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={() => setEditDialogOpen(false)}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleUpdate} disabled={actionLoading || !editEmail.trim()}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

