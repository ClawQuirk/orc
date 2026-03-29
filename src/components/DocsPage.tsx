export default function DocsPage() {
  return (
    <div className="page-content">
      <h2>Docs</h2>
      <p className="page-description">Documents, spreadsheets, and presentations from connected services.</p>
      <div className="page-placeholder">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <h3>Coming Soon</h3>
        <p>Browse Google Drive documents, view recent edits, and link files to projects — all without leaving Orc.</p>
      </div>
    </div>
  );
}
