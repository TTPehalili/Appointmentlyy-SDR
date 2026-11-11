import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getServiceSupabase } from '@/lib/supabase';
import { CadenceGenerator } from '@/lib/cadenceGenerator';
import { Lead } from '@/types';
import { getServerSession } from '@/lib/server/session';
import { toLeadRows } from '@/lib/server/leadImport';

export async function POST(req: NextRequest) {
  // The workspace always comes from the session, never the request.
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  try {
    const contentType = req.headers.get('content-type') || '';
    let csvData = '';
    let campaignId = 'enterprise-outbound';
    let assignedRepId: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      campaignId = (formData.get('campaignId') as string) || campaignId;
      assignedRepId = (formData.get('assignedRepId') as string) || null;
      if (file) {
        csvData = await file.text();
      }
    } else {
      const body = await req.json();
      csvData = body.csvData || '';
      campaignId = body.campaignId || campaignId;
      assignedRepId = body.assignedRepId || null;
    }

    if (!csvData || csvData.trim().length === 0) {
      return NextResponse.json({ error: 'CSV data is empty' }, { status: 400 });
    }

    // 1. Parse CSV with PapaParse
    const parsed = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors && parsed.errors.length > 0) {
      console.warn('[CSV Import] Notice on rows:', parsed.errors.slice(0, 3));
    }

    const rows = parsed.data as Record<string, string>[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in CSV' }, { status: 400 });
    }

    // 2. Intelligent Auto-Column Mapping
    const mappedLeads: Lead[] = rows.map((row, index) => {
      const keys = Object.keys(row);
      const findKey = (...aliases: string[]) => {
        const lowerAliases = aliases.map(a => a.toLowerCase().replace(/[^a-z0-9]/g, ''));
        return keys.find(k => {
          const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          return lowerAliases.includes(cleanK);
        });
      };

      const emailKey = findKey('email', 'email address', 'e-mail', 'mail');
      const companyKey = findKey('company', 'company name', 'account', 'organization');
      const titleKey = findKey('title', 'job title', 'role', 'position');
      const phoneKey = findKey('phone', 'phone number', 'mobile', 'telephone');
      const firstNameKey = findKey('first name', 'firstname', 'first', 'fname');
      const lastNameKey = findKey('last name', 'lastname', 'last', 'lname');
      const fullNameKey = findKey('name', 'full name', 'contact name');
      const websiteKey = findKey('website', 'site', 'url', 'domain', 'company url', 'web', 'homepage');
      const linkedinKey = findKey('linkedin', 'linkedin url', 'person linkedin', 'profile', 'linkedin profile', 'contact linkedin', 'social');
      const signalKey = findKey('signal', 'buying signal', 'signals', 'buying signals', 'triggers', 'trigger', 'recent news', 'notes', 'intel', 'context');
      const techStackKey = findKey('tech stack', 'tech', 'crm', 'technologies', 'sales tools', 'software', 'dialer');
      const painPointKey = findKey('pain point', 'pain', 'challenge', 'bottleneck', 'problem', 'objection');
      const outsourcerKey = findKey('outsourcer', 'vendor', 'current agency', 'agency', 'competitor', 'incumbent');
      const headcountKey = findKey('headcount', 'seats', 'team size', 'employees', 'company size');

      let firstName = firstNameKey ? row[firstNameKey] : '';
      let lastName = lastNameKey ? row[lastNameKey] : '';

      if (!firstName && fullNameKey && row[fullNameKey]) {
        const parts = row[fullNameKey].trim().split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }

      // Collect custom variables & ensure website, linkedin, signals are stored
      const standardKeys = [emailKey, companyKey, titleKey, phoneKey, firstNameKey, lastNameKey, fullNameKey].filter(Boolean);
      const customVars: Record<string, string> = {};
      for (const k of keys) {
        if (!standardKeys.includes(k) && row[k]) {
          customVars[k] = row[k];
        }
      }

      if (websiteKey && row[websiteKey]) customVars['website'] = row[websiteKey];
      if (linkedinKey && row[linkedinKey]) customVars['linkedin_url'] = row[linkedinKey];
      if (signalKey && row[signalKey]) customVars['buying_signals'] = row[signalKey];
      if (techStackKey && row[techStackKey]) customVars['tech_stack'] = row[techStackKey];
      if (painPointKey && row[painPointKey]) customVars['pain_point'] = row[painPointKey];
      if (outsourcerKey && row[outsourcerKey]) customVars['outsourcer'] = row[outsourcerKey];
      if (headcountKey && row[headcountKey]) customVars['headcount'] = row[headcountKey];

      return {
        id: `lead-${Date.now()}-${index}`,
        campaign_id: campaignId,
        assigned_rep_id: assignedRepId || undefined,
        first_name: firstName || 'Prospect',
        last_name: lastName || '',
        email: (emailKey ? row[emailKey] : '') || `lead${index}@example.com`,
        phone: phoneKey ? row[phoneKey] : '',
        company: (companyKey ? row[companyKey] : '') || 'Target Account',
        title: (titleKey ? row[titleKey] : '') || 'Executive',
        status: 'new',
        website: websiteKey ? row[websiteKey] : undefined,
        linkedin_url: linkedinKey ? row[linkedinKey] : undefined,
        signals: signalKey ? row[signalKey] : undefined,
        custom_variables: customVars,
        created_at: new Date().toISOString()
      };
    });

    // 3. Mirror into the Supabase leads table, tagged with the importing workspace. Only with the
    // server's service key (never the public key). The browser keeps its own copy of the import,
    // so a failed mirror is logged here and the import still succeeds for the user.
    if ((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
      try {
        const recordsToInsert = toLeadRows(mappedLeads, { tenantCode: session.tenantCode, campaignId, assignedRepId });
        const { error } = await getServiceSupabase().from('leads').insert(recordsToInsert);
        if (error) {
          console.error(`[CSV Import] Supabase insert failed for workspace ${session.tenantCode} (${recordsToInsert.length} rows): ${error.message}`);
        }
      } catch (dbErr) {
        console.error('[CSV Import] Supabase insert error:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      importedCount: mappedLeads.length,
      leads: mappedLeads
    });

  } catch (error: any) {
    console.error('[CSV Import] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import CSV' },
      { status: 500 }
    );
  }
}
