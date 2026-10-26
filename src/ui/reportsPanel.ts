import { formatDate, formatMonth } from '../sim/calendar';
import type { Sample } from '../sim/state';
import { el } from './dom';
import type { GameHost } from './host';

interface Graph {
  title: string;
  series: { label: string; colour: string; value: (s: Sample) => number; percent?: boolean }[];
}

const GRAPHS: readonly Graph[] = [
  { title: 'Crowns', series: [{ label: 'crowns', colour: '#e8c46a', value: (s) => s.crowns }] },
  { title: 'Food and stone', series: [
    { label: 'food', colour: '#9fd98b', value: (s) => s.food },
    { label: 'stone', colour: '#cfc6b0', value: (s) => s.stone },
  ] },
  { title: 'Workforce', series: [{ label: 'workers', colour: '#7fb0e0', value: (s) => s.workers }] },
  { title: 'Efficiency and progress', series: [
    { label: 'efficiency', colour: '#f0a070', value: (s) => s.efficiency * 100, percent: true },
    { label: 'built', colour: '#c8a060', value: (s) => s.progress * 100, percent: true },
  ] },
];

const W = 276;
const H = 74;

/** Graphs of the stores, workforce and progress over time, and a log of what happened. */
export class ReportsPanel {
  private key = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly host: GameHost,
  ) {}

  update(): void {
    const { sim } = this.host;
    const key = `${sim.history.length}:${sim.history[sim.history.length - 1]?.day}:${sim.log.length}:${sim.log[sim.log.length - 1]?.text}`;
    if (key === this.key) return;
    this.key = key;

    const graphs = el('section');
    graphs.append(el('strong', undefined, 'Reports'));
    if (sim.history.length < 2) graphs.append(el('div', 'dim', 'Graphs fill in as the days go by (a point every five days).'));
    else for (const g of GRAPHS) graphs.append(this.graph(g, sim.history));

    const log = el('section');
    log.append(el('strong', undefined, 'What has happened'));
    for (const entry of [...sim.log].reverse().slice(0, 14)) {
      const row = el('div', 'log');
      row.append(el('span', 'dim', `${formatDate(entry.day)}: `), entry.text);
      log.append(row);
    }
    this.root.replaceChildren(graphs, log);
  }

  private graph(g: Graph, history: readonly Sample[]): HTMLElement {
    const box = el('div', 'graph');
    const last = history[history.length - 1] as Sample;
    const legend = el('div', 'graph-title');
    legend.append(el('span', undefined, g.title + ' '));
    for (const s of g.series) {
      const v = s.value(last);
      const item = el('span', undefined, ` ${s.label} ${Math.round(v).toLocaleString('en-GB')}${s.percent ? '%' : ''}`);
      item.style.color = s.colour;
      legend.append(item);
    }
    const canvas = el('canvas');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = W * ratio;
    canvas.height = H * ratio;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      const all = g.series.flatMap((s) => history.map(s.value));
      const max = g.series.every((s) => s.percent) ? 100 : Math.max(1, ...all) * 1.1;
      const x0 = history[0]?.day ?? 0;
      const span = Math.max(1, last.day - x0);
      const px = (day: number) => 2 + ((day - x0) / span) * (W - 4);
      const py = (v: number) => H - 12 - (v / max) * (H - 18);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(0, py(0) + 0.5);
      ctx.lineTo(W, py(0) + 0.5);
      ctx.stroke();
      // Faint marks at the start of each winter.
      ctx.fillStyle = 'rgba(160,190,230,0.08)';
      for (const s of history) if ((s.day % 360) >= 270 && (s.day % 360) < 275) ctx.fillRect(px(s.day), 0, Math.max(2, (90 / span) * (W - 4)), H - 12);
      for (const s of g.series) {
        ctx.strokeStyle = s.colour;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        history.forEach((h, i) => (i === 0 ? ctx.moveTo(px(h.day), py(s.value(h))) : ctx.lineTo(px(h.day), py(s.value(h)))));
        ctx.stroke();
      }
      ctx.fillStyle = '#a39d8c';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(formatMonth(x0), 2, H - 1);
      const end = formatMonth(last.day);
      ctx.fillText(end, W - ctx.measureText(end).width - 2, H - 1);
      ctx.fillText(Math.round(max).toLocaleString('en-GB'), 2, 9);
    }
    box.append(legend, canvas);
    return box;
  }
}
