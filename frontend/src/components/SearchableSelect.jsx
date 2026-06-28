// frontend/src/components/SearchableSelect.jsx
// Dropdown com busca por texto — substitui <select> nativo em listas longas
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export default function SearchableSelect({
  value,           // valor selecionado (id)
  onChange,        // callback(id)
  options,         // [{ value, label }]
  placeholder = 'Selecionar...',
  disabled = false,
  style = {},
}) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const containerRef          = useRef();
  const inputRef              = useRef();

  // Fechar ao clicar fora
  useEffect(() => {
    function handle(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Focar input ao abrir
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const sorted = [...options].sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' })
  );

  const filtered = query.trim()
    ? sorted.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : sorted;

  const selected = options.find(o => String(o.value) === String(value));

  function select(val) {
    onChange(val);
    setOpen(false);
    setQuery('');
  }

  function clear(e) {
    e.stopPropagation();
    onChange('');
    setQuery('');
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      {/* Trigger */}
      <div
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px',
          border: `0.5px solid ${open ? '#1a3a5c' : 'rgba(0,0,0,0.18)'}`,
          borderRadius: 8,
          background: disabled ? '#f5f5f0' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 13,
          color: selected ? '#1a1a18' : '#9a9a97',
          boxShadow: open ? '0 0 0 2px rgba(26,58,92,0.1)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          minHeight: 36,
          userSelect: 'none',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6, flexShrink: 0 }}>
          {selected && !disabled && (
            <span onClick={clear} style={{ display: 'flex', cursor: 'pointer', color: '#9a9a97' }}>
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} color="#6b6b68"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999,
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          overflow: 'hidden',
        }}>
          {/* Campo de busca */}
          <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
              background: '#f5f5f0', borderRadius: 6, padding: '5px 8px' }}>
              <Search size={13} color="#9a9a97" style={{ flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar..."
                style={{
                  border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 12, color: '#1a1a18', width: '100%', padding: 0,
                }}
              />
              {query && (
                <span onClick={() => setQuery('')} style={{ cursor: 'pointer', color: '#9a9a97', display: 'flex' }}>
                  <X size={11} />
                </span>
              )}
            </div>
          </div>

          {/* Lista */}
          <div style={{
            maxHeight: 220,
            overflowY: 'auto',
            /* scrollbar visível e com espessura adequada */
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(0,0,0,0.2) transparent',
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#9a9a97', textAlign: 'center' }}>
                Nenhum resultado encontrado
              </div>
            ) : (
              <>
                {/* Opção vazia (limpar seleção) */}
                <div
                  onClick={() => select('')}
                  style={{
                    padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                    color: '#9a9a97', fontStyle: 'italic',
                    background: !value ? '#f0f4ff' : 'transparent',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f5f5f0'}
                  onMouseLeave={e => e.currentTarget.style.background = !value ? '#f0f4ff' : 'transparent'}
                >
                  {placeholder}
                </div>
                {filtered.map(o => (
                  <div
                    key={o.value}
                    onClick={() => select(o.value)}
                    style={{
                      padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                      background: String(o.value) === String(value) ? '#e8f0fe' : 'transparent',
                      color: String(o.value) === String(value) ? '#1a3a5c' : '#1a1a18',
                      fontWeight: String(o.value) === String(value) ? 600 : 400,
                      borderLeft: String(o.value) === String(value) ? '3px solid #1a3a5c' : '3px solid transparent',
                    }}
                    onMouseEnter={e => { if (String(o.value) !== String(value)) e.currentTarget.style.background = '#f5f5f0'; }}
                    onMouseLeave={e => { if (String(o.value) !== String(value)) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {o.label}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
