// frontend/src/utils/download.js
// Download de arquivos protegidos (/files/*) — links <a href> diretos não enviam
// o token JWT e retornavam "Token não fornecido". Este helper baixa via fetch
// com o header de autorização e dispara o download no navegador.
import toast from 'react-hot-toast';

export async function baixarArquivoAutenticado(caminho, nomeArquivo) {
  const token = localStorage.getItem('docjuris_token');
  const toastId = toast.loading('Baixando arquivo...');
  try {
    const resp = await fetch(caminho, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo || caminho.split('/').pop() || 'arquivo';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Arquivo baixado!', { id: toastId });
  } catch (e) {
    toast.error('Erro ao baixar o arquivo. Tente novamente.', { id: toastId });
  }
}

// Abre o arquivo em nova aba (visualização), autenticado
export async function abrirArquivoAutenticado(caminho) {
  const token = localStorage.getItem('docjuris_token');
  const toastId = toast.loading('Abrindo arquivo...');
  try {
    const resp = await fetch(caminho, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast.dismiss(toastId);
  } catch (e) {
    toast.error('Erro ao abrir o arquivo.', { id: toastId });
  }
}
