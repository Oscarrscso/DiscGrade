import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { bestBluraysAdapter, parseBestBluraysPage, parseBestBluraysSearchResults } from "../sources/bestBlurays.ts";
import { parseArrowFilmsPage, parseArrowFilmsSearchResults } from "../sources/arrowFilms.ts";
import { bluRayComAdapter, parseBluRayPage, parseBluRayQuickSearch } from "../sources/blurayCom.ts";
import { dvdCompareAdapter, parseDvdComparePage, parseDvdCompareSearchResults } from "../sources/dvdCompare.ts";
import { parseSecondSightPage, parseSecondSightSearchResults } from "../sources/secondSightFilms.ts";
import type { Identity } from "../types/discGuide.ts";
import type { SourceRuntime } from "../types/sources.ts";

const fixtures = path.join(process.cwd(), "src", "tests", "fixtures");

const identity: Identity = {
  imdbId: "tt0056552",
  title: "The Trial",
  year: 1962,
  alternateTitles: ["Le Proces", "Le Procès"],
  directors: ["Orson Welles"]
};

test("BestBlurays search parser prefers the exact title/year match", async () => {
  const html = await fs.readFile(path.join(fixtures, "bestblurays-search.html"), "utf8");
  const results = parseBestBluraysSearchResults(html, identity);

  assert.equal(results[0]?.title, "The Trial (1962)");
  assert.match(results[0]?.url || "", /the-trial-1962/);
});

test("BestBlurays search parser handles Episode IV style identity titles", () => {
  const html = `
    <div>
      <a href="/film/158-star-wars-1977" data-discover="true">Star Wars (1977)</a>
      <a href="/film/333-the-empire-strikes-back-1980" data-discover="true">The Empire Strikes Back (1980)</a>
    </div>
  `;
  const results = parseBestBluraysSearchResults(html, {
    imdbId: "tt0076759",
    title: "Star Wars: Episode IV - A New Hope",
    year: 1977,
    alternateTitles: [],
    directors: ["George Lucas"]
  });

  assert.equal(results[0]?.title, "Star Wars (1977)");
  assert.match(results[0]?.url || "", /star-wars-1977/);
});

test("BestBlurays adapter search retries with simplified titles when exact query returns no matches", async () => {
  const htmlNoResults = `
    <script>
      window.__reactRouterContext.streamController.enqueue("total\\\",0");
    </script>
  `;
  const htmlWithMatch = `
    <div>
      <a href="/film/158-star-wars-1977" data-discover="true">Star Wars (1977)</a>
    </div>
  `;
  const fetchedUrls: string[] = [];
  const runtime: SourceRuntime = {
    async fetchText(url: string): Promise<string> {
      fetchedUrls.push(url);
      if (url.includes("Star%20Wars%3A%20Episode%20IV%20-%20A%20New%20Hope")) {
        return htmlNoResults;
      }
      if (url.includes("Star%20Wars")) {
        return htmlWithMatch;
      }
      return "";
    }
  };

  const results = await bestBluraysAdapter.search({
    imdbId: "tt0076759",
    title: "Star Wars: Episode IV - A New Hope",
    year: 1977,
    alternateTitles: [],
    directors: ["George Lucas"]
  }, runtime);

  assert.ok(fetchedUrls.some((url) => url.includes("Star%20Wars%3A%20Episode%20IV%20-%20A%20New%20Hope")));
  assert.ok(fetchedUrls.some((url) => url.includes("Star%20Wars")));
  assert.equal(results[0]?.title, "Star Wars (1977)");
});

test("BestBlurays page parser extracts ranked releases", async () => {
  const html = await fs.readFile(path.join(fixtures, "bestblurays-page.html"), "utf8");
  const evidence = await parseBestBluraysPage(html, identity, {
    url: "https://www.bestblurays.com/film/2128-the-trial-1962",
    title: "The Trial (1962)",
    year: 1962,
    matchedBy: "title_year",
    confidence: 0.95
  });

  assert.ok(evidence?.parsed?.bestOverall);
  assert.equal(evidence?.parsed?.bestOverall, "Criterion 4K Blu-ray");
  assert.equal(evidence?.matchedBy, "imdb");
});

test("Arrow Films search and page parsers extract commentary tracks", async () => {
  const searchHtml = await fs.readFile(path.join(fixtures, "arrowfilms-search.html"), "utf8");
  const pageHtml = await fs.readFile(path.join(fixtures, "arrowfilms-page.html"), "utf8");
  const results = parseArrowFilmsSearchResults(searchHtml, {
    ...identity,
    title: "Wild Things"
  });

  assert.equal(results[0]?.title, "Wild Things Blu-ray");
  const evidence = await parseArrowFilmsPage(pageHtml, {
    ...identity,
    title: "Wild Things"
  }, results[0]);
  const edition = evidence?.parsed?.editions?.[0];

  assert.ok(edition);
  assert.equal(edition?.label, "Arrow Video");
  assert.equal(edition?.commentaryTracks?.[0]?.description, "Exclusive audio commentary by director John McNaughton and producer Steven A. Jones");
});

test("Second Sight search and page parsers extract commentary tracks", async () => {
  const searchPayload = await fs.readFile(path.join(fixtures, "secondsight-search.json"), "utf8");
  const pageHtml = await fs.readFile(path.join(fixtures, "secondsight-page.html"), "utf8");
  const results = parseSecondSightSearchResults(searchPayload, {
    ...identity,
    title: "Next of Kin"
  });

  assert.equal(results[0]?.title, "Next of Kin");
  const evidence = await parseSecondSightPage(pageHtml, {
    ...identity,
    title: "Next of Kin"
  }, results[0]);
  const edition = evidence?.parsed?.editions?.[0];

  assert.ok(edition);
  assert.equal(edition?.label, "Second Sight Films");
  assert.equal(edition?.region, "B");
  assert.equal(edition?.commentaryTracks?.length, 2);
  assert.equal(edition?.commentaryTracks?.[0]?.description, "Audio commentary with Director Tony Willams and Producer Tim White");
});

test("Blu-ray.com quick search parser returns matching editions", async () => {
  const html = await fs.readFile(path.join(fixtures, "bluray-quicksearch.html"), "utf8");
  const results = parseBluRayQuickSearch(html, identity);

  assert.equal(results.length, 2);
  assert.match(results[0]?.url || "", /The-Trial/);
});

test("Blu-ray.com adapter search retries with simplified titles when the full title returns no matches", async () => {
  const htmlNoResults = `<ul></ul><script>var urls = new Array(); var countrycodes = new Array();</script>`;
  const htmlWithMatch = `
    <ul><li id="match0">&nbsp;Star Wars (1977)</li></ul>
    <script>
      var urls = new Array('https://www.blu-ray.com/movies/Star-Wars-Blu-ray/12345/');
      var countrycodes = new Array('US');
    </script>
  `;
  const requestBodies: string[] = [];
  const runtime: SourceRuntime = {
    async fetchText(_url: string, init): Promise<string> {
      requestBodies.push(init?.body || "");
      if (init?.body?.includes("Star%20Wars%3A%20Episode%20IV%20-%20A%20New%20Hope")) {
        return htmlNoResults;
      }
      if (init?.body?.includes("Star%20Wars")) {
        return htmlWithMatch;
      }
      return htmlNoResults;
    }
  };

  const results = await bluRayComAdapter.search({
    imdbId: "tt0076759",
    title: "Star Wars: Episode IV - A New Hope",
    year: 1977,
    alternateTitles: [],
    directors: ["George Lucas"]
  }, runtime);

  assert.ok(requestBodies.some((body) => body.includes("Star%20Wars%3A%20Episode%20IV%20-%20A%20New%20Hope")));
  assert.ok(requestBodies.some((body) => body.includes("Star%20Wars")));
  assert.equal(results[0]?.title, "Star Wars (1977)");
});

test("Blu-ray.com adapter expands fetch depth when search has many hits", async () => {
  const manyMatches = Array.from({ length: 11 }, (_, index) => ({
    id: index,
    url: `https://www.blu-ray.com/movies/City-of-God-Blu-ray/${1000 + index}/`,
    title: `City of God (${2002 + (index % 2)})`
  }));
  const htmlWithManyMatches = `
    <ul>
      ${manyMatches.map((item) => `<li id="match${item.id}">&nbsp;${item.title}</li>`).join("")}
    </ul>
    <script>
      var urls = new Array(${manyMatches.map((item) => `'${item.url}'`).join(",")});
      var countrycodes = new Array(${manyMatches.map(() => "'US'").join(",")});
    </script>
  `;
  const runtime: SourceRuntime = {
    async fetchText(): Promise<string> {
      return htmlWithManyMatches;
    }
  };

  const results = await bluRayComAdapter.search({
    imdbId: "tt0317248",
    title: "City of God",
    year: 2002,
    alternateTitles: [],
    directors: ["Fernando Meirelles"]
  }, runtime);

  assert.equal(results.length, 8);
});

test("Blu-ray.com adapter keeps default fetch depth when search hit count is modest", async () => {
  const moderateMatches = Array.from({ length: 6 }, (_, index) => ({
    id: index,
    url: `https://www.blu-ray.com/movies/City-of-God-Blu-ray/${2000 + index}/`,
    title: `City of God (${2002 + (index % 2)})`
  }));
  const htmlWithModerateMatches = `
    <ul>
      ${moderateMatches.map((item) => `<li id="match${item.id}">&nbsp;${item.title}</li>`).join("")}
    </ul>
    <script>
      var urls = new Array(${moderateMatches.map((item) => `'${item.url}'`).join(",")});
      var countrycodes = new Array(${moderateMatches.map(() => "'US'").join(",")});
    </script>
  `;
  const runtime: SourceRuntime = {
    async fetchText(): Promise<string> {
      return htmlWithModerateMatches;
    }
  };

  const results = await bluRayComAdapter.search({
    imdbId: "tt0317248",
    title: "City of God",
    year: 2002,
    alternateTitles: [],
    directors: ["Fernando Meirelles"]
  }, runtime);

  assert.equal(results.length, 4);
});

test("Blu-ray.com page parser extracts edition specs", async () => {
  const html = await fs.readFile(path.join(fixtures, "bluray-page.html"), "utf8");
  const evidence = await parseBluRayPage(html, identity, {
    url: "https://www.blu-ray.com/movies/The-Trial-Blu-ray/77978/",
    title: "The Trial (1962)",
    year: 1962,
    country: "United States",
    matchedBy: "title_year",
    confidence: 0.95
  });

  const edition = evidence?.parsed?.editions?.[0];
  assert.ok(edition);
  assert.equal(edition?.label, "Criterion");
  assert.equal(edition?.format, "Blu-ray");
  assert.equal(edition?.video?.resolution, "1080p");
  assert.match(edition?.region || "", /Region A/);
  assert.equal(edition?.commentaryTracks?.[0]?.description, "Audio commentary by film scholar Joseph McBride");
});

test("DVDCompare search and page parsers extract cut/version data", async () => {
  const searchHtml = await fs.readFile(path.join(fixtures, "dvdcompare-search.html"), "utf8");
  const pageHtml = await fs.readFile(path.join(fixtures, "dvdcompare-page.html"), "utf8");
  const results = parseDvdCompareSearchResults(searchHtml, identity);

  assert.equal(results.length, 1);
  const evidence = await parseDvdComparePage(pageHtml, identity, results[0]);
  const edition = evidence?.parsed?.editions?.[0];

  assert.ok(edition);
  assert.equal(edition?.label, "Criterion Collection");
  assert.equal(edition?.country, "United States");
  assert.ok(edition?.cuts?.[0]?.description?.includes("No cuts"));
  assert.equal(edition?.commentaryTracks?.[0]?.description, "Audio commentary");
});

test("DVDCompare search parser matches titles with trailing article before the subtitle", () => {
  const html = `
    <html>
      <body>
        <a href="film.php?fid=3721">Lord of the Rings (The): The Two Towers (2002)</a>
      </body>
    </html>
  `;

  const results = parseDvdCompareSearchResults(html, {
    imdbId: "tt0167261",
    title: "The Lord of the Rings: The Two Towers",
    year: 2002,
    alternateTitles: [],
    directors: ["Peter Jackson"]
  });

  assert.equal(results[0]?.title, "Lord of the Rings (The): The Two Towers (2002)");
});

test("DVDCompare search parser prefers the main film over fuzzy spinoffs when an exact match exists", () => {
  const html = `
    <html>
      <body>
        <a href="film.php?fid=1852">Lord of the Rings (The): The Fellowship of the Ring (2001)</a>
        <a href="film.php?fid=55880">Lord of the Rings (The): The Fellowship of the Ring (Blu-ray 4K) (2001)</a>
        <a href="film.php?fid=15985">Lord of the Rings (The): The Fellowship of the Ring (Blu-ray) (2001)</a>
        <a href="film.php?fid=2271">National Geographic: Beyond the Movie - The Lord of the Rings: The Fellowship of the Ring (2001)</a>
      </body>
    </html>
  `;

  const results = parseDvdCompareSearchResults(html, {
    imdbId: "tt0120737",
    title: "The Lord of the Rings: The Fellowship of the Ring",
    year: 2001,
    alternateTitles: [],
    directors: ["Peter Jackson"]
  });

  assert.equal(results.length, 3);
  assert.equal(results[0]?.title, "Lord of the Rings (The): The Fellowship of the Ring (2001)");
  assert.ok(results.every((result) => !result.title.includes("National Geographic")));
});

test("DVDCompare adapter search retries with simplified titles when the full title returns no matches", async () => {
  const htmlNoResults = `<html><body>No matches</body></html>`;
  const htmlWithMatch = `<html><body><a href="film.php?fid=158">Star Wars (Blu-ray) (1977)</a></body></html>`;
  const requestBodies: string[] = [];
  const runtime: SourceRuntime = {
    async fetchText(_url: string, init): Promise<string> {
      requestBodies.push(init?.body || "");
      if (init?.body?.includes("Star%20Wars%3A%20Episode%20IV%20-%20A%20New%20Hope")) {
        return htmlNoResults;
      }
      if (init?.body?.includes("Star%20Wars")) {
        return htmlWithMatch;
      }
      return htmlNoResults;
    }
  };

  const results = await dvdCompareAdapter.search({
    imdbId: "tt0076759",
    title: "Star Wars: Episode IV - A New Hope",
    year: 1977,
    alternateTitles: [],
    directors: ["George Lucas"]
  }, runtime);

  assert.ok(requestBodies.some((body) => body.includes("Star%20Wars%3A%20Episode%20IV%20-%20A%20New%20Hope")));
  assert.ok(requestBodies.some((body) => body.includes("Star%20Wars")));
  assert.equal(results[0]?.title, "Star Wars (Blu-ray) (1977)");
});

test("DVDCompare adapter continues searching when the first term only finds a loose side match", async () => {
  const natGeoOnly = `
    <html>
      <body>
        <a href="film.php?fid=2271">National Geographic: Beyond the Movie - The Lord of the Rings: The Fellowship of the Ring (2001)</a>
      </body>
    </html>
  `;
  const exactMatch = `
    <html>
      <body>
        <a href="film.php?fid=1852">Lord of the Rings (The): The Fellowship of the Ring (2001)</a>
      </body>
    </html>
  `;
  const requestBodies: string[] = [];
  const runtime: SourceRuntime = {
    async fetchText(_url: string, init): Promise<string> {
      requestBodies.push(init?.body || "");
      if (init?.body?.includes("The%20Lord%20of%20the%20Rings%3A%20The%20Fellowship%20of%20the%20Ring")) {
        return natGeoOnly;
      }
      if (init?.body?.includes("The%20Fellowship%20of%20the%20Ring")) {
        return exactMatch;
      }
      return `<html><body>No matches</body></html>`;
    }
  };

  const results = await dvdCompareAdapter.search({
    imdbId: "tt0120737",
    title: "The Lord of the Rings: The Fellowship of the Ring",
    year: 2001,
    alternateTitles: [],
    directors: ["Peter Jackson"]
  }, runtime);

  assert.ok(requestBodies.some((body) => body.includes("The%20Lord%20of%20the%20Rings%3A%20The%20Fellowship%20of%20the%20Ring")));
  assert.ok(requestBodies.some((body) => body.includes("The%20Fellowship%20of%20the%20Ring")));
  assert.equal(results[0]?.title, "Lord of the Rings (The): The Fellowship of the Ring (2001)");
});
