"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 } } }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={qc}>
        {children}
        {/* bottom margin clears the mobile tab bar, see --toast-bottom in globals.css */}
        <Toaster position="bottom-center" offset={{ bottom: "var(--toast-bottom)" }} mobileOffset={{ bottom: "var(--toast-bottom)" }} duration={2000} richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
