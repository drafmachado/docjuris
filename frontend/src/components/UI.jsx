// Button
export function Btn({ children, variant = 'primary', size = 'md', loading, disabled, onClick, type = 'button', style }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: 'none', borderRadius: 8, fontFamily: 'inherit',
    cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
    opacity: (disabled || loading) ? 0.6 : 1,
    transition: 'background 0.15s',
    fontWeight: 500,
    ...style,
  };
  const sizes = { sm: { padding: '5px 10px', fontSize: 12 }, md: { padding: '8px 14px', fontSize: 13 }, lg: { padding: '10px 18px', fontSize: 14 } };
  const variants = {
    primary: { background: '#1a3a5c', color: 'white' },
    outline: { background: 'white', color: '#1a1a18', border: '0.5px solid rgba(0,0,0,0.18)' },
    danger: { background: '#fcebeb', color: '#a32d2d', border: '0.5px solid #f09595' },
    ghost: { background: 'transparent', color: '#6b6b68' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} style={{ ...base, ...sizes[size], ...variants[variant] }}>
      {loading ? 'Aguarde...' : children}
    </button>
  );
}

// Badge
export function Badge({ children, color = 'blue' }) {
  const colors = {
    green: { background: '#eaf3de', color: '#3b6d11' },
    amber: { background: '#faeeda', color: '#854f0b' },
    blue: { background: '#e8f0fe', color: '#185fa5' },
    red: { background: '#fcebeb', color: '#a32d2d' },
    gray: { background: '#f1efe8', color: '#5f5e5a' },
  };
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, ...colors[color] }}>
      {children}
    </span>
  );
}

// Card
export function Card({ children, style, padding = '1.25rem' }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, overflow: 'hidden', ...style }}>
      {children}
    </div>
  );
}

// CardHeader
export function CardHeader({ title, action }) {
  return (
    <div style={{ padding: '1rem 1.25rem', borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h3 style={{ fontSize: 14, fontWeight: 500 }}>{title}</h3>
      {action}
    </div>
  );
}

// Modal
export function Modal({ open, onClose, title, children, footer, width = 540 }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.25rem', borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b6b68', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && (
          <div style={{ padding: '1rem 1.25rem', borderTop: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// FormField
export function FormField({ label, children, col }) {
  return (
    <div style={{ gridColumn: col ? `span ${col}` : undefined }}>
      <label style={{ display: 'block', fontSize: 12, color: '#6b6b68', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

// FormGrid
export function FormGrid({ children, cols = 2 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
      {children}
    </div>
  );
}

// SectionTitle
export function SectionTitle({ children }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: '#6b6b68', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '1rem 0 0.75rem', paddingBottom: 6, borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
      {children}
    </p>
  );
}

// Table
// Envolvida em contêiner com rolagem horizontal: em telas estreitas (PWA/celular),
// as colunas que não cabem ficam acessíveis deslizando o dedo — antes eram cortadas.
export function Table({ headers, children, empty }) {
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
    <table style={{ width: '100%', minWidth: Math.max(560, headers.length * 130), borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{ padding: '9px 1.25rem', textAlign: 'left', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b6b68', borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#fafaf8', whiteSpace: 'nowrap' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {children}
        {empty}
      </tbody>
    </table>
    </div>
  );
}

export function Tr({ children, onClick }) {
  return (
    <tr onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}
      onMouseEnter={e => { if(onClick) e.currentTarget.style.background = '#fafaf8'; }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
      {children}
    </tr>
  );
}

export function Td({ children, muted }) {
  return (
    <td style={{ padding: '11px 1.25rem', fontSize: 13, color: muted ? '#6b6b68' : '#1a1a18', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
      {children}
    </td>
  );
}

// Topbar
export function Topbar({ title, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
      <div style={{ display: 'flex', gap: 8 }}>{children}</div>
    </div>
  );
}

// EmptyState
export function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b6b68' }}>
      <div style={{ fontSize: 36, marginBottom: '0.75rem' }}>{icon}</div>
      <p style={{ fontWeight: 500, marginBottom: 4 }}>{title}</p>
      {subtitle && <p style={{ fontSize: 12 }}>{subtitle}</p>}
    </div>
  );
}
