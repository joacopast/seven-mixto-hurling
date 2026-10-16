import ExcelJS from "exceljs";

const BRAND_GREEN = "FF123F2C";

/** Serializa filas a un .xlsx con encabezado estilizado, ancho de columna automático y filtros. */
export async function toXlsx(
  sheetName: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.addRow(headers);
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN } };
    cell.alignment = { vertical: "middle" };
  });

  for (const row of rows) sheet.addRow(row.map((v) => v ?? ""));

  sheet.columns.forEach((col, i) => {
    let max = (headers[i] ?? "").length;
    for (const row of rows) {
      const len = row[i] == null ? 0 : String(row[i]).length;
      if (len > max) max = len;
    }
    col.width = Math.min(Math.max(max + 2, 10), 40);
  });

  if (headers.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
