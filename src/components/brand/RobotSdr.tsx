'use client';

/**
 * The Appointmentlyy robot SDR: the playful character of Lead Finder's pull progress, shared with the
 * Client Projects AI planner view. Moved here unchanged from components/icp/PullProgressPanel.tsx: the
 * SVG and the CSS text are byte-for-byte what the panel rendered before (checked by
 * tools/robot_extract/robot_identical.mjs), so Lead Finder looks exactly the same.
 *
 * Use it inside an <svg className="appy-pp-scene" viewBox="18 22 444 270" data-phase data-pose data-eyes>
 * whose ancestor defines the --pp-* colours (.appy-pp in Lead Finder, .ai-robot in the AI planner), and
 * include ROBOT_CSS (+ ROBOT_BURST_CSS for the done burst) in a style tag.
 *  - data-pose: idle | search | up | mug (plus any pose the host adds through `extraPoses`)
 *  - data-eyes: n | wide | dots | happy | sleepy
 *  - data-phase drives the loops: connecting | searching | enriching | saving | done | error
 */
import * as React from 'react';

export const ROBOT_CSS = `.appy-pp-b-body{fill:var(--pp-bot)}
.appy-pp-b-limb{stroke:var(--pp-bot);stroke-width:11;stroke-linecap:round;fill:none}
.appy-pp-b-screen{fill:var(--pp-screen)}

.appy-pp-b-eye{fill:var(--pp-eye)}
.appy-pp-b-eye-s{stroke:var(--pp-eye);stroke-width:3.5;stroke-linecap:round;fill:none}
.appy-pp-b-band{stroke:var(--pp-bot-band);stroke-width:5;fill:none;stroke-linecap:round}
.appy-pp-b-band-thin{stroke:var(--pp-bot-band);stroke-width:3;fill:none;stroke-linecap:round}
.appy-pp-b-cup{fill:var(--pp-bot-band)}
.appy-pp-b-accent{fill:var(--brand-500)}
.appy-pp-b-ant{stroke:var(--pp-bot);stroke-width:4;stroke-linecap:round}
.appy-pp-b-shadow{fill:#000;opacity:.14;transform-box:fill-box;transform-origin:center}
[data-theme="dark"] .appy-pp-b-shadow{opacity:.5}
.appy-pp-b-vb{fill:var(--pp-eye);transform-box:fill-box;transform-origin:center;transform:scaleY(.35)}
.appy-pp-b-lens{fill:color-mix(in srgb,var(--pp-eye) 16%,transparent);stroke:var(--pp-bot-band);stroke-width:4}
.appy-pp-b-mug{fill:var(--pp-card);stroke:var(--line-strong);stroke-width:1.5}
.appy-pp-b-steam{stroke:var(--fg3);stroke-width:2;fill:none;stroke-linecap:round;opacity:0}

.appy-pp-bot-bob{animation:appy-pp-bob 2.4s ease-in-out infinite}
.appy-pp-b-shadow{animation:appy-pp-shadow 2.4s ease-in-out infinite}
.appy-pp-eyes-n{transform-box:fill-box;transform-origin:center;animation:appy-pp-blink 4.2s infinite}
.appy-pp-bulb{transform-box:fill-box;transform-origin:center}
.appy-pp-head{transform-origin:220px 160px}
.appy-pp-arm-r{transform-origin:250px 182px}
.appy-pp-arm-l{transform-origin:190px 182px}

/* pose switching */
.appy-pp-pose{display:none}
.appy-pp-scene[data-pose=idle] .appy-pp-p-idle,.appy-pp-scene[data-pose=search] .appy-pp-p-search,.appy-pp-scene[data-pose=up] .appy-pp-p-up,.appy-pp-scene[data-pose=mug] .appy-pp-p-mug{display:inline}
.appy-pp-scene[data-pose=search] .appy-pp-p-idle-l,.appy-pp-scene[data-pose=idle] .appy-pp-p-idle-l,.appy-pp-scene[data-pose=mug] .appy-pp-p-idle-l{display:inline}
.appy-pp-eyes{display:none}
.appy-pp-scene[data-eyes=n] .appy-pp-eyes-n-w,.appy-pp-scene[data-eyes=wide] .appy-pp-eyes-n-w,.appy-pp-scene[data-eyes=dots] .appy-pp-eyes-d,.appy-pp-scene[data-eyes=happy] .appy-pp-eyes-h,.appy-pp-scene[data-eyes=sleepy] .appy-pp-eyes-s{display:inline}
.appy-pp-eyes-n-w{transform-box:fill-box;transform-origin:center}
.appy-pp-scene[data-eyes=wide] .appy-pp-eyes-n-w{transform:scale(1.2)}
.appy-pp-mouth{display:none}
.appy-pp-scene[data-eyes=n] .appy-pp-m-smile,.appy-pp-scene[data-eyes=dots] .appy-pp-m-smile,.appy-pp-scene[data-eyes=wide] .appy-pp-m-o,.appy-pp-scene[data-eyes=happy] .appy-pp-m-o,.appy-pp-scene[data-eyes=sleepy] .appy-pp-m-flat{display:inline}

/* per-phase loops */
.appy-pp-scene[data-phase=connecting] .appy-pp-bulb{animation:appy-pp-soft 1s ease-in-out infinite}
.appy-pp-eyes-d circle{transform-box:fill-box;transform-origin:center;animation:appy-pp-dotb 1.1s ease-in-out infinite}
.appy-pp-eyes-d circle:nth-child(2){animation-delay:.15s}.appy-pp-eyes-d circle:nth-child(3){animation-delay:.3s}
.appy-pp-scene[data-phase=searching] .appy-pp-p-search{animation:appy-pp-sweep 1.8s ease-in-out infinite}
.appy-pp-scene[data-phase=searching] .appy-pp-eyes-n-w{animation:appy-pp-look 1.8s ease-in-out infinite}
.appy-pp-scene[data-phase=searching] .appy-pp-head{animation:appy-pp-tilt 1.8s ease-in-out infinite}
.appy-pp-scene[data-phase=enriching] .appy-pp-b-vb{animation:appy-pp-talk .42s ease-in-out infinite}
.appy-pp-scene[data-phase=enriching] .appy-pp-b-vb:nth-child(2){animation-delay:-.14s}
.appy-pp-scene[data-phase=enriching] .appy-pp-b-vb:nth-child(3){animation-delay:-.28s}
.appy-pp-scene[data-phase=error] .appy-pp-bot-bob,.appy-pp-scene[data-phase=error] .appy-pp-b-shadow{animation:none}
.appy-pp-scene[data-phase=error] .appy-pp-bulb{fill:var(--ink-500)}
.appy-pp-scene[data-phase=error] .appy-pp-b-steam{animation:appy-pp-steam 2s ease-out infinite}
.appy-pp-scene[data-phase=error] .appy-pp-b-steam.appy-pp-s2{animation-delay:.7s}
.appy-pp-scene[data-phase=error] .appy-pp-b-steam.appy-pp-s3{animation-delay:1.3s}
.appy-pp-scene[data-phase=done] .appy-pp-bot-bob{animation:appy-pp-jump 900ms var(--ease-out) both, appy-pp-bob 2.4s ease-in-out 900ms infinite}
.appy-pp-scene[data-phase=saving] .appy-pp-bot-bob{animation:appy-pp-bob 1.2s ease-in-out infinite}

@keyframes appy-pp-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes appy-pp-shadow{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.88)}}
@keyframes appy-pp-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.12)}}
@keyframes appy-pp-dotb{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-4px);opacity:1}}
@keyframes appy-pp-sweep{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(11deg)}}
@keyframes appy-pp-look{0%,100%{transform:translateX(-3px)}50%{transform:translateX(4px)}}
@keyframes appy-pp-tilt{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(3deg)}}
@keyframes appy-pp-talk{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
@keyframes appy-pp-steam{0%{transform:translateY(4px);opacity:0}30%{opacity:.8}100%{transform:translateY(-14px);opacity:0}}
@keyframes appy-pp-jump{0%{transform:translateY(0)}28%{transform:translateY(-22px)}52%{transform:translateY(0)}70%{transform:translateY(-7px)}100%{transform:translateY(0)}}
`;

export const ROBOT_BURST_CSS = `/* burst */
.appy-pp-burst{opacity:0}
.appy-pp-scene[data-phase=done] .appy-pp-burst{opacity:1}
.appy-pp-spark{stroke:var(--brand-500);stroke-width:4;stroke-linecap:round;opacity:0}
.appy-pp-spark.appy-pp-alt{stroke:var(--pp-eye)}
:root:not([data-theme="dark"]) .appy-pp-spark.appy-pp-alt{stroke:var(--warning-400)}
.appy-pp-scene[data-phase=done] .appy-pp-spark{animation:appy-pp-spark 900ms var(--ease-out) 160ms both}
.appy-pp-ring{fill:none;stroke:var(--brand-500);stroke-width:2.5;opacity:0;transform-box:fill-box;transform-origin:center}
.appy-pp-scene[data-phase=done] .appy-pp-ring{animation:appy-pp-ring 800ms var(--ease-out) 150ms both}
@keyframes appy-pp-spark{0%{transform:translateY(14px);opacity:0}25%{opacity:1}70%{opacity:1}100%{transform:translateY(-16px);opacity:0}}
@keyframes appy-pp-ring{0%{transform:scale(.4);opacity:.6}100%{transform:scale(1.8);opacity:0}}
`;

/** The robot (shadow, body, poses, head). The refs let Lead Finder animate the toss and the bulb. */
export function RobotBot({
  bulbRef,
  armRef,
  extraPoses,
}: {
  bulbRef?: React.Ref<SVGCircleElement>;
  armRef?: React.Ref<SVGGElement>;
  /** Extra pose groups (class "appy-pp-pose <host pose class>"), shown by the host's own CSS. */
  extraPoses?: React.ReactNode;
}) {
  return (
    <>
      <ellipse className="appy-pp-b-shadow" cx="220" cy="259" rx="40" ry="5" />
      <g className="appy-pp-bot-bob">
        <rect className="appy-pp-b-body" x="203" y="226" width="12" height="28" rx="6" />
        <rect className="appy-pp-b-body" x="225" y="226" width="12" height="28" rx="6" />
        <rect className="appy-pp-b-body" x="197" y="249" width="22" height="9" rx="4.5" />
        <rect className="appy-pp-b-body" x="221" y="249" width="22" height="9" rx="4.5" />
        <rect className="appy-pp-b-body" x="186" y="166" width="68" height="66" rx="18" />
        <rect className="appy-pp-b-screen" x="204" y="184" width="32" height="20" rx="6" />
        <g>
          <rect className="appy-pp-b-vb" x="212" y="190" width="3.5" height="8" rx="1.75" />
          <rect className="appy-pp-b-vb" x="218.25" y="190" width="3.5" height="8" rx="1.75" />
          <rect className="appy-pp-b-vb" x="224.5" y="190" width="3.5" height="8" rx="1.75" />
        </g>
        <rect className="appy-pp-b-body" x="212" y="154" width="16" height="16" rx="4" />

        {/* arms by pose */}
        <g className="appy-pp-arm-l appy-pp-pose appy-pp-p-idle-l">
          <path className="appy-pp-b-limb" d="M190 182 L172 214" />
        </g>
        <g className="appy-pp-arm-r appy-pp-pose appy-pp-p-idle" ref={armRef}>
          <path className="appy-pp-b-limb" d="M250 182 L268 212" />
        </g>
        <g className="appy-pp-arm-r appy-pp-pose appy-pp-p-search">
          <path className="appy-pp-b-limb" d="M250 182 L276 160" />
          <path className="appy-pp-b-band" d="M277 159 L286 149" />
          <circle className="appy-pp-b-lens" cx="296" cy="138" r="14" />
          <path
            d="M289 132 q4 -4 9 -3"
            style={{ stroke: 'var(--pp-eye)', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', opacity: 0.8 }}
          />
        </g>
        <g className="appy-pp-pose appy-pp-p-up">
          <path className="appy-pp-b-limb" d="M190 182 L168 150" />
          <path className="appy-pp-b-limb" d="M250 182 L272 150" />
        </g>
        <g className="appy-pp-pose appy-pp-p-mug">
          <path className="appy-pp-b-limb" d="M250 182 L262 206" />
          <path className="appy-pp-b-mug" d="M276 196 h3 a4.5 4.5 0 0 1 0 9 h-3" />
          <rect className="appy-pp-b-mug" x="258" y="190" width="18" height="21" rx="3" />
          <path className="appy-pp-b-steam" d="M263 184 q-3 -4 0 -8 q3 -4 0 -8" />
          <path className="appy-pp-b-steam appy-pp-s2" d="M270 184 q-3 -4 0 -8 q3 -4 0 -8" />
          <path className="appy-pp-b-steam appy-pp-s3" d="M266.5 180 q-3 -4 0 -8" />
        </g>

        {extraPoses}
        {/* head */}
        <g className="appy-pp-head">
          <path className="appy-pp-b-band" d="M172 128 A48 48 0 0 1 268 128" />
          <line className="appy-pp-b-ant" x1="220" y1="92" x2="220" y2="70" />
          <circle className="appy-pp-b-accent appy-pp-bulb" cx="220" cy="65" r="6" ref={bulbRef} />
          <rect className="appy-pp-b-body" x="172" y="92" width="96" height="70" rx="24" />
          <rect className="appy-pp-b-screen" x="183" y="103" width="74" height="48" rx="16" />
          <g className="appy-pp-eyes appy-pp-eyes-n-w">
            <g className="appy-pp-eyes-n">
              <rect className="appy-pp-b-eye" x="201" y="115" width="11" height="17" rx="5.5" />
              <rect className="appy-pp-b-eye" x="228" y="115" width="11" height="17" rx="5.5" />
            </g>
          </g>
          <g className="appy-pp-eyes appy-pp-eyes-d">
            <circle className="appy-pp-b-eye" cx="207" cy="124" r="3.5" />
            <circle className="appy-pp-b-eye" cx="220" cy="124" r="3.5" />
            <circle className="appy-pp-b-eye" cx="233" cy="124" r="3.5" />
          </g>
          <g className="appy-pp-eyes appy-pp-eyes-h">
            <path className="appy-pp-b-eye-s" d="M200 127 q6 -9 12 0" />
            <path className="appy-pp-b-eye-s" d="M228 127 q6 -9 12 0" />
          </g>
          <g className="appy-pp-eyes appy-pp-eyes-s">
            <path className="appy-pp-b-eye-s" d="M201 125 h11" />
            <path className="appy-pp-b-eye-s" d="M228 125 h11" />
          </g>
          <path className="appy-pp-mouth appy-pp-m-smile appy-pp-b-eye-s" d="M211 140 Q220 146 229 140" style={{ strokeWidth: 3 }} />
          <ellipse className="appy-pp-mouth appy-pp-m-o appy-pp-b-eye" cx="220" cy="141" rx="5" ry="4" />
          <path className="appy-pp-mouth appy-pp-m-flat appy-pp-b-eye-s" d="M214 141 h12" style={{ strokeWidth: 3 }} />
          <rect className="appy-pp-b-cup" x="163" y="113" width="12" height="29" rx="6" />
          <rect className="appy-pp-b-cup" x="265" y="113" width="12" height="29" rx="6" />
          <path className="appy-pp-b-band-thin" d="M169 141 Q170 163 196 163" />
          <circle className="appy-pp-b-accent" cx="199" cy="163" r="4" />
        </g>
      </g>

    </>
  );
}

/** The success burst (shown by data-phase=done). */
export function RobotBurst() {
  return (
    <>
      <g className="appy-pp-burst" transform="translate(220 122)">
        <circle className="appy-pp-ring" r="44" />
        {[0, 45, 90, 135, 225, 270, 315].map((deg) => (
          <g key={deg} transform={`rotate(${deg})`}>
            {deg % 90 === 0 ? (
              <line className="appy-pp-spark" x1="0" y1="-60" x2="0" y2="-76" />
            ) : (
              <line className="appy-pp-spark appy-pp-alt" x1="0" y1="-62" x2="0" y2="-72" />
            )}
          </g>
        ))}
      </g>
    </>
  );
}
