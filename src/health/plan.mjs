// The improvement plan: up to three actions, chosen on this page from a fixed table, in a fixed order of priority,
// from the watch summary and the blood test. Each action carries its source (docs/HEALTH.md). The AI explains and
// connects them; it cannot add one, so it cannot invent a diagnosis, a medicine or a supplement. Wellness only: an
// action never treats anything, and a blood value outside its lab's range always goes to a doctor.

const num = (n) => n.toLocaleString('en-US');

// The rules, in priority order. Each returns an action or nothing.
const RULES = [
  // 1. A blood value outside the range its lab printed: a question for a doctor, first, always.
  ({ labs }) => {
    const out = (labs || []).filter((l) => l.position === 'above' || l.position === 'below');
    if (!out.length) return null;
    const list = (xs) => (xs.length < 2 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
    const side = (pos) => out.filter((l) => l.position === pos).map((l) => l.marker);
    const said = ['above', 'below'].filter((pos) => side(pos).length)
      .map((pos) => `${list(side(pos))} ${side(pos).length > 1 ? 'are' : 'is'} ${pos} the range your lab printed`);
    return { area: 'Blood test', why: `${said.join('; ')}.`,
      action: 'Ask a doctor about these results: only they can say what a value outside the lab\'s range means for you.', source: "The lab's own reference range" };
  },
  // 2. Sleep below the 7 hours a night recommended for adults.
  ({ watch }) => {
    const s = (watch || []).find((w) => w.id === 'sleep' && w.average !== null);
    if (!s || s.average >= 7) return null;
    return { area: 'Sleep', why: `${s.average} hours a night on average${s.change < 0 ? `, ${Math.abs(s.change)} fewer than four weeks ago` : ''}; adults are advised 7 or more.`,
      action: 'Aim for at least 7 hours. Going to bed and getting up at the same times every day, weekends included, helps.', source: 'AASM and SRS (2015); CDC sleep tips' };
  },
  // 3. Activity low (under 5,000 steps a day) or falling (by 1,000 or more a day over the four weeks).
  ({ watch }) => {
    const st = (watch || []).find((w) => w.id === 'steps' && w.average !== null);
    if (!st || !(st.average < 5000 || (st.change !== null && st.change <= -1000))) return null;
    return { area: 'Activity', why: `${num(st.average)} steps a day on average${st.change < 0 ? `, down ${num(Math.abs(st.change))} over four weeks` : ''}.`,
      action: 'Build up to at least 150 minutes of moderate activity a week, such as brisk walking: about 30 minutes on 5 days.', source: 'WHO physical activity guidelines (2020)' };
  },
  // 4. Resting heart rate rising by 3 beats a minute or more over the four weeks.
  ({ watch }) => {
    const h = (watch || []).find((w) => w.id === 'rhr' && w.average !== null);
    if (!h || h.change === null || h.change < 3) return null;
    return { area: 'Resting heart rate', why: `It rose by ${h.change} beats a minute over four weeks (a watch's estimate).`,
      action: 'It can rise with short sleep or stress. If it keeps rising, ask a doctor.', source: "Your own trend, from your watch" };
  },
  // 5. HRV falling by more than 8% of its first week.
  ({ watch }) => {
    const v = (watch || []).find((w) => w.id === 'hrv' && w.average !== null);
    if (!v || v.change === null || v.change >= 0) return null;
    return { area: 'Heart rate variability', why: `It fell by ${Math.abs(v.change)} ms over four weeks (a watch's estimate).`,
      action: 'It often falls with short sleep, stress or hard training. Look again after a week of steadier sleep.', source: "Your own trend, from your watch" };
  },
];

/** Up to three actions for the watch summary and blood test given, or the one "keep going" item; [] with neither. */
export function improvementPlan({ watch = null, labs = null } = {}) {
  if (!watch?.length && !labs?.length) return [];
  const actions = RULES.map((rule) => rule({ watch, labs })).filter(Boolean).slice(0, 3);
  if (actions.length) return actions;
  return [{ area: 'Keep going', why: 'Your sleep, activity and blood values are within the ranges used here, and your trends are steady.',
    action: 'Keep your routine, and read your data again in a few months.', source: 'The ranges and trends above' }];
}
