import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "../admin/ui";

interface AskOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  dangerous?: boolean;
}

/** تأیید قبل از عملیات حساس: `if (!(await ask({...}))) return;` */
export function useConfirm(): { ask: (o: AskOptions) => Promise<boolean>; dialog: ReactNode } {
  const [state, setState] = useState<AskOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback(
    (options: AskOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setState(options);
      }),
    []
  );
  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  };

  const dialog = (
    <ConfirmDialog
      open={Boolean(state)}
      title={state?.title ?? ""}
      description={state?.description ?? ""}
      confirmLabel={state?.confirmLabel ?? "تأیید و ادامه"}
      dangerous={state?.dangerous}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  );
  return { ask, dialog };
}
