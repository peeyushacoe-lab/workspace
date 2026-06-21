"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ColumnDef<T> = {
  key: string;
  header: string;
  /** Width hint e.g. "w-32" or "w-1/4" */
  width?: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
};

interface DataTableProps<T extends Record<string, unknown>> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Key field used as React key */
  rowKey?: keyof T;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
}

type SortDir = "asc" | "desc" | null;

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  searchable = false,
  searchPlaceholder = "Search…",
  pageSize = 20,
  loading = false,
  emptyMessage = "No data",
  onRowClick,
  className,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir(null); }
    setPage(1);
  }

  function SortIcon({ colKey }: { colKey: string }) {
    if (sortKey !== colKey) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 text-[#00C2FF]" />
      : <ChevronDown className="h-3 w-3 text-[#00C2FF]" />;
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {searchable && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8A92A6]" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#1B1F2A] border border-white/[0.07] text-sm text-[#E6E9F0] placeholder:text-[#8A92A6]/60 focus:outline-none focus:border-[#00C2FF]/50 transition-colors"
          />
        </div>
      )}

      <div className="rounded-xl border border-white/[0.07] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.07] bg-[#1B1F2A]/60">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 py-3 text-left text-[11px] font-semibold text-[#8A92A6]",
                      col.width,
                      col.sortable && "cursor-pointer select-none hover:text-[#E6E9F0]",
                    )}
                    onClick={() => col.sortable && toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.header}
                      {col.sortable && <SortIcon colKey={col.key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.04]">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <div className="h-4 rounded bg-[#1B1F2A] animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-[#8A92A6] text-sm">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginated.map((row, i) => (
                  <tr
                    key={rowKey ? String(row[rowKey as string]) : i}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "border-b border-white/[0.04] transition-colors",
                      onRowClick && "cursor-pointer hover:bg-[#12151D]/[0.03]",
                    )}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-4 py-3 text-[#E6E9F0]", col.width)}>
                        {col.render
                          ? col.render(row[col.key], row)
                          : String(row[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[#8A92A6]">
          <span>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-md hover:bg-[#0E2532] disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-md hover:bg-[#0E2532] disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
