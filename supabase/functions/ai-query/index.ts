import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DatasetInfo {
  id: string;
  name: string;
  tags: string[];
  column_schema: { name: string; detectedType: string }[];
  row_count: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, datasets, history } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const datasetContext = (datasets as DatasetInfo[])
      .map(
        (d) =>
          `Dataset "${d.name}" (id: ${d.id}, ${d.row_count} rows, tags: [${d.tags?.join(", ") ?? ""}])\n  Columns: ${d.column_schema
            ?.map((c: any) => `${c.name} (${c.detectedType})`)
            .join(", ")}`
      )
      .join("\n\n");

    const systemPrompt = `You are a data query assistant for CSV datasets. You help users query their uploaded datasets.

AVAILABLE DATASETS:
${datasetContext || "No datasets available."}

YOUR TASK:
When the user asks for data, you MUST respond with a JSON tool call using the "create_query_plan" function.
The query plan specifies which datasets to query and what filters to apply.

FILTER OPERATORS: equals, contains, starts_with, gt, lt, gte, lte
- For state queries, try both full name and abbreviation (e.g. "Colorado" and "CO")
- Column names must match exactly from the schema above
- If the user's query is ambiguous about which dataset, ask for clarification
- If no datasets exist, tell the user to upload data first
- For general questions or greetings, respond conversationally without a query plan

Keep responses concise and structured.`;

    const body: any = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        ...(history ?? []),
        { role: "user", content: message },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "create_query_plan",
            description:
              "Create a structured query plan to filter and retrieve data from datasets. Always use this when the user wants data.",
            parameters: {
              type: "object",
              properties: {
                dataset_ids: {
                  type: "array",
                  items: { type: "string" },
                  description: "UUIDs of datasets to query",
                },
                filters: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      column: { type: "string" },
                      operator: {
                        type: "string",
                        enum: ["equals", "contains", "starts_with", "gt", "lt", "gte", "lte"],
                      },
                      value: { type: "string" },
                    },
                    required: ["column", "operator", "value"],
                    additionalProperties: false,
                  },
                },
                columns: {
                  type: "array",
                  items: { type: "string" },
                  description: "Specific columns to return. Omit for all columns.",
                },
                limit: {
                  type: "number",
                  description: "Max rows to return. Default 200.",
                },
              },
              required: ["dataset_ids", "filters"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: "auto",
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const choice = result.choices?.[0];

    // Check if AI used tool calling
    if (choice?.message?.tool_calls?.length) {
      const toolCall = choice.message.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);
      const textContent = choice.message.content || "";

      return new Response(
        JSON.stringify({
          message: textContent || `Querying ${args.dataset_ids.length} dataset(s) with ${args.filters.length} filter(s).`,
          queryPlan: {
            dataset_ids: args.dataset_ids,
            filters: args.filters,
            columns: args.columns,
            limit: args.limit ?? 200,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Regular text response
    return new Response(
      JSON.stringify({ message: choice?.message?.content || "I couldn't understand that. Could you rephrase?" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-query error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
