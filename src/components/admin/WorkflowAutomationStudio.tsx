'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  type ReactFlowInstance
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Play,
  Plus,
  Clock,
  Save,
  CheckCircle2,
  Workflow,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Copy,
  FolderInput,
  Edit,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  RotateCcw,
  RotateCw,
  Share2,
  MoreHorizontal,
  Tag,
  ArrowLeft
} from 'lucide-react';

import { Button, IconButton, Kbd } from '@/components/ui';
import { WorkflowCanvasNode } from '../canvas/WorkflowCanvasNode';
import AddNodeModal from '../palette/AddNodeModal';
import NodeConfigDrawer from '../panels/NodeConfigDrawer';
import ExecutionHistoryDrawer from '../panels/ExecutionHistoryDrawer';
import ProjectModal from '../panels/ProjectManagerModal';
import {
  MoveWorkflowModal,
  DuplicateWorkflowModal,
  WorkflowSettingsModal
} from '../panels/WorkflowActionModals';
import { INodeDefinition } from '@/registry';
import { ProjectFolderRecord, WorkflowRecord } from '@/lib/db';
import { useSession } from '@/lib/session';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import { scrubDemoDeep, type CanvasEdgeLite, type CanvasNodeLite, type CanvasProposal } from '@/lib/workflowAssistant';
import WorkflowAssistantWidget, { type ApplyResult, type CanvasGraph } from '../workflows/WorkflowAssistantWidget';

// Connector look: ink-300 at rest, crimson on hover or select (presentational only).
const EDGE_STYLE = { stroke: 'var(--ink-300)', strokeWidth: 2 };
const EDGE_HOVER_CLS =
  String.raw`[&_.react-flow\_\_edge:hover_.react-flow\_\_edge-path]:!stroke-[var(--brand-500)] ` +
  String.raw`[&_.react-flow\_\_edge.selected_.react-flow\_\_edge-path]:!stroke-[var(--brand-500)]`;

const nodeTypes = {
  customNode: WorkflowCanvasNode
};

interface WorkflowAutomationStudioProps {
  initialWorkflowId?: string;
  onBackToList?: () => void;
  /** Just built by the assistant: open its chat and walk through the checklist. */
  autoAssist?: boolean;
  onAutoAssistDone?: () => void;
}

export default function WorkflowAutomationStudio({
  initialWorkflowId,
  onBackToList,
  autoAssist = false,
  onAutoAssistDone
}: WorkflowAutomationStudioProps) {
  const { role } = useSession();
  // Only platform staff can switch workflows on or run them; workspace admins build drafts.
  const isStaff = role === 'Super Admin';
  const isDemo = useDemoWorkspace();
  const [projects, setProjects] = useState<ProjectFolderRecord[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>(
    initialWorkflowId || 'wf-voice-chatbot'
  );
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowRecord | null>(null);

  // View Mode: 'Editor' vs 'Executions' (matching n8n top center pill)
  const [viewMode, setViewMode] = useState<'editor' | 'executions'>('editor');

  // React Flow state - STRICTLY STATIC connecting lines (animated: false)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // UI Drawer & Modal States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Collapsed by default for clean canvas
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'proj-voice': true,
    'proj-qa': true,
    'proj-telephony': true,
    ungrouped: true
  });

  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false);
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runSuccess, setRunSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadedWorkflowId, setLoadedWorkflowId] = useState<string | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);

  // Project modal states
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectFolderRecord | null>(null);

  // Workflow Action modals
  const [movingWorkflow, setMovingWorkflow] = useState<WorkflowRecord | null>(null);
  const [duplicatingWorkflow, setDuplicatingWorkflow] = useState<WorkflowRecord | null>(null);
  const [settingsWorkflow, setSettingsWorkflow] = useState<WorkflowRecord | null>(null);

  // Load Projects & Workflows from API
  const refreshData = useCallback(async () => {
    try {
      const [projRes, wfRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/workflows')
      ]);
      const projData = await projRes.json();
      const wfData = await wfRes.json();

      if (projData.success) {
        setProjects(projData.data);
      }
      if (wfData.success && wfData.data.length > 0) {
        setWorkflows(wfData.data);

        // Find active (default to VoiceChatbot if available)
        const matched =
          wfData.data.find((w: WorkflowRecord) => w.id === activeWorkflowId) ||
          wfData.data.find((w: WorkflowRecord) => w.id === 'wf-voice-chatbot') ||
          wfData.data[0];

        setActiveWorkflowId(matched.id);
        setCurrentWorkflow(matched);
        setLoadedWorkflowId(matched.id);
        setNodes(matched.nodes || []);
        // STATIC connecting lines: animated: false, clean neutral gray
        setEdges(
          (matched.edges || []).map((e: Edge) => ({
            ...e,
            animated: false,
            style: EDGE_STYLE
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load project/workflow data:', err);
    }
  }, [activeWorkflowId, setNodes, setEdges]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Sync initialWorkflowId if prop changes
  useEffect(() => {
    if (initialWorkflowId && initialWorkflowId !== activeWorkflowId) {
      setActiveWorkflowId(initialWorkflowId);
    }
  }, [initialWorkflowId, activeWorkflowId]);

  // Keyboard shortcut: '/' opens the Add Node modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === '/') {
        e.preventDefault();
        setIsAddNodeOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Connect edges statically (no animation)
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: false,
            style: EDGE_STYLE
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const handleOpenConfig = useCallback((nodeId: string) => {
    setConfigNodeId(nodeId);
  }, []);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (configNodeId === nodeId) setConfigNodeId(null);
    },
    [configNodeId, setNodes, setEdges]
  );

  const processedNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onOpenConfig: handleOpenConfig,
        onDelete: handleDeleteNode
      }
    }));
  }, [nodes, handleOpenConfig, handleDeleteNode]);

  const handleSelectWorkflow = (wf: WorkflowRecord) => {
    setActiveWorkflowId(wf.id);
    setCurrentWorkflow(wf);
    setLoadedWorkflowId(wf.id);
    setNodes(wf.nodes || []);
    setEdges(
      (wf.edges || []).map((e: Edge) => ({
        ...e,
        animated: false,
        style: EDGE_STYLE
      }))
    );
    setConfigNodeId(null);
  };

  const handleAddNode = (def: INodeDefinition) => {
    const newId = `node-${Date.now().toString().slice(-4)}`;
    const x = 200 + (nodes.length % 4) * 280;
    const y = 140 + Math.floor(nodes.length / 4) * 160;

    const newNode: Node = {
      id: newId,
      type: 'customNode',
      position: { x, y },
      data: {
        nodeType: def.name,
        label: def.displayName,
        category: def.category,
        icon: def.icon,
        // Node defaults were written for the demo workspace; client workspaces get them without sample names.
        config: (() => {
          const defaults = def.properties.reduce((acc, p) => ({ ...acc, [p.name]: p.default }), {} as Record<string, unknown>);
          return isDemo ? defaults : scrubDemoDeep(defaults);
        })()
      }
    };

    setNodes((nds) => [...nds, newNode]);
    setConfigNodeId(newId);
  };

  // ---- Assistant hooks: read the canvas, apply a proposed change (and save), undo, highlight a step.
  const graphRef = useRef<{ nodes: Node[]; edges: Edge[]; workflow: WorkflowRecord | null }>({ nodes: [], edges: [], workflow: null });
  // Layout effect: it runs before the assistant's own effects, so the assistant never reads a stale graph.
  useLayoutEffect(() => {
    graphRef.current = { nodes, edges, workflow: currentWorkflow };
  }, [nodes, edges, currentWorkflow]);

  const getGraph = useCallback(
    (): CanvasGraph => ({
      nodes: graphRef.current.nodes as unknown as CanvasNodeLite[],
      edges: graphRef.current.edges as unknown as CanvasEdgeLite[]
    }),
    []
  );

  const persist = useCallback(async (nextNodes: Node[], nextEdges: Edge[]): Promise<boolean> => {
    const wf = graphRef.current.workflow;
    if (!wf) return false;
    try {
      const res = await fetch(`/api/workflows/${wf.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wf.name,
          description: wf.description,
          nodes: nextNodes.map((n) => ({ ...n, selected: false, data: { ...n.data, status: undefined } })),
          edges: nextEdges.map((e) => ({ ...e, animated: false }))
        })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentWorkflow(data.data);
        setWorkflows((prev) => prev.map((w) => (w.id === data.data.id ? data.data : w)));
        return true;
      }
    } catch (err) {
      console.error('Failed to save the assistant change:', err);
    }
    return false;
  }, []);

  const styleEdges = (list: Edge[]) => list.map((e) => ({ ...e, animated: false, style: EDGE_STYLE }));

  const applyProposal = useCallback(
    async (p: CanvasProposal): Promise<ApplyResult> => {
      const before = { nodes: graphRef.current.nodes, edges: graphRef.current.edges };
      const updated = new Map(p.updated.map((u) => [u.id, u]));
      const removed = new Set(p.removedIds);
      const nextNodes: Node[] = [
        ...before.nodes
          .filter((n) => !removed.has(n.id))
          .map((n) => {
            const u = updated.get(n.id);
            return u ? { ...n, position: u.position || n.position, data: { ...n.data, ...u.data } } : n;
          }),
        ...p.added.map((a) => ({ ...a, type: 'customNode', position: a.position || { x: 0, y: 0 } }) as Node)
      ];
      const nextEdges = styleEdges(p.edges as unknown as Edge[]);
      setNodes(nextNodes);
      setEdges(nextEdges);
      graphRef.current = { ...graphRef.current, nodes: nextNodes, edges: nextEdges };
      const saved = await persist(nextNodes, nextEdges);
      return {
        saved,
        snapshot: before,
        graph: { nodes: nextNodes as unknown as CanvasNodeLite[], edges: nextEdges as unknown as CanvasEdgeLite[] }
      };
    },
    [persist, setNodes, setEdges]
  );

  const restoreSnapshot = useCallback(
    async (snapshot: unknown): Promise<boolean> => {
      const snap = snapshot as { nodes: Node[]; edges: Edge[] } | null;
      if (!snap) return false;
      setNodes(snap.nodes);
      setEdges(snap.edges);
      graphRef.current = { ...graphRef.current, nodes: snap.nodes, edges: snap.edges };
      return persist(snap.nodes, snap.edges);
    },
    [persist, setNodes, setEdges]
  );

  const focusNode = useCallback(
    (nodeId: string | null) => {
      setNodes((nds) => nds.map((n) => ({ ...n, selected: nodeId !== null && n.id === nodeId })));
      if (nodeId && flow) {
        flow.fitView({ nodes: [{ id: nodeId }], duration: 400, maxZoom: 1.1, padding: 0.8 });
      }
    },
    [flow, setNodes]
  );

  const handleSaveWorkflow = async () => {
    if (!currentWorkflow) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/workflows/${currentWorkflow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentWorkflow,
          nodes,
          edges: edges.map((e) => ({ ...e, animated: false }))
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsSaving(false);
        setWorkflows((prev) => prev.map((w) => (w.id === currentWorkflow.id ? data.data : w)));
        setCurrentWorkflow(data.data);
      }
    } catch (err) {
      console.error('Failed to save workflow:', err);
      setIsSaving(false);
    }
  };

  // Run Workflow (CTA button like in n8n screenshot)
  const handleRunWorkflow = async () => {
    if (!currentWorkflow) return;
    setIsRunning(true);
    setRunSuccess(false);

    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, status: 'running' }
      }))
    );

    try {
      await fetch(`/api/workflows/${currentWorkflow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentWorkflow,
          nodes,
          edges: edges.map((e) => ({ ...e, animated: false }))
        })
      });

      const res = await fetch(`/api/workflows/${currentWorkflow.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerSource: 'manual' })
      });

      const data = await res.json();
      if (data.success) {
        setRunSuccess(true);
        const traces = data.data.nodeOutputs || {};
        setNodes((nds) =>
          nds.map((n) => {
            const trace = traces[n.id];
            return {
              ...n,
              data: {
                ...n.data,
                status: trace?.status || 'success',
                executionTimeMs: trace?.executionTimeMs || 28
              }
            };
          })
        );
        setTimeout(() => setRunSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Execution failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleToggleActive = async () => {
    if (!currentWorkflow) return;
    const nextState = !currentWorkflow.active;
    setCurrentWorkflow({ ...currentWorkflow, active: nextState });
    await fetch(`/api/workflows/${currentWorkflow.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: nextState })
    });
  };

  // Project Folder Operations
  const handleSaveProject = async (projectData: { id?: string; name: string; description?: string; color: string }) => {
    if (projectData.id) {
      const res = await fetch(`/api/projects/${projectData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      });
      const data = await res.json();
      if (data.success) {
        setProjects((prev) => prev.map((p) => (p.id === projectData.id ? data.data : p)));
      }
    } else {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      });
      const data = await res.json();
      if (data.success) {
        setProjects((prev) => [...prev, data.data]);
        setExpandedFolders((prev) => ({ ...prev, [data.data.id]: true }));
      }
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (window.confirm(`Delete project folder "${projectName}"? Workflows will be moved to Ungrouped.`)) {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        setWorkflows((prev) =>
          prev.map((w) => (w.folderId === projectId ? { ...w, folderId: undefined } : w))
        );
      }
    }
  };

  const handleCreateNewWorkflow = async (targetFolderId?: string) => {
    const newName = `New Workflow ${workflows.length + 1}`;
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName,
        folderId: targetFolderId,
        nodes: [
          {
            id: 'node-1',
            type: 'customNode',
            position: { x: 100, y: 160 },
            data: {
              nodeType: 'webhookTrigger',
              label: 'Listen',
              category: 'Triggers',
              icon: 'Webhook',
              isTriggerPill: true,
              config: { path: `hook-${Date.now().toString().slice(-4)}`, httpMethod: 'POST' }
            }
          }
        ],
        edges: []
      })
    });
    const data = await res.json();
    if (data.success) {
      setWorkflows((prev) => [data.data, ...prev]);
      handleSelectWorkflow(data.data);
    }
  };

  const handleDuplicateWorkflow = async (workflowId: string, newName: string, folderId?: string) => {
    const res = await fetch(`/api/workflows/${workflowId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, folderId })
    });
    const data = await res.json();
    if (data.success) {
      setWorkflows((prev) => [data.data, ...prev]);
      handleSelectWorkflow(data.data);
    }
  };

  const handleMoveWorkflow = async (workflowId: string, targetFolderId?: string) => {
    const res = await fetch(`/api/workflows/${workflowId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: targetFolderId })
    });
    const data = await res.json();
    if (data.success) {
      setWorkflows((prev) =>
        prev.map((w) => (w.id === workflowId ? { ...w, folderId: targetFolderId } : w))
      );
      if (currentWorkflow?.id === workflowId) {
        setCurrentWorkflow({ ...currentWorkflow, folderId: targetFolderId });
      }
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    const res = await fetch(`/api/workflows/${workflowId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      const remaining = workflows.filter((w) => w.id !== workflowId);
      setWorkflows(remaining);
      if (activeWorkflowId === workflowId && remaining.length > 0) {
        handleSelectWorkflow(remaining[0]);
      }
    }
  };

  const toggleFolder = (folderKey: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderKey]: !prev[folderKey] }));
  };

  const selectedNode = nodes.find((n) => n.id === configNodeId);
  const currentProject = projects.find((p) => p.id === currentWorkflow?.folderId);

  return (
    <div className="flex flex-col h-[calc(100vh-270px)] min-h-[520px] w-full bg-app rounded-lg border border-line overflow-hidden shadow-xs font-sans antialiased text-fg">
      {/* Editor header bar */}
      <div className="h-14 px-3 border-b border-line bg-surface flex items-center justify-between gap-3 shrink-0">
        {/* Left: Project / Workflow Breadcrumb */}
        <div className="flex items-center gap-2 min-w-0">
          {onBackToList && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onBackToList}
              title="Back to workflows"
              icon={<ArrowLeft className="h-4 w-4" />}
            >
              Workflows
            </Button>
          )}

          <button
            onClick={() => setIsSidebarOpen((v) => !v)}
            className="focus-ring p-1.5 rounded-sm text-fg-secondary hover:text-fg hover:bg-subtle transition-colors"
            title="Show or hide folders"
            aria-label="Show or hide folders"
          >
            {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>

          <div className="flex items-center gap-1.5 text-small min-w-0">
            <span className="flex items-center gap-1 text-fg-secondary">
              <Folder className="h-3.5 w-3.5" />
              <span className="truncate">{currentProject?.name || 'Personal'}</span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-tertiary" />
            <span
              onClick={() => setSettingsWorkflow(currentWorkflow)}
              className="truncate text-body-strong text-fg hover:text-brand-text transition-colors cursor-pointer"
            >
              {currentWorkflow?.name || 'VoiceChatbot'}
            </span>
          </div>

          <button
            onClick={() => setSettingsWorkflow(currentWorkflow)}
            className="focus-ring shrink-0 text-small text-fg-tertiary hover:text-fg flex items-center gap-1 px-2 py-0.5 rounded-sm hover:bg-subtle transition-colors"
          >
            <Tag className="h-3.5 w-3.5" />
            <span>Add tag</span>
          </button>
        </div>

        {/* Center: Editor / Executions */}
        <div className="inline-flex items-center rounded-md border border-line bg-subtle p-0.5 text-small">
          <button
            onClick={() => {
              setViewMode('editor');
              setIsHistoryOpen(false);
            }}
            className={`focus-ring h-7 px-3 rounded-sm font-medium transition-colors ${
              viewMode === 'editor' && !isHistoryOpen
                ? 'bg-selected text-selected-fg shadow-xs'
                : 'text-fg-secondary hover:bg-surface hover:text-fg'
            }`}
          >
            Editor
          </button>
          {isStaff && (
          <button
            onClick={() => {
              setViewMode('executions');
              setIsHistoryOpen(true);
            }}
            className={`focus-ring h-7 px-3 rounded-sm font-medium transition-colors ${
              isHistoryOpen || viewMode === 'executions'
                ? 'bg-selected text-selected-fg shadow-xs'
                : 'text-fg-secondary hover:bg-surface hover:text-fg'
            }`}
          >
            Executions
          </button>
          )}
        </div>

        {/* Right: Active toggle, Share, Save, undo/redo */}
        <div className="flex items-center gap-1.5">
          {/* Active / Inactive switch (platform staff only; everyone else builds drafts) */}
          {!isStaff && (
            <span className="pr-2 mr-1 border-r border-line text-small text-fg-secondary" title="Drafts don’t run. Switching a workflow on is done by your platform team.">
              Draft
            </span>
          )}
          {isStaff && (
          <div className="flex items-center gap-2 pr-2 mr-1 border-r border-line">
            <span className="text-small text-fg-secondary">
              {currentWorkflow?.active ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={handleToggleActive}
              className={`focus-ring w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                currentWorkflow?.active ? 'bg-selected' : 'bg-ink-300'
              }`}
            >
              <div
                className={`bg-surface w-4 h-4 rounded-full shadow-xs transform transition-transform ${
                  currentWorkflow?.active ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          )}

          {/* Undo / Redo */}
          <IconButton label="Undo" size="sm" variant="ghost">
            <RotateCcw className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo" size="sm" variant="ghost">
            <RotateCw className="h-4 w-4" />
          </IconButton>

          {/* Share */}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              alert('Workflow sharing link copied to clipboard!');
            }}
          >
            Share
          </Button>

          {/* Save Button */}
          <Button
            size="sm"
            variant="brand"
            onClick={handleSaveWorkflow}
            disabled={isSaving}
            icon={<Save className="h-4 w-4" />}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>

          {/* More options */}
          <IconButton label="Workflow settings" size="sm" variant="ghost" onClick={() => setSettingsWorkflow(currentWorkflow)}>
            <MoreHorizontal className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 w-full h-full relative flex overflow-hidden">
        {/* Left Project / Folder Navigator Sidebar */}
        {isSidebarOpen && (
          <aside className="w-64 border-r border-line bg-surface flex flex-col shrink-0 overflow-hidden animate-in slide-in-from-left duration-200 z-10">
            <div className="h-11 px-3 border-b border-line flex items-center justify-between">
              <span className="text-body-strong text-fg">Folders</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingProject(null);
                  setIsProjectModalOpen(true);
                }}
                icon={<FolderPlus className="h-4 w-4" />}
                className="h-7 px-2"
              >
                New
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {projects.map((proj) => {
                const isExpanded = expandedFolders[proj.id] ?? true;
                const folderWorkflows = workflows.filter((w) => w.folderId === proj.id);

                return (
                  <div key={proj.id}>
                    <div className="group h-8 px-1.5 rounded-sm hover:bg-subtle flex items-center justify-between gap-1">
                      <div
                        onClick={() => toggleFolder(proj.id)}
                        className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer select-none text-body text-fg"
                      >
                        <span className="text-fg-tertiary">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </span>
                        <Folder className="h-4 w-4 shrink-0 text-fg-secondary" />
                        <span className="truncate">{proj.name}</span>
                        <span className="text-caption tabular-nums text-fg-tertiary">{folderWorkflows.length}</span>
                      </div>

                      <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleCreateNewWorkflow(proj.id)}
                          className="focus-ring p-1 rounded-sm text-fg-tertiary hover:text-fg"
                          title="New workflow"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingProject(proj);
                            setIsProjectModalOpen(true);
                          }}
                          className="focus-ring p-1 rounded-sm text-fg-tertiary hover:text-fg"
                          title="Edit folder"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProject(proj.id, proj.name)}
                          className="focus-ring p-1 rounded-sm text-fg-tertiary hover:text-danger-fg"
                          title="Delete folder"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pl-5 py-0.5 space-y-0.5">
                        {folderWorkflows.map((wf) => {
                          const isSelected = activeWorkflowId === wf.id;
                          return (
                            <div
                              key={wf.id}
                              onClick={() => handleSelectWorkflow(wf)}
                              className={`group h-8 px-2 rounded-sm flex items-center justify-between text-body cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-selected-soft text-selected-soft-fg font-medium'
                                  : 'hover:bg-subtle text-fg-secondary'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate flex-1">
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${wf.active ? 'bg-success-500' : 'bg-ink-300'}`} />
                                <span className="truncate">{wf.name}</span>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDuplicatingWorkflow(wf);
                                  }}
                                  className="focus-ring rounded-sm p-0.5 text-fg-tertiary hover:text-fg"
                                  title="Duplicate"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMovingWorkflow(wf);
                                  }}
                                  className="focus-ring rounded-sm p-0.5 text-fg-tertiary hover:text-fg"
                                  title="Move"
                                >
                                  <FolderInput className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* React Flow canvas: light, minimal, static lines */}
        <div className="flex-1 w-full h-full relative">
          <ReactFlow
            nodes={processedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onInit={setFlow}
            fitView
            attributionPosition="bottom-left"
            className={EDGE_HOVER_CLS}
            defaultEdgeOptions={{
              animated: false,
              style: EDGE_STYLE
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--ink-300)" />
            <Controls
              position="bottom-left"
              className="!rounded-md !border !border-line !shadow-md overflow-hidden"
            />
            <MiniMap
              position="bottom-right"
              nodeColor={() => 'var(--ink-300)'}
              className="!rounded-lg !border !border-line !shadow-md overflow-hidden"
            />
          </ReactFlow>

          {/* Floating toolbar: Add node */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-md">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsAddNodeOpen(true)}
              icon={<Plus className="h-4 w-4" />}
              className="text-fg"
            >
              Add node
              <Kbd>/</Kbd>
            </Button>
          </div>

          {/* Workflow assistant (floating chat) */}
          <WorkflowAssistantWidget
            key={activeWorkflowId}
            getGraph={getGraph}
            applyProposal={applyProposal}
            restore={restoreSnapshot}
            focusNode={focusNode}
            autoCheck={autoAssist}
            onAutoCheckDone={() => onAutoAssistDone?.()}
            graphReady={loadedWorkflowId === activeWorkflowId && nodes.length > 0}
            canActivate={isStaff}
          />

          {/* Floating bottom center: Run workflow (platform staff only; it runs on the server) */}
          {isStaff && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
            <Button
              size="lg"
              variant="primary"
              onClick={handleRunWorkflow}
              disabled={isRunning}
              className="shadow-md"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Running workflow...</span>
                </>
              ) : runSuccess ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Workflow ran</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Run workflow</span>
                </>
              )}
            </Button>
          </div>
          )}
        </div>
      </div>

      {/* Add Node Palette Modal */}
      <AddNodeModal
        isOpen={isAddNodeOpen}
        onClose={() => setIsAddNodeOpen(false)}
        onSelectNode={handleAddNode}
      />

      {/* Node Config Drawer (Exact n8n Node Details replica) */}
      <NodeConfigDrawer
        nodeId={configNodeId}
        workflowId={activeWorkflowId}
        initialNodeData={selectedNode?.data}
        allowTestStep={isStaff}
        onClose={() => setConfigNodeId(null)}
        onSaveConfig={(id, updatedConfig, updatedLabel) => {
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === id) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    config: updatedConfig,
                    label: updatedLabel || n.data.label
                  }
                };
              }
              return n;
            })
          );
        }}
      />

      {/* Execution History Drawer */}
      <ExecutionHistoryDrawer
        isOpen={isHistoryOpen}
        workflowId={activeWorkflowId}
        onClose={() => setIsHistoryOpen(false)}
      />

      {/* Project Folder Modals */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        initialProject={editingProject}
        onSave={handleSaveProject}
      />

      <MoveWorkflowModal
        isOpen={Boolean(movingWorkflow)}
        onClose={() => setMovingWorkflow(null)}
        workflow={movingWorkflow}
        projects={projects}
        onMove={handleMoveWorkflow}
      />

      <DuplicateWorkflowModal
        isOpen={Boolean(duplicatingWorkflow)}
        onClose={() => setDuplicatingWorkflow(null)}
        workflow={duplicatingWorkflow}
        projects={projects}
        onDuplicate={handleDuplicateWorkflow}
      />

      <WorkflowSettingsModal
        isOpen={Boolean(settingsWorkflow)}
        onClose={() => setSettingsWorkflow(null)}
        workflow={settingsWorkflow}
        onSave={async (id, updates) => {
          await fetch(`/api/workflows/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
          });
          refreshData();
        }}
        onDelete={handleDeleteWorkflow}
      />
    </div>
  );
}
