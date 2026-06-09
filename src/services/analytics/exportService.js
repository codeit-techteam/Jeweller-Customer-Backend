function escapeCsv(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function flattenForExport(data, prefix = "") {
  const rows = [];
  if (data?.cards && typeof data.cards === "object") {
    rows.push(["Metric", "Value"]);
    for (const [key, value] of Object.entries(data.cards)) {
      rows.push([key, value]);
    }
    rows.push([]);
  }
  if (data?.charts && typeof data.charts === "object") {
    for (const [chartName, series] of Object.entries(data.charts)) {
      if (!Array.isArray(series) || !series.length) continue;
      rows.push([`Chart: ${chartName}`]);
      const keys = Object.keys(series[0]);
      rows.push(keys);
      for (const point of series) {
        rows.push(keys.map((k) => point[k]));
      }
      rows.push([]);
    }
  }
  return rows;
}

export function buildAnalyticsCsv(dashboardType, data) {
  const header = [[`Dashboard`, dashboardType], [`Exported At`, new Date().toISOString()], []];
  const body = flattenForExport(data);
  const lines = [...header, ...body].map((row) =>
    Array.isArray(row) ? row.map(escapeCsv).join(",") : escapeCsv(row),
  );
  return lines.join("\n");
}

export function buildAnalyticsPdfBuffer(dashboardType, data) {
  const lines = [
    `Super Admin Analytics Report`,
    `Dashboard: ${dashboardType}`,
    `Exported: ${new Date().toISOString()}`,
    ``,
  ];
  if (data?.cards) {
    lines.push(`--- Summary ---`);
    for (const [k, v] of Object.entries(data.cards)) {
      lines.push(`${k}: ${v}`);
    }
    lines.push(``);
  }
  const content = lines.join("\n");
  const escaped = content.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length ${escaped.length + 50} >>stream
BT /F1 10 Tf 40 750 Td (${escaped.slice(0, 2000)}) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000264 00000 n 
0000000400 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
480
%%EOF`;
  return Buffer.from(pdf, "utf8");
}
