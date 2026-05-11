"use client";

import { Provider } from "react-redux";
import { ReactNode, useState } from "react";
import { makeStore } from "@/lib/store";

export function Providers({ children }: { children: ReactNode }) {
  const [store] = useState(() => makeStore());

  return <Provider store={store}>{children}</Provider>;
}
