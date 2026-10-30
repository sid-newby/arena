(() => {
  'use strict';
  const status = document.getElementById('chart-status');
  if (!window.React || !window.ReactDOM || !window.ReactIs || !window.Recharts) return;
  const data = JSON.parse(document.getElementById('report-data').textContent);
  const R = window.React,
    C = window.Recharts,
    h = R.createElement;
  const styles = getComputedStyle(document.documentElement);
  const palette = [1, 2, 3, 4, 5].map((i) => styles.getPropertyValue('--chart-' + i).trim());
  const colorProbe = document.createElement('span');
  document.body.append(colorProbe);
  const colors = palette.map((color) => {
    colorProbe.style.color = color;
    return getComputedStyle(colorProbe).color;
  });
  colorProbe.remove();
  const ink = styles.getPropertyValue('--muted-foreground').trim();
  const keys = [
    ...new Set(
      data.models
        .map((model) => model.modelKey)
        .concat(data.pairs.flatMap((pair) => [pair.a.modelKey, pair.b.modelKey]))
        .filter(Boolean),
    ),
  ].toSorted();
  const color = (key) => colors[Math.max(0, keys.indexOf(key)) % colors.length];
  const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const number = (value) => (value == null ? 'Unknown' : formatter.format(value));
  const tooltip = h(C.Tooltip, {
    contentStyle: {
      background: styles.getPropertyValue('--card'),
      border: '1px solid ' + styles.getPropertyValue('--border'),
      color: styles.getPropertyValue('--foreground'),
      borderRadius: 0,
    },
    formatter: (value) => number(value),
  });
  const roots = new Map();
  function mount(id, child) {
    const element = document.getElementById(id);
    if (!element) return;
    if (!roots.has(id)) roots.set(id, window.ReactDOM.createRoot(element));
    roots
      .get(id)
      .render(h(C.ResponsiveContainer, { width: '100%', height: '100%', minWidth: 0 }, child));
  }
  const axis = { tick: { fill: ink, fontSize: 11 }, stroke: ink, tickLine: false, axisLine: false };
  const grid = h(C.CartesianGrid, {
    stroke: styles.getPropertyValue('--border'),
    vertical: false,
    strokeDasharray: '3 5',
  });
  const selection = Object.entries(data.summary.selection).map(([label, value]) => ({
    label,
    value,
  }));
  mount(
    'decision-chart',
    h(
      C.BarChart,
      { data: selection, margin: { top: 12, right: 14, bottom: 10, left: 0 } },
      grid,
      h(C.XAxis, { ...axis, dataKey: 'label' }),
      h(C.YAxis, { ...axis, allowDecimals: false }),
      tooltip,
      h(C.Bar, {
        dataKey: 'value',
        name: 'Confirmed runs',
        fill: colors[0],
        isAnimationActive: false,
      }),
    ),
  );
  const pairs = data.pairs.flatMap((pair) =>
    [pair.a, pair.b].map((attempt) => ({
      ...attempt,
      label:
        pair.runId +
        ' · ' +
        attempt.role.toUpperCase() +
        ' · ' +
        (attempt.model || 'Unknown model'),
      input: attempt.usage.input,
      output: attempt.usage.output,
    })),
  );
  const pairRows = pairs
    .filter((attempt) => attempt.input !== null || attempt.output !== null)
    .slice(0, 12);
  mount(
    'token-chart',
    h(
      C.BarChart,
      { data: pairRows, layout: 'vertical', margin: { top: 8, right: 24, bottom: 12, left: 0 } },
      h(C.CartesianGrid, { stroke: styles.getPropertyValue('--border'), horizontal: false }),
      h(C.XAxis, { ...axis, type: 'number' }),
      h(C.YAxis, {
        ...axis,
        type: 'category',
        dataKey: 'label',
        width: 140,
        tick: { fill: ink, fontSize: 10 },
      }),
      tooltip,
      h(
        C.Bar,
        {
          dataKey: 'input',
          name: 'Input tokens (cached included)',
          stackId: 'tokens',
          isAnimationActive: false,
        },
        ...pairRows.map((row, i) =>
          h(C.Cell, { key: i, fill: color(row.modelKey), fillOpacity: 0.5 }),
        ),
      ),
      h(
        C.Bar,
        {
          dataKey: 'output',
          name: 'Output tokens (reasoning included)',
          stackId: 'tokens',
          isAnimationActive: false,
        },
        ...pairRows.map((row, i) => h(C.Cell, { key: i, fill: color(row.modelKey) })),
      ),
    ),
  );
  const timed = pairs.filter((attempt) => attempt.elapsedMs !== null).slice(0, 12);
  mount(
    'duration-chart',
    h(
      C.BarChart,
      { data: timed, layout: 'vertical', margin: { right: 24 } },
      h(C.XAxis, { ...axis, type: 'number', unit: ' ms' }),
      h(C.YAxis, {
        ...axis,
        type: 'category',
        dataKey: 'label',
        width: 140,
        tick: { fill: ink, fontSize: 10 },
      }),
      tooltip,
      h(
        C.Bar,
        { dataKey: 'elapsedMs', name: 'Execution ms', isAnimationActive: false },
        ...timed.map((row, i) => h(C.Cell, { key: i, fill: color(row.modelKey) })),
      ),
    ),
  );
  const models = data.models.slice(0, 12).map((model) => ({
    ...model,
    label:
      model.model +
      ' · ' +
      (model.effort || 'effort unknown') +
      ' · ' +
      (model.phase || 'phase unknown') +
      ' · ' +
      (model.toolProfile || 'tools unknown') +
      ' · ' +
      model.coverage,
    medianTokens: model.tokens.median,
    medianDuration: model.duration.median,
  }));
  mount(
    'model-chart',
    h(
      C.BarChart,
      { data: models, margin: { top: 8, right: 20, bottom: 65 } },
      grid,
      h(C.XAxis, { ...axis, dataKey: 'label', angle: -15, textAnchor: 'end', height: 75 }),
      h(C.YAxis, { ...axis }),
      tooltip,
      h(
        C.Bar,
        { dataKey: 'medianTokens', name: 'Median observed tokens', isAnimationActive: false },
        ...models.map((row, i) => h(C.Cell, { key: i, fill: color(row.modelKey) })),
      ),
    ),
  );
  const intervals = data.timeline.attempts
    .filter((attempt) => attempt.startedAt !== null && attempt.finishedAt !== null)
    .slice(0, 12)
    .map((attempt) => ({
      ...attempt,
      label:
        attempt.runId +
        ' · ' +
        attempt.role.toUpperCase() +
        ' · ' +
        (attempt.model || 'Unknown model'),
      interval: [attempt.startedAt, attempt.finishedAt],
    }));
  const time = (value) =>
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: data.timeZone,
    }).format(value);
  mount(
    'timeline-chart',
    h(
      C.BarChart,
      { data: intervals, layout: 'vertical', margin: { right: 24, bottom: 14 } },
      h(C.XAxis, { ...axis, type: 'number', domain: ['dataMin', 'dataMax'], tickFormatter: time }),
      h(C.YAxis, {
        ...axis,
        type: 'category',
        dataKey: 'label',
        width: 140,
        tick: { fill: ink, fontSize: 10 },
      }),
      h(C.Tooltip, {
        formatter: (value) => (Array.isArray(value) ? value.map(time).join(' – ') : time(value)),
        contentStyle: {
          background: styles.getPropertyValue('--card'),
          border: '1px solid ' + styles.getPropertyValue('--border'),
        },
      }),
      h(
        C.Bar,
        { dataKey: 'interval', name: 'Observed interval', isAnimationActive: false },
        ...intervals.map((row, i) => h(C.Cell, { key: i, fill: color(row.modelKey) })),
      ),
    ),
  );
  const timingModels = data.models.slice(0, 12).map((model, index) => ({
    label:
      model.model +
      ' · ' +
      (model.effort || 'effort unknown') +
      ' · ' +
      (model.phase || 'phase unknown'),
    index,
    ...model.duration,
  }));
  const timingSeries = [
    ['min', 'Minimum ms', 0],
    ['median', 'Median ms', 1],
    ['max', 'Maximum ms', 2],
  ];
  mount(
    'duration-distribution-chart',
    h(
      C.ScatterChart,
      { margin: { top: 10, right: 30, bottom: 20, left: 0 } },
      grid,
      h(C.XAxis, { ...axis, type: 'number', dataKey: 'value', name: 'Execution', unit: ' ms' }),
      h(C.YAxis, {
        ...axis,
        type: 'number',
        dataKey: 'index',
        name: 'Model group',
        allowDecimals: false,
        width: 140,
        tickFormatter: (value) => (timingModels[value] ? timingModels[value].label : ''),
        domain: [-1, Math.max(1, timingModels.length)],
      }),
      h(C.Tooltip, {
        content: ({ active, payload }) =>
          active && payload && payload[0]
            ? h(
                'div',
                {
                  style: {
                    background: styles.getPropertyValue('--card'),
                    border: '1px solid ' + styles.getPropertyValue('--border'),
                    padding: '10px',
                  },
                },
                h('p', null, payload[0].payload.label),
                h('p', null, 'Minimum: ' + number(payload[0].payload.min) + ' ms'),
                h('p', null, 'Median: ' + number(payload[0].payload.median) + ' ms'),
                h('p', null, 'Maximum: ' + number(payload[0].payload.max) + ' ms'),
              )
            : null,
      }),
      ...timingSeries.map(([key, name, index]) =>
        h(C.Scatter, {
          key,
          name,
          data: timingModels
            .filter((row) => row[key] !== null)
            .map((row) => ({ ...row, value: row[key] })),
          fill: colors[index],
          shape: index === 1 ? 'diamond' : 'circle',
          isAnimationActive: false,
        }),
      ),
    ),
  );
  const reference = document.getElementById('reference-model');
  function deltas() {
    const selected = reference ? reference.value : '';
    const matching = data.pairs.filter((pair) => !selected || pair.a.modelKey === selected);
    const rows = matching.slice(0, 100).map((pair) => ({
      label: pair.runId,
      tokenDelta: pair.tokenDelta === null ? null : pair.tokenDelta * 100,
      durationDelta: pair.durationDelta === null ? null : pair.durationDelta * 100,
    }));
    const eligible = rows.filter(
      (row) => row.tokenDelta !== null || row.durationDelta !== null,
    ).length;
    const detail = document.getElementById('delta-status');
    if (detail)
      detail.textContent =
        eligible +
        ' comparable pairs shown (first 100 matching rows at most; ' +
        matching.length +
        ' captured pairs match). Candidate B relative to reference A; exclusions remain in the pair table.';
    mount(
      'delta-chart',
      h(
        C.BarChart,
        { data: rows, margin: { top: 8, right: 20, bottom: 10 } },
        grid,
        h(C.ReferenceLine, { y: 0, stroke: ink }),
        h(C.XAxis, { ...axis, dataKey: 'label' }),
        h(C.YAxis, { ...axis, unit: '%' }),
        h(C.Tooltip, { formatter: (value) => number(value) + '%' }),
        h(C.Bar, {
          dataKey: 'tokenDelta',
          name: 'Token delta %',
          fill: colors[0],
          isAnimationActive: false,
        }),
        h(C.Bar, {
          dataKey: 'durationDelta',
          name: 'Execution delta %',
          fill: colors[1],
          isAnimationActive: false,
        }),
      ),
    );
  }
  if (reference) reference.addEventListener('change', deltas);
  deltas();
  if (status)
    status.textContent =
      'Interactive charts loaded. All values and exclusions remain available in the tables below.';
  document.documentElement.classList.add('charts-ready');
})();
