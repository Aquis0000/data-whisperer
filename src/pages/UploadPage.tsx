import { useState, useCallback } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { parseCSVContent, type ParsedCSV, type ColumnInfo } from "@/lib/csv-parser";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ImportStatus = "idle" | "previewing" | "importing" | "complete" | "error";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".csv")) {
      setError("Only CSV files are supported");
      return;
    }
    setFile(f);
    setDatasetName(f.name.replace(/\.csv$/i, ""));
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const result = parseCSVContent(content);
        setParsed(result);
        setStatus("previewing");
      } catch (err: any) {
        setError(err.message);
        setStatus("error");
      }
    };
    reader.readAsText(f);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handleImport = async () => {
    if (!parsed || !datasetName.trim()) return;
    setStatus("importing");

    try {
      // Create dataset
      const { data: dataset, error: dsError } = await supabase
        .from("datasets")
        .insert({
          name: datasetName.trim(),
          tags,
          source_filename: file!.name,
          column_schema: parsed.columns as any,
          row_count: parsed.totalRows,
          status: "processing",
        } as any)
        .select()
        .single();

      if (dsError) throw dsError;

      // Insert records in batches of 500
      const batchSize = 500;
      for (let i = 0; i < parsed.rows.length; i += batchSize) {
        const batch = parsed.rows.slice(i, i + batchSize).map((row) => ({
          dataset_id: dataset.id,
          data: row as any,
        }));
        const { error: recError } = await supabase.from("records").insert(batch as any);
        if (recError) throw recError;
      }

      // Mark complete
      await supabase
        .from("datasets")
        .update({ status: "complete" })
        .eq("id", dataset.id);

      setStatus("complete");
      toast({ title: "Import complete", description: `${parsed.totalRows} records imported successfully.` });
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }
  };

  const reset = () => {
    setFile(null);
    setParsed(null);
    setDatasetName("");
    setTags([]);
    setTagInput("");
    setStatus("idle");
    setError("");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Upload Dataset</h1>
        <p className="text-muted-foreground text-sm mt-1">Import a CSV file to create a new queryable dataset.</p>
      </div>

      {status === "idle" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="glass-card flex flex-col items-center justify-center gap-4 p-12 cursor-pointer transition-all hover:border-primary/40 hover:glow-primary"
          onClick={() => document.getElementById("csv-input")?.click()}
        >
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Drop your CSV file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Supports .csv files of any size</p>
          </div>
          <input
            id="csv-input"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      )}

      {status === "previewing" && parsed && (
        <div className="space-y-6">
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file?.name}</p>
                <p className="text-xs text-muted-foreground">{parsed.totalRows.toLocaleString()} rows · {parsed.headers.length} columns</p>
              </div>
              <Button variant="ghost" size="icon" onClick={reset}><X className="h-4 w-4" /></Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Dataset Name</Label>
                <Input value={datasetName} onChange={(e) => setDatasetName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tags</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                    placeholder="Add tag..."
                  />
                  <Button variant="secondary" size="sm" onClick={addTag}>Add</Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tags.map((t) => (
                      <Badge key={t} variant="secondary" className="gap-1 text-xs">
                        {t}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(t)} />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column Preview */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Detected Columns</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {parsed.columns.map((col: ColumnInfo) => (
                <div key={col.name} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2">
                  <span className="text-sm font-mono truncate">{col.name}</span>
                  <Badge variant="outline" className="text-[10px] ml-2 shrink-0">{col.detectedType}</Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Data Preview */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Preview (first 20 rows)</h3>
            <div className="overflow-auto rounded-md border border-border max-h-[400px] scrollbar-thin">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 sticky top-0">
                    {parsed.headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      {parsed.headers.map((h) => (
                        <td key={h} className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate">{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={reset}>Cancel</Button>
            <Button onClick={handleImport} disabled={!datasetName.trim()}>
              Confirm Import
            </Button>
          </div>
        </div>
      )}

      {status === "importing" && (
        <div className="glass-card flex flex-col items-center justify-center gap-4 p-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Importing records...</p>
        </div>
      )}

      {status === "complete" && (
        <div className="glass-card flex flex-col items-center justify-center gap-4 p-12">
          <CheckCircle2 className="h-10 w-10 text-primary" />
          <div className="text-center">
            <p className="font-semibold">Import Complete</p>
            <p className="text-sm text-muted-foreground mt-1">{parsed?.totalRows.toLocaleString()} records added to "{datasetName}"</p>
          </div>
          <Button onClick={reset}>Upload Another</Button>
        </div>
      )}

      {status === "error" && (
        <div className="glass-card flex flex-col items-center justify-center gap-4 p-12">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div className="text-center">
            <p className="font-semibold">Import Failed</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
          <Button onClick={reset}>Try Again</Button>
        </div>
      )}
    </div>
  );
}
