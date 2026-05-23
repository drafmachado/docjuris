import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDB } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware, adminOnly);

// GET /api/users
router.get('/', (req, res) => {
  const db = getDB();
  const users = db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at').all();
  res.json(users);
});

// POST /api/users — cria novo colaborador
router.post('/', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
  if (!['admin', 'colaborador'].includes(role)) return res.status(400).json({ error: 'Perfil inválido' });

  const db = getDB();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
  `).run(name, email.toLowerCase().trim(), hash, role || 'colaborador');

  const user = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(user);
});

// PUT /api/users/:id
router.put('/:id', (req, res) => {
  const db = getDB();
  const { name, email, role, active, password } = req.body;

  // Impede remover o próprio admin
  if (req.params.id == req.user.id && active === false) {
    return res.status(400).json({ error: 'Você não pode desativar sua própria conta' });
  }

  let updateSql = 'UPDATE users SET name = ?, email = ?, role = ?, active = ?';
  const params = [name, email?.toLowerCase().trim(), role, active ? 1 : 0];

  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
    updateSql += ', password_hash = ?';
    params.push(bcrypt.hashSync(password, 10));
  }

  updateSql += ' WHERE id = ?';
  params.push(req.params.id);

  db.prepare(updateSql).run(...params);
  res.json({ success: true });
});

// DELETE /api/users/:id — desativa
router.delete('/:id', (req, res) => {
  if (req.params.id == req.user.id) {
    return res.status(400).json({ error: 'Você não pode remover sua própria conta' });
  }
  const db = getDB();
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
