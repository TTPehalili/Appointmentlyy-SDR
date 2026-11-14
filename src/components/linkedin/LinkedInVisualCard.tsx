'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Copy, 
  Check, 
  Download, 
  ImageIcon, 
  Camera, 
  Layers, 
  RefreshCw, 
  CheckCircle2,
  Edit3,
  ShieldCheck
} from 'lucide-react';
import { VisualCardConfig } from '@/lib/linkedinStudio';
import { Button, SegmentedControl, Textarea } from '@/components/ui';

export interface PovPhotoItem {
  id: string;
  url: string;
  headline: string;
  subtitle: string;
  badge: string;
  badgeType: 'devil' | 'filipino' | 'client' | 'ops';
  prompt: string;
  buttonLabel: string;
}

export const POV_IMAGE_CATALOG: PovPhotoItem[] = [
  {
    id: 'broker-devil',
    url: '/images/linkedin/broker-middleman-devil.jpg',
    headline: 'THE BROKER TAX: 60% Cut & OPEX Drain',
    subtitle: 'Predatory Middleman • 60% Skim & Floor Control Takeover',
    badge: '⚠️ Devil in Disguise',
    badgeType: 'devil',
    buttonLabel: '⚠️ 60% Broker Tax',
    prompt: 'A cinematic 35mm editorial photograph of a predatory corporate lead broker and middleman depicted as a devil in disguise: An arrogant, manipulative man in his late 40s in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom, steepled hands, wearing a calculating cynical smirk over contracts stamped with 60% broker cut and cheap pay-per-performance terms. Chiaroscuro dramatic lighting with subtle crimson rim light, psychological thriller tone, zero corporate cheer.'
  },
  {
    id: 'script-discard-sparring',
    url: '/images/linkedin/script-discard-sparring.jpg',
    headline: 'SCRIPTLESS TELEPROMPTER',
    subtitle: 'Sub-150ms Live Objection Teleprompting & Discarded Scripts',
    badge: '🇵🇭 Authentic Filipino Talent',
    badgeType: 'filipino',
    buttonLabel: '⚡ Scriptless Teleprompter',
    prompt: 'Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling. Dual screens display "LIVE OBJECTION TELEPROMPTER CUES - 150ms LATENCY" and real-time prospect telemetry. On the desk next to him, a crumpled static PDF script sits discarded in a recycling bin, symbolizing the transition from rigid scripts to agile voice sparring. Modern glass architecture, warm natural daylight, Kodak Portra 400 aesthetic, authentic Filipino BPO setting.'
  },
  {
    id: 'direct-partnership-equity',
    url: '/images/linkedin/direct-partnership-equity.jpg',
    headline: 'DIRECT CONTRACT EQUITY',
    subtitle: 'Foreign Client & Filipino BPO Director Strategic Partnership',
    badge: '🤝 Client & PH Talent',
    badgeType: 'client',
    buttonLabel: '🤝 Client & Talent Equity',
    prompt: 'A candid 35mm photograph showing the direct relationship between a foreign enterprise client and Filipino offshore talent: A senior North American client executive in a tailored navy blazer and a distinguished, articulate Filipino female BPO operations director collaborating as equal strategic partners. They stand beside a transparent glass architectural whiteboard displaying "DIRECT SEAT CONTRACT ECONOMICS • 100% EQUITY RETENTION • REVENUE VELOCITY". Authentic warm golden hour sunlight, Kodak Portra 800 tone, respectful peer-to-peer partnership, zero generic stock poses.'
  },
  {
    id: 'hostile-coaching',
    url: '/images/linkedin/episode-2-realistic.jpg',
    headline: 'OBJECTION SPARRING COACH',
    subtitle: 'Manila BPO Team Leader Mentoring SDR on Objection Playbook',
    badge: '🇵🇭 Authentic Filipino Talent',
    badgeType: 'filipino',
    buttonLabel: '🇵🇭 Coach Mentorship',
    prompt: 'A candid, authentic 35mm photograph in a modern Manila BPO office: A smart Filipino male team leader and sales coach with authentic Southeast Asian features mentoring a young female Filipino SDR over a laptop screen, reviewing an objection playbook. Warm daylight, modern contemporary startup office, natural unposed expressions of focus and camaraderie, call floor softly visible in background, Fujicolor Pro 400H tone, genuine Filipino workplace culture.'
  },
  {
    id: 'enriched-pipeline',
    url: '/images/linkedin/episode-1-realistic.jpg',
    headline: 'ENRICHED PIPELINE RESEARCH',
    subtitle: 'Focused Manila BGC SDR Analyzing Target Enterprise Accounts',
    badge: '🇵🇭 Authentic Filipino Talent',
    badgeType: 'filipino',
    buttonLabel: '🎯 Pipeline Research Desk',
    prompt: 'A realistic, relatable, candid 35mm photograph of a young professional Filipino female sales development representative with authentic Southeast Asian features, working at a clean minimalist office desk in Manila BGC. She is focused on dual monitor screens showing clean data charts, wearing a subtle call center headset, ID lanyard, holding a pen over a notebook with a ceramic coffee mug nearby. Soft natural daylight from high-rise office windows, authentic human expression, natural skin texture, Kodak Portra 400 film aesthetic, shallow depth of field, authentic Filipino BPO workplace.'
  },
  {
    id: 'operations-telemetry',
    url: '/images/linkedin/episode-5-realistic.jpg',
    headline: 'FLOOR PRODUCTION METRICS',
    subtitle: 'Filipino Operations Director Reviewing Live Telemetry Metrics',
    badge: '🇵🇭 Authentic Filipino Talent',
    badgeType: 'filipino',
    buttonLabel: '📊 Floor Ops Director',
    prompt: 'A documentary 35mm photograph of an experienced Filipino operations manager with authentic Southeast Asian features, collaborating inside a modern Manila tech office in BGC. Standing beside a digital dashboard showing outbound retention rates and live dial telemetry, reviewing real-time rep performance with clear authority. Natural office ambient lighting, unposed documentary photography, Kodachrome tones, authentic Filipino leadership.'
  }
];

interface LinkedInVisualCardProps {
  visualConfig: VisualCardConfig;
  imagePrompt: string;
  realisticPhotoPrompt?: string;
  realisticImageUrl?: string;
  alternativeImageUrl?: string;
  alternativeImageLabel?: string;
  alternativeImagePrompt?: string;
  episodeNumber: number;
  postTitle?: string;
  postHook?: string;
  postBody?: string;
}

export default function LinkedInVisualCard({
  visualConfig,
  imagePrompt,
  realisticPhotoPrompt,
  realisticImageUrl,
  alternativeImageUrl,
  alternativeImageLabel = 'The Middleman Trap (Devil in Disguise)',
  alternativeImagePrompt,
  episodeNumber,
  postTitle,
  postHook,
  postBody
}: LinkedInVisualCardProps) {
  // Visual Mode: 'photo' (Realistic & Relatable) vs 'graphic' (Minimalist Executive Graphic)
  const [visualMode, setVisualMode] = useState<'photo' | 'graphic'>('photo');

  // Variant switcher: 'primary' vs 'alternative'
  const [activeVariant, setActiveVariant] = useState<'primary' | 'alternative'>('primary');

  // Find initial catalog index matching realisticImageUrl or fallback
  const getCatalogIndex = (url?: string): number => {
    if (!url) return (episodeNumber - 1) % POV_IMAGE_CATALOG.length;
    const foundIdx = POV_IMAGE_CATALOG.findIndex(item => item.url === url);
    return foundIdx >= 0 ? foundIdx : (episodeNumber - 1) % POV_IMAGE_CATALOG.length;
  };

  const initialCatalogIndex = getCatalogIndex(realisticImageUrl);
  const [currentCatalogIndex, setCurrentCatalogIndex] = useState<number>(initialCatalogIndex);
  const [customPrimaryPrompt, setCustomPrimaryPrompt] = useState<string>(
    realisticPhotoPrompt || POV_IMAGE_CATALOG[initialCatalogIndex].prompt
  );
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Synchronize when parent props change
  useEffect(() => {
    const nextIdx = getCatalogIndex(realisticImageUrl);
    setCurrentCatalogIndex(nextIdx);
    setCustomPrimaryPrompt(realisticPhotoPrompt || POV_IMAGE_CATALOG[nextIdx].prompt);
  }, [realisticImageUrl, realisticPhotoPrompt]);

  const activeCatalogItem = POV_IMAGE_CATALOG[currentCatalogIndex];

  // Resolve alternative item details if alternativeImageUrl exists
  const altCatalogItem = alternativeImageUrl 
    ? POV_IMAGE_CATALOG.find(item => item.url === alternativeImageUrl)
    : null;

  // Active photo URL
  const displayedPhotoUrl = activeVariant === 'alternative' && alternativeImageUrl
    ? alternativeImageUrl
    : activeCatalogItem.url;

  // Active prompt: strictly in sync with the displayed photo!
  const displayedPhotoPrompt = activeVariant === 'alternative' && alternativeImageUrl
    ? (alternativeImagePrompt || altCatalogItem?.prompt || POV_IMAGE_CATALOG[0].prompt)
    : customPrimaryPrompt;

  // Active headline and subtitle overlay
  const displayedHeadline = activeVariant === 'alternative'
    ? (altCatalogItem?.headline || 'THE BROKER TAX: Margin Skim')
    : activeCatalogItem.headline;

  const displayedSubtitle = activeVariant === 'alternative'
    ? (altCatalogItem?.subtitle || 'Predatory Lead Broker • Devil in Disguise Archetype')
    : activeCatalogItem.subtitle;

  // Active cultural badge
  const displayedBadge = activeVariant === 'alternative'
    ? (altCatalogItem?.badge || '⚠️ Devil in Disguise')
    : activeCatalogItem.badge;

  const displayedBadgeType = activeVariant === 'alternative'
    ? (altCatalogItem?.badgeType || 'devil')
    : activeCatalogItem.badgeType;

  const primaryButtonLabel = activeCatalogItem.buttonLabel || '📸 Primary Photo';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Cycle to next authentic photo in curated catalog
  const handleCycleAuthenticPhoto = () => {
    const nextIndex = (currentCatalogIndex + 1) % POV_IMAGE_CATALOG.length;
    setCurrentCatalogIndex(nextIndex);
    setCustomPrimaryPrompt(POV_IMAGE_CATALOG[nextIndex].prompt);
    setActiveVariant('primary');
  };

  // Reset to default photo & prompt
  const handleResetDefaultPhoto = () => {
    setCurrentCatalogIndex(initialCatalogIndex);
    setCustomPrimaryPrompt(realisticPhotoPrompt || POV_IMAGE_CATALOG[initialCatalogIndex].prompt);
    setActiveVariant('primary');
  };

  // Download the realistic JPG photo directly
  const handleDownloadPhoto = async () => {
    setDownloading(true);
    const photoToDownload = displayedPhotoUrl;
    const downloadFilename = activeVariant === 'alternative' 
      ? `linkedin-ep${episodeNumber}-alternative-visual.jpg` 
      : `linkedin-ep${episodeNumber}-${activeCatalogItem.id}.jpg`;

    try {
      const response = await fetch(photoToDownload);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Failed to download photo:', err);
      const link = document.createElement('a');
      link.href = photoToDownload;
      link.download = downloadFilename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setDownloading(false);
    }
  };

  // Download SVG Graphic
  const handleDownloadSvg = () => {
    setDownloading(true);
    try {
      const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#09090b" />
      <stop offset="50%" stop-color="#18181b" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#27272a" stroke-width="1" opacity="0.3"/>
    </pattern>
  </defs>
  
  <rect width="1080" height="1080" fill="url(#bgGrad)"/>
  <rect width="1080" height="1080" fill="url(#grid)"/>
  <circle cx="540" cy="400" r="320" fill="#3f3f46" opacity="0.1" filter="blur(80px)"/>
  <rect x="40" y="40" width="1000" height="1000" rx="28" fill="none" stroke="#27272a" stroke-width="2"/>
  
  <rect x="90" y="100" width="280" height="48" rx="24" fill="#27272a"/>
  <text x="230" y="132" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#f43f5e" letter-spacing="2" text-anchor="middle">
    ${(visualConfig.tag || `EPISODE 0${episodeNumber}`).toUpperCase()}
  </text>
  
  <text x="990" y="132" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="#71717a" text-anchor="end">
    APPOINTMENTLYY INTELLIGENCE
  </text>
  
  <text x="90" y="380" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="130" font-weight="900" fill="#ffffff" letter-spacing="-3">
    ${visualConfig.metric || '82%'}
  </text>
  
  <text x="90" y="440" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="600" fill="#a1a1aa">
    ${visualConfig.metricLabel || 'Operational Benchmark'}
  </text>
  
  <line x1="90" y1="490" x2="990" y2="490" stroke="#3f3f46" stroke-width="2"/>
  
  <text x="90" y="600" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="800" fill="#f4f4f5">
    ${visualConfig.headline.length > 36 ? visualConfig.headline.slice(0, 36) + '...' : visualConfig.headline}
  </text>
  
  <text x="90" y="670" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="400" fill="#a1a1aa">
    ${visualConfig.subheadline || 'Key operational takeaway for BPO and outbound leaders'}
  </text>
  
  <rect x="90" y="900" width="900" height="80" rx="16" fill="#18181b" stroke="#27272a" stroke-width="1"/>
  <text x="130" y="948" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="600" fill="#e4e4e7">
    BPO Client Acquisition &amp; High-Retention Seat Architecture
  </text>
  <text x="950" y="948" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="#10b981" text-anchor="end">
    VERIFIED BENCHMARK
  </text>
</svg>`;

      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `linkedin-ep${episodeNumber}-graphic.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download SVG:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      {/* Visual header & mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-fg-secondary" />
          <span className="text-body-strong text-fg">Post image</span>
          <span className="flex items-center gap-1 text-small text-fg-tertiary">
            <ShieldCheck className="h-3.5 w-3.5 text-success-fg" />
            Matches the post
          </span>
        </div>

        <SegmentedControl
          size="sm"
          label="Image type"
          value={visualMode}
          onChange={(v) => setVisualMode(v as 'photo' | 'graphic')}
          items={[
            {
              value: 'photo',
              label: (
                <span className="flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" />
                  <span>Photo</span>
                </span>
              ),
            },
            {
              value: 'graphic',
              label: (
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  <span>Graphic</span>
                </span>
              ),
            },
          ]}
        />
      </div>

      {/* =================================================================== */}
      {/* MODE 1: REALISTIC PHOTO PREVIEW                                     */}
      {/* =================================================================== */}
      {visualMode === 'photo' ? (
        <div className="space-y-3">
          {/* Primary vs alternative photo */}
          {alternativeImageUrl && (
            <div className="flex items-center justify-center gap-1 rounded-md border border-line bg-subtle p-0.5 text-small">
              <button
                type="button"
                onClick={() => setActiveVariant('primary')}
                aria-pressed={activeVariant === 'primary'}
                className={`focus-ring rounded-sm px-2.5 py-1 transition-colors ${
                  activeVariant === 'primary'
                    ? 'bg-selected font-medium text-selected-fg shadow-xs'
                    : 'text-fg-secondary hover:bg-surface hover:text-fg'
                }`}
              >
                {primaryButtonLabel}
              </button>
              <button
                type="button"
                onClick={() => setActiveVariant('alternative')}
                aria-pressed={activeVariant === 'alternative'}
                className={`focus-ring flex items-center gap-1 rounded-sm px-2.5 py-1 transition-colors ${
                  activeVariant === 'alternative'
                    ? 'bg-selected font-medium text-selected-fg shadow-xs'
                    : 'text-fg-secondary hover:bg-surface hover:text-fg'
                }`}
              >
                <span>{alternativeImageLabel}</span>
              </button>
            </div>
          )}

          {/* Photo */}
          <div className="group relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-lg border border-line bg-subtle">
            <img
              src={displayedPhotoUrl}
              alt={`LinkedIn Episode ${episodeNumber} Visual`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />

            {/* Style & audience labels */}
            <div className="pointer-events-none absolute left-2 right-2 top-2 z-10 flex items-center justify-between gap-1">
              <span className="rounded-sm bg-ink-950/75 px-2 py-0.5 text-caption text-ink-50 backdrop-blur-xs">
                Candid 35mm
              </span>

              {displayedBadgeType === 'devil' ? (
                <span className="rounded-sm bg-ink-950/75 px-2 py-0.5 text-caption text-ink-50 backdrop-blur-xs">
                  {displayedBadge}
                </span>
              ) : displayedBadgeType === 'client' ? (
                <span className="rounded-sm bg-ink-950/75 px-2 py-0.5 text-caption text-ink-50 backdrop-blur-xs">
                  {displayedBadge}
                </span>
              ) : (
                <span className="rounded-sm bg-ink-950/75 px-2 py-0.5 text-caption text-ink-50 backdrop-blur-xs">
                  {displayedBadge}
                </span>
              )}
            </div>

            {/* Headline overlay */}
            <div className="absolute bottom-2 left-2 right-2 z-10 rounded-md bg-ink-950/80 p-2 text-left backdrop-blur-xs">
              <div className="truncate text-caption text-ink-50">
                {displayedHeadline}
              </div>
              <div className="line-clamp-1 text-caption font-normal text-ink-400">
                {displayedSubtitle}
              </div>
            </div>
          </div>

          {/* Photo prompt (kept in sync with the photo) */}
          <div className="space-y-2 rounded-md border border-line bg-subtle p-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-small font-medium text-fg">
                <Sparkles className="h-3.5 w-3.5 text-fg-secondary" />
                Photo prompt
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                  title="Customize photographic prompt"
                  className="h-7 px-2"
                >
                  <Edit3 />
                  <span>{isEditingPrompt ? 'Close' : 'Edit'}</span>
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(displayedPhotoPrompt, `prompt-photo-${episodeNumber}`)}
                  className="h-7 px-2"
                >
                  {copiedKey === `prompt-photo-${episodeNumber}` ? (
                    <>
                      <Check />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy />
                      <span>Copy prompt</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {isEditingPrompt ? (
              <Textarea
                value={displayedPhotoPrompt}
                onChange={(e) => setCustomPrimaryPrompt(e.target.value)}
                rows={3}
                className="min-h-0 text-small"
              />
            ) : (
              <p className="line-clamp-3 rounded-sm border border-line bg-surface p-2 text-small leading-relaxed text-fg-secondary">
                {displayedPhotoPrompt}
              </p>
            )}
          </div>

          {/* Switch photo & download */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCycleAuthenticPhoto}
              title="Cycle through curated authentic 35mm photos with synchronized prompts"
            >
              <RefreshCw />
              <span>Switch photo</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadPhoto}
              disabled={downloading}
            >
              <Download />
              <span>{downloading ? 'Saving...' : 'Download JPG'}</span>
            </Button>
          </div>

          {currentCatalogIndex !== initialCatalogIndex && (
            <div className="text-center">
              <Button variant="ghost" size="sm" onClick={handleResetDefaultPhoto}>
                Reset to episode {episodeNumber} default
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* =================================================================== */
        /* MODE 2: GRAPHIC PREVIEW (the exported graphic itself is dark)       */
        /* =================================================================== */
        <div className="space-y-3">
          <div
            className="group relative mx-auto flex aspect-square w-full max-w-[280px] select-none flex-col justify-between overflow-hidden rounded-lg border border-line bg-inverse p-4 text-ink-50"
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--ink-800)_1px,transparent_1px),linear-gradient(to_bottom,var(--ink-800)_1px,transparent_1px)] bg-[size:16px_16px] opacity-40" />

            <div className="relative z-10 flex items-center justify-between">
              <span className="rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-caption text-ink-50">
                {visualConfig.tag || `EPISODE 0${episodeNumber}`}
              </span>
              <span className="text-caption font-normal text-ink-400">
                Appointmentlyy
              </span>
            </div>

            <div className="relative z-10 my-auto space-y-1 text-center">
              <div className="text-display tabular-nums text-ink-50">
                {visualConfig.metric || '82%'}
              </div>
              <div className="px-2 text-caption leading-tight text-ink-400">
                {visualConfig.metricLabel || 'Operational Metric'}
              </div>
            </div>

            <div className="relative z-10 space-y-0.5 border-t border-ink-800 pt-2 text-left">
              <div className="line-clamp-2 text-caption leading-tight text-ink-50">
                {visualConfig.headline}
              </div>
              <div className="line-clamp-1 text-caption font-normal text-ink-400">
                {visualConfig.subheadline || 'Key takeaway for BPO and outbound leaders'}
              </div>
            </div>
          </div>

          {/* Graphic prompt */}
          <div className="space-y-2 rounded-md border border-line bg-subtle p-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-small font-medium text-fg">
                <Sparkles className="h-3.5 w-3.5 text-fg-secondary" />
                Graphic prompt
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyToClipboard(imagePrompt, `prompt-graphic-${episodeNumber}`)}
                className="h-7 px-2"
              >
                {copiedKey === `prompt-graphic-${episodeNumber}` ? (
                  <>
                    <Check />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy />
                    <span>Copy prompt</span>
                  </>
                )}
              </Button>
            </div>
            <p className="line-clamp-3 rounded-sm border border-line bg-surface p-2 text-small leading-snug text-fg-secondary">
              {imagePrompt}
            </p>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleDownloadSvg}
            disabled={downloading}
            className="w-full"
          >
            <Download />
            <span>{downloading ? 'Downloading...' : 'Download graphic (SVG)'}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
