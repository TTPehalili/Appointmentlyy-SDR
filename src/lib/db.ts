import { WorkflowItem } from '../engine/item-pipeline';
import { encryptSecret, decryptSecret } from './crypto';
import { PRELOADED_WORKFLOW_TEMPLATES } from './workflowTemplates';
import { PLATFORM_TENANT_CODE } from './roles';

export interface ProjectFolderRecord {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRecord {
  id: string;
  name: string;
  description?: string;
  folderId?: string; // ID of ProjectFolderRecord
  active: boolean;
  nodes: any[];
  edges: any[];
  webhookPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'running' | 'success' | 'error';
  startedAt: string;
  finishedAt?: string;
  executionTimeMs?: number;
  triggerSource: 'manual' | 'webhook' | 'schedule' | 'mcp' | 'test';
  nodeOutputs: Record<string, {
    status: 'idle' | 'running' | 'success' | 'error';
    input?: WorkflowItem[];
    output?: WorkflowItem[];
    executionTimeMs?: number;
    error?: string;
  }>;
  error?: string;
}

export interface CredentialRecord {
  id: string;
  name: string;
  type: string;
  encryptedData: string;
  createdAt: string;
  updatedAt: string;
}

export interface EphemeralWebhookListener {
  workflowId: string;
  nodeId: string;
  timestamp: number;
  payload?: any;
  resolve?: (payload: any) => void;
}

// In-Memory and persistent storage store
class WorkflowDatabase {
  private projects: Map<string, ProjectFolderRecord> = new Map();
  private workflows: Map<string, WorkflowRecord> = new Map();
  private executions: Map<string, ExecutionRecord> = new Map();
  private credentials: Map<string, CredentialRecord> = new Map();
  private testListeners: Map<string, EphemeralWebhookListener> = new Map();

  /** `seed` false gives an empty store (client workspaces start clean, with no sample workflows). */
  constructor(seed = true) {
    if (seed) this.seedDefaults();
  }

  // --- Project Folders ---
  async listProjects(): Promise<ProjectFolderRecord[]> {
    return Array.from(this.projects.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async getProject(id: string): Promise<ProjectFolderRecord | null> {
    return this.projects.get(id) || null;
  }

  async saveProject(data: Partial<ProjectFolderRecord> & { name: string }): Promise<ProjectFolderRecord> {
    const id = data.id || `proj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const existing = this.projects.get(id);

    const record: ProjectFolderRecord = {
      id,
      name: data.name,
      description: data.description || existing?.description || '',
      color: data.color || existing?.color || '#ED1C24',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    this.projects.set(id, record);
    return record;
  }

  async deleteProject(id: string): Promise<boolean> {
    const deleted = this.projects.delete(id);
    if (deleted) {
      // Unlink workflows from deleted folder
      for (const [wId, wf] of this.workflows.entries()) {
        if (wf.folderId === id) {
          this.workflows.set(wId, { ...wf, folderId: undefined, updatedAt: new Date().toISOString() });
        }
      }
    }
    return deleted;
  }

  // --- Workflows ---
  async listWorkflows(folderId?: string): Promise<WorkflowRecord[]> {
    const all = Array.from(this.workflows.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    if (folderId !== undefined) {
      return all.filter((w) => w.folderId === folderId);
    }
    return all;
  }

  async getWorkflow(id: string): Promise<WorkflowRecord | null> {
    return this.workflows.get(id) || null;
  }

  async findWorkflowByWebhookPath(path: string): Promise<WorkflowRecord | null> {
    for (const wf of this.workflows.values()) {
      if (wf.webhookPath === path) return wf;
      const webhookNode = wf.nodes.find(
        (n) => n.data?.nodeType === 'webhookTrigger' || n.type === 'webhookTrigger' || n.category === 'trigger'
      );
      if (webhookNode?.data?.config?.path === path || webhookNode?.config?.path === path) {
        return wf;
      }
    }
    return null;
  }

  async saveWorkflow(data: Partial<WorkflowRecord> & { name: string; nodes: any[]; edges: any[] }): Promise<WorkflowRecord> {
    const id = data.id || `wf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const existing = this.workflows.get(id);

    const record: WorkflowRecord = {
      id,
      name: data.name,
      description: data.description || '',
      folderId: data.folderId !== undefined ? data.folderId : existing?.folderId,
      active: data.active ?? existing?.active ?? true,
      nodes: data.nodes,
      edges: data.edges,
      webhookPath: data.webhookPath || existing?.webhookPath,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    this.workflows.set(id, record);
    return record;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    return this.workflows.delete(id);
  }

  async duplicateWorkflow(id: string, newName?: string, targetFolderId?: string): Promise<WorkflowRecord | null> {
    const source = this.workflows.get(id);
    if (!source) return null;

    const newId = `wf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    // Deep clone nodes and edges
    const clonedNodes = JSON.parse(JSON.stringify(source.nodes));
    const clonedEdges = JSON.parse(JSON.stringify(source.edges));

    const duplicate: WorkflowRecord = {
      id: newId,
      name: newName || `${source.name} (Copy)`,
      description: source.description,
      folderId: targetFolderId !== undefined ? targetFolderId : source.folderId,
      active: false, // Start duplicate as draft/inactive
      nodes: clonedNodes,
      edges: clonedEdges,
      webhookPath: source.webhookPath ? `${source.webhookPath}-copy` : undefined,
      createdAt: now,
      updatedAt: now
    };

    this.workflows.set(newId, duplicate);
    return duplicate;
  }

  async moveWorkflow(id: string, targetFolderId?: string): Promise<WorkflowRecord | null> {
    const wf = this.workflows.get(id);
    if (!wf) return null;

    const updated: WorkflowRecord = {
      ...wf,
      folderId: targetFolderId,
      updatedAt: new Date().toISOString()
    };

    this.workflows.set(id, updated);
    return updated;
  }

  // --- Executions ---
  async listExecutions(limit = 50): Promise<ExecutionRecord[]> {
    return Array.from(this.executions.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  async getExecution(id: string): Promise<ExecutionRecord | null> {
    return this.executions.get(id) || null;
  }

  async saveExecution(record: ExecutionRecord): Promise<ExecutionRecord> {
    this.executions.set(record.id, record);
    return record;
  }

  // --- Credentials ---
  async listCredentials(): Promise<{ id: string; name: string; type: string; createdAt: string }[]> {
    return Array.from(this.credentials.values()).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      createdAt: c.createdAt
    }));
  }

  async getCredentialData(id: string): Promise<Record<string, any> | null> {
    const record = this.credentials.get(id);
    if (!record) return null;
    try {
      const decrypted = decryptSecret(record.encryptedData);
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  async saveCredential(name: string, type: string, data: Record<string, any>): Promise<string> {
    const id = `cred-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const encryptedData = encryptSecret(JSON.stringify(data));
    const now = new Date().toISOString();

    this.credentials.set(id, {
      id,
      name,
      type,
      encryptedData,
      createdAt: now,
      updatedAt: now
    });
    return id;
  }

  async deleteCredential(id: string): Promise<boolean> {
    return this.credentials.delete(id);
  }

  // --- Ephemeral Webhook Test Listeners ---
  registerTestListener(workflowId: string, nodeId: string): Promise<any> {
    const key = `${workflowId}:${nodeId}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.testListeners.has(key)) {
          this.testListeners.delete(key);
        }
      }, 60000);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }

      this.testListeners.set(key, {
        workflowId,
        nodeId,
        timestamp: Date.now(),
        resolve: (payload: any) => {
          clearTimeout(timer);
          resolve(payload);
        }
      });
    });
  }

  dispatchTestListener(workflowId: string, nodeId: string, payload: any): boolean {
    const key = `${workflowId}:${nodeId}`;
    const listener = this.testListeners.get(key);
    if (listener && listener.resolve) {
      listener.resolve(payload);
      this.testListeners.delete(key);
      return true;
    }
    return false;
  }

  // Seed default presets
  private seedDefaults() {
    // 1. 21-Day Outbound Cadence Suite
    this.projects.set('proj-cadence', {
      id: 'proj-cadence',
      name: '🚀 21-Day Outbound Cadence Suite',
      description: 'Multi-channel outbound blueprint: Day 1-27 cold emails, phone synergy recaps, and LinkedIn touches',
      color: '#ED1C24',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 2. After-Call Dispositions (Boris Cockpit)
    this.projects.set('proj-dispositions', {
      id: 'proj-dispositions',
      name: '🎯 After-Call Dispositions (Boris Cockpit)',
      description: 'Automated SMS, email, LinkedIn, and CRM workflows triggered on call disposition outcomes',
      color: '#059669',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 3. Speed-to-Lead & Signals
    this.projects.set('proj-speed', {
      id: 'proj-speed',
      name: '⚡ Speed-to-Lead & Inbound Signals',
      description: 'Sub-60s inbound lead ring-downs, instant mobile SMS spikes, and Slack floor countdowns',
      color: '#D97706',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    this.projects.set('proj-qa', {
      id: 'proj-qa',
      name: '🎯 QA & Sparring Automation',
      description: 'ARM framework rubric evaluation, supervisor Slack alerts, and CRM certificate auto-tagging',
      color: '#7C3AED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    this.projects.set('proj-telephony', {
      id: 'proj-telephony',
      name: '📞 Telephony & Inbound Dialers',
      description: 'Hot lead ingest webhooks, automated phone number normalization, and Boris dial-downs',
      color: '#2563EB',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    this.projects.set('proj-voice', {
      id: 'proj-voice',
      name: 'Personal / VoiceChatbot',
      description: 'Conversational voice bots with ElevenLabs TTS, Scribe, and autonomous AI Agent tool routing',
      color: '#4F46E5',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Preload Outbound Cadence & Disposition Workflows
    for (const tpl of PRELOADED_WORKFLOW_TEMPLATES) {
      let folderId = 'proj-cadence';
      if (tpl.category === 'After-Call Dispositions') folderId = 'proj-dispositions';
      else if (tpl.category === 'Speed-to-Lead & Signals') folderId = 'proj-speed';

      this.workflows.set(tpl.id, {
        id: tpl.id,
        name: tpl.name,
        description: tpl.description,
        folderId,
        active: true,
        nodes: tpl.nodes,
        edges: tpl.edges,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    // 0. n8n VoiceChatbot (ElevenLabs + AI Agent)
    this.workflows.set('wf-voice-chatbot', {
      id: 'wf-voice-chatbot',
      name: 'VoiceChatbot',
      description: 'Conversational voice assistant: Inbound Webhook (Listen) ➔ AI Agent ➔ ElevenLabs TTS synthesis with memory & vector tool.',
      folderId: 'proj-voice',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      webhookPath: 'voice-chat',
      nodes: [
        {
          id: 'node-listen',
          type: 'customNode',
          position: { x: 100, y: 160 },
          data: {
            nodeType: 'webhookTrigger',
            label: 'Listen',
            category: 'Triggers',
            icon: 'Webhook',
            isTriggerPill: true,
            config: {
              path: 'voice-chat',
              httpMethod: 'POST',
              responseMode: 'lastNode'
            }
          }
        },
        {
          id: 'node-agent',
          type: 'customNode',
          position: { x: 380, y: 140 },
          data: {
            nodeType: 'aiAgentNode',
            label: 'AI Agent',
            category: 'AI & LLMs',
            icon: 'Bot',
            hasSubHandles: true,
            config: {
              agentGoal: 'Respond concisely to incoming customer query using conversational tone.',
              maxIterations: 3
            }
          }
        },
        {
          id: 'node-elevenlabs',
          type: 'customNode',
          position: { x: 740, y: 140 },
          data: {
            nodeType: 'elevenLabsNode',
            label: 'ElevenLabs2',
            subtitle: 'textToSpeech: speech',
            category: 'App Integrations',
            icon: 'ElevenLabs',
            config: {
              actionCategory: 'speech',
              operation: 'textToSpeech',
              voiceId: '21m00Tcm4TlvDq8ikWAM',
              modelId: 'eleven_turbo_v2_5',
              text: '{{ $json.aiResponse.content || "Hello! Thanks for connecting with Appointmentlyy." }}'
            }
          }
        },
        {
          id: 'node-model',
          type: 'customNode',
          position: { x: 260, y: 350 },
          data: {
            nodeType: 'openAiModelNode',
            label: 'OpenAI',
            subtitle: 'Model: gpt-4o',
            category: 'AI & LLMs',
            icon: 'Bot',
            isSubNode: true,
            config: { model: 'gpt-4o', temperature: 0.7 }
          }
        },
        {
          id: 'node-memory',
          type: 'customNode',
          position: { x: 440, y: 350 },
          data: {
            nodeType: 'windowBufferMemoryNode',
            label: 'Window Buffer Memory',
            subtitle: 'Memory: 5 turns',
            category: 'AI & LLMs',
            icon: 'Memory',
            isSubNode: true,
            config: { windowSize: 5 }
          }
        },
        {
          id: 'node-tool',
          type: 'customNode',
          position: { x: 620, y: 350 },
          data: {
            nodeType: 'vectorStoreToolNode',
            label: 'Vector Store Tool',
            subtitle: 'Tool: solar_playbook',
            category: 'AI & LLMs',
            icon: 'Database',
            isSubNode: true,
            config: { collection: 'solar_objection_playbook' }
          }
        }
      ],
      edges: [
        { id: 'edge-listen-agent', source: 'node-listen', target: 'node-agent', sourceHandle: 'output', targetHandle: 'input', label: 'POST' },
        { id: 'edge-agent-eleven', source: 'node-agent', target: 'node-elevenlabs', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'edge-agent-model', source: 'node-agent', target: 'node-model', sourceHandle: 'output', targetHandle: 'input', style: { strokeDasharray: '4 4' } },
        { id: 'edge-agent-memory', source: 'node-agent', target: 'node-memory', sourceHandle: 'output', targetHandle: 'input', style: { strokeDasharray: '4 4' } },
        { id: 'edge-agent-tool', source: 'node-agent', target: 'node-tool', sourceHandle: 'output', targetHandle: 'input', style: { strokeDasharray: '4 4' } }
      ]
    });

    // 1. Sparring ARM Rubric -> GHL Auto-Tag & Supervisor Slack Escalation
    this.workflows.set('wf-arm-rubric', {
      id: 'wf-arm-rubric',
      name: '⚡ Sparring ARM Rubric ➔ GHL Auto-Tag & Supervisor Escalation',
      description: 'Listens for completed 3-minute AI sparring rounds, evaluates Boris ARM benchmark >= 80%, tags GoHighLevel contact, and alerts Slack.',
      folderId: 'proj-qa',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      webhookPath: 'sparring-finished',
      nodes: [
        {
          id: 'node-1',
          type: 'customNode',
          position: { x: 80, y: 160 },
          data: {
            nodeType: 'webhookTrigger',
            label: 'Sparring Completed Webhook',
            category: 'Triggers',
            icon: 'Webhook',
            config: {
              path: 'sparring-finished',
              httpMethod: 'POST',
              responseMode: 'onReceived'
            }
          }
        },
        {
          id: 'node-2',
          type: 'customNode',
          position: { x: 420, y: 160 },
          data: {
            nodeType: 'ifNode',
            label: 'Evaluate ARM Benchmark (>= 80%)',
            category: 'Logic & Flow',
            icon: 'GitFork',
            config: {
              field: '{{ $json.body.score }}',
              operator: '>=',
              value: 80
            }
          }
        },
        {
          id: 'node-3',
          type: 'customNode',
          position: { x: 760, y: 80 },
          data: {
            nodeType: 'slackNode',
            label: 'Slack Floor Alert',
            category: 'App Integrations',
            icon: 'Slack',
            config: {
              channel: '#floor-supervisors',
              text: '🎉 Rep {{ $node["Sparring Completed Webhook"].json.body.repName }} scored {{ $node["Sparring Completed Webhook"].json.body.score }}% on ARM Sparring!'
            }
          }
        },
        {
          id: 'node-4',
          type: 'customNode',
          position: { x: 760, y: 280 },
          data: {
            nodeType: 'mcpToolCallerNode',
            label: 'Claude 3.5 Coaching Feedback (MCP)',
            category: 'Model Context Protocol (MCP)',
            icon: 'Cpu',
            config: {
              serverSource: 'sse',
              toolName: 'generate_coaching_rubric',
              toolArguments: '{"score": "{{ $node[\'Sparring Completed Webhook\'].json.body.score }}"}'
            }
          }
        }
      ],
      edges: [
        { id: 'e1-2', source: 'node-1', target: 'node-2', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2-3', source: 'node-2', target: 'node-3', sourceHandle: 'true', targetHandle: 'input' },
        { id: 'e2-4', source: 'node-2', target: 'node-4', sourceHandle: 'false', targetHandle: 'input' }
      ]
    });

    // 2. Hot Lead Ingest -> Telephony Boris Dial & Supabase CRM
    this.workflows.set('wf-hot-transfer', {
      id: 'wf-hot-transfer',
      name: '📞 Hot Lead Ingest ➔ Boris Telephony Dial & CRM Enrich',
      description: 'Instant lead qualification via Webhook, AI enrichment via GPT-4o, and automated softphone ring-down.',
      folderId: 'proj-telephony',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      webhookPath: 'inbound-lead',
      nodes: [
        {
          id: 'lead-1',
          type: 'customNode',
          position: { x: 80, y: 180 },
          data: {
            nodeType: 'webhookTrigger',
            label: 'Inbound Webhook Lead',
            category: 'Triggers',
            icon: 'Webhook',
            config: {
              path: 'inbound-lead',
              httpMethod: 'POST',
              responseMode: 'lastNode'
            }
          }
        },
        {
          id: 'lead-2',
          type: 'customNode',
          position: { x: 420, y: 180 },
          data: {
            nodeType: 'codeNode',
            label: 'Normalize & Sanitize Lead Phone',
            category: 'Data & Transforms',
            icon: 'Code',
            config: {
              code: 'const item = $input.first();\nconst phone = (item.json.body?.phone || "").replace(/[^0-9+]/g, "");\nreturn [{ json: { ...item.json.body, normalizedPhone: phone, readyForDial: phone.length >= 10 } }];'
            }
          }
        },
        {
          id: 'lead-3',
          type: 'customNode',
          position: { x: 760, y: 180 },
          data: {
            nodeType: 'httpRequestNode',
            label: 'Boris Telephony Softphone Dial',
            category: 'Core Protocols',
            icon: 'Globe',
            config: {
              method: 'POST',
              url: 'https://api.appointmentlyy.ai/telephony/dial',
              bodyType: 'json',
              bodyContent: '{"destination": "{{ $json.normalizedPhone }}", "agent": "Boris AI"}'
            }
          }
        }
      ],
      edges: [
        { id: 'el-1-2', source: 'lead-1', target: 'lead-2', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'el-2-3', source: 'lead-2', target: 'lead-3', sourceHandle: 'output', targetHandle: 'input' }
      ]
    });
  }
}

// Global Singleton for Next.js hot module reloads
const globalForDb = global as unknown as {
  workflowDatabase?: WorkflowDatabase;
  tenantWorkflowDatabases?: Map<string, WorkflowDatabase>;
};
/**
 * The platform's own store (APPOINTMENTLYY, the demo workspace), seeded with sample workflows.
 * Webhooks, MCP and the runner only ever read this one, so workflows saved in a client
 * workspace's store are drafts that never run on the server.
 */
export const db = globalForDb.workflowDatabase || new WorkflowDatabase();
if (process.env.NODE_ENV !== 'production') globalForDb.workflowDatabase = db;

const tenantDbs = globalForDb.tenantWorkflowDatabases || new Map<string, WorkflowDatabase>();
globalForDb.tenantWorkflowDatabases = tenantDbs;

/**
 * Workflow storage for one workspace. The platform (demo) workspace uses the seeded `db`; every
 * client workspace gets its own empty store, so one workspace never sees another's workflows.
 */
export function workflowDbForTenant(tenantCode: string): WorkflowDatabase {
  if (tenantCode === PLATFORM_TENANT_CODE) return db;
  let store = tenantDbs.get(tenantCode);
  if (!store) {
    store = new WorkflowDatabase(false);
    tenantDbs.set(tenantCode, store);
  }
  return store;
}

export type { WorkflowDatabase };
