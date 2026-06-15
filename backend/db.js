import crypto from 'crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/app/storage/docjuris.db'
  : path.join(__dirname, '../storage/docjuris.db');

let db;

export function getDB() {
  if (!db) db = new Database(DB_PATH);
  return db;
}

export function initDB() {
  const storageDir = process.env.NODE_ENV === 'production'
    ? '/app/storage'
    : path.join(__dirname, '../storage');

  const templatesDir = path.join(storageDir, 'templates');
  const pdfsDir = path.join(storageDir, 'pdfs');
  const clientFilesDir = path.join(storageDir, 'client_files');

  [storageDir, templatesDir, pdfsDir, clientFilesDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const db = getDB();

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'colaborador',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS peticoes_geradas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      processo_id INTEGER REFERENCES processos(id),
      tipo_peca TEXT NOT NULL,
      area TEXT,
      fatos TEXT,
      conteudo TEXT,
      buscas TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS honorarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      processo_id INTEGER REFERENCES processos(id),
      descricao TEXT NOT NULL,
      valor_total REAL NOT NULL,
      num_parcelas INTEGER DEFAULT 1,
      valor_parcela REAL,
      vencimento TEXT,
      status TEXT DEFAULT 'pendente',
      data_pagamento TEXT,
      observacoes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS solicitacoes_exclusao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      referencia_id INTEGER NOT NULL,
      referencia_nome TEXT NOT NULL,
      motivo TEXT,
      status TEXT DEFAULT 'pendente',
      solicitado_por INTEGER REFERENCES users(id),
      aprovado_por INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT,
      email TEXT,
      area TEXT DEFAULT 'outro',
      origem TEXT DEFAULT 'outro',
      etapa TEXT DEFAULT 'contato',
      valor_estimado REAL,
      observacoes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads_atividades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS comunicados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mensagem TEXT NOT NULL,
      filtro TEXT DEFAULT 'todos',
      total_destinatarios INTEGER DEFAULT 0,
      enviados INTEGER DEFAULT 0,
      erros INTEGER DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      auto_fields TEXT NOT NULL DEFAULT '[]',
      manual_fields TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      template_id INTEGER NOT NULL REFERENCES templates(id),
      generated_by INTEGER REFERENCES users(id),
      pdf_filename TEXT,
      docx_filename TEXT,
      manual_values TEXT NOT NULL DEFAULT '{}',
      auto_values TEXT NOT NULL DEFAULT '{}',
      email_sent INTEGER NOT NULL DEFAULT 0,
      email_sent_to TEXT,
      email_sent_at TEXT,
      status TEXT NOT NULL DEFAULT 'gerado',
      zapsign_doc_token TEXT,
      signed_pdf_filename TEXT,
      signed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  try { db.exec(`ALTER TABLE documents ADD COLUMN zapsign_doc_token TEXT`); } catch {}
  try { db.exec(`ALTER TABLE documents ADD COLUMN signed_pdf_filename TEXT`); } catch {}
  try { db.exec(`ALTER TABLE documents ADD COLUMN signed_at TEXT`); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS upload_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      template_ids TEXT NOT NULL DEFAULT '[]',
      required_docs TEXT NOT NULL DEFAULT '[]',
      manual_values TEXT NOT NULL DEFAULT '{}',
      message TEXT NOT NULL DEFAULT '',
      received_docs TEXT NOT NULL DEFAULT '[]',
      expires_at TEXT NOT NULL,
      completed_at TEXT,
      signed_at TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS processos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      numero_cnj TEXT NOT NULL,
      vara TEXT,
      comarca TEXT,
      tribunal TEXT,
      tipo TEXT,
      polo_ativo TEXT,
      polo_passivo TEXT,
      observacoes TEXT,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prazos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      titulo TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'prazo',
      data_limite TEXT NOT NULL,
      responsavel_id INTEGER REFERENCES users(id),
      concluido INTEGER NOT NULL DEFAULT 0,
      alerta_enviado INTEGER NOT NULL DEFAULT 0,
      observacoes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS andamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      descricao TEXT NOT NULL,
      tipo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migração: adiciona coluna alerta_enviado se não existir
  try { db.exec('ALTER TABLE prazos ADD COLUMN alerta_enviado INTEGER NOT NULL DEFAULT 0'); } catch {}

  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!adminExists) {
    
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || crypto.randomBytes(16).toString('hex');
    const hash = bcrypt.hashSync(initialPassword, 12);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run('Administrador', 'admin@escritorio.com', hash, 'admin');
    if (process.env.ADMIN_INITIAL_PASSWORD) {
      console.log('👤 Admin criado com senha da variável ADMIN_INITIAL_PASSWORD');
    } else {
      console.warn('⚠️  Senha temporária do admin:', initialPassword);
    }
    console.log('⚠️  TROQUE A SENHA após o primeiro login!');
  }

  console.log('🗄️  Banco de dados inicializado');
}
