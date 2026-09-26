import * as React from "react";
import { cn } from "@/lib/utils";

export type DataColumn<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  /** Hide below this breakpoint to keep phone tables readable. */
  hideBelow?: "sm" | "md" | "lg";
};

const hideClass = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/** Plain, fast table: sticky header, tabular numbers, optional row click. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  className,
  caption,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  className?: string;
  caption?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-separate border-spacing-0 text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "sticky top-0 border-b border-outline-variant/60 bg-surface-dim/90 px-3 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-outline backdrop-blur",
                  column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left",
                  column.hideBelow && hideClass[column.hideBelow],
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn("group", onRowClick && "cursor-pointer")}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "mm-num border-b border-outline-variant/30 px-3 py-3 align-middle text-on-surface transition-colors group-hover:bg-surface-high/40",
                    column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left",
                    column.hideBelow && hideClass[column.hideBelow],
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
