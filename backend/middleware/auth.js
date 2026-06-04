import jwt from 'jsonwebtoken';

// SEGURANÇA: JWT_SECRET DEVE estar configurada como variável de ambiente no Railway.
// Em produção, nunca usar o fallback. O servidor recusa iniciar sem ela.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: JWT_SECRET não configurada. Configure no Railway antes de iniciar.');
    process.exit(1);
  } else {
    console.warn('⚠️  JWT_SECRET não configurada. Usando valor de desenvolvimento — NÃO use em produção.');
  }
}
const _JWT_SECRET = JWT_SECRET || 'dev-only-secret-nao-usar-em-producao';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, _JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    _JWT_SECRET,
    { expiresIn: '4h' }
  );
}
