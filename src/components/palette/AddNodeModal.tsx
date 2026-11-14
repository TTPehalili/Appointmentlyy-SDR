'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Sparkles, Cpu, Layers, GitFork, Webhook, Code, Globe, MessageSquare } from 'lucide-react';
import { Button, Dialog, IconButton, Kbd } from '@/components/ui';
import { ALL_NODE_DEFINITIONS, INodeDefinition, NodeCategory } from '@/registry';

const CATEGORIES: { label: string; value: string; icon: React.ElementType }[] = [
  { label: 'All Nodes', value: 'All', icon: Layers },
  { label: 'Triggers', value: 'Triggers', icon: Webhook },
  { label: 'Logic & Flow', value: 'Logic & Flow', icon: GitFork },
  { label: 'Data & Transforms', value: 'Data & Transforms', icon: Code },
  { label: 'App Integrations', value: 'App Integrations', icon: MessageSquare },
  { label: 'AI & LLMs', value: 'AI & LLMs', icon: Sparkles },
  { label: 'Model Context Protocol (MCP)', value: 'Model Context Protocol (MCP)', icon: Cpu },
  { label: 'Core Protocols', value: 'Core Protocols', icon: Globe }
];

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNode: (nodeDef: INodeDefinition) => void;
}

export default function AddNodeModal({ isOpen, onClose, onSelectNode }: AddNodeModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search once the dialog is shown (runs after Dialog's showModal effect)
  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
  }, [isOpen]);

  const filteredNodes = useMemo(() => {
    let list = ALL_NODE_DEFINITIONS;
    if (selectedCategory !== 'All') {
      list = list.filter((n) => n.category === selectedCategory);
    }
    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (n) =>
        n.displayName.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.name.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q)
    );
  }, [selectedCategory, searchQuery]);

  return (
    <Dialog open={isOpen} onClose={onClose} title="Add a step" size="xl" bare className="overflow-hidden">
      <div className="flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-h2 text-fg">Add a step</h2>
            <p className="mt-1 text-body text-fg-secondary">Pick a trigger, logic, app, AI or MCP step.</p>
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        {/* Search Input */}
        <div className="px-6 pb-4 border-b border-line">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-tertiary" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name, app (Slack, Stripe) or function"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="focus-ring w-full h-9 pl-9 pr-3 rounded-sm bg-surface border border-line-strong text-body text-fg placeholder:text-fg-disabled"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-3 no-scrollbar text-small">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`focus-ring flex items-center gap-1.5 h-7 px-2.5 rounded-full border whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-selected text-selected-fg border-selected'
                      : 'bg-surface text-fg-secondary hover:bg-subtle hover:text-fg border-line'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Node Grid List */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredNodes.length === 0 ? (
            <div className="col-span-2 py-12 text-center">
              <p className="text-body-strong text-fg">No steps match &ldquo;{searchQuery}&rdquo;</p>
              <p className="text-small text-fg-secondary mt-1">Try &ldquo;webhook&rdquo;, &ldquo;slack&rdquo;, &ldquo;ai&rdquo; or &ldquo;code&rdquo;.</p>
            </div>
          ) : (
            filteredNodes.map((node) => (
              <div
                key={node.name}
                onClick={() => {
                  onSelectNode(node);
                  onClose();
                }}
                className="group p-3 rounded-lg border border-line bg-surface hover:border-line-strong hover:bg-subtle transition-colors cursor-pointer flex items-start gap-3"
              >
                <div className="h-8 w-8 rounded-md border border-line bg-subtle text-fg-secondary shrink-0 flex items-center justify-center">
                  {node.name === 'elevenLabsNode' ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <rect x="7" y="4" width="3.5" height="16" rx="1.75" />
                      <rect x="13.5" y="4" width="3.5" height="16" rx="1.75" />
                    </svg>
                  ) : (
                    <span className="text-small font-medium">{node.displayName[0]}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-body-strong text-fg truncate">
                      {node.displayName}
                    </h4>
                    <span className="text-caption text-fg-tertiary shrink-0 truncate max-w-[45%]">
                      {node.category}
                    </span>
                  </div>
                  <p className="text-small text-fg-secondary line-clamp-2 mt-0.5">
                    {node.description}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line flex items-center justify-between text-small text-fg-secondary">
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{filteredNodes.length} steps</span>
            <span className="text-fg-tertiary">·</span>
            <span className="flex items-center gap-1">Press <Kbd>/</Kbd> on the canvas to open</span>
          </div>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
