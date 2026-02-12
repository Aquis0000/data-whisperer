export interface ColumnInfo {
  name: string;
  detectedType: "string" | "number" | "boolean" | "date";
  sampleValues: string[];
}

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  columns: ColumnInfo[];
  totalRows: number;
}

function detectType(values: string[]): "string" | "number" | "boolean" | "date" {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return "string";

  // Check boolean
  const boolValues = new Set(["true", "false", "yes", "no", "1", "0"]);
  if (nonEmpty.every((v) => boolValues.has(v.toLowerCase()))) return "boolean";

  // Check number
  if (nonEmpty.every((v) => !isNaN(Number(v)) && v.trim() !== "")) return "number";

  // Check date - simple heuristic
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/, // ISO
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/, // US date
    /^\d{1,2}-\d{1,2}-\d{2,4}/, // dash date
  ];
  if (nonEmpty.filter((v) => datePatterns.some((p) => p.test(v))).length > nonEmpty.length * 0.7) {
    return "date";
  }

  return "string";
}

export function parseCSVContent(content: string): ParsedCSV {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) throw new Error("CSV file is empty");

  // Simple CSV parser that handles quoted fields
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  if (headers.length === 0 || headers.every((h) => h === "")) {
    throw new Error("CSV must have headers");
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  // Sample up to 100 rows for type detection
  const sampleSize = Math.min(rows.length, 100);
  const columns: ColumnInfo[] = headers.map((name) => {
    const sampleValues = rows.slice(0, sampleSize).map((r) => r[name] ?? "");
    return {
      name,
      detectedType: detectType(sampleValues),
      sampleValues: sampleValues.slice(0, 5),
    };
  });

  return { headers, rows, columns, totalRows: rows.length };
}

export function generateCSVContent(
  rows: Record<string, unknown>[],
  columns?: string[]
): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map((c) => `"${c}"`).join(",");
  const dataLines = rows.map((row) =>
    cols.map((c) => {
      const val = String(row[c] ?? "");
      return `"${val.replace(/"/g, '""')}"`;
    }).join(",")
  );
  return [header, ...dataLines].join("\n");
}
