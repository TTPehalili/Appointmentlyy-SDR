'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { PageHeader, SegmentedControl, SettingsSection } from '@/components/ui';
import { useColorMode, type ColorMode } from '@/lib/colorMode';
import { AgentLinkSettings } from '@/components/telephony/AgentLinkSettings';

const MODES: { value: ColorMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun className="size-4" aria-hidden /> },
  { value: 'system', label: 'System', icon: <Monitor className="size-4" aria-hidden /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="size-4" aria-hidden /> },
];

const HINTS: Record<ColorMode, string> = {
  light: 'Always use the light theme.',
  system: 'Match your device’s light or dark setting automatically.',
  dark: 'Always use the dark theme. Easier on the eyes on long shifts.',
};

/** Personal settings, available to every role. Appearance is saved on this device. */
export default function SettingsPage() {
  const [mode, setMode] = useColorMode();

  return (
    <div className="w-full max-w-[880px] px-4 py-6 md:px-8">
      <PageHeader title="Settings" description="Personal preferences for this device." />
      <div className="flex flex-col divide-y divide-line border-t border-line">
        <SettingsSection title="Appearance" description="Choose how Appointmentlyy looks to you.">
          <div className="flex flex-col gap-2">
            <SegmentedControl
              label="Theme"
              value={mode}
              onChange={(v) => setMode(v as ColorMode)}
              className="self-start"
              items={MODES.map((m) => ({
                value: m.value,
                label: (
                  <>
                    {m.icon}
                    {m.label}
                  </>
                ),
              }))}
            />
            <p className="text-small text-fg-secondary" aria-live="polite">
              {HINTS[mode]}
            </p>
          </div>
        </SettingsSection>
        <SettingsSection
          title="Phone system"
          description="Dial through your company's VICIdial from the Dialer."
        >
          <AgentLinkSettings />
        </SettingsSection>
      </div>
    </div>
  );
}
