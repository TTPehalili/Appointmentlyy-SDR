import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey, domain } = await req.json();

    if (!provider || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'Provider and apiKey are required' },
        { status: 400 }
      );
    }

    const trimmedKey = apiKey.trim();
    const startTime = Date.now();

    // 1. Resend API Key Validation
    if (provider === 'resend') {
      if (!trimmedKey.startsWith('re_')) {
        return NextResponse.json({
          success: false,
          error: 'Invalid Resend API Key format. Resend keys must begin with "re_".'
        });
      }

      try {
        const res = await fetch('https://api.resend.com/api-keys', {
          headers: {
            'Authorization': `Bearer ${trimmedKey}`
          }
        });

        const latency = `${Date.now() - startTime}ms`;

        if (res.ok) {
          // If domain was also provided, check domain verification status
          let domainStatus = 'Verified & Ready';
          if (domain) {
            try {
              const domainRes = await fetch('https://api.resend.com/domains', {
                headers: { 'Authorization': `Bearer ${trimmedKey}` }
              });
              if (domainRes.ok) {
                const domainData = await domainRes.json();
                const matched = domainData.data?.find((d: any) => d.name.toLowerCase() === domain.toLowerCase().trim());
                if (matched) {
                  domainStatus = `Domain "${matched.name}" is ${matched.status}`;
                }
              }
            } catch {}
          }

          return NextResponse.json({
            success: true,
            latency,
            provider: 'resend',
            message: `Resend API Key is active. ${domainStatus}`
          });
        } else {
          const errData = await res.json().catch(() => ({}));
          return NextResponse.json({
            success: false,
            latency,
            error: errData.message || `Resend authentication failed (${res.status}). Please check your API key in the Resend dashboard.`
          });
        }
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: `Network error connecting to Resend: ${err.message}`
        });
      }
    }

    // 2. OpenAI API Key Validation
    if (provider === 'openai') {
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${trimmedKey}` }
        });
        const latency = `${Date.now() - startTime}ms`;
        if (res.ok) {
          return NextResponse.json({
            success: true,
            latency,
            provider: 'openai',
            model: 'gpt-4o',
            message: 'OpenAI API Key verified successfully.'
          });
        } else {
          return NextResponse.json({
            success: false,
            latency,
            error: 'Invalid OpenAI API Key or account quota exceeded.'
          });
        }
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: `Network error connecting to OpenAI: ${err.message}`
        });
      }
    }

    // 3. Anthropic Claude API Key Validation
    if (provider === 'claude') {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': trimmedKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }]
          })
        });
        const latency = `${Date.now() - startTime}ms`;
        // 200 or 400 with invalid tokens still means key authenticated (401 means invalid key)
        if (res.status !== 401 && res.status !== 403) {
          return NextResponse.json({
            success: true,
            latency,
            provider: 'claude',
            model: 'claude-3-5-sonnet',
            message: 'Anthropic Claude API Key verified successfully.'
          });
        } else {
          return NextResponse.json({
            success: false,
            latency,
            error: 'Invalid Anthropic API Key. Please verify in console.anthropic.com.'
          });
        }
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: `Network error connecting to Anthropic: ${err.message}`
        });
      }
    }

    // 4. ElevenLabs API Key Validation (the platform's voice engine). Calls ElevenLabs itself:
    //    GET /v1/user for tier and character quota. A key scoped without "User: read" is checked
    //    against GET /v1/models instead, so TTS-only keys still validate.
    if (provider === 'elevenlabs') {
      try {
        const headers = { 'xi-api-key': trimmedKey };
        const res = await fetch('https://api.elevenlabs.io/v1/user', { headers });
        const latency = `${Date.now() - startTime}ms`;
        if (res.ok) {
          const userData = await res.json().catch(() => ({}));
          const sub = userData.subscription || {};
          const tier = sub.tier || 'active';
          const used = Number(sub.character_count);
          const limit = Number(sub.character_limit);
          const quota = Number.isFinite(used) && Number.isFinite(limit) && limit > 0
            ? ` ${Math.max(0, limit - used).toLocaleString('en-US')} of ${limit.toLocaleString('en-US')} characters left.`
            : '';
          return NextResponse.json({
            success: true,
            latency,
            provider: 'elevenlabs',
            message: `ElevenLabs key verified (tier: ${tier}).${quota}`
          });
        }
        const errBody = await res.json().catch(() => ({}));
        const detailStatus = typeof errBody?.detail === 'object' ? errBody.detail?.status : '';
        if (detailStatus === 'missing_permissions') {
          const modelsRes = await fetch('https://api.elevenlabs.io/v1/models', { headers });
          if (modelsRes.ok) {
            return NextResponse.json({
              success: true,
              latency: `${Date.now() - startTime}ms`,
              provider: 'elevenlabs',
              message: 'ElevenLabs key verified. It is scoped without account access, so tier and quota are not shown.'
            });
          }
        }
        return NextResponse.json({
          success: false,
          latency,
          error: detailStatus === 'quota_exceeded'
            ? 'This ElevenLabs key is valid but its character quota is used up.'
            : 'Invalid ElevenLabs API key. Copy it again from elevenlabs.io, Developers, API keys.'
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: `Network error connecting to ElevenLabs: ${err.message}`
        });
      }
    }

    // 5. Google Gemini API Key Validation (text model)
    if (provider === 'gemini') {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(trimmedKey)}`);
        const latency = `${Date.now() - startTime}ms`;
        if (res.ok) {
          return NextResponse.json({
            success: true,
            latency,
            provider: 'gemini',
            message: 'Google Gemini API key verified.'
          });
        }
        return NextResponse.json({
          success: false,
          latency,
          error: 'Invalid Google Gemini API key. Check it in Google AI Studio.'
        });
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: `Network error connecting to Google Gemini: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    }

    // Unknown provider: never report a key as valid without checking it.
    return NextResponse.json(
      { success: false, latency: `${Date.now() - startTime}ms`, error: `Unknown provider "${String(provider)}".` },
      { status: 400 }
    );

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Internal error validating credentials' },
      { status: 500 }
    );
  }
}
