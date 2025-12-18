import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export default function DataTable({ 
  columns, 
  data, 
  isLoading, 
  onRowClick,
  emptyComponent,
  onSort,
  sortColumn,
  sortDirection
}) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              {columns.map((col, index) => (
                <TableHead key={index} className={cn("font-semibold text-slate-700", col.className)}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {columns.map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!data?.length && emptyComponent) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {emptyComponent}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              {columns.map((col, index) => (
                <TableHead 
                  key={index} 
                  className={cn(
                    "font-semibold text-slate-700", 
                    col.className,
                    col.sortable && "cursor-pointer select-none group"
                  )}
                  onClick={() => col.sortable && onSort && onSort(col.accessor || col.sortKey)}
                >
                  <div className="flex items-center gap-2">
                    {col.header}
                    {col.sortable && (
                      <span className="text-slate-400">
                        {sortColumn === (col.accessor || col.sortKey) ? (
                          sortDirection === 'asc' ? 
                            <ArrowUp className="h-4 w-4 text-blue-600" /> : 
                            <ArrowDown className="h-4 w-4 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" />
                        )}
                      </span>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, rowIndex) => (
              <TableRow 
                key={row.id || rowIndex}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "transition-colors",
                  onRowClick && "cursor-pointer hover:bg-blue-50"
                )}
              >
                {columns.map((col, colIndex) => (
                  <TableCell key={colIndex} className={col.cellClassName}>
                    {col.render ? col.render(row) : row[col.accessor]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}