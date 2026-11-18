'use client';

/**
 * The robot SDR at work in the AI planner view (the same character as Lead Finder's playful pull,
 * components/brand/RobotSdr). Its pose and props follow the run's REAL stage:
 *   queued    idle, waiting           reading   holds the PDF while a scan beam sweeps it
 *   finding   the magnifier           mapping   sorts into the phase columns
 *   drafting  tosses cards into the week columns (the Lead Finder crate toss)
 *   writing   types                   ready     arms up, the success burst
 *   failed    puzzled
 * The one-liners rotate every 3 s and say what is happening, never a number (the real counts are in the
 * step rail). Only stage changes are announced to screen readers (by the stage view). With reduced motion
 * every loop stops and each stage is a still pose.
 */
import * as React from 'react';
import { ROBOT_BURST_CSS, ROBOT_CSS, RobotBot, RobotBurst } from '@/components/brand/RobotSdr';
import type { AiStage } from '@/lib/clientProjects/types';

const PHASE: Record<AiStage, string> = { queued: 'connecting', reading: 'enriching', finding: 'searching', mapping: 'enriching', drafting: 'enriching', writing: 'enriching', ready: 'done', failed: 'error' };
const POSE: Record<AiStage, string> = { queued: 'idle', reading: 'hold', finding: 'search', mapping: 'sort', drafting: 'toss', writing: 'type', ready: 'up', failed: 'puzzled' };
const EYES: Record<AiStage, string> = { queued: 'dots', reading: 'n', finding: 'n', mapping: 'n', drafting: 'n', writing: 'n', ready: 'happy', failed: 'sleepy' };

export const QUIPS: Record<AiStage, string[]> = {
  queued: ['Clearing the desk', 'Warming up the planner'],
  reading: ['Reading the fine print so you don’t have to', 'Turning every page, annexes too', 'Highlighter out'],
  finding: ['Circling every deadline in red', 'Hunting for dates and promises', 'If it has a due date, it goes on the list'],
  mapping: ['Sorting promises into weeks', 'Matching the contract to the SOP', 'Every obligation gets a home'],
  drafting: ['Dealing the cards…', 'One card per promise', 'Short titles, real dates'],
  writing: ['Writing the briefing, no fluff', 'Summing it up for the client', 'Plain words only'],
  ready: ['Plan ready for your review', 'Nothing goes live until you approve'],
  failed: ['Hmm. That did not go to plan', 'The planner stopped. Details below'],
};

/** Colours and motion for the robot inside the (always dark) AI stage, plus the planner's own poses and props. */
const AI_ROBOT_CSS = `
.ai-robot{--ease-pop:cubic-bezier(.34,1.56,.64,1);--pp-grid:rgb(250 250 249/.055);--pp-bot:var(--ink-300);--pp-bot-band:var(--ink-500);--pp-screen:var(--ink-950);--pp-eye:var(--ai-highlight);--pp-card:var(--ink-800);--fg:var(--text-primary);--fg3:var(--text-tertiary);--line-strong:var(--border-strong)}
.ai-robot svg{display:block;width:100%;height:auto}
.ai-robot .ai-ground{stroke:var(--line-strong);stroke-width:1.5;stroke-dasharray:2 6;stroke-linecap:round}
.ai-robot .ai-prop,.ai-robot .ai-prop-q{display:none}
.ai-robot-scene[data-stage=reading] .ai-prop-reading,.ai-robot-scene[data-stage=finding] .ai-prop-finding,.ai-robot-scene[data-stage=mapping] .ai-prop-cols,.ai-robot-scene[data-stage=drafting] .ai-prop-cols,.ai-robot-scene[data-stage=drafting] .ai-prop-drafting,.ai-robot-scene[data-stage=writing] .ai-prop-writing,.ai-robot-scene[data-stage=failed] .ai-prop-q{display:inline}
.ai-robot-scene[data-pose=hold] .ai-p-hold,.ai-robot-scene[data-pose=sort] .ai-p-sort,.ai-robot-scene[data-pose=toss] .ai-p-toss,.ai-robot-scene[data-pose=type] .ai-p-type,.ai-robot-scene[data-pose=puzzled] .ai-p-puzzled{display:inline}
.ai-robot-scene[data-pose=toss] .appy-pp-p-idle-l{display:inline}
.ai-robot .ai-doc{fill:var(--pp-card);stroke:var(--line-strong);stroke-width:1.2}
.ai-robot .ai-doc-l{stroke:var(--ink-600);stroke-width:2;stroke-linecap:round}
.ai-robot .ai-beam-r{fill:color-mix(in srgb,var(--brand-500) 30%,transparent)}
.ai-robot .ai-beam-e{stroke:var(--brand-500);stroke-width:2}
.ai-robot .ai-scanbeam{animation:ai-r-scan 1.5s cubic-bezier(.65,0,.35,1) infinite}
.ai-robot .ai-dia{fill:var(--brand-500);transform-box:fill-box;transform-origin:center;opacity:0;animation:ai-r-pop 1.8s var(--ease-pop) infinite}
.ai-robot .ai-dia:nth-of-type(2){animation-delay:.6s}.ai-robot .ai-dia:nth-of-type(3){animation-delay:1.2s}
.ai-robot .ai-col{fill:none;stroke:var(--line-strong);stroke-width:1.2;stroke-dasharray:3 3}
.ai-robot .ai-chip{fill:var(--pp-card);stroke:var(--line-strong);stroke-width:1;transform-box:fill-box;transform-origin:50% 100%;animation:ai-r-stack 2.4s var(--ease-pop) infinite}
.ai-robot .ai-chip:nth-of-type(2n){animation-delay:.4s}.ai-robot .ai-chip:nth-of-type(3n){animation-delay:.8s}
.ai-robot .ai-p-sort .ai-sl{transform-origin:190px 182px;animation:ai-r-sortl 1.2s ease-in-out infinite}
.ai-robot .ai-p-sort .ai-sr{transform-origin:250px 182px;animation:ai-r-sortr 1.2s ease-in-out infinite}
.ai-robot .ai-p-toss{transform-origin:250px 182px;animation:ai-r-toss 1.1s ease-in-out infinite}
.ai-robot .ai-fly{animation:ai-r-fx 1.1s linear infinite}
.ai-robot .ai-fly>g{animation:ai-r-fy 1.1s infinite}
.ai-robot .ai-fly>g>rect{transform-box:fill-box;transform-origin:center;animation:ai-r-fr 1.1s ease-in infinite}
.ai-robot .ai-fly:nth-of-type(2),.ai-robot .ai-fly:nth-of-type(2)>g,.ai-robot .ai-fly:nth-of-type(2)>g>rect{animation-delay:.37s}
.ai-robot .ai-fly:nth-of-type(3),.ai-robot .ai-fly:nth-of-type(3)>g,.ai-robot .ai-fly:nth-of-type(3)>g>rect{animation-delay:.74s}
.ai-robot .ai-kbd{fill:var(--ink-700);stroke:var(--line-strong);stroke-width:1}
.ai-robot .ai-lid{fill:var(--ink-800);stroke:var(--line-strong);stroke-width:1}
.ai-robot .ai-p-type .ai-tl{animation:ai-r-tap .28s ease-in-out infinite}
.ai-robot .ai-p-type .ai-tr{animation:ai-r-tap .28s ease-in-out .14s infinite}
.ai-robot .ai-caret{fill:var(--brand-500);animation:ai-r-blink 1s steps(1) infinite}
.ai-robot .ai-q{font-size:30px;font-weight:700;fill:var(--warning-400);animation:ai-r-q 1.6s ease-in-out infinite}
.ai-robot .ai-p-puzzled .ai-scratch{transform-origin:250px 182px;animation:ai-r-scratch .9s ease-in-out infinite}
@keyframes ai-r-scan{from{transform:translateY(0)}to{transform:translateY(40px)}}
@keyframes ai-r-pop{0%{transform:translateY(0) scale(.2);opacity:0}25%{opacity:1;transform:translateY(-16px) scale(1)}80%{opacity:1}100%{transform:translateY(-30px) scale(.9);opacity:0}}
@keyframes ai-r-stack{0%{transform:scaleY(0);opacity:0}30%{transform:scaleY(1);opacity:1}85%{opacity:1}100%{opacity:0}}
@keyframes ai-r-sortl{0%,100%{transform:rotate(0)}50%{transform:rotate(-22deg)}}
@keyframes ai-r-sortr{0%,100%{transform:rotate(18deg)}50%{transform:rotate(0)}}
@keyframes ai-r-toss{0%,100%{transform:rotate(30deg)}45%{transform:rotate(-38deg)}}
@keyframes ai-r-fx{from{transform:translateX(0)}to{transform:translateX(116px)}}
@keyframes ai-r-fy{0%{transform:translateY(0);animation-timing-function:cubic-bezier(.25,.6,.45,1)}45%{transform:translateY(-74px);animation-timing-function:cubic-bezier(.55,0,.75,.45)}100%{transform:translateY(34px)}}
@keyframes ai-r-fr{from{transform:rotate(0)}to{transform:rotate(-340deg)}}
@keyframes ai-r-tap{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
@keyframes ai-r-blink{50%{opacity:0}}
@keyframes ai-r-q{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes ai-r-scratch{0%,100%{transform:rotate(0)}50%{transform:rotate(-12deg)}}
.ai-quip{min-height:20px;font-size:12.5px;color:var(--text-secondary);text-align:center}
.ai-quip>span{display:inline-block;animation:ai-r-quip 320ms var(--ease-out,ease-out) both}
@keyframes ai-r-quip{from{opacity:0;transform:translateY(5px)}}
@media (prefers-reduced-motion: reduce){
  .ai-robot,.ai-robot *,.ai-robot *::before,.ai-robot *::after{animation:none!important;transition:none!important}
  .ai-robot .ai-dia,.ai-robot .ai-chip{opacity:1}
  .ai-robot .ai-fly{display:none}
  .ai-robot .appy-pp-burst{display:none}
}
`;

export function useReducedMotion() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return r;
}

/** The current one-liner for a stage: rotates every 3 s (still with reduced motion). */
function useQuip(stage: AiStage, reduced: boolean): string {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    setI(0);
    if (reduced) return;
    const t = window.setInterval(() => setI((n) => n + 1), 3000);
    return () => window.clearInterval(t);
  }, [stage, reduced]);
  const lines = QUIPS[stage];
  return lines[i % lines.length];
}

export function AiRobot({ stage }: { stage: AiStage }) {
  const reduced = useReducedMotion();
  const quip = useQuip(stage, reduced);
  const limb = 'appy-pp-b-limb';
  return (
    <div className="ai-robot" data-testid="cp-ai-robot" data-stage={stage} data-pose={POSE[stage]}>
      <style href="appy-robot-sdr" precedence="default">
        {ROBOT_CSS + ROBOT_BURST_CSS}
      </style>
      <style href="cp-ai-robot" precedence="default">
        {AI_ROBOT_CSS}
      </style>
      <svg className="appy-pp-scene ai-robot-scene" viewBox="18 22 444 270" data-phase={PHASE[stage]} data-pose={POSE[stage]} data-eyes={EYES[stage]} data-stage={stage} aria-hidden>
        <line className="ai-ground" x1="-400" y1="258.5" x2="880" y2="258.5" />

        {/* finding: the contract on the desk; milestone diamonds pop out of it */}
        <g className="ai-prop ai-prop-finding">
          <rect className="ai-doc" x="318" y="176" width="64" height="82" rx="4" />
          {[192, 204, 216, 228, 240].map((y) => (
            <path key={y} className="ai-doc-l" d={`M328 ${y} h44`} />
          ))}
          <rect className="ai-dia" x="335" y="170" width="9" height="9" transform="rotate(45 339.5 174.5)" />
          <rect className="ai-dia" x="352" y="168" width="9" height="9" transform="rotate(45 356.5 172.5)" />
          <rect className="ai-dia" x="368" y="171" width="9" height="9" transform="rotate(45 372.5 175.5)" />
        </g>

        {/* mapping and drafting: the phase columns */}
        <g className="ai-prop ai-prop-cols">
          {[318, 360, 402].map((x, ci) => (
            <g key={x}>
              <rect className="ai-col" x={x} y="150" width="36" height="108" rx="5" />
              {[0, 1, 2].map((r) => (
                <rect key={r} className="ai-chip" x={x + 5} y={232 - r * 22 - ci * 4} width="26" height="16" rx="3" />
              ))}
            </g>
          ))}
        </g>

        {/* drafting: cards tossed from the hand into the columns (the Lead Finder toss arc) */}
        <g className="ai-prop ai-prop-drafting">
          {[0, 1, 2].map((n) => (
            <g key={n} className="ai-fly" transform="translate(262 196)">
              <g>
                <rect x="-11" y="-7" width="22" height="14" rx="2.5" className="ai-doc" />
              </g>
            </g>
          ))}
        </g>

        {/* failed: a question mark */}
        <g className="ai-prop-q">
          <text className="ai-q" x="282" y="102">
            ?
          </text>
        </g>

        <RobotBot
          extraPoses={
            <>
              {/* reading: both hands hold the PDF in front; the scan beam sweeps it */}
              <g className="appy-pp-pose ai-p-hold">
                <path className={limb} d="M190 182 L208 210" />
                <path className={limb} d="M250 182 L232 210" />
                <g className="ai-prop-reading">
                  <rect className="ai-doc" x="196" y="196" width="48" height="58" rx="3" />
                  {[208, 218, 228, 238].map((y) => (
                    <path key={y} className="ai-doc-l" d={`M204 ${y} h32`} />
                  ))}
                  <g className="ai-scanbeam">
                    <rect className="ai-beam-r" x="196" y="198" width="48" height="8" />
                    <path className="ai-beam-e" d="M196 206 h48" />
                  </g>
                </g>
              </g>
              {/* mapping: sorting left and right */}
              <g className="appy-pp-pose ai-p-sort">
                <path className={`${limb} ai-sl`} d="M190 182 L164 204" />
                <path className={`${limb} ai-sr`} d="M250 182 L280 198" />
              </g>
              {/* drafting: the throwing arm */}
              <g className="appy-pp-pose ai-p-toss">
                <path className={limb} d="M250 182 L272 196" />
              </g>
              {/* writing: typing on a small laptop */}
              <g className="appy-pp-pose ai-p-type">
                <path className="ai-lid" d="M196 214 L244 214 L240 186 L200 186 Z" />
                <rect className="ai-caret" x="206" y="196" width="2" height="8" />
                <rect className="ai-kbd" x="190" y="214" width="60" height="9" rx="2" />
                <path className={`${limb} ai-tl`} d="M190 182 L204 216" />
                <path className={`${limb} ai-tr`} d="M250 182 L236 216" />
              </g>
              {/* failed: scratching its head */}
              <g className="appy-pp-pose ai-p-puzzled">
                <path className={limb} d="M190 182 L176 214" />
                <g className="ai-scratch">
                  <path className={limb} d="M250 182 L270 152 L258 128" />
                </g>
              </g>
            </>
          }
        />
        <RobotBurst />
      </svg>
      <p className="ai-quip" aria-hidden data-testid="cp-ai-quip">
        <span key={quip}>{quip}</span>
      </p>
    </div>
  );
}
