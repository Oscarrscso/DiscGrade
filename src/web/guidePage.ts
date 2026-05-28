import { buildReadableDebugReport } from "../core/debugReport.ts";
import { escapeHtml } from "../core/html.ts";
import type { DiscGuide, Edition } from "../types/discGuide.ts";

function heroStyle(guide: DiscGuide): string {
  if (!guide.background) return "";
  return `style="--hero-image: url('${guide.background}'); background-size: cover; background-position: center;"`;
}

function renderDebug(guide: DiscGuide): string {
  const report = buildReadableDebugReport(guide);
  if (!report) return "";

  return `
    <section class="grid">
      <article class="card">
        <h2 class="section-title">Debug: Build Trace</h2>
        <ul class="list">
          ${report.lines.map((line) => `<li>${escapeHtml(line || " ")}</li>`).join("")}
        </ul>
      </article>
    </section>
  `;
}

function renderEdition(edition: Edition): string {
  return `
    <article class="card edition-card">
      <div class="edition-head">
        <div>
          <h3 class="edition-title">${escapeHtml(edition.title)}</h3>
          <div class="stat-line">
            <span>${escapeHtml(edition.format)}</span>
            ${edition.country ? `<span>${escapeHtml(edition.country)}</span>` : ""}
            ${edition.region ? `<span>${escapeHtml(edition.region)}</span>` : ""}
            ${edition.releaseDate ? `<span>${escapeHtml(edition.releaseDate)}</span>` : edition.releaseYear ? `<span>${edition.releaseYear}</span>` : ""}
          </div>
        </div>
        ${
          edition.score
            ? `<div class="score"><strong>${edition.score.overall}</strong><span>Overall</span></div>`
            : ""
        }
      </div>
      ${(edition.badges || []).length ? `<div class="pill-row">${edition.badges!.map((badge) => `<span class="pill">${escapeHtml(badge)}</span>`).join("")}</div>` : ""}
      <div class="table-wrap">
        <table>
          <tr><th>Video</th><td>${escapeHtml(
            [
              edition.video?.resolution,
              edition.video?.codec,
              edition.video?.aspectRatio,
              ...(edition.video?.hdr || [])
            ]
              .filter(Boolean)
              .join(" · ") || "Unknown"
          )}</td></tr>
          <tr><th>Audio</th><td>${escapeHtml(
            (edition.audio || []).map((audio) => `${audio.language}: ${audio.format}`).join(" | ") || "Unknown"
          )}</td></tr>
          <tr><th>Commentaries</th><td>${escapeHtml(
            (edition.commentaryTracks || []).map((track) => track.description).join(" | ") || "No commentary data"
          )}</td></tr>
          <tr><th>Cuts</th><td>${escapeHtml(
            (edition.cuts || []).map((cut) => cut.description || cut.name).join(" | ") || "No cut data"
          )}</td></tr>
          <tr><th>Extras</th><td>${escapeHtml((edition.extras || []).slice(0, 4).join(" | ") || "No extras captured")}</td></tr>
        </table>
      </div>
      ${(edition.notes || []).length ? `<ul class="list">${edition.notes!.slice(0, 6).map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
      ${edition.sourceUrls.length ? `<div class="source-row">${edition.sourceUrls.map((url) => `<a class="pill" href="${url}" target="_blank" rel="noopener noreferrer">Source</a>`).join("")}</div>` : ""}
    </article>
  `;
}

export function renderGuidePage(guide: DiscGuide, baseUrl: string): string {
  const sourceList = guide.sources
    .map(
      (source) => `
        <div class="source">
          <div class="source-name">${escapeHtml(source.sourceName)} · ${escapeHtml(source.matchedBy)} · confidence ${(source.confidence * 100).toFixed(0)}%</div>
          <div>${escapeHtml(source.extractedClaims.map((claim) => claim.text).join(" "))}</div>
          <a href="${source.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.url)}</a>
        </div>
      `
    )
    .join("");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(guide.title)} · DiscGrade</title>
      <link rel="stylesheet" href="${baseUrl}/styles.css" />
    </head>
    <body>
      <main class="shell">
        <section class="hero" ${heroStyle(guide)}>
          <div class="hero-inner">
            <div class="eyebrow">
              <span>DiscGrade</span>
              <span>${escapeHtml(guide.imdbId)}</span>
              ${Number.isFinite(guide.year) ? `<span>${guide.year}</span>` : ""}
            </div>
            <h1 class="title">${escapeHtml(guide.title)}</h1>
            <p class="lede">${escapeHtml(guide.verdict.shortSummary)}</p>
          </div>
        </section>

        <section class="grid cols-3">
          <article class="card metric">
            <div class="metric-label">Best Overall</div>
            <div class="metric-value">${escapeHtml(guide.verdict.bestOverall?.editionTitle || "No strong pick yet")}</div>
          </article>
          <article class="card metric">
            <div class="metric-label">Best Video / Audio</div>
            <div class="metric-value">${escapeHtml(
              [guide.verdict.bestVideo?.editionTitle, guide.verdict.bestAudio?.editionTitle]
                .filter(Boolean)
                .join(" / ") || "Still gathering evidence"
            )}</div>
          </article>
          <article class="card metric">
            <div class="metric-label">Confidence</div>
            <div class="metric-value">${escapeHtml(guide.confidence.label)} (${guide.confidence.score}/100)</div>
          </article>
        </section>

        <section class="grid cols-2">
          <article class="card">
            <h2 class="section-title">Quick Verdict</h2>
            <ul class="list">
              ${guide.verdict.bestOverall ? `<li>Best overall: ${escapeHtml(guide.verdict.bestOverall.editionTitle)}</li>` : ""}
              ${guide.verdict.bestVideo ? `<li>Best video: ${escapeHtml(guide.verdict.bestVideo.editionTitle)}</li>` : ""}
              ${guide.verdict.bestAudio ? `<li>Best audio: ${escapeHtml(guide.verdict.bestAudio.editionTitle)}</li>` : ""}
              ${guide.verdict.bestEnglishFriendly ? `<li>Best English-friendly: ${escapeHtml(guide.verdict.bestEnglishFriendly.editionTitle)}</li>` : ""}
              ${guide.verdict.bestExtras ? `<li>Best extras: ${escapeHtml(guide.verdict.bestExtras.editionTitle)}</li>` : ""}
              ${guide.verdict.recommendedCut ? `<li>Recommended cut: ${escapeHtml(guide.verdict.recommendedCut)}</li>` : ""}
            </ul>
          </article>

          ${
            guide.conflictNotes?.length
              ? `<article class="card">
                  <h2 class="section-title">Source Notes</h2>
                  <ul class="list">${guide.conflictNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
                </article>`
              : ""
          }
        </section>

        <section class="grid">
          <div class="card">
            <h2 class="section-title">Edition Comparison</h2>
            <div class="grid cols-2">
              ${guide.editions.map(renderEdition).join("")}
            </div>
          </div>
        </section>

        <section class="grid cols-2">
          <article class="card">
            <h2 class="section-title">Evidence</h2>
            ${sourceList || "<p>No evidence was collected for this title yet.</p>"}
          </article>
          <article class="card">
            <h2 class="section-title">Guide Metadata</h2>
            <ul class="list">
              <li>IMDb: ${escapeHtml(guide.imdbId)}</li>
              ${guide.tmdbId ? `<li>TMDB: ${guide.tmdbId}</li>` : ""}
              ${guide.directors?.length ? `<li>Director: ${escapeHtml(guide.directors.join(", "))}</li>` : ""}
              <li>Last updated: ${escapeHtml(new Date(guide.lastUpdated).toLocaleString("en-IE"))}</li>
              <li>Guide status: ${escapeHtml(guide.status)}</li>
            </ul>
          </article>
        </section>

        ${renderDebug(guide)}
      </main>
    </body>
  </html>`;
}

export function renderHomePage(baseUrl: string): string {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>DiscGrade</title>
      <link rel="stylesheet" href="${baseUrl}/styles.css" />
    </head>
    <body>
      <main class="shell">
        <section class="hero">
          <div class="hero-inner">
            <div class="eyebrow"><span>DiscGrade</span><span>Stremio Add-on</span></div>
            <h1 class="title">Physical media picks inside Stremio and Fusion.</h1>
            <p class="lede">Paste the manifest URL into Stremio or Fusion, then open a movie to see the best 4K or Blu-ray edition, relevant cut notes, commentary tracks, and release availability.</p>
          </div>
        </section>

        <section class="card home-card">
          <h2 class="section-title">Install</h2>
          <div>Manifest URL:</div>
          <pre>${baseUrl}/manifest.json</pre>
          <div>Example guide:</div>
          <pre>${baseUrl}/guide/tt0056218</pre>
        </section>
      </main>
    </body>
  </html>`;
}
