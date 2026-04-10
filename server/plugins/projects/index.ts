import { readFileSync, existsSync } from 'node:fs';
import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { regenerateProjectMarkdown, getProjectMarkdownPath } from '../../projects/markdown-gen.js';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3-multiple-ciphers';

const manifest: PluginManifest = {
  id: 'orc-projects',
  name: 'Projects',
  description: 'Create, manage, and track projects with epics and tasks',
  version: '0.1.0',
  icon: 'folder',
  category: 'documents',
  requiresAuth: false,
  authType: 'none',
  toolPrefix: 'projects',
  connection: 'local',
};

const WORKSPACE_PROP = {
  workspaceId: {
    type: 'string',
    description: 'Workspace ID to scope the operation. Defaults to "home" if omitted.',
  },
};

const tools: PluginToolDefinition[] = [
  {
    name: 'projects_list',
    description: 'List all projects with their status, epic count, and task count.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        status: { type: 'string', description: 'Filter by status (active, paused, completed, archived). Omit for all.' },
      },
    },
  },
  {
    name: 'projects_get',
    description: 'Get the full project context as markdown. This is the primary way to read project details including summary, links, epics, tasks, and recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        projectId: { type: 'string', description: 'Project ID' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'projects_create',
    description: 'Create a new project in the given workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        name: { type: 'string', description: 'Project name' },
        summary: { type: 'string', description: 'Project summary (optional)' },
        effort_estimate: { type: 'string', description: 'Effort estimate, e.g. "3 weeks" (optional)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'projects_add_epic',
    description: 'Add an epic to a project.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        projectId: { type: 'string', description: 'Project ID' },
        title: { type: 'string', description: 'Epic title' },
        description: { type: 'string', description: 'Epic description (optional)' },
        effort_estimate: { type: 'string', description: 'Effort estimate (optional)' },
      },
      required: ['projectId', 'title'],
    },
  },
  {
    name: 'projects_add_task',
    description: 'Add a task to an epic within a project.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        projectId: { type: 'string', description: 'Project ID' },
        epicId: { type: 'string', description: 'Epic ID to add the task to' },
        title: { type: 'string', description: 'Task title' },
        effort_estimate: { type: 'string', description: 'Effort estimate (optional)' },
      },
      required: ['projectId', 'epicId', 'title'],
    },
  },
  {
    name: 'projects_update_status',
    description: 'Update the status of a project, epic, or task.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        projectId: { type: 'string', description: 'Project ID' },
        epicId: { type: 'string', description: 'Epic ID (if updating an epic or to identify context)' },
        taskId: { type: 'string', description: 'Task ID (if updating a task)' },
        status: { type: 'string', description: 'New status. Projects: active/paused/completed/archived. Epics/tasks: todo/in_progress/done.' },
      },
      required: ['projectId', 'status'],
    },
  },
  {
    name: 'projects_recommend',
    description: 'Submit an AI recommendation for a project. The user will see it in the UI and can accept or decline it.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        projectId: { type: 'string', description: 'Project ID' },
        text: { type: 'string', description: 'Recommendation text' },
      },
      required: ['projectId', 'text'],
    },
  },
];

export class ProjectsPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private db: Database.Database | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    this.db = deps.db;
    deps.logger('Projects plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.db) return { content: [{ type: 'text', text: 'Database not initialized' }], isError: true };
    const db = this.db;
    const now = () => new Date().toISOString();
    const wsId = (args.workspaceId as string) || 'home';

    // Guard: verify a project belongs to the current workspace for scoped ops
    const ownsProject = (projectId: string): boolean => {
      const row = db.prepare('SELECT workspace_id FROM projects WHERE id = ?').get(projectId) as any;
      return row && row.workspace_id === wsId;
    };

    try {
      switch (toolName) {
        case 'projects_list': {
          const status = args.status as string | undefined;
          const rows = status
            ? db.prepare('SELECT * FROM projects WHERE workspace_id = ? AND status = ? ORDER BY updated_at DESC').all(wsId, status)
            : db.prepare('SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC').all(wsId);
          const projects = (rows as any[]).map((p) => {
            const epicCount = (db.prepare('SELECT COUNT(*) as c FROM epics WHERE project_id = ?').get(p.id) as any).c;
            const taskCount = (db.prepare('SELECT COUNT(*) as c FROM tasks WHERE project_id = ?').get(p.id) as any).c;
            const doneCount = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND status = 'done'").get(p.id) as any).c;
            return `**${p.name}** [${p.status}] — ${epicCount} epics, ${taskCount} tasks (${doneCount} done)${p.effort_estimate ? ` — Effort: ${p.effort_estimate}` : ''}\n[ID: ${p.id}]`;
          });
          return { content: [{ type: 'text', text: projects.length ? projects.join('\n\n') : 'No projects found.' }] };
        }

        case 'projects_get': {
          if (!ownsProject(args.projectId as string)) {
            return { content: [{ type: 'text', text: 'Project not found in this workspace.' }], isError: true };
          }
          const mdPath = getProjectMarkdownPath(args.projectId as string);
          if (!existsSync(mdPath)) {
            regenerateProjectMarkdown(args.projectId as string);
          }
          if (existsSync(mdPath)) {
            return { content: [{ type: 'text', text: readFileSync(mdPath, 'utf-8') }] };
          }
          return { content: [{ type: 'text', text: 'Project not found.' }], isError: true };
        }

        case 'projects_create': {
          const id = randomUUID();
          const ts = now();
          db.prepare('INSERT INTO projects (id, workspace_id, name, summary, effort_estimate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(id, wsId, args.name, (args.summary as string) || null, (args.effort_estimate as string) || null, ts, ts);
          regenerateProjectMarkdown(id);
          return { content: [{ type: 'text', text: `Project created: "${args.name}" [ID: ${id}]` }] };
        }

        case 'projects_add_epic': {
          if (!ownsProject(args.projectId as string)) {
            return { content: [{ type: 'text', text: 'Project not found in this workspace.' }], isError: true };
          }
          const id = randomUUID();
          const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM epics WHERE project_id = ?').get(args.projectId) as any)?.m ?? -1;
          db.prepare('INSERT INTO epics (id, project_id, title, description, effort_estimate, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, args.projectId, args.title, (args.description as string) || null, (args.effort_estimate as string) || null, maxOrder + 1);
          db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), args.projectId);
          regenerateProjectMarkdown(args.projectId as string);
          return { content: [{ type: 'text', text: `Epic added: "${args.title}" [ID: ${id}]` }] };
        }

        case 'projects_add_task': {
          if (!ownsProject(args.projectId as string)) {
            return { content: [{ type: 'text', text: 'Project not found in this workspace.' }], isError: true };
          }
          const id = randomUUID();
          const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM tasks WHERE epic_id = ?').get(args.epicId) as any)?.m ?? -1;
          db.prepare('INSERT INTO tasks (id, epic_id, project_id, title, effort_estimate, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, args.epicId, args.projectId, args.title, (args.effort_estimate as string) || null, maxOrder + 1);
          db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), args.projectId);
          regenerateProjectMarkdown(args.projectId as string);
          return { content: [{ type: 'text', text: `Task added: "${args.title}" [ID: ${id}]` }] };
        }

        case 'projects_update_status': {
          const { projectId, epicId, taskId, status } = args as Record<string, string>;
          if (!ownsProject(projectId)) {
            return { content: [{ type: 'text', text: 'Project not found in this workspace.' }], isError: true };
          }
          if (taskId) {
            db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), taskId);
          } else if (epicId) {
            db.prepare('UPDATE epics SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), epicId);
          } else {
            db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), projectId);
          }
          regenerateProjectMarkdown(projectId);
          return { content: [{ type: 'text', text: `Status updated to "${status}"` }] };
        }

        case 'projects_recommend': {
          if (!ownsProject(args.projectId as string)) {
            return { content: [{ type: 'text', text: 'Project not found in this workspace.' }], isError: true };
          }
          const id = randomUUID();
          db.prepare('INSERT INTO project_recommendations (id, project_id, text) VALUES (?, ?, ?)')
            .run(id, args.projectId, args.text);
          db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), args.projectId);
          regenerateProjectMarkdown(args.projectId as string);
          return { content: [{ type: 'text', text: `Recommendation submitted for user review: "${args.text}"` }] };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Projects error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}
}
