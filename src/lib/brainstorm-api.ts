export interface BrainstormBoard {
  id: string;
  name: string;
  status: 'active' | 'archived';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BrainstormNodeData {
  label: string;
  content: string;
  color: string;
}

export interface BrainstormNode {
  id: string;
  board_id: string;
  type: string;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  data: BrainstormNodeData;
  style: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainstormEdge {
  id: string;
  board_id: string;
  source: string;
  target: string;
  source_handle: string | null;
  target_handle: string | null;
  type: string | null;
  label: string | null;
  data: string | null;
  style: string | null;
  created_at: string;
}

export interface BoardWithElements extends BrainstormBoard {
  nodes: BrainstormNode[];
  edges: BrainstormEdge[];
}

const json = (r: Response) => r.json();
const headers = { 'Content-Type': 'application/json' };

export const brainstormApi = {
  listBoards: (status?: string): Promise<{ boards: BrainstormBoard[] }> =>
    fetch(`/api/brainstorm/boards${status ? `?status=${status}` : ''}`).then(json),

  getBoard: (id: string): Promise<BoardWithElements> =>
    fetch(`/api/brainstorm/boards/${id}`).then(json),

  createBoard: (name: string): Promise<BrainstormBoard> =>
    fetch('/api/brainstorm/boards', { method: 'POST', headers, body: JSON.stringify({ name }) }).then(json),

  updateBoard: (id: string, data: Partial<BrainstormBoard>): Promise<void> =>
    fetch(`/api/brainstorm/boards/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) }).then(() => {}),

  deleteBoard: (id: string): Promise<void> =>
    fetch(`/api/brainstorm/boards/${id}`, { method: 'DELETE' }).then(() => {}),

  duplicateBoard: (id: string): Promise<{ id: string; name: string }> =>
    fetch(`/api/brainstorm/boards/${id}/duplicate`, { method: 'POST' }).then(json),

  createNode: (boardId: string, data: { position_x: number; position_y: number; width?: number; height?: number; data?: Partial<BrainstormNodeData> }): Promise<{ id: string }> =>
    fetch(`/api/brainstorm/boards/${boardId}/nodes`, { method: 'POST', headers, body: JSON.stringify(data) }).then(json),

  updateNode: (boardId: string, nodeId: string, data: Record<string, unknown>): Promise<void> =>
    fetch(`/api/brainstorm/boards/${boardId}/nodes/${nodeId}`, { method: 'PUT', headers, body: JSON.stringify(data) }).then(() => {}),

  deleteNode: (boardId: string, nodeId: string): Promise<void> =>
    fetch(`/api/brainstorm/boards/${boardId}/nodes/${nodeId}`, { method: 'DELETE' }).then(() => {}),

  batchUpdateNodes: (boardId: string, nodes: Array<Record<string, unknown>>): Promise<void> =>
    fetch(`/api/brainstorm/boards/${boardId}/nodes/batch`, { method: 'PUT', headers, body: JSON.stringify({ nodes }) }).then(() => {}),

  createEdge: (boardId: string, data: { source: string; target: string; source_handle?: string; target_handle?: string; type?: string; label?: string }): Promise<{ id: string }> =>
    fetch(`/api/brainstorm/boards/${boardId}/edges`, { method: 'POST', headers, body: JSON.stringify(data) }).then(json),

  deleteEdge: (boardId: string, edgeId: string): Promise<void> =>
    fetch(`/api/brainstorm/boards/${boardId}/edges/${edgeId}`, { method: 'DELETE' }).then(() => {}),

  batchCreateEdges: (boardId: string, edges: Array<{ source: string; target: string; source_handle?: string; target_handle?: string; type?: string; label?: string }>): Promise<{ ids: string[] }> =>
    fetch(`/api/brainstorm/boards/${boardId}/edges/batch`, { method: 'POST', headers, body: JSON.stringify({ edges }) }).then(json),

  batchDeleteEdges: (boardId: string, ids: string[]): Promise<void> =>
    fetch(`/api/brainstorm/boards/${boardId}/edges/batch`, { method: 'DELETE', headers, body: JSON.stringify({ ids }) }).then(() => {}),
};
