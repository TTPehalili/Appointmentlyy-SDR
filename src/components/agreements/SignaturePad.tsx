'use client';

/**
 * Signature input: draw with mouse, pen or finger, or type the name in a script font. Either way the
 * result is a transparent PNG data URL (kept well under the 200 KB limit).
 */
import * as React from 'react';
import { Eraser } from 'lucide-react';
import { Button, Input, SegmentedControl } from '@/components/ui';

const W = 600;
const H = 200;
export const SCRIPT_FONT = '"Segoe Script", "Brush Script MT", "Lucida Handwriting", "Apple Chancery", cursive';

export interface SignatureValue {
  kind: 'drawn' | 'typed';
  png: string;
}

export function SignaturePad({
  onChange,
  defaultTyped = '',
  label = 'Signature',
}: {
  onChange: (v: SignatureValue | null) => void;
  defaultTyped?: string;
  label?: string;
}) {
  const [mode, setMode] = React.useState<'drawn' | 'typed'>('drawn');
  const [typed, setTyped] = React.useState(defaultTyped);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const dirty = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  const ctx = () => {
    const c = canvas.current?.getContext('2d');
    if (c) {
      c.lineWidth = 3;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = '#111827';
      c.fillStyle = '#111827';
    }
    return c;
  };

  const clear = React.useCallback(() => {
    const c = ctx();
    c?.clearRect(0, 0, W, H);
    dirty.current = false;
    onChangeRef.current(null);
  }, []);

  // Typed mode: draw the name in a script font.
  React.useEffect(() => {
    if (mode !== 'typed') return;
    const c = ctx();
    if (!c) return;
    c.clearRect(0, 0, W, H);
    const name = typed.trim();
    if (!name) {
      onChangeRef.current(null);
      return;
    }
    let size = 64;
    c.textBaseline = 'middle';
    do {
      c.font = `${size}px ${SCRIPT_FONT}`;
      size -= 4;
    } while (c.measureText(name).width > W - 40 && size > 20);
    c.fillText(name, 20, H / 2);
    onChangeRef.current({ kind: 'typed', png: canvas.current!.toDataURL('image/png') });
  }, [mode, typed]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'drawn') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const c = ctx();
    if (c && last.current) {
      c.beginPath();
      c.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
      c.fill();
    }
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || mode !== 'drawn') return;
    const p = point(e);
    const c = ctx();
    if (c && last.current) {
      c.beginPath();
      c.moveTo(last.current.x, last.current.y);
      c.lineTo(p.x, p.y);
      c.stroke();
    }
    last.current = p;
    dirty.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current && canvas.current) onChangeRef.current({ kind: 'drawn', png: canvas.current.toDataURL('image/png') });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-strong text-fg">{label}</span>
        <SegmentedControl
          size="sm"
          label="How to sign"
          value={mode}
          onChange={(v) => {
            setMode(v as 'drawn' | 'typed');
            if (v === 'drawn') clear();
          }}
          items={[
            { value: 'drawn', label: 'Draw' },
            { value: 'typed', label: 'Type' },
          ]}
        />
      </div>
      {mode === 'typed' && (
        <Input aria-label="Type your signature" placeholder="Type your full name" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={80} />
      )}
      <div className="relative">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          data-signature-pad
          aria-label={mode === 'drawn' ? 'Draw your signature here' : 'Your typed signature'}
          className="block h-auto w-full touch-none rounded-md border border-dashed border-line-strong bg-white"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        {mode === 'drawn' && (
          <div className="absolute bottom-2 right-2">
            <Button size="sm" variant="ghost" icon={<Eraser />} onClick={clear}>
              Clear
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
