import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Trash2, RotateCcw, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function DatasetsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleted, setShowDeleted] = useState(false);

  const { data: datasets, isLoading } = useQuery({
    queryKey: ["datasets", showDeleted],
    queryFn: async () => {
      let query = supabase
        .from("datasets")
        .select("*")
        .order("created_at", { ascending: false });

      if (!showDeleted) {
        query = query.is("deleted_at", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("datasets")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      toast({ title: "Dataset deleted" });
    },
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("datasets")
        .update({ deleted_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      toast({ title: "Dataset restored" });
    },
  });

  const statusBadge = (status: string) => {
    if (status === "complete") return <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">Complete</Badge>;
    if (status === "processing") return <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px]">Processing</Badge>;
    return <Badge variant="destructive" className="text-[10px]">Error</Badge>;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Datasets</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your imported CSV datasets.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowDeleted(!showDeleted)}>
          {showDeleted ? "Hide Deleted" : "Show Deleted"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
      ) : !datasets?.length ? (
        <div className="glass-card flex flex-col items-center justify-center gap-4 p-16">
          <Database className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No datasets yet. Upload a CSV to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {datasets.map((ds) => (
            <div
              key={ds.id}
              className={`glass-card p-4 flex items-center gap-4 transition-opacity ${ds.deleted_at ? "opacity-50" : ""}`}
            >
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{ds.name}</p>
                  {statusBadge(ds.status)}
                  {ds.deleted_at && <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">Deleted</Badge>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{ds.row_count?.toLocaleString()} rows</span>
                  <span>·</span>
                  <span>{(ds.column_schema as any[])?.length ?? 0} columns</span>
                  <span>·</span>
                  <span>{new Date(ds.created_at).toLocaleDateString()}</span>
                </div>
                {(ds.tags as string[])?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(ds.tags as string[]).map((t: string) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {ds.deleted_at ? (
                  <Button variant="ghost" size="icon" onClick={() => restore.mutate(ds.id)}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{ds.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>This will soft-delete the dataset. You can restore it later.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => softDelete.mutate(ds.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
