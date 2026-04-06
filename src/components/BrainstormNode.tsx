import { useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from '@xyflow/react';
import type { NodeProps, ResizeParams } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COLORS = [
  'var(--brainstorm-node-1, #e8d5b7)',
  'var(--brainstorm-node-2, #b7d5e8)',
  'var(--brainstorm-node-3, #d5e8b7)',
  'var(--brainstorm-node-4, #e8b7d5)',
  'var(--brainstorm-node-5, #d5b7e8)',
  'var(--brainstorm-node-6, #b7e8d5)',
];

interface BrainstormNodeData {
  label: string;
  content: string;
  color: string;
  onDataChange?: (id: string, data: { label: string; content: string; color: string }) => void;
  onResizeEnd?: (id: string, width: number, height: number) => void;
  [key: string]: unknown;
}

export default function BrainstormNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as BrainstormNodeData;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(nodeData.label || '');
  const [content, setContent] = useState(nodeData.content || '');
  const [color, setColor] = useState(nodeData.color || COLORS[0]);
  const containerRef = useRef<HTMLDivElement>(null);
  const { setNodes } = useReactFlow();

  useEffect(() => {
    setLabel(nodeData.label || '');
    setContent(nodeData.content || '');
    setColor(nodeData.color || COLORS[0]);
  }, [nodeData.label, nodeData.content, nodeData.color]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const newData = { label, content, color };
    // Update ReactFlow state
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...newData } } : n
      )
    );
    // Notify parent for API save
    nodeData.onDataChange?.(id, newData);
  }, [id, label, content, color, setNodes, nodeData]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  }, []);

  // Click-away to save: detect deselection (covers pane + other node clicks)
  // and document mousedown (covers edges, controls, etc.)
  const wasSelected = useRef(selected);
  useEffect(() => {
    if (editing && wasSelected.current && !selected) {
      commitEdit();
    }
    wasSelected.current = selected;
  }, [selected, editing, commitEdit]);

  useEffect(() => {
    if (!editing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as HTMLElement)) {
        commitEdit();
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [editing, commitEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') commitEdit();
  }, [commitEdit]);

  const handleResizeEnd = useCallback((_event: unknown, params: ResizeParams) => {
    nodeData.onResizeEnd?.(id, params.width, params.height);
  }, [id, nodeData]);

  return (
    <div
      ref={containerRef}
      className={`brainstorm-node${editing ? ' editing' : ''}${selected ? ' selected' : ''}`}
      style={{ backgroundColor: color }}
      onDoubleClick={handleDoubleClick}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={150}
        minHeight={60}
        lineClassName="brainstorm-resize-line"
        handleClassName="brainstorm-resize-handle"
        onResizeEnd={handleResizeEnd}
      />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />

      {editing ? (
        <div className="brainstorm-node-inline-edit" onKeyDown={handleKeyDown}>
          <input
            className="brainstorm-inline-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Title"
            autoFocus
          />
          <textarea
            className="brainstorm-inline-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Content"
          />
          <div className="brainstorm-color-swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`brainstorm-swatch${color === c ? ' active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="brainstorm-node-label">{label || 'Double-click to edit'}</div>
          {content && (
            <div className="brainstorm-node-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          )}
        </>
      )}

      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  );
}
