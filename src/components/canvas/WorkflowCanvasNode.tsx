'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Webhook,
  Clock,
  PlayCircle,
  Mail,
  GitFork,
  Shuffle,
  Filter,
  Repeat,
  GitMerge,
  Hourglass,
  Layers,
  Code,
  SlidersHorizontal,
  Braces,
  Calendar,
  Key,
  Hash,
  MessageSquare,
  Send,
  GitPullRequest,
  Sheet,
  FolderSync,
  FileText,
  Database,
  CreditCard,
  MailCheck,
  Server,
  Bot,
  Sparkles,
  Network,
  Cpu,
  BookOpen,
  Radio,
  Globe,
  Settings,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Volume2,
  Smartphone,
  PhoneCall
} from 'lucide-react';

// Custom ElevenLabs Logo icon: two vertical bars "||" exactly as in n8n
function ElevenLabsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className || 'h-4 w-4'}>
      <rect x="7" y="4" width="3.5" height="16" rx="1.75" />
      <rect x="13.5" y="4" width="3.5" height="16" rx="1.75" />
    </svg>
  );
}

// Custom LinkedIn "in" glyph
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className || 'h-4 w-4'}>
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
  );
}

const ICON_MAP: Record<string, React.ElementType> = {
  ElevenLabs: ElevenLabsIcon,
  LinkedIn: LinkedInIcon,
  Smartphone,
  PhoneCall,
  Webhook,
  Clock,
  PlayCircle,
  Mail,
  GitFork,
  Shuffle,
  Filter,
  Repeat,
  GitMerge,
  Hourglass,
  Layers,
  Code,
  SlidersHorizontal,
  Braces,
  Calendar,
  Key,
  Slack: Hash,
  MessageSquare,
  Send,
  GitPullRequest,
  Sheet,
  FolderSync,
  FileText,
  Database,
  CreditCard,
  MailCheck,
  Server,
  Bot,
  Sparkles,
  Network,
  Cpu,
  BookOpen,
  Radio,
  Globe,
  Volume2
};

const HANDLE_CLS =
  '!w-2.5 !h-2.5 !bg-surface !border-2 !border-ink-400 hover:!border-brand-500 transition-colors';

export interface CanvasNodeData {
  label: string;
  nodeType: string;
  category: string;
  icon?: string;
  subtitle?: string;
  isTriggerPill?: boolean;
  hasSubHandles?: boolean;
  isSubNode?: boolean;
  config?: Record<string, any>;
  status?: 'idle' | 'running' | 'success' | 'error';
  executionTimeMs?: number;
  onOpenConfig?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
}

export const WorkflowCanvasNode = memo(function WorkflowCanvasNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData;
  const isTrigger = nodeData.category === 'Triggers' || nodeData.isTriggerPill;
  const isIfNode = nodeData.nodeType === 'ifNode';
  const hasSubHandles = Boolean(nodeData.hasSubHandles);
  const isSubNode = Boolean(nodeData.isSubNode);

  // Compute subtitle
  const subtitle =
    nodeData.subtitle ||
    (nodeData.config?.operation
      ? `${nodeData.config.operation}: ${nodeData.config.actionCategory || 'action'}`
      : nodeData.config?.path
      ? `POST: /${nodeData.config.path}`
      : nodeData.config?.channel
      ? `channel: ${nodeData.config.channel}`
      : nodeData.config?.model
      ? `model: ${nodeData.config.model}`
      : nodeData.config?.method
      ? `${nodeData.config.method}`
      : '');

  const IconComponent = (nodeData.icon && ICON_MAP[nodeData.icon]) || (nodeData.nodeType === 'elevenLabsNode' ? ElevenLabsIcon : Code);
  const status = nodeData.status || 'idle';

  return (
    <div
      className={`group relative rounded-lg border bg-surface transition-colors duration-150 select-none ${
        isSubNode ? 'min-w-[170px] max-w-[190px] shadow-xs' : 'w-[240px] shadow-xs'
      } ${
        selected ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line hover:border-line-strong'
      }`}
    >
      {/* Target input handle (unless Trigger) */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className={HANDLE_CLS}
        />
      )}

      {/* Trigger specific subtle lightning indicator (like in screenshot) */}
      {isTrigger && (
        <div className="absolute -left-6 top-1/2 -translate-y-1/2 flex items-center justify-center text-fg-tertiary" title="Trigger">
          <Zap className="h-4 w-4" />
        </div>
      )}

      {/* Minimalist n8n Node Body */}
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        {/* Monochrome icon */}
        <div className="h-8 w-8 rounded-md border border-line bg-subtle text-fg-secondary shrink-0 flex items-center justify-center">
          <IconComponent className="h-4 w-4" />
        </div>

        {/* Title and Subtitle */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <h4 className="text-body-strong text-fg truncate">{nodeData.label}</h4>
            {/* Quick action buttons on hover */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nodeData.onOpenConfig && nodeData.onOpenConfig(id);
                }}
                className="focus-ring p-1 rounded-sm text-fg-tertiary hover:text-fg hover:bg-subtle"
                title="Configure"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nodeData.onDelete && nodeData.onDelete(id);
                }}
                className="focus-ring p-1 rounded-sm text-fg-tertiary hover:text-danger-fg hover:bg-danger-bg"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {subtitle && (
            <p className="text-small text-fg-secondary truncate">
              {subtitle}
            </p>
          )}

          {/* Minimal status indicator if running/success/error */}
          {status !== 'idle' && (
            <div className="mt-1 flex items-center gap-1.5 text-caption">
              {status === 'running' && (
                <>
                  <Loader2 className="h-3 w-3 text-fg-tertiary animate-spin" />
                  <span className="text-fg-secondary">Running...</span>
                </>
              )}
              {status === 'success' && (
                <>
                  <CheckCircle2 className="h-3 w-3 text-success-fg" />
                  <span className="text-success-fg tabular-nums">Done {nodeData.executionTimeMs ? `(${nodeData.executionTimeMs}ms)` : ''}</span>
                </>
              )}
              {status === 'error' && (
                <>
                  <AlertCircle className="h-3 w-3 text-danger-fg" />
                  <span className="text-danger-fg">Error</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main output handles */}
      {isIfNode ? (
        <>
          <div className="absolute right-0 top-[35%] translate-x-1/2 flex items-center">
            <Handle
              type="source"
              position={Position.Right}
              id="true"
              className={HANDLE_CLS}
            />
            <span className="text-caption text-fg-secondary mr-2 bg-surface px-1 rounded-sm border border-line">
              true
            </span>
          </div>
          <div className="absolute right-0 top-[65%] translate-x-1/2 flex items-center">
            <Handle
              type="source"
              position={Position.Right}
              id="false"
              className={HANDLE_CLS}
            />
            <span className="text-caption text-fg-secondary mr-2 bg-surface px-1 rounded-sm border border-line">
              false
            </span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className={HANDLE_CLS}
        />
      )}

      {/* Sub-handles for AI Agent (Model, Memory, Tool) */}
      {hasSubHandles && (
        <div className="border-t border-line px-3 py-1.5 bg-subtle rounded-b-lg flex items-center justify-around text-caption text-fg-tertiary">
          <div className="relative flex flex-col items-center">
            <Handle
              type="source"
              position={Position.Bottom}
              id="model"
              className="!w-2.5 !h-2.5 !rounded-sm !bg-surface !border !border-ink-400 hover:!border-brand-500"
            />
            <span className="mt-1">Model</span>
          </div>
          <div className="relative flex flex-col items-center">
            <Handle
              type="source"
              position={Position.Bottom}
              id="memory"
              className="!w-2.5 !h-2.5 !rounded-sm !bg-surface !border !border-ink-400 hover:!border-brand-500"
            />
            <span className="mt-1">Memory</span>
          </div>
          <div className="relative flex flex-col items-center">
            <Handle
              type="source"
              position={Position.Bottom}
              id="tool"
              className="!w-2.5 !h-2.5 !rounded-sm !bg-surface !border !border-ink-400 hover:!border-brand-500"
            />
            <span className="mt-1">Tool</span>
          </div>
        </div>
      )}
    </div>
  );
});
