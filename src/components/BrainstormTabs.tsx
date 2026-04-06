import { useState, useRef, useEffect, useCallback } from 'react';
import type { BrainstormBoard } from '../lib/brainstorm-api';

interface BrainstormTabsProps {
  boards: BrainstormBoard[];
  activeId: string | null;
  archivedBoards: BrainstormBoard[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function BrainstormTabs({
  boards, activeId, archivedBoards, onSelect, onCreate, onRename, onDuplicate, onArchive, onRestore, onDelete,
}: BrainstormTabsProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; boardId: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus();
  }, [renamingId]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, boardId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, boardId });
  }, []);

  const startRename = useCallback((boardId: string) => {
    const board = boards.find((b) => b.id === boardId);
    if (board) { setRenamingId(boardId); setRenameValue(board.name); }
    setContextMenu(null);
  }, [boards]);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }, [renamingId, renameValue, onRename]);

  return (
    <div className="brainstorm-tabs-wrapper">
      <div className="brainstorm-tabs">
        {boards.map((b) => (
          <div
            key={b.id}
            className={`brainstorm-tab${b.id === activeId ? ' active' : ''}`}
            onClick={() => onSelect(b.id)}
            onContextMenu={(e) => handleContextMenu(e, b.id)}
            onDoubleClick={() => startRename(b.id)}
          >
            {renamingId === b.id ? (
              <input
                ref={renameRef}
                className="brainstorm-tab-rename"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span>{b.name}</span>
            )}
          </div>
        ))}
        <button className="brainstorm-tab brainstorm-tab-add" onClick={onCreate} title="New board">+</button>
      </div>

      {contextMenu && (
        <div className="brainstorm-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => startRename(contextMenu.boardId)}>Rename</button>
          <button onClick={() => { onDuplicate(contextMenu.boardId); setContextMenu(null); }}>Duplicate</button>
          <button onClick={() => { onArchive(contextMenu.boardId); setContextMenu(null); }}>Archive</button>
          <hr />
          <button className="danger" onClick={() => { onDelete(contextMenu.boardId); setContextMenu(null); }}>Delete</button>
        </div>
      )}

      {archivedBoards.length > 0 && (
        <div className="brainstorm-archive">
          <button className="brainstorm-archive-toggle" onClick={() => setArchiveOpen(!archiveOpen)}>
            {archiveOpen ? '▾' : '▸'} Archived ({archivedBoards.length})
          </button>
          {archiveOpen && (
            <div className="brainstorm-archive-list">
              {archivedBoards.map((b) => (
                <div key={b.id} className="brainstorm-archive-item">
                  <span>{b.name}</span>
                  <div className="brainstorm-archive-actions">
                    <button onClick={() => onRestore(b.id)} title="Restore">↩</button>
                    <button className="danger" onClick={() => onDelete(b.id)} title="Delete">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
