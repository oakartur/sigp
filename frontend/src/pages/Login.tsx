import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  TextField,
  Typography,
  Chip,
  Stack,
} from '@mui/material';
import { AuthContext, api } from '../context/AuthContext';

function decodeTokenPayload(token: string) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
      .join(''),
  );
  return JSON.parse(jsonPayload);
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const token = response.data.access_token;

      try {
        const payload = decodeTokenPayload(token);
        login(token, {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
        });
      } catch {
        login(token, { id: 'unknown', email, role: 'QUANTIFIER' });
      }

      navigate('/');
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Falha no login. Verifique email e senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', py: 4 }}>
      <Container maxWidth="lg">
        <Paper sx={{ overflow: 'hidden', borderRadius: 3 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' },
              minHeight: { md: 560 },
            }}
          >
            <Box
              sx={{
                p: { xs: 3, md: 5 },
                background:
                  'linear-gradient(150deg, rgba(11,95,255,1) 0%, rgba(12,57,133,1) 45%, rgba(15,118,110,1) 100%)',
                color: '#E6EEF8',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 3,
              }}
            >
              <Box>
                <Typography variant="h4" sx={{ color: '#FFFFFF', mb: 1 }}>
                  SIGP
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.95, maxWidth: 520 }}>
                  Plataforma de levantamento de material para projetos de redes, infraestrutura e CFTV.
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label="Catalogo tecnico" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#FFFFFF' }} />
                <Chip label="Versionamento" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#FFFFFF' }} />
                <Chip label="Rastreabilidade" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#FFFFFF' }} />
              </Stack>

              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                Use sua conta corporativa para acessar os projetos.
              </Typography>
            </Box>

            <Box sx={{ p: { xs: 3, md: 5 }, display: 'flex', alignItems: 'center' }}>
              <Box component="form" onSubmit={handleLogin} sx={{ width: '100%' }}>
                <Typography variant="h5" sx={{ mb: 1 }}>
                  Entrar
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Preencha as credenciais para abrir o painel de projetos.
                </Typography>

                {error && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                  </Alert>
                )}

                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="email"
                  label="E-mail"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="password"
                  label="Senha"
                  type="password"
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <Button type="submit" fullWidth variant="contained" disabled={loading} sx={{ mt: 3, py: 1.25 }}>
                  {loading ? 'Entrando...' : 'Acessar sistema'}
                </Button>
              </Box>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
