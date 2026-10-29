// Order statuses, main doc 5.1. Order matters: stepper and Kanban columns follow it.
export const STATUSES = [
  { key: "negotiation", label: "Negotiation", bar: "bg-amber-500", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { key: "confirmed", label: "Confirmed", bar: "bg-blue-500", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { key: "printer_assigned", label: "Printer assigned", bar: "bg-indigo-500", cls: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  { key: "printing", label: "Printing", bar: "bg-purple-500", cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { key: "print_error", label: "Print error", bar: "bg-red-500", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  { key: "packing", label: "Packing", bar: "bg-orange-500", cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  { key: "delivery", label: "Delivery", bar: "bg-teal-500", cls: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  { key: "done", label: "Done", bar: "bg-green-500", cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
  { key: "cancelled", label: "Cancelled", bar: "bg-zinc-500", cls: "bg-zinc-500/15 text-zinc-500" },
  { key: "closed", label: "Closed", bar: "bg-zinc-700", cls: "bg-zinc-700/20 text-zinc-600 dark:text-zinc-400" },
] as const;

export type StatusKey = (typeof STATUSES)[number]["key"];
export const STATUS_KEYS = STATUSES.map((s) => s.key) as [StatusKey, ...StatusKey[]];
export const STEPPER: StatusKey[] = ["negotiation", "confirmed", "printer_assigned", "printing", "packing", "delivery", "done"];
// "In progress" on the dashboard: statuses 2 to 7 (main doc 5.12)
export const IN_PROGRESS: StatusKey[] = ["confirmed", "printer_assigned", "printing", "print_error", "packing", "delivery"];
// Statuses at or after Printing consume material (main doc 5.2)
export const CONSUMING: StatusKey[] = ["printing", "packing", "delivery", "done", "closed"];

export const statusOf = (key: string) => STATUSES.find((s) => s.key === key) ?? STATUSES[0];
