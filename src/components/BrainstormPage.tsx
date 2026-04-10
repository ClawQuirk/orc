import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
} from '@xyflow/react';
import type { Connection, Node, Edge, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { brainstormApi } from '../lib/brainstorm-api';
import { useWorkspaceId } from '../lib/workspace-context';
import type { BrainstormBoard, BoardWithElements } from '../lib/brainstorm-api';
import BrainstormNode from './BrainstormNode';
import BrainstormTabs from './BrainstormTabs';

const nodeTypes = { custom: BrainstormNode };

function dbNodeToFlow(n: any): Node {
  const data = typeof n.data === 'string' ? JSON.parse(n.data) : (n.data || {});
  return {
    id: n.id,
    type: 'custom',
    position: { x: n.position_x, y: n.position_y },
    data: { label: data.label || '', content: data.content || '', color: data.color || '' },
    style: n.width ? { width: n.width, height: n.height } : undefined,
  };
}

function dbEdgeToFlow(e: any): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.source_handle || undefined,
    targetHandle: e.target_handle || undefined,
    type: e.type || undefined,
    label: e.label || undefined,
  };
}

function BrainstormPageInner() {
  const workspaceId = useWorkspaceId();
  const [boards, setBoards] = useState<BrainstormBoard[]>([]);
  const [archivedBoards, setArchivedBoards] = useState<BrainstormBoard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [clipboard, setClipboard] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // Load boards when mount or workspace changes
  useEffect(() => {
    setActiveId(null);
    setNodes([]);
    setEdges([]);
    brainstormApi.listBoards().then(({ boards: all }) => {
      const active = all.filter((b) => b.status === 'active');
      const archived = all.filter((b) => b.status === 'archived');
      setBoards(active);
      setArchivedBoards(archived);
      if (active.length > 0) {
        setActiveId(active[0].id);
      } else {
        // Auto-create first board
        brainstormApi.createBoard('Board 1').then((b) => {
          setBoards([b]);
          setActiveId(b.id);
        });
      }
    });
  }, [workspaceId, setNodes, setEdges]);

  // Node data change callback (passed into custom nodes)
  const handleNodeDataChange = useCallback((nodeId: string, data: { label: string; content: string; color: string }) => {
    if (!activeIdRef.current) return;
    brainstormApi.updateNode(activeIdRef.current, nodeId, { data });
  }, []);

  // Node resize callback
  const handleNodeResizeEnd = useCallback((nodeId: string, width: number, height: number) => {
    if (!activeIdRef.current) return;
    brainstormApi.updateNode(activeIdRef.current, nodeId, { width, height });
  }, []);

  // Load board content when active board changes — inject callbacks directly
  useEffect(() => {
    if (!activeId) return;
    brainstormApi.getBoard(activeId).then((board: BoardWithElements) => {
      setNodes(board.nodes.map((n) => {
        const node = dbNodeToFlow(n);
        node.data = { ...node.data, onDataChange: handleNodeDataChange, onResizeEnd: handleNodeResizeEnd };
        return node;
      }));
      setEdges(board.edges.map(dbEdgeToFlow));
    });
  }, [activeId, setNodes, setEdges, handleNodeDataChange, handleNodeResizeEnd]);

  // Connect edges
  const onConnect = useCallback((connection: Connection) => {
    if (!activeIdRef.current) return;
    brainstormApi.createEdge(activeIdRef.current, {
      source: connection.source,
      target: connection.target,
      source_handle: connection.sourceHandle ?? undefined,
      target_handle: connection.targetHandle ?? undefined,
    }).then(({ id }) => {
      setEdges((eds) => addEdge({ ...connection, id }, eds));
    });
  }, [setEdges]);

  // Delete nodes
  const onNodesDelete = useCallback((deleted: Node[]) => {
    if (!activeIdRef.current) return;
    for (const n of deleted) {
      brainstormApi.deleteNode(activeIdRef.current, n.id);
    }
  }, []);

  // Delete edges
  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    if (!activeIdRef.current) return;
    for (const e of deleted) {
      brainstormApi.deleteEdge(activeIdRef.current, e.id);
    }
  }, []);

  // Drag stop — save positions
  const onNodeDragStop = useCallback((_event: React.MouseEvent, _node: Node, draggedNodes: Node[]) => {
    if (!activeIdRef.current) return;
    const updates = draggedNodes.map((n) => ({
      id: n.id,
      position_x: n.position.x,
      position_y: n.position.y,
    }));
    brainstormApi.batchUpdateNodes(activeIdRef.current, updates);
  }, []);

  // Double-click canvas to create node
  const lastClickRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    const now = Date.now();
    const last = lastClickRef.current;
    const isDoubleClick = now - last.time < 400 && Math.abs(event.clientX - last.x) < 5 && Math.abs(event.clientY - last.y) < 5;
    lastClickRef.current = { time: now, x: event.clientX, y: event.clientY };

    if (!isDoubleClick || !activeIdRef.current || !rfInstance) return;

    const position = rfInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });

    brainstormApi.createNode(activeIdRef.current, {
      position_x: position.x,
      position_y: position.y,
      data: { label: '', content: '', color: 'var(--brainstorm-node-1, #e8d5b7)' },
    }).then(({ id }) => {
      const newNode: Node = {
        id,
        type: 'custom',
        position,
        data: { label: '', content: '', color: 'var(--brainstorm-node-1, #e8d5b7)', onDataChange: handleNodeDataChange, onResizeEnd: handleNodeResizeEnd },
      };
      setNodes((nds) => [...nds, newNode]);
    });
  }, [setNodes, handleNodeDataChange, rfInstance]);

  // Copy/Paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeIdRef.current) return;
      if (e.ctrlKey && e.key === 'c') {
        const selectedNodes = nodes.filter((n) => n.selected);
        if (selectedNodes.length === 0) return;
        const selectedIds = new Set(selectedNodes.map((n) => n.id));
        const connectedEdges = edges.filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target));
        setClipboard({ nodes: selectedNodes, edges: connectedEdges });
      }
      if (e.ctrlKey && e.key === 'v' && clipboard) {
        const boardId = activeIdRef.current;
        const nodeIdMap = new Map<string, string>();

        // Create nodes with offset
        const newNodesData = clipboard.nodes.map((n) => ({
          position_x: n.position.x + 50,
          position_y: n.position.y + 50,
          data: { label: (n.data as any).label || '', content: (n.data as any).content || '', color: (n.data as any).color || '' },
        }));

        Promise.all(
          newNodesData.map((nd, i) =>
            brainstormApi.createNode(boardId, nd).then(({ id }) => {
              nodeIdMap.set(clipboard!.nodes[i].id, id);
              return {
                id,
                type: 'custom' as const,
                position: { x: nd.position_x, y: nd.position_y },
                data: { ...nd.data, onDataChange: handleNodeDataChange, onResizeEnd: handleNodeResizeEnd },
              };
            })
          )
        ).then((newNodes) => {
          setNodes((nds) => [...nds, ...newNodes]);

          // Create remapped edges
          if (clipboard!.edges.length > 0) {
            const newEdges = clipboard!.edges.map((e) => ({
              source: nodeIdMap.get(e.source)!,
              target: nodeIdMap.get(e.target)!,
              source_handle: e.sourceHandle ?? undefined,
              target_handle: e.targetHandle ?? undefined,
            })).filter((e) => e.source && e.target);

            if (newEdges.length > 0) {
              brainstormApi.batchCreateEdges(boardId, newEdges).then(({ ids }) => {
                const flowEdges: Edge[] = ids.map((id, i) => ({
                  id,
                  source: newEdges[i].source,
                  target: newEdges[i].target,
                  sourceHandle: newEdges[i].source_handle,
                  targetHandle: newEdges[i].target_handle,
                }));
                setEdges((eds) => [...eds, ...flowEdges]);
              });
            }
          }
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, clipboard, setNodes, setEdges, handleNodeDataChange]);

  // Board management callbacks
  const handleCreateBoard = useCallback(() => {
    const name = `Board ${boards.length + 1}`;
    brainstormApi.createBoard(name).then((b) => {
      setBoards((prev) => [...prev, b]);
      setActiveId(b.id);
    });
  }, [boards.length]);

  const handleRenameBoard = useCallback((id: string, name: string) => {
    brainstormApi.updateBoard(id, { name } as any).then(() => {
      setBoards((prev) => prev.map((b) => b.id === id ? { ...b, name } : b));
    });
  }, []);

  const handleDuplicateBoard = useCallback((id: string) => {
    brainstormApi.duplicateBoard(id).then(({ id: newId, name }) => {
      brainstormApi.listBoards('active').then(({ boards: active }) => {
        setBoards(active);
        setActiveId(newId);
      });
    });
  }, []);

  const handleArchiveBoard = useCallback((id: string) => {
    brainstormApi.updateBoard(id, { status: 'archived' } as any).then(() => {
      setBoards((prev) => {
        const board = prev.find((b) => b.id === id);
        if (board) setArchivedBoards((a) => [...a, { ...board, status: 'archived' }]);
        const remaining = prev.filter((b) => b.id !== id);
        if (activeId === id) setActiveId(remaining[0]?.id || null);
        return remaining;
      });
    });
  }, [activeId]);

  const handleRestoreBoard = useCallback((id: string) => {
    brainstormApi.updateBoard(id, { status: 'active' } as any).then(() => {
      setArchivedBoards((prev) => {
        const board = prev.find((b) => b.id === id);
        if (board) setBoards((a) => [...a, { ...board, status: 'active' }]);
        return prev.filter((b) => b.id !== id);
      });
    });
  }, []);

  const handleDeleteBoard = useCallback((id: string) => {
    brainstormApi.deleteBoard(id).then(() => {
      setBoards((prev) => {
        const remaining = prev.filter((b) => b.id !== id);
        if (activeId === id) setActiveId(remaining[0]?.id || null);
        return remaining;
      });
      setArchivedBoards((prev) => prev.filter((b) => b.id !== id));
    });
  }, [activeId]);

  return (
    <div className="brainstorm-layout">
      <BrainstormTabs
        boards={boards}
        activeId={activeId}
        archivedBoards={archivedBoards}
        onSelect={setActiveId}
        onCreate={handleCreateBoard}
        onRename={handleRenameBoard}
        onDuplicate={handleDuplicateBoard}
        onArchive={handleArchiveBoard}
        onRestore={handleRestoreBoard}
        onDelete={handleDeleteBoard}
      />
      <div className="brainstorm-canvas">
        {activeId && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onNodeDragStop={onNodeDragStop}
            onPaneClick={onPaneClick}
            onInit={setRfInstance}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
          >
            <Controls />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

export default function BrainstormPage() {
  return (
    <ReactFlowProvider>
      <BrainstormPageInner />
    </ReactFlowProvider>
  );
}
