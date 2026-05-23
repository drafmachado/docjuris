import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../storage/docjuris.db');

let db;

export function getDB() {
  if (!db) db = new Database(DB_PATH);
  return db;
}

export function initDB() {
  // Garante que a pasta storage existe
  const storageDir = path.join(__dirname, '../storage');
  const templatesDir = path.join(storageDir, 'templates');
  const pdfsDir = path.join(storageDir, 'pdfs');
  const clientFilesDir = path.join(storageDir, 'client_files');
  [storageDir, templatesDir, pdfsDir, clientFilesDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const db = getDB();

  // Ativar foreign keys
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Tabela de usuários
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'colaborador', -- 'admin' | 'colaborador'
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Tabela de clientes
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      nacionalidade TEXT,
      cpf TEXT,
      rg TEXT,
      orgao_expedidor TEXT,
      endereco TEXT,
      cidade TEXT,
      estado TEXT,
      email TEXT,
      telefone TEXT,
      observacoes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Tabela de arquivos do cliente (docs enviados como RG, CPF, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      uploaded_by INTEGER REFERENCES users(id),
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Tabela de templates
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'contrato' | 'procuracao' | 'declaracao' | 'peticao' | 'outro'
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      -- Campos extraídos automaticamente pelo sistema (JSON array de strings)
      auto_fields TEXT NOT NULL DEFAULT '[]',
      -- Campos a preencher manualmente (JSON array de {key, label, type})
      manual_fields TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Tabela de documentos gerados
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      template_id INTEGER NOT NULL REFERENCES templates(id),
      generated_by INTEGER REFERENCES users(id),
      pdf_filename TEXT,
      docx_filename TEXT,
      -- Campos manuais usados nesta geração (JSON object)
      manual_values TEXT NOT NULL DEFAULT '{}',
      -- Campos auto extraídos usados (JSON object)
      auto_values TEXT NOT NULL DEFAULT '{}',
      email_sent INTEGER NOT NULL DEFAULT 0,
      email_sent_to TEXT,
      email_sent_at TEXT,
      status TEXT NOT NULL DEFAULT 'gerado', -- 'gerado' | 'enviado' | 'erro'
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Cria admin padrão se não existe
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run('Administrador', 'admin@escritorio.com', hash, 'admin');
    console.log('👤 Usuário admin criado: admin@escritorio.com / admin123');
    console.log('⚠️  TROQUE A SENHA após o primeiro login!');
  }

  console.log('🗄️  Banco de dados inicializado');
}
