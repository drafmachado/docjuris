import bcrypt from 'bcryptjs';
import { getDB, initDB } from './backend/db.js';

initDB();
const db = getDB();
const hash = bcrypt.hashSync('teste123', 12);
db.prepare('INSERT OR REPLACE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Admin', 'admin@teste.com', hash, 'admin');
console.log('✅ Usuário admin@teste.com criado com senha teste123');
