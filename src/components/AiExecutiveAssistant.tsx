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
import AppSidebar from '@/components/AppSidebar';
import GlobalTopHeader from '@/components/GlobalTopHeader';
import { buildOpsSnapshot } from '@/lib/opsSnapshot';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const DEFAULT_PROMPTS = [
  {
    label: '📊 Overall Team Stats (Today vs Last Week)',
    query: 'Tell me the overall stats of my team today, yesterday, last week, next week, last month.'
  },
  {
    label: '🔍 Call Drivers Impacting Booking Rate',
    query: 'Tell what our call drivers are that are impacting our booking rate performance based on all call notes and dispositions.'
  },
  {
    label: '🎯 Julian Vance Call Deep-Dive (Apex Global)',
    query: 'What were the exact objections and conversation details on Julian Vance call?'
  },
  {
    label: '🛡️ ARM Objection Battlecards & Rebuttals',
    query: 'Show me the ARM battlecards and rebuttal scripts for price and competitor objections.'
  },
  {
    label: '🏆 Floor Rep Leaderboard & Quotas',
    query: 'Who are our top performing reps today and what is their script adherence?'
  },
  {
    label: '🔮 Next Week Follow-Up Forecast',
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
    <div className="flex h-screen bg-[#F2F0EF] text-[#222021] font-sans antialiased overflow-hidden">
      <AppSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <GlobalTopHeader />

        <div className="max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col h-[calc(100vh-5rem)]">
          
          {/* HEADER */}
          <div className="flex items-center justify-between pb-3 border-b border-[#222021]/10 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-[#222021] text-white">
                  <BorisOperationsIcon className="h-5 w-5 text-[#ED1C24]" />
                </span>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#ED1C24]">
                  AI BORIS OPERATIONS INTELLIGENCE
                </span>
              </div>
              <h1 className="text-2xl font-black text-[#222021] tracking-tight mt-1">
                Executive Operations Copilot
              </h1>
              <p className="text-xs text-[#6b6968]">
                Ask any question about team stats, call notes, conversion drivers, and appointment booking trends.
              </p>
            </div>

            <Link
              href="/analytics"
              className="px-3 py-1.5 rounded-xl bg-white border border-[#222021]/15 text-xs font-bold text-[#222021] hover:border-[#ED1C24] flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <BarChart3 className="h-4 w-4 text-[#ED1C24]" />
              <span className="hidden sm:inline">View Performance Dashboard</span>
              <ExternalLink className="h-3 w-3 text-slate-400" />
            </Link>
          </div>

          {/* CHAT MESSAGES DISPLAY */}
          <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-[#222021] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5 border border-[#222021]/10">
                    <BorisOperationsIcon className="h-4 w-4 text-[#ED1C24]" />
                  </div>
                )}

                <div
                  className={`max-w-[92%] rounded-2xl p-5 shadow-xs relative group ${
                    msg.sender === 'user'
                      ? 'bg-[#ED1C24] text-white font-medium self-end ml-auto'
                      : 'bg-white border border-[#222021]/15 text-[#222021] shadow-sm'
                  }`}
                >
                  {msg.sender === 'user' ? (
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-1 text-[10px] font-mono opacity-80 border-b border-white/20 mb-2">
                        <span>Supervisor Inquiry</span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <div className="text-xs font-semibold leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  ) : msg.id === 'welcome' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-[#222021]/10">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[#ED1C24] text-white text-[10px] font-mono font-bold uppercase">
                            ACTIVE COPILOT
                          </span>
                          <span className="text-xs font-bold text-[#222021]">
                            AI Boris Executive Operations Intelligence
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-[#6b6968]">{msg.timestamp}</span>
                      </div>

                      <p className="text-xs text-[#333130] leading-relaxed">
                        I am your <strong>AI Operations & Floor Intelligence Copilot</strong>. I synthesize call telemetry, auto-notetaker summaries, rep cadence activities, and CRM dispositions across all your campaigns into executive-ready email reports.
                      </p>

                      <div className="pt-2 border-t border-[#222021]/10">
                        <span className="text-[10px] font-mono font-bold uppercase text-[#6b6968] block mb-2">
                          Click any question below to generate an instant email report:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {DEFAULT_PROMPTS.map((p, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSendMessage(p.query)}
                              className="text-left p-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 border border-[#222021]/10 text-xs font-medium text-[#222021] transition-all hover:border-[#ED1C24] flex items-center justify-between group/btn cursor-pointer"
                            >
                              <span>{p.label}</span>
                              <Sparkles className="h-3 w-3 text-[#ED1C24] opacity-0 group-hover/btn:opacity-100 transition-opacity shrink-0 ml-1" />
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
                  <div className="w-8 h-8 rounded-xl bg-[#222021] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5 font-mono font-bold text-xs">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-[#ED1C24] flex items-center justify-center shrink-0 shadow-xs border border-slate-800">
                  <Loader2 className="h-4 w-4 animate-spin text-[#ED1C24]" />
                </div>
                <div className="bg-white border border-[#222021]/15 rounded-2xl px-4 py-3 shadow-2xs flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-700">
                    Boris AI is analyzing call notes, telemetry, and CRM dispositions...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* QUICK PROMPTS CHIPS */}
          <div className="pt-2 pb-2 shrink-0">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
              Suggested Operations Inquiries:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {DEFAULT_PROMPTS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(p.query)}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-[#222021]/15 text-[11px] font-semibold text-slate-800 whitespace-nowrap transition-colors shadow-2xs cursor-pointer hover:border-[#ED1C24]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* INPUT FORM */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 pt-1 shrink-0"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask anything... (e.g. 'What are our call drivers impacting bookings?' or 'Team stats yesterday')"
              className="flex-1 bg-white border border-[#222021]/15 rounded-xl px-4 py-3 text-xs text-[#222021] placeholder-[#6b6968] focus:outline-none focus:ring-2 focus:ring-[#ED1C24] shadow-xs"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="px-5 py-3 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] disabled:bg-slate-300 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="hidden sm:inline">Ask Boris</span>
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
