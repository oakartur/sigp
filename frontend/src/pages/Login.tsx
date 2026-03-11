import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Container, 
  Paper,
  Alert
} from '@mui/material';
import { AuthContext, api } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      
      // A API retorna o access_token e possivelmente os dados do usuário.
      // O backend do NestJS tipicamente retorna: { access_token: "..." }
      // Precisamos decodificar ou pelo menos assumir o role se não vier.
      // O auth.service do backend retorna: { access_token: string }
      
      const token = response.data.access_token;
      
      // Decodificando JWT básico no frontend apenas para pegar os dados do payload, 
      // ou fazendo uma requisição extra se existisse um endpoint /users/me.
      // Vamos assumir que o payload do JWT tem { sub, email, role } como configurado no backend
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const payload = JSON.parse(jsonPayload);
        
        const userData = {
          id: payload.sub,
          email: payload.email,
          role: payload.role
        };
        
        login(token, userData);
        navigate('/');
        
      } catch (decodeErr) {
        console.error("Erro ao decodificar token", decodeErr);
        // Fallback genérico caso a decodificação falhe
        login(token, { id: 'unknown', email, role: 'QUANTIFIER' });
        navigate('/');
      }
      
    } catch (err: any) {
      setError(err.response?.data?.message || 'Falha ao fazer login. Verifique as credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box 
      sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #121212 0%, #1a1a2e 100%)'
      }}
    >
      <Container maxWidth="xs">
        <Paper 
          elevation={6} 
          sx={{ 
            p: 4, 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            borderRadius: 3,
            borderTop: '4px solid',
            borderColor: 'primary.main',
            bgcolor: 'background.paper',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}
        >
          <Typography component="h1" variant="h4" sx={{ mb: 3, fontWeight: 700, color: 'white' }}>
            SIGP
          </Typography>
          <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary', textAlign: 'center' }}>
            Sistema de Quantificação e Recebimento
          </Typography>

          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleLogin} sx={{ mt: 1, width: '100%' }}>
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
              variant="outlined"
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
              variant="outlined"
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              disabled={loading}
              sx={{ mt: 4, mb: 2, py: 1.5, fontWeight: 600, borderRadius: 2 }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
