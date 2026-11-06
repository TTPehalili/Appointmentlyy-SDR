'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Folder,
  FolderPlus,
  Plus,
  Search,
  Filter,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  Copy,
  FolderInput,
  Edit,
  Trash2,
  ExternalLink,
  Play,
  CheckCircle2,
  Clock,
  Sparkles,
  Settings,
  Layers,
  ArrowLeft,
  Check,
  FileCode2,
  Zap,
  Tag,
  Radio,
  SlidersHorizontal,
  Home,
  CheckSquare,
  Square,
  Share2,
  Bot,
  PhoneCall,
  Calendar,
  Workflow
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { ProjectFolderRecord, WorkflowRecord } from '@/lib/db';
import ProjectModal from '../panels/ProjectManagerModal';
import {
  MoveWorkflowModal,
  DuplicateWorkflowModal,
  WorkflowSettingsModal
} from '../panels/WorkflowActionModals';
import TemplateGalleryModal from '../panels/TemplateGalleryModal';
import { WorkflowTemplate, PRELOADED_WORKFLOW_TEMPLATES } from '@/lib/workflowTemplates';

const menuItem =
  'focus-ring w-full px-3 py-1.5 text-left text-body text-fg hover:bg-subtle flex items-center gap-2 transition-colors cursor-pointer';
const menuItemDanger =
  'focus-ring w-full px-3 py-1.5 text-left text-body text-danger-fg hover:bg-danger-bg flex items-center gap-2 transition-colors cursor-pointer';
const menuIcon = 'h-4 w-4 shrink-0 text-fg-secondary';
const checkboxCls = 'focus-ring h-4 w-4 rounded-sm border-line-strong accent-ink-900 cursor-pointer';

interface WorkflowListHubProps {
  onOpenCanvas: (workflowId?: string) => void;
}

export default function WorkflowListHub({ onOpenCanvas }: WorkflowListHubProps) {
  const [projects, setProjects] = useState<ProjectFolderRecord[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Current folder drill-down: null = Home root, string = inside folderId
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Filter & Search
  const [activeTab, setActiveTab] = useState<'all' | 'needs_review' | 'deleted'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});

  // Dropdown menus
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [openItemMenuId, setOpenItemMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Modals
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectFolderRecord | null>(null);
  const [movingWorkflow, setMovingWorkflow] = useState<WorkflowRecord | null>(null);
  const [duplicatingWorkflow, setDuplicatingWorkflow] = useState<WorkflowRecord | null>(null);
  const [settingsWorkflow, setSettingsWorkflow] = useState<WorkflowRecord | null>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsCreateMenuOpen(false);
        setOpenItemMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Projects & Workflows
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [projRes, wfRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/workflows')
      ]);
      const projData = await projRes.json();
      const wfData = await wfRes.json();

      if (projData.success) setProjects(projData.data);
      if (wfData.success) setWorkflows(wfData.data);
    } catch (err) {
      console.error('Failed to load workflow hub data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Current folder object
  const currentFolder = useMemo(() => {
    return projects.find((p) => p.id === currentFolderId) || null;
  }, [projects, currentFolderId]);

  // Filtered Folders (only visible at Home root)
  const visibleProjects = useMemo(() => {
    if (currentFolderId !== null) return [];
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase().trim();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))
    );
  }, [projects, currentFolderId, searchQuery]);

  // Filtered Workflows
  const visibleWorkflows = useMemo(() => {
    let list = workflows;
    if (currentFolderId !== null) {
      list = list.filter((w) => w.folderId === currentFolderId);
    } else {
      // At root, show ungrouped workflows
      list = list.filter((w) => !w.folderId);
    }

    if (activeTab === 'needs_review') {
      list = list.filter((w) => !w.active);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (w) => w.name.toLowerCase().includes(q) || (w.description && w.description.toLowerCase().includes(q))
      );
    }

    return list;
  }, [workflows, currentFolderId, activeTab, searchQuery]);

  // Handle Create Project Folder
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
        if (currentFolderId === projectId) {
          setCurrentFolderId(null);
        }
      }
    }
  };

  // Create new workflow from scratch
  const handleCreateWorkflow = async (templateType: 'scratch' | 'elevenlabs' | 'arm' | 'dialer') => {
    setIsCreateMenuOpen(false);
    let name = `New Workflow ${workflows.length + 1}`;
    let nodes: any[] = [];
    let edges: any[] = [];
    let webhookPath = `hook-${Date.now().toString().slice(-4)}`;

    if (templateType === 'elevenlabs') {
      name = 'VoiceChatbot (ElevenLabs)';
      webhookPath = 'voice-chat';
      nodes = [
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
            config: { path: 'voice-chat', httpMethod: 'POST' }
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
            config: { agentGoal: 'Voice conversational assistance', maxIterations: 3 }
          }
        },
        {
          id: 'node-eleven',
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
              text: '{{ $json.aiResponse.content || "Hello!" }}'
            }
          }
        }
      ];
      edges = [
        { id: 'e1', source: 'node-listen', target: 'node-agent', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'node-agent', target: 'node-eleven', sourceHandle: 'output', targetHandle: 'input' }
      ];
    } else {
      nodes = [
        {
          id: 'node-1',
          type: 'customNode',
          position: { x: 100, y: 160 },
          data: {
            nodeType: 'manualTrigger',
            label: 'Manual Trigger',
            category: 'Triggers',
            icon: 'PlayCircle',
            config: { mockPayload: '{"status": "test"}' }
          }
        }
      ];
    }

    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        folderId: currentFolderId || undefined,
        webhookPath,
        nodes,
        edges
      })
    });
    const data = await res.json();
    if (data.success) {
      setWorkflows((prev) => [data.data, ...prev]);
      onOpenCanvas(data.data.id);
    }
  };

  // Deploy preloaded outbound template
  const handleDeployTemplate = async (template: WorkflowTemplate, targetFolderId?: string) => {
    setIsTemplateGalleryOpen(false);
    setIsCreateMenuOpen(false);
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: template.name,
        folderId: targetFolderId || currentFolderId || undefined,
        nodes: template.nodes,
        edges: template.edges
      })
    });
    const data = await res.json();
    if (data.success) {
      setWorkflows((prev) => [data.data, ...prev]);
      onOpenCanvas(data.data.id);
    }
  };

  // Duplicate Workflow
  const handleDuplicateWorkflow = async (workflowId: string, newName: string, folderId?: string) => {
    const res = await fetch(`/api/workflows/${workflowId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, folderId })
    });
    const data = await res.json();
    if (data.success) {
      setWorkflows((prev) => [data.data, ...prev]);
    }
  };

  // Move Workflow
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
    }
  };

  // Delete Workflow
  const handleDeleteWorkflow = async (workflowId: string) => {
    if (window.confirm('Are you sure you want to delete this workflow?')) {
      const res = await fetch(`/api/workflows/${workflowId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
      }
    }
  };

  // Toggle active status
  const handleToggleActive = async (workflow: WorkflowRecord) => {
    const nextState = !workflow.active;
    setWorkflows((prev) =>
      prev.map((w) => (w.id === workflow.id ? { ...w, active: nextState } : w))
    );
    await fetch(`/api/workflows/${workflow.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: nextState })
    });
  };

  return (
    <div className="space-y-4" ref={menuRef}>
      {/* Toolbar: status tabs, search and actions */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line">
        <div className="flex items-center gap-6 text-body">
          <button
            onClick={() => setActiveTab('all')}
            className={`focus-ring -mb-px h-10 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'all' ? 'border-action text-fg font-medium' : 'border-transparent text-fg-secondary hover:text-fg'
            }`}
          >
            <span>All workflows</span>
          </button>

          <button
            onClick={() => setActiveTab('needs_review')}
            className={`focus-ring -mb-px h-10 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'needs_review' ? 'border-action text-fg font-medium' : 'border-transparent text-fg-secondary hover:text-fg'
            }`}
          >
            <span>Needs review</span>
            <span className="text-caption tabular-nums text-fg-tertiary">3</span>
          </button>

          <button
            onClick={() => setActiveTab('deleted')}
            className={`focus-ring -mb-px h-10 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'deleted' ? 'border-action text-fg font-medium' : 'border-transparent text-fg-secondary hover:text-fg'
            }`}
          >
            <span>Deleted</span>
          </button>

          <button className="focus-ring -mb-px h-10 border-b-2 border-transparent text-fg-tertiary hover:text-fg transition-colors cursor-pointer flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" />
            <span>Smart list</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-tertiary" />
            <input
              type="text"
              placeholder="Search workflows or folders"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="focus-ring h-8 w-56 pl-8 pr-3 rounded-sm bg-surface border border-line-strong text-small text-fg placeholder:text-fg-disabled"
            />
          </div>
          <Button size="sm" variant="ghost" icon={<SlidersHorizontal className="h-4 w-4" />}>
            Filters
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onOpenCanvas()} icon={<Workflow className="h-4 w-4" />}>
            Open canvas
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditingProject(null);
              setIsFolderModalOpen(true);
            }}
            icon={<FolderPlus className="h-4 w-4" />}
          >
            New folder
          </Button>

          {/* New workflow with dropdown */}
          <div className="relative">
            <Button
              size="sm"
              variant="brand"
              onClick={() => setIsCreateMenuOpen((v) => !v)}
              icon={<Plus className="h-4 w-4" />}
            >
              New workflow
              <ChevronDown className="h-3.5 w-3.5 -ml-1" />
            </Button>

            {isCreateMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 rounded-md bg-surface border border-line shadow-md py-1 z-30 divide-y divide-line">
                <div className="py-1">
                  <button onClick={() => handleCreateWorkflow('scratch')} className={menuItem}>
                    <Plus className={menuIcon} />
                    <span>Start from scratch</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsTemplateGalleryOpen(true);
                      setIsCreateMenuOpen(false);
                    }}
                    className={menuItem}
                  >
                    <Sparkles className={menuIcon} />
                    <span>Browse outbound templates</span>
                  </button>
                </div>

                {/* Outbound Cadences Quick-Picks */}
                <div className="py-1">
                  <div className="px-3 pt-1.5 pb-1 text-caption text-fg-tertiary">
                    Cadences and after-call dispositions
                  </div>

                  <button
                    onClick={() => {
                      const tpl = PRELOADED_WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-cadence-21day-master');
                      if (tpl) handleDeployTemplate(tpl);
                    }}
                    className={menuItem}
                  >
                    <Zap className={menuIcon} />
                    <span>21-day multi-channel cadence</span>
                  </button>

                  <button
                    onClick={() => {
                      const tpl = PRELOADED_WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-meeting-booked-vip');
                      if (tpl) handleDeployTemplate(tpl);
                    }}
                    className={menuItem}
                  >
                    <CheckCircle2 className={menuIcon} />
                    <span>Meeting booked VIP (SMS, email, LinkedIn)</span>
                  </button>

                  <button
                    onClick={() => {
                      const tpl = PRELOADED_WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-cadence-day3-vm-email-synergy');
                      if (tpl) handleDeployTemplate(tpl);
                    }}
                    className={menuItem}
                  >
                    <PhoneCall className={menuIcon} />
                    <span>Day 3: voicemail and email</span>
                  </button>

                  <button
                    onClick={() => {
                      const tpl = PRELOADED_WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-followup-calendar-nudge');
                      if (tpl) handleDeployTemplate(tpl);
                    }}
                    className={menuItem}
                  >
                    <Calendar className={menuIcon} />
                    <span>Follow-up: one-click calendar link</span>
                  </button>
                </div>

                <div className="py-1">
                  <button onClick={() => handleCreateWorkflow('elevenlabs')} className={menuItem}>
                    <Bot className={menuIcon} />
                    <span>Voice chatbot (ElevenLabs)</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsTemplateGalleryOpen(true);
                      setIsCreateMenuOpen(false);
                    }}
                    className={menuItem}
                  >
                    <Layers className={menuIcon} />
                    <span>Select a recipe</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsTemplateGalleryOpen(true);
                      setIsCreateMenuOpen(false);
                    }}
                    className={menuItem}
                  >
                    <FileCode2 className={menuIcon} />
                    <span>Select from template</span>
                  </button>
                </div>

                <div className="py-1">
                  <button onClick={() => handleCreateWorkflow('scratch')} className={`${menuItem} text-fg-secondary`}>
                    <Home className={menuIcon} />
                    <span>Properties-based workflow</span>
                    <Badge className="ml-auto">Beta</Badge>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Folder breadcrumb (Home > Folder) */}
      <nav aria-label="Folder path" className="flex items-center gap-1.5 text-small text-fg-secondary">
        <button
          onClick={() => setCurrentFolderId(null)}
          className={`focus-ring rounded-sm flex items-center gap-1 hover:text-fg transition-colors cursor-pointer ${
            currentFolderId === null ? 'text-fg' : ''
          }`}
        >
          <Home className="h-3.5 w-3.5" />
          <span>Home</span>
        </button>

        {currentFolder && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-fg-tertiary" />
            <span className="text-fg flex items-center gap-1.5">
              <Folder className="h-3.5 w-3.5 text-fg-secondary" />
              <span>{currentFolder.name}</span>
            </span>
            <button
              onClick={() => setCurrentFolderId(null)}
              className="focus-ring rounded-sm ml-2 text-small text-fg-tertiary hover:text-fg underline-offset-2 hover:underline"
            >
              Back to all folders
            </button>
          </>
        )}
      </nav>

      {/* Table */}
      <div className="rounded-lg border border-line bg-surface overflow-x-auto shadow-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-subtle text-caption text-fg-tertiary">
              <th className="h-9 px-4 w-10 font-medium">
                <input type="checkbox" className={checkboxCls} />
              </th>
              <th className="h-9 px-4 whitespace-nowrap font-medium">Name</th>
              <th className="h-9 px-4 whitespace-nowrap font-medium">Status</th>
              <th className="h-9 px-4 whitespace-nowrap font-medium text-right">Total enrolled</th>
              <th className="h-9 px-4 whitespace-nowrap font-medium text-right">Active enrolled</th>
              <th className="h-9 px-4 whitespace-nowrap font-medium">Last updated</th>
              <th className="h-9 px-4 whitespace-nowrap font-medium">Created</th>
              <th className="h-9 px-4 whitespace-nowrap font-medium">Success rate</th>
              <th className="h-9 px-4 w-12"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>

          <tbody className="text-body">
            {isLoading ? (
              <tr className="border-t border-line">
                <td colSpan={9} className="py-12 text-center text-fg-tertiary">
                  <div className="inline-block h-5 w-5 rounded-full border-2 border-ink-300 border-t-transparent animate-spin" />
                  <p className="mt-2 text-small">Loading workflows...</p>
                </td>
              </tr>
            ) : (
              <>
                {/* 1. Folders Rows (When at Home root) */}
                {visibleProjects.map((proj) => {
                  const folderWfs = workflows.filter((w) => w.folderId === proj.id);
                  const isMenuOpen = openItemMenuId === proj.id;

                  return (
                    <tr
                      key={proj.id}
                      onClick={() => setCurrentFolderId(proj.id)}
                      className="border-t border-line hover:bg-subtle transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className={checkboxCls} />
                      </td>

                      {/* Name Column with Folder Icon */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Folder className="h-4 w-4 shrink-0 text-fg-secondary" />
                          <div className="min-w-0">
                            <span className="text-body-strong text-fg">{proj.name}</span>
                            {proj.description && (
                              <p className="text-small text-fg-secondary line-clamp-1">{proj.description}</p>
                            )}
                          </div>
                          <span className="text-small tabular-nums text-fg-tertiary ml-1 whitespace-nowrap">
                            {folderWfs.length} workflows
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-small text-fg-secondary">Folder</td>
                      <td className="py-3 px-4 text-right tabular-nums text-fg-secondary">{folderWfs.length * 12}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-fg-secondary">{folderWfs.length * 8}</td>
                      <td className="py-3 px-4 text-small tabular-nums text-fg-secondary">
                        {new Date(proj.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-small tabular-nums text-fg-secondary">
                        {new Date(proj.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-small tabular-nums text-fg-secondary">99.2%</td>

                      {/* Three-Dot Menu */}
                      <td className="py-3 px-4 text-right relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setOpenItemMenuId(isMenuOpen ? null : proj.id)}
                          aria-label="Folder actions"
                          className="focus-ring p-1 rounded-sm text-fg-tertiary hover:text-fg hover:bg-subtle transition-colors"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {isMenuOpen && (
                          <div className="absolute right-4 top-10 w-48 rounded-md bg-surface border border-line shadow-md py-1 z-20 text-left">
                            <button
                              onClick={() => {
                                setCurrentFolderId(proj.id);
                                setOpenItemMenuId(null);
                              }}
                              className={menuItem}
                            >
                              <Folder className={menuIcon} />
                              <span>Open folder</span>
                            </button>

                            <button
                              onClick={() => {
                                setEditingProject(proj);
                                setIsFolderModalOpen(true);
                                setOpenItemMenuId(null);
                              }}
                              className={menuItem}
                            >
                              <Edit className={menuIcon} />
                              <span>Edit folder</span>
                            </button>

                            <button
                              onClick={() => {
                                handleDeleteProject(proj.id, proj.name);
                                setOpenItemMenuId(null);
                              }}
                              className={menuItemDanger}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Delete folder</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* 2. Workflows Rows */}
                {visibleWorkflows.map((wf) => {
                  const isMenuOpen = openItemMenuId === wf.id;

                  return (
                    <tr
                      key={wf.id}
                      onClick={() => onOpenCanvas(wf.id)}
                      className="border-t border-line hover:bg-subtle transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className={checkboxCls} />
                      </td>

                      {/* Workflow Name with Icon */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Workflow className="h-4 w-4 shrink-0 text-fg-secondary" />
                          <div className="min-w-0">
                            <span className="text-body-strong text-fg">{wf.name}</span>
                            {wf.description && (
                              <p className="text-small text-fg-secondary line-clamp-1">{wf.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Active Status Switch */}
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleActive(wf)}
                            className={`focus-ring w-8 h-4.5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                              wf.active ? 'bg-action' : 'bg-ink-300'
                            }`}
                          >
                            <div
                              className={`bg-surface w-3.5 h-3.5 rounded-full shadow-xs transform transition-transform ${
                                wf.active ? 'translate-x-3.5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <Badge tone={wf.active ? 'success' : 'neutral'}>
                            {wf.active ? 'Published' : 'Draft'}
                          </Badge>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right tabular-nums text-fg-secondary">42</td>
                      <td className="py-3 px-4 text-right tabular-nums text-fg-secondary">38</td>
                      <td className="py-3 px-4 text-small tabular-nums text-fg-secondary">
                        {new Date(wf.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-small tabular-nums text-fg-secondary">
                        {new Date(wf.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-small tabular-nums text-fg-secondary">100%</td>

                      {/* Three-Dot Menu */}
                      <td className="py-3 px-4 text-right relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setOpenItemMenuId(isMenuOpen ? null : wf.id)}
                          aria-label="Workflow actions"
                          className="focus-ring p-1 rounded-sm text-fg-tertiary hover:text-fg hover:bg-subtle transition-colors"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {isMenuOpen && (
                          <div className="absolute right-4 top-10 w-48 rounded-md bg-surface border border-line shadow-md py-1 z-20 text-left">
                            <button
                              onClick={() => {
                                onOpenCanvas(wf.id);
                                setOpenItemMenuId(null);
                              }}
                              className={menuItem}
                            >
                              <ExternalLink className={menuIcon} />
                              <span>Open in canvas</span>
                            </button>

                            <button
                              onClick={() => {
                                setDuplicatingWorkflow(wf);
                                setOpenItemMenuId(null);
                              }}
                              className={menuItem}
                            >
                              <Copy className={menuIcon} />
                              <span>Duplicate</span>
                            </button>

                            <button
                              onClick={() => {
                                setMovingWorkflow(wf);
                                setOpenItemMenuId(null);
                              }}
                              className={menuItem}
                            >
                              <FolderInput className={menuIcon} />
                              <span>Move to folder</span>
                            </button>

                            <button
                              onClick={() => {
                                setSettingsWorkflow(wf);
                                setOpenItemMenuId(null);
                              }}
                              className={menuItem}
                            >
                              <Settings className={menuIcon} />
                              <span>Rename and settings</span>
                            </button>

                            <button
                              onClick={() => {
                                handleDeleteWorkflow(wf.id);
                                setOpenItemMenuId(null);
                              }}
                              className={menuItemDanger}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Delete workflow</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <ProjectModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
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
          loadData();
        }}
        onDelete={handleDeleteWorkflow}
      />

      <TemplateGalleryModal
        isOpen={isTemplateGalleryOpen}
        onClose={() => setIsTemplateGalleryOpen(false)}
        onSelectTemplate={handleDeployTemplate}
        projects={projects}
        currentFolderId={currentFolderId}
      />
    </div>
  );
}
