export const stylesCss = `
:root {
  --bg: #f5efe4;
  --bg-deep: #1f1a16;
  --card: rgba(255, 248, 239, 0.82);
  --card-strong: rgba(255, 250, 244, 0.95);
  --ink: #221b16;
  --muted: #69584a;
  --accent: #8b2e1e;
  --accent-soft: #c85f2e;
  --olive: #4d5e3c;
  --gold: #c19543;
  --border: rgba(34, 27, 22, 0.12);
  --shadow: 0 20px 50px rgba(34, 27, 22, 0.12);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  color: var(--ink);
  background:
    radial-gradient(circle at top left, rgba(200, 95, 46, 0.14), transparent 28%),
    radial-gradient(circle at top right, rgba(77, 94, 60, 0.14), transparent 24%),
    linear-gradient(180deg, #f9f5ee 0%, var(--bg) 38%, #efe5d6 100%);
  font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
  line-height: 1.5;
}

a {
  color: inherit;
}

.shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 56px;
}

.hero {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  min-height: 300px;
  padding: 28px;
  display: grid;
  align-items: end;
  background:
    linear-gradient(135deg, rgba(20, 16, 13, 0.82), rgba(45, 31, 25, 0.58)),
    var(--hero-image, linear-gradient(135deg, #3e2f29, #1e1713));
  color: #fff8ef;
  box-shadow: var(--shadow);
}

.hero::after {
  content: "";
  position: absolute;
  inset: auto -80px -80px auto;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 209, 132, 0.3), transparent 62%);
}

.hero-inner {
  position: relative;
  z-index: 1;
  max-width: 760px;
}

.eyebrow {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 248, 239, 0.12);
  backdrop-filter: blur(10px);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.title {
  margin: 16px 0 8px;
  font-family: "Iowan Old Style", "Palatino Linotype", serif;
  font-size: clamp(2.2rem, 6vw, 4rem);
  line-height: 0.95;
}

.lede {
  margin: 0;
  max-width: 62ch;
  color: rgba(255, 248, 239, 0.86);
}

.grid {
  display: grid;
  gap: 18px;
  margin-top: 22px;
}

.grid.cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.grid.cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 22px;
  padding: 20px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
}

.card strong {
  color: var(--ink);
}

.section-title {
  margin: 0 0 12px;
  font-family: "Iowan Old Style", "Palatino Linotype", serif;
  font-size: 1.45rem;
}

.metric {
  display: grid;
  gap: 8px;
}

.metric-label {
  color: var(--muted);
  font-size: 0.86rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.metric-value {
  font-size: 1.08rem;
  font-weight: 700;
}

.pill-row, .source-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(34, 27, 22, 0.08);
  font-size: 0.92rem;
}

.pill.warning-high {
  background: rgba(139, 46, 30, 0.12);
  color: var(--accent);
}

.pill.warning-medium {
  background: rgba(193, 149, 67, 0.14);
  color: #6a4e13;
}

.pill.warning-low {
  background: rgba(77, 94, 60, 0.12);
  color: var(--olive);
}

.edition-card {
  display: grid;
  gap: 12px;
}

.edition-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}

.edition-title {
  margin: 0;
  font-size: 1.1rem;
}

.score {
  min-width: 76px;
  text-align: center;
  border-radius: 18px;
  padding: 10px 12px;
  background: linear-gradient(180deg, rgba(139, 46, 30, 0.12), rgba(200, 95, 46, 0.06));
}

.score strong {
  display: block;
  font-size: 1.45rem;
}

.score span {
  font-size: 0.8rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stat-line {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--muted);
  font-size: 0.95rem;
}

.list {
  margin: 0;
  padding-left: 18px;
}

.list li + li {
  margin-top: 6px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  text-align: left;
  vertical-align: top;
  padding: 12px 10px;
  border-bottom: 1px solid rgba(34, 27, 22, 0.08);
  font-size: 0.95rem;
}

th {
  color: var(--muted);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.source {
  display: grid;
  gap: 8px;
  padding: 14px 0;
  border-top: 1px solid rgba(34, 27, 22, 0.08);
}

.source:first-child {
  border-top: 0;
  padding-top: 0;
}

.source-name {
  font-weight: 700;
}

.home-card {
  margin-top: 22px;
  display: grid;
  gap: 10px;
}

code, pre {
  font-family: "SF Mono", "Menlo", "Consolas", monospace;
}

pre {
  overflow: auto;
  background: rgba(34, 27, 22, 0.06);
  border-radius: 18px;
  padding: 14px;
}

@media (max-width: 900px) {
  .grid.cols-3,
  .grid.cols-2 {
    grid-template-columns: 1fr;
  }

  .hero {
    min-height: 240px;
    padding: 22px;
  }
}
`;
