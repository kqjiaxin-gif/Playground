import qrcode from 'qrcode-generator';

// QR as rows of '1'/'0' so the browser can draw it onto a shareable image.
export function qrModules(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const rows = [];
  for (let r = 0; r < n; r++) {
    let row = '';
    for (let c = 0; c < n; c++) row += qr.isDark(r, c) ? '1' : '0';
    rows.push(row);
  }
  return rows;
}

// Browser-side: draws the pass (event, QR, code, names) as a PNG Blob.
// Kept as a string so it can be inlined into pages; also copied into the test-run artifact.
export const PASS_CARD_JS = `
function drawPassCard(p) {
  var W = 1080, H = 1560, pad = 72;
  var c = document.createElement('canvas');
  c.width = W; c.height = H;
  var g = c.getContext('2d');
  var face = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  function font(weight, size) { return weight + ' ' + size + 'px ' + face; }
  function fit(text, y, weight, size, color) {
    g.fillStyle = color;
    do { g.font = font(weight, size); size -= 2; } while (g.measureText(text).width > W - pad * 2 && size > 22);
    g.fillText(text, W / 2, y);
  }
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';

  g.fillStyle = p.brand; g.fillRect(0, 0, W, 240);
  fit(p.event || 'Event pass', 120, 800, 76, '#ffffff');
  if (p.when) fit(p.when, 305, 600, 40, '#17151f');
  if (p.venue) fit(p.venue, 360, 400, 36, '#6b6878');

  g.strokeStyle = '#d9d6e2'; g.lineWidth = 4; g.setLineDash([18, 14]);
  g.beginPath(); g.moveTo(pad, 420); g.lineTo(W - pad, 420); g.stroke(); g.setLineDash([]);

  var n = p.modules.length, quiet = 4;
  var cell = Math.floor(720 / (n + quiet * 2)), size = cell * (n + quiet * 2);
  var qx = Math.round((W - size) / 2), qy = 460;
  g.fillStyle = '#000000';
  for (var r = 0; r < n; r++) for (var col = 0; col < n; col++) {
    if (p.modules[r].charAt(col) === '1') g.fillRect(qx + (col + quiet) * cell, qy + (r + quiet) * cell, cell, cell);
  }
  var y = qy + size + 50;
  fit(p.code.split('').join(' '), y, 800, 60, '#17151f');
  y += 90;
  (p.names || []).forEach(function (nm) { fit(nm, y, 700, 50, '#17151f'); y += 64; });
  fit('Admits ' + p.admits + ' \\u00b7 Show this QR at the door', Math.max(y + 20, H - 70), 500, 34, '#6b6878');
  return new Promise(function (res) { c.toBlob(res, 'image/png'); });
}
`;
