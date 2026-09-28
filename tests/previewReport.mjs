/** Turns preview/manifest.json into preview/index.html (the owner's pre-release review page). */
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = new globalThis.URL('../preview/', import.meta.url).pathname;
const m = JSON.parse(readFileSync(`${DIR}manifest.json`, 'utf8'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const passed = m.checks.filter((c) => c.pass).length;
const allOk = passed === m.checks.length;
const when = new Date(m.generatedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

const html = `<title>SAEED ROYALE Preview</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one review column. Verdict, then the recorded run, then checks, then the scene-by-scene shots. */
:root{
  --bg:#f5f3f8; --panel:#ffffff; --fg:#1a1526; --muted:#6b6480; --line:#ddd8e8;
  --accent:#5b3fd4; --gold:#a87b00; --ok:#0f7a4b; --bad:#b3261e; --okbg:#e3f4ea; --badbg:#fbe4e2;
  --sans:'IBM Plex Sans Arabic',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0f0b1a; --panel:#181226; --fg:#ece8f6; --muted:#9d95b4; --line:#2c2440;
  --accent:#9b86ff; --gold:#e0b93c; --ok:#4fd08c; --bad:#ff7b72; --okbg:#12301f; --badbg:#3b1714; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0f0b1a; --panel:#181226; --fg:#ece8f6; --muted:#9d95b4; --line:#2c2440;
  --accent:#9b86ff; --gold:#e0b93c; --ok:#4fd08c; --bad:#ff7b72; --okbg:#12301f; --badbg:#3b1714; color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:15px;line-height:1.6;padding-block:28px 56px;padding-inline:16px}
main{max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:28px}
h1{font-size:clamp(26px,5vw,38px);line-height:1.15;margin:0;text-wrap:balance}
h2{font-size:18px;margin:0 0 12px}
.sub{color:var(--muted);margin:6px 0 0}
.meta{display:flex;flex-wrap:wrap;gap:8px 20px;font:12px var(--mono);color:var(--muted);margin-top:14px}
.verdict{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:16px 18px;border-radius:10px;border:1px solid var(--line);
  background:var(--okbg);color:var(--ok)}
.verdict.fail{background:var(--badbg);color:var(--bad)}
.verdict b{font-size:22px}
.verdict span{color:var(--fg)}
.video{background:#000;border-radius:10px;overflow:hidden;border:1px solid var(--line)}
video{display:block;width:100%;max-height:70vh;background:#000}
.note{font-size:13px;color:var(--muted);margin:8px 0 0}
ul.checks{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:8px}
.checks li{display:flex;gap:10px;align-items:baseline;padding:9px 12px;background:var(--panel);border:1px solid var(--line);border-radius:8px;min-width:0}
.tag{font:600 11px var(--mono);padding:2px 7px;border-radius:5px;background:var(--okbg);color:var(--ok);flex:none}
.tag.bad{background:var(--badbg);color:var(--bad)}
.checks small{display:block;font:11px var(--mono);color:var(--muted);overflow-wrap:anywhere}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:16px}
figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;min-width:0}
figure a{display:block;line-height:0}
figure img{width:100%;height:auto;aspect-ratio:851/393;object-fit:cover}
figcaption{padding:10px 12px}
figcaption strong{display:block}
figcaption span{font-size:12px;color:var(--muted);direction:ltr;display:block;text-align:start}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
<main dir="rtl" lang="ar">
  <header>
    <h1>سعيد رويال — معاينة ما قبل الإصدار</h1>
    <p class="sub">جلسة لعب حقيقية على النسخة المبنية، مسجّلة بالفيديو والصور قبل النشر.</p>
    <div class="meta" dir="ltr"><span>commit ${esc(m.commit)}</span><span>${esc(when)}</span><span>${esc(m.device)}</span></div>
  </header>

  <section class="verdict${allOk ? '' : ' fail'}" aria-label="النتيجة">
    <b dir="ltr">${passed}/${m.checks.length}</b>
    <span>${allOk ? 'كل الفحوصات نجحت. النسخة جاهزة للمراجعة.' : 'بعض الفحوصات فشلت. راجع القائمة أدناه.'}</span>
  </section>

  ${m.video ? `<section>
    <h2>تسجيل الجلسة</h2>
    <div class="video"><video controls preload="metadata" playsinline src="${esc(m.video)}"></video></div>
    <p class="note">التسجيل بعرض برمجي داخل بيئة الاختبار، فالحركة فيه أبطأ وأقل سلاسة مما ستراه على هاتف حقيقي.</p>
  </section>` : ''}

  <section>
    <h2>الفحوصات الآلية</h2>
    <ul class="checks">
      ${m.checks.map((c) => `<li><span class="tag${c.pass ? '' : ' bad'}">${c.pass ? 'PASS' : 'FAIL'}</span><div>${esc(c.name)}${c.detail ? `<small>${esc(c.detail)}</small>` : ''}</div></li>`).join('\n      ')}
    </ul>
  </section>

  <section>
    <h2>المشاهد (${m.shots.length})</h2>
    <div class="gallery">
      ${m.shots.map((s) => `<figure><a href="${esc(s.file)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(s.file)}" alt="${esc(s.title)}"></a><figcaption><strong>${esc(s.title)}</strong><span>${esc(s.note)}</span></figcaption></figure>`).join('\n      ')}
    </div>
  </section>
</main>
`;
writeFileSync(`${DIR}index.html`, html);
console.log(`wrote preview/index.html (${m.shots.length} shots, ${passed}/${m.checks.length} checks)`);
