import { useState, useRef, useEffect } from "react";
import { Send, Download, Loader2, MessageSquare, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { generateCSVContent } from "@/lib/csv-parser";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
  results?: Record<string, unknown>[];
  queryPlan?: QueryPlan;
}

interface QueryPlan {
  dataset_ids: string[];
  filters: QueryFilter[];
  columns?: string[];
  limit?: number;
}

interface QueryFilter {
  column: string;
  operator: "equals" | "contains" | "starts_with" | "gt" | "lt" | "gte" | "lte";
  value: string | number;
}

export default function QueryPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const executeQueryPlan = async (plan: QueryPlan): Promise<Record<string, unknown>[]> => {
    let allResults: Record<string, unknown>[] = [];

    for (const datasetId of plan.dataset_ids) {
      let query = supabase
        .from("records")
        .select("data")
        .eq("dataset_id", datasetId)
        .limit(plan.limit ?? 200);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []).map((r) => r.data as Record<string, unknown>);

      // Apply filters client-side on JSONB data
      for (const filter of plan.filters) {
        rows = rows.filter((row) => {
          const val = String(row[filter.column] ?? "").toLowerCase();
          const target = String(filter.value).toLowerCase();
          switch (filter.operator) {
            case "equals": return val === target;
            case "contains": return val.includes(target);
            case "starts_with": return val.startsWith(target);
            case "gt": return Number(row[filter.column]) > Number(filter.value);
            case "lt": return Number(row[filter.column]) < Number(filter.value);
            case "gte": return Number(row[filter.column]) >= Number(filter.value);
            case "lte": return Number(row[filter.column]) <= Number(filter.value);
            default: return true;
          }
        });
      }

      // Filter columns if specified
      if (plan.columns?.length) {
        rows = rows.map((row) => {
          const filtered: Record<string, unknown> = {};
          plan.columns!.forEach((c) => { filtered[c] = row[c]; });
          return filtered;
        });
      }

      allResults = [...allResults, ...rows];
    }

    return allResults;
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Fetch datasets for context
      const { data: datasets } = await supabase
        .from("datasets")
        .select("id, name, tags, column_schema, row_count")
        .is("deleted_at", null);

      const { data: fnData, error: fnError } = await supabase.functions.invoke("ai-query", {
        body: {
          message: userMsg.content,
          datasets: datasets ?? [],
          history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        },
      });

      if (fnError) throw fnError;

      const response = fnData as { message: string; queryPlan?: QueryPlan };

      if (response.queryPlan) {
        const results = await executeQueryPlan(response.queryPlan);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: response.message || `Found ${results.length} results.`,
            results,
            queryPlan: response.queryPlan,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: response.message }]);
      }
    } catch (err: any) {
      toast({ title: "Query failed", description: err.message, variant: "destructive" });
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const exportCSV = (results: Record<string, unknown>[]) => {
    const csv = generateCSVContent(results);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin p-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-lg font-semibold">AI Query Agent</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Ask questions about your datasets in natural language. Try: "Show me all HVAC businesses in Colorado"
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 animate-fade-in ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={`max-w-[85%] space-y-3 ${msg.role === "user" ? "order-first" : ""}`}>
                  <div className={`rounded-xl px-4 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground ml-auto"
                      : "bg-secondary"
                  }`}>
                    {msg.content}
                  </div>

                  {msg.results && msg.results.length > 0 && (
                    <div className="glass-card overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                        <span className="text-xs text-muted-foreground">{msg.results.length} results</span>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => exportCSV(msg.results!)}>
                          <Download className="h-3 w-3" /> Export CSV
                        </Button>
                      </div>
                      <div className="overflow-auto max-h-[300px] scrollbar-thin">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/50 sticky top-0">
                              {Object.keys(msg.results[0]).map((k) => (
                                <th key={k} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.results.slice(0, 50).map((row, ri) => (
                              <tr key={ri} className="border-b border-border/50 hover:bg-muted/30">
                                {Object.values(row).map((v, ci) => (
                                  <td key={ci} className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate">{String(v ?? "")}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {msg.results.length > 50 && (
                        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
                          Showing 50 of {msg.results.length}. Export to see all.
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                </div>
                <div className="rounded-xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
                  Analyzing your query...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask about your datasets..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={sendMessage} disabled={!input.trim() || isLoading} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
