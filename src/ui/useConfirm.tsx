import React, { useCallback, useState } from 'react';
import { Button, Dialog } from './index';

export interface ConfirmOptions {
    /** 묻는 문장 */
    title: React.ReactNode;
    message?: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
}

/**
 * 브라우저 confirm 대신 쓰는 확인 대화상자. `confirm(...)`은 누른 버튼을 Promise로 돌려준다.
 * 돌려받은 `dialog`를 화면에 그려 둬야 한다.
 */
export function useConfirm(): [(opts: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
    const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);
    const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>(resolve => setState({ opts, resolve })), []);
    const close = (ok: boolean) => {
        state?.resolve(ok);
        setState(null);
    };
    const dialog = (
        <Dialog
            open={!!state}
            onClose={() => close(false)}
            title={state?.opts.title}
            width="xs"
            actions={<>
                <Button onClick={() => close(false)}>{state?.opts.cancelLabel}</Button>
                <Button variant="primary" autoFocus onClick={() => close(true)}>{state?.opts.confirmLabel}</Button>
            </>}
        >
            {state?.opts.message ?? null}
        </Dialog>
    );
    return [confirm, dialog];
}
