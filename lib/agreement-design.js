const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Embed the original website asset; no network, font CDN or user-supplied URLs.
const logo = `data:image/png;base64,${readFileSync(join(__dirname, '../images/logo.png')).toString('base64')}`;
function escape(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function list(items) {
  if (!Array.isArray(items) || !items.length) return '<li class="empty">No celebrities selected yet.</li>';
  return items.map((person, i) => `<li><span class="number">${String(i + 1).padStart(2, '0')}</span>
    <div><strong>${escape(person?.name || 'Unnamed Celebrity')}</strong>
    <small>${escape(person?.subtitle || person?.category || person?.genre || person?.sport || '')}</small></div></li>`).join('');
}
function signature(name) {
  return `<div class="signatures"><div><span class="signature-line"></span><span>${name} Approval Signature</span></div>
    <div><span class="signature-line"></span><span>Date</span></div></div>`;
}
function buildAgreement(body, type) {
  const her = escape(body.herName || 'Her'), his = escape(body.hisName || 'His');
  const couples = type === 'couples', owner = type === 'his' ? his : her;
  const compact = [body.herName, body.hisName].some(name => String(name || '').length > 30) ||
    [...(Array.isArray(body.herList) ? body.herList : []), ...(Array.isArray(body.hisList) ? body.hisList : [])]
      .some(person => String(person?.name || '').length > 40);
  const partner = type === 'his' ? her : his;
  const edition = couples ? 'The Double Headliner' : type === 'his' ? 'The High Roller' : 'The Golden Marquee';
  const panel = (name, items, approver) => `<section class="selection-panel"><div class="panel-label">THE CELEBRITY GUEST LIST</div>
    ${couples ? `<h2>${name}'s Cheat List</h2>` : ''}<ol>${list(items)}</ol>${signature(approver)}</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The Cheat List Agreement</title><style>
    @page { size: letter landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; background:#160e09; color:#f2e3c6; }
    body { font-family:Georgia,'Times New Roman',serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .page { width:11in; height:8.5in; padding:28px; background:radial-gradient(ellipse at top left,#462316,transparent 65%),#160e09; }
    .agreement { height:100%; border:3px double #d8a54a; padding:22px 28px 18px; position:relative;
      box-shadow:inset 0 0 0 5px #160e09,inset 0 0 0 6px #866131; }
    .agreement-content { display:flow-root; }
    .topline,.panel-label,.eyebrow,.edition,.footer,.signatures { font-family:Arial,sans-serif; }
    .topline { display:flex; justify-content:space-between; font-size:9px; letter-spacing:3px; color:#d9b774; }
    .header { display:flex; align-items:center; justify-content:space-between; gap:24px; margin:8px 0 12px; }
    .logo { width:204px; height:124px; object-fit:contain; flex-shrink:0; }
    .headline { flex:1; text-align:right; }
    .edition { font-size:10px; color:#ffad68; letter-spacing:4px; text-transform:uppercase; }
    h1 { font-size:43px; line-height:1.02; margin:10px 0; color:#ffdc91; letter-spacing:-1px; font-weight:normal;
      text-shadow:0 0 12px #c36b3438; }
    .subtitle { font-size:13px; font-style:italic; color:#d9c69f; }
    .stars { color:#e8b55f; letter-spacing:8px; font-size:12px; }
    .names { border-top:1px solid #926b36; border-bottom:1px solid #926b36; padding:12px 0;
      display:grid; grid-template-columns:minmax(0,1fr) 58px minmax(0,1fr); align-items:center; text-align:center; gap:10px; }
    .eyebrow { display:block; font-size:9px; letter-spacing:3px; color:#d9b774; margin-bottom:5px; }
    .name { font-size:32px; line-height:1.12; overflow-wrap:anywhere; color:#fff0cb; }
    .amp { font-size:38px; font-style:italic; color:#ffad68; }
    .intro { margin:10px 0 12px; font-size:12px; text-align:center; color:#d9c69f; line-height:1.4; }
    .selection-panel { border:1px solid #926b36; padding:16px 22px 12px; background:#24150e; min-width:0; break-inside:avoid; }
    .panel-label { font-size:9px; letter-spacing:3px; color:#e8b55f; padding-bottom:10px; border-bottom:1px solid #70512f; }
    h2 { font-size:20px; font-weight:normal; margin:10px 0 4px; overflow-wrap:anywhere; }
    ol { list-style:none; margin:0; padding:0; }
    li { display:flex; align-items:center; gap:15px; padding:7px 0; border-bottom:1px solid #5c4028; break-inside:avoid; }
    li>div { min-width:0; } .number { color:#e8b55f; font-size:22px; font-style:italic; min-width:28px; }
    strong { display:block; font-size:18px; font-weight:normal; line-height:1.2; overflow-wrap:anywhere; }
    small { display:block; font-family:Arial,sans-serif; font-size:10px; line-height:1.3; color:#c7b58f; margin-top:2px; overflow-wrap:anywhere; }
    .empty { font-size:16px; padding:35px 0; }
    .signatures { display:grid; grid-template-columns:minmax(0,1fr) 100px; gap:24px; margin-top:26px; font-size:9px; color:#d9c69f; }
    .signatures>div { min-width:0; overflow-wrap:anywhere; line-height:1.4; }
    .signature-line { display:block; border-top:1px solid #b99b61; margin-bottom:7px; }
    .footer { margin-top:17px; text-align:center; font-size:8px; line-height:1.6; color:#bda781; }
    .footer b { display:block; color:#e8b55f; letter-spacing:3px; font-size:9px; margin-bottom:3px; }
    .her .selection-panel { background:linear-gradient(110deg,#391b1d,#24150e); border-radius:18px 18px 0 0; }
    .her .headline { border-right:3px solid #bd6542; padding-right:18px; }
    .his .page { background:radial-gradient(ellipse at top right,#144346,transparent 70%),#101a19; }
    .his .selection-panel { background:#132a2a; border-left:5px solid #d8a54a; }
    .his .edition,.his .amp { color:#edc070; } .his h1 { text-transform:uppercase; font-size:38px; letter-spacing:2px; }
    .couples .page { background:radial-gradient(ellipse at top,#4c2820,transparent 70%),#160e09; }
    .couples .panels { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:18px; }
    .couples .selection-panel { padding:12px 16px; } .couples .selection-panel:last-child { background:#132a2a; }
    .couples li { padding:6px 0; gap:10px; } .couples strong { font-size:16px; }
    .couples .signatures { gap:12px; grid-template-columns:minmax(0,1fr) 65px; }
    .couples h1 { font-size:36px; } .couples .name { font-size:28px; }
    .couples .logo { height:106px; }
    .compact .logo { height:100px; width:180px; }
    .compact .name { font-size:24px; } .compact h1 { font-size:32px; }
    .compact strong { font-size:14px; } .compact small { font-size:9px; }
    .compact li { padding:5px 0; } .compact h2 { font-size:17px; }
  </style></head><body class="${type}${compact ? ' compact' : ''}"><main class="page"><article class="agreement"><div class="agreement-content">
    <div class="topline"><span>THECHEATLIST.COM</span><span>JUST FOR FUN • NEVER LEGALLY BINDING</span></div>
    <header class="header"><img class="logo" src="${logo}" alt="The Cheat List logo"><div class="headline">
      <div class="edition">${edition}</div><h1>${couples ? 'Two hearts.<br>One lucky deal.' : type === 'his' ? 'A little luck.<br>A lot of permission.' : 'Your name.<br>Up in lights.'}</h1>
      <div class="subtitle">${couples ? 'Couples Agreement' : `${owner}'s Agreement`} &nbsp; <span class="stars">✦ ✦ ✦</span></div></div></header>
    <section class="names"><div><span class="eyebrow">${couples ? 'FIRST HEADLINER' : 'THE HEADLINER'}</span><div class="name">${owner}</div></div>
      <div class="amp">&amp;</div><div><span class="eyebrow">${couples ? 'SECOND HEADLINER' : 'THE CO-STAR'}</span><div class="name">${partner}</div></div></section>
    <p class="intro">${couples ? 'Two exclusive guest lists. One mutually approved flight of fancy.' : 'A playful permission slip for a strictly imaginary celebrity encounter.'}<br>All in good fun. Always on the same team.</p>
    <div class="panels">${couples ? panel(her, body.herList, his) + panel(his, body.hisList, her) : panel(owner, type === 'his' ? body.hisList : body.herList, partner)}</div>
    <footer class="footer"><b>IT’S JUST FOR FUN</b>For entertainment purposes only. Not endorsed by any celebrity, studio, team, league, label, or public figure.</footer>
    </div></article></main></body></html>`;
}
async function fitAgreement() {
      await document.fonts.ready;
      const frame = document.querySelector('.agreement');
      const content = document.querySelector('.agreement-content');
      const style = getComputedStyle(frame);
      const available = frame.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      let zoom = 1;
      for (let attempt = 0; attempt < 8; attempt++) {
        const height = content.getBoundingClientRect().height;
        if (height <= available - 2) return;
        zoom *= (available - 4) / height;
        content.style.zoom = String(zoom);
      }
      if (content.getBoundingClientRect().height > available)
        throw new Error('Agreement content could not fit on one page');
}
module.exports = { buildAgreement, fitAgreement };
