import { INodeDefinition, NodeExecutionContext } from './types';
import { WorkflowItem } from '../engine/item-pipeline';

export const webhookTriggerNode: INodeDefinition = {
  name: 'webhookTrigger',
  displayName: 'Webhook Trigger',
  description: 'Starts workflow when receiving an HTTP request (GET, POST, PUT, DELETE)',
  icon: 'Webhook',
  category: 'Triggers',
  group: ['trigger'],
  inputs: [],
  outputs: [{ id: 'output', type: 'main', label: 'Output' }],
  properties: [
    {
      name: 'httpMethod',
      displayName: 'HTTP Method',
      type: 'options',
      default: 'POST',
      options: [
        { name: 'POST', value: 'POST' },
        { name: 'GET', value: 'GET' },
        { name: 'PUT', value: 'PUT' },
        { name: 'DELETE', value: 'DELETE' }
      ]
    },
    {
      name: 'path',
      displayName: 'Webhook Path Slug',
      type: 'string',
      default: 'incoming-hook',
      required: true,
      description: 'The URL path suffix for this webhook endpoint'
    },
    {
      name: 'responseMode',
      displayName: 'Response Mode',
      type: 'options',
      default: 'onReceived',
      options: [
        { name: 'Immediately on Received', value: 'onReceived' },
        { name: 'Wait for Last Node Output', value: 'lastNode' }
      ]
    },
    {
      name: 'authSecret',
      displayName: 'Secret / Bearer Token',
      type: 'string',
      default: '',
      description: 'Required. Callers send it as "Authorization: Bearer <secret>" or an "X-Webhook-Secret" header.'
    }
  ],
  execute: async (context: NodeExecutionContext): Promise<WorkflowItem[][]> => {
    // If incoming payload was passed via trigger options
    if (context.inputItems && context.inputItems.length > 0 && Object.keys(context.inputItems[0].json).length > 0) {
      return [context.inputItems];
    }
    // Default mock payload for testing
    return [
      [
        {
          json: {
            headers: { 'content-type': 'application/json', 'user-agent': 'WebhookTest/1.0' },
            query: {},
            params: { path: context.config.path || 'incoming-hook' },
            body: { event: 'sample.ping', timestamp: new Date().toISOString() }
          }
        }
      ]
    ];
  }
};

export const scheduleTriggerNode: INodeDefinition = {
  name: 'scheduleTrigger',
  displayName: 'Schedule (Cron)',
  description: 'Triggers workflow automatically on a timed interval or cron schedule',
  icon: 'Clock',
  category: 'Triggers',
  group: ['trigger'],
  inputs: [],
  outputs: [{ id: 'output', type: 'main', label: 'Output' }],
  properties: [
    {
      name: 'mode',
      displayName: 'Trigger Frequency',
      type: 'options',
      default: 'interval',
      options: [
        { name: 'Every X Minutes', value: 'interval' },
        { name: 'Cron Expression', value: 'cron' }
      ]
    },
    {
      name: 'intervalMinutes',
      displayName: 'Interval (Minutes)',
      type: 'number',
      default: 15,
      displayOptions: { show: { mode: ['interval'] } }
    },
    {
      name: 'cronExpression',
      displayName: 'Cron Expression',
      type: 'string',
      default: '0 9 * * 1-5',
      description: 'Standard 5-field cron syntax (e.g. 0 9 * * 1-5 for Mon-Fri at 9 AM)',
      displayOptions: { show: { mode: ['cron'] } }
    },
    {
      name: 'timezone',
      displayName: 'Timezone',
      type: 'string',
      default: 'UTC'
    }
  ],
  execute: async (): Promise<WorkflowItem[][]> => {
    const now = new Date();
    return [
      [
        {
          json: {
            timestamp: now.toISOString(),
            epoch: now.getTime(),
            formatted: now.toUTCString()
          }
        }
      ]
    ];
  }
};

export const manualTriggerNode: INodeDefinition = {
  name: 'manualTrigger',
  displayName: 'Manual Trigger',
  description: 'Trigger workflow manually via the canvas test button with custom mock JSON',
  icon: 'PlayCircle',
  category: 'Triggers',
  group: ['trigger'],
  inputs: [],
  outputs: [{ id: 'output', type: 'main', label: 'Output' }],
  properties: [
    {
      name: 'mockPayload',
      displayName: 'Mock JSON Payload',
      type: 'json',
      default: '{\n  "leadName": "Arthur Vance",\n  "company": "Apex Global BPO",\n  "leadScore": 92\n}',
      description: 'Test payload passed into subsequent nodes'
    }
  ],
  execute: async (context: NodeExecutionContext): Promise<WorkflowItem[][]> => {
    if (context.inputItems && context.inputItems.length > 0 && Object.keys(context.inputItems[0].json).length > 0) {
      return [context.inputItems];
    }
    let parsed: any = {};
    try {
      parsed = JSON.parse(context.config.mockPayload || '{}');
    } catch {
      parsed = { raw: context.config.mockPayload };
    }
    return [[{ json: parsed }]];
  }
};

export const emailTriggerNode: INodeDefinition = {
  name: 'emailTrigger',
  displayName: 'Email / IMAP Trigger',
  description: 'Polls an IMAP inbox for new emails matching sender or subject criteria',
  icon: 'Mail',
  category: 'Triggers',
  group: ['trigger'],
  inputs: [],
  outputs: [{ id: 'output', type: 'main', label: 'Output' }],
  properties: [
    { name: 'host', displayName: 'IMAP Host', type: 'string', default: 'imap.gmail.com' },
    { name: 'port', displayName: 'Port', type: 'number', default: 993 },
    { name: 'senderFilter', displayName: 'Sender Filter', type: 'string', default: '' },
    { name: 'subjectFilter', displayName: 'Subject Filter', type: 'string', default: '' },
    { name: 'downloadAttachments', displayName: 'Download Attachments', type: 'boolean', default: false }
  ],
  execute: async (context: NodeExecutionContext): Promise<WorkflowItem[][]> => {
    return [
      [
        {
          json: {
            from: context.config.senderFilter || 'prospect@enterprise.com',
            subject: context.config.subjectFilter || 'Re: Partnership Inquiry',
            date: new Date().toISOString(),
            body: 'Sounds great! Let us schedule a 15-minute call on Thursday.'
          }
        }
      ]
    ];
  }
};

export const borisDispositionTriggerNode: INodeDefinition = {
  name: 'borisDispositionTrigger',
  displayName: 'Boris Cockpit Disposition',
  description: 'Triggers immediately when a call disposition is saved in AI Boris Calling Cockpit',
  icon: 'PhoneCall',
  category: 'Triggers',
  group: ['trigger'],
  inputs: [],
  outputs: [{ id: 'output', type: 'main', label: 'Output' }],
  properties: [
    {
      name: 'dispositionFilter',
      displayName: 'Call Disposition Filter',
      type: 'options',
      default: 'all',
      options: [
        { name: 'All Dispositions', value: 'all' },
        { name: 'Meeting Booked', value: 'Meeting Booked' },
        { name: 'Follow-up Required', value: 'Follow-up Required' },
        { name: 'Referral / Update Contact', value: 'Referral / Update Contact' },
        { name: 'Call back', value: 'Call back' },
        { name: 'No answer', value: 'No answer' },
        { name: 'Not interested', value: 'Not interested' },
        { name: 'Disqualified', value: 'Disqualified' },
        { name: 'Do not call', value: 'Do not call' }
      ]
    },
    {
      name: 'requirePhone',
      displayName: 'Require Valid Mobile Phone',
      type: 'boolean',
      default: true
    },
    {
      name: 'requireEmail',
      displayName: 'Require Email Address',
      type: 'boolean',
      default: true
    }
  ],
  execute: async (context: NodeExecutionContext): Promise<WorkflowItem[][]> => {
    if (context.inputItems && context.inputItems.length > 0 && Object.keys(context.inputItems[0].json).length > 0) {
      return [context.inputItems];
    }
    return [
      [
        {
          json: {
            disposition:
              context.config.dispositionFilter && context.config.dispositionFilter !== 'all'
                ? context.config.dispositionFilter
                : 'Meeting Booked',
            leadName: 'Sarah Jenkins',
            title: 'VP of Business Development',
            company: 'Nexus Logistics AI',
            phone: '+1 (555) 392-8812',
            email: 'sjenkins@nexuslogistics.ai',
            linkedInUrl: 'https://linkedin.com/in/sarahjenkins-nexus',
            repName: 'Boris AI Agent',
            scheduledTime: 'Tomorrow at 2:00 PM EST',
            callDuration: '4m 12s',
            notes: 'High intent. Asked for founder demo with Emil. Wants to automate after-call follow-ups for 12 SDRs.',
            timestamp: new Date().toISOString()
          }
        }
      ]
    ];
  }
};

