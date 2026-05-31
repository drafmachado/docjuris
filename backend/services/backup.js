// backend/services/backup.js
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
 
const __dirname = path.dirname(fileURLToPath(import.meta.url));
 
const FOLDER_ID = '1S430FxBjLfjVLpdXsBfD8l8Hd6IBoBbN';
const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/app/storage/docjuris.db'
  : path.join(__dirname, '../../storage/docjuris.db');
 
const KEEP_DAYS = 30; // mantém últimos 30 backups
 
function getAuth() {
  const credentials = {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };
 
  return new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/drive']
  );
}
 
export async function runBackup() {
  try {
    console.log('🔄 Iniciando backup do banco de dados...');
 
    if (!fs.existsSync(DB_PATH)) {
      console.error('❌ Arquivo do banco não encontrado:', DB_PATH);
      return;
    }
 
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });
 
    // Nome do arquivo com timestamp
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 10); // 2026-05-30
    const filename = `docjuris_backup_${timestamp}.db`;
 
    // Verifica se já existe backup do dia
    const existing = await drive.files.list({
      q: `name='${filename}' and '${FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id, name)',
    });
 
    if (existing.data.files.length > 0) {
      console.log(`ℹ️  Backup do dia ${timestamp} já existe. Pulando.`);
      return;
    }
 
    // Faz upload do banco
    const fileStream = fs.createReadStream(DB_PATH);
    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: 'application/octet-stream',
        body: fileStream,
      },
      fields: 'id, name, size',
    });
 
    console.log(`✅ Backup realizado: ${response.data.name} (${response.data.size} bytes)`);
 
    // Remove backups mais antigos que 30 dias
    const allFiles = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed=false and name contains 'docjuris_backup_'`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime',
    });
 
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
 
    for (const file of allFiles.data.files) {
      if (new Date(file.createdTime) < cutoff) {
        await drive.files.delete({ fileId: file.id });
        console.log(`🗑️  Backup antigo removido: ${file.name}`);
      }
    }
 
  } catch (err) {
    console.error('❌ Erro no backup:', err.message);
  }
}
 
