'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  BarChart3, 
  TrendingUp, 
  CalendarClock, 
  ShieldAlert, 
  PhoneCall, 
  Loader2, 
  RotateCcw,
  ExternalLink,
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';
import BorisOperationsIcon from '@/components/icons/BorisOperationsIcon';
import ExecutiveReportRenderer from '@/components/assistant/ExecutiveReportRenderer';
import { buildOpsSnapshot } from '@/lib/opsSnapshot';
import { Button, PageHeader, buttonClasses } from '@/components/ui';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const DEFAULT_PROMPTS = [
  {
    label: 'Team stats, today vs last week',
    query: 'Tell me the overall stats of my team today, yesterday, last week, next week, last month.'
  },
  {
    label: 'Call drivers affecting booking rate',
    query: 'Tell what our call drivers are that are impacting our booking rate performance based on all call notes and dispositions.'
  },
  {
    label: 'Julian Vance call deep dive (Apex Global)',
    query: 'What were the exact objections and conversation details on Julian Vance call?'
  },
  {
    label: 'ARM objection battlecards and rebuttals',
    query: 'Show me the ARM battlecards and rebuttal scripts for price and competitor objections.'
  },
  {
    label: 'Rep leaderboard and quotas',
    query: 'Who are our top performing reps today and what is their script adherence?'
  },
  {
    label: 'Next week follow-up forecast',
    query: 'What is our scheduled follow-up and carry-over backlog forecast for next week?'
  }
];

export default function AiExecutiveAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content: `### 👋 Welcome to AI Boris Executive Intelligence

I am your **AI Operations & Floor Intelligence Assistant**. I have real-time access to all call telemetry, auto note-taker summaries, reps outreach metrics, and disposition records across your campaigns.

**You can ask me anything about your floor's performance, such as:**
* *"Tell me the overall stats of my team today, yesterday, last week, and next week's forecast."*
* *"What call drivers are impacting our booking rate performance?"*
* *"Which objection patterns are causing our deals to stall?"*
* *"How are our reps performing against their daily quotas?"*

Select a prompt below or type your question:`,
      timestamp: 'Active Session'
    }
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputQuery;
    if (!query.trim() || isLoading) return;

    const userMsgId = `user_${Date.now()}`;
    const newMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      content: query.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query.trim(),
          context: { snapshot: buildOpsSnapshot() }
        })
      });

      const data = await res.json();
      if (res.ok && data.answer) {
        const assistantMsg: ChatMessage = {
          id: `ai_${Date.now()}`,
          sender: 'assistant',
          content: data.answer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          content: `⚠️ Failed to fetch insights: ${data.error || 'Server error'}. Please try again.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } catch (err: any) {
      console.error('[AI QUERY ERROR]', err);
      const networkErrorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: 'assistant',
        content: `⚠️ Network error while communicating with AI Intelligence backend: ${err.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, networkErrorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 bg-app text-fg font-sans antialiased overflow-hidden">

      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        <div className="max-w-5xl w-full mx-auto px-4 py-6 md:px-8 flex flex-col flex-1 min-h-0">

          {/* HEADER */}
          <PageHeader
            className="shrink-0 border-b border-line pb-4"
            title="Operations intel"
            description="Ask about team stats, call notes, conversion drivers and booking trends."
            secondaryActions={
              <Link href="/reports" className={buttonClasses('secondary', 'md')}>
                <BarChart3 aria-hidden className="text-fg-secondary" />
                <span className="hidden sm:inline">Performance dashboard</span>
                <ExternalLink aria-hidden className="text-fg-tertiary" />
              </Link>
            }
          />

          {/* CHAT MESSAGES DISPLAY */}
          <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4 pr-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 text-body ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="size-8 rounded-full bg-ink-950 text-ink-50 flex items-center justify-center shrink-0 mt-0.5">
                    <BorisOperationsIcon className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`max-w-[92%] rounded-lg relative group ${
                    msg.sender === 'user'
                      ? 'bg-subtle border border-line text-fg px-4 py-3 self-end ml-auto'
                      : 'bg-surface border border-line text-fg p-5 shadow-xs'
                  }`}
                >
                  {msg.sender === 'user' ? (
                    <div>
                      <div className="flex items-center justify-between gap-4 pb-1 text-caption text-fg-tertiary">
                        <span>You</span>
                        <span className="tabular-nums">{msg.timestamp}</span>
                      </div>
                      <div className="text-body text-fg">
                        {msg.content}
                      </div>
                    </div>
                  ) : msg.id === 'welcome' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3 pb-2 border-b border-line">
                        <span className="text-h3 text-fg">
                          Operations copilot
                        </span>
                        <span className="text-caption text-fg-tertiary">{msg.timestamp}</span>
                      </div>

                      <p className="text-body text-fg-secondary">
                        I am your <strong className="font-medium text-fg">AI Operations & Floor Intelligence Copilot</strong>. I synthesize call telemetry, auto-notetaker summaries, rep cadence activities, and CRM dispositions across all your campaigns into executive-ready email reports.
                      </p>

                      <div className="pt-3 border-t border-line">
                        <p className="text-small text-fg-secondary mb-2">
                          Pick a question to generate an instant report:
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {DEFAULT_PROMPTS.map((p, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSendMessage(p.query)}
                              className="focus-ring text-left px-3 py-2.5 rounded-md bg-surface hover:bg-subtle border border-line text-body text-fg transition-colors duration-150 flex items-center justify-between group/btn cursor-pointer"
                            >
                              <span>{p.label}</span>
                              <Sparkles className="h-4 w-4 text-fg-tertiary opacity-0 group-hover/btn:opacity-100 transition-opacity shrink-0 ml-2" aria-hidden />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ExecutiveReportRenderer
                      content={msg.content}
                      timestamp={msg.timestamp}
                    />
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="size-8 rounded-full bg-subtle border border-line text-fg-secondary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-3 text-body text-fg-tertiary" aria-live="polite">
                <div className="size-8 rounded-full bg-ink-950 text-ink-50 flex items-center justify-center shrink-0">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="bg-surface border border-line rounded-lg px-4 py-3 shadow-xs flex items-center gap-2">
                  <span className="text-body text-fg-secondary">
                    Analyzing call notes, telemetry and CRM dispositions...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* QUICK PROMPTS CHIPS */}
          <div className="pt-2 pb-2 shrink-0">
            <p className="text-caption text-fg-tertiary mb-1.5">
              Suggested questions
            </p>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {DEFAULT_PROMPTS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(p.query)}
                  className="focus-ring h-8 px-3 rounded-full bg-surface hover:bg-subtle border border-line text-small text-fg-secondary hover:text-fg whitespace-nowrap transition-colors duration-150 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* INPUT FORM (dark AI composer focus surface) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 mt-1 p-2 rounded-lg bg-ink-950 shrink-0 focus-within:ring-2 focus-within:ring-brand-500/40"
          >
            <Sparkles className="ml-2 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask anything... (e.g. 'What are our call drivers impacting bookings?' or 'Team stats yesterday')"
              aria-label="Ask the operations copilot"
              className="flex-1 min-w-0 bg-transparent px-2 py-2 text-body text-ink-50 placeholder:text-ink-400 focus:outline-none"
            />
            <Button
              type="submit"
              variant="brand"
              disabled={!inputQuery.trim() || isLoading}
              icon={isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            >
              <span className="hidden sm:inline">Ask</span>
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
