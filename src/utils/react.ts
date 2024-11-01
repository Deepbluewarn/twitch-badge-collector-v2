export const getReactFiber = (node: Node) => {
    if (node == null) {
        return;
    }
    return Object.entries(node).find(([k]) =>
        k.startsWith("__reactFiber$")
    )?.[1];
};

export const getReactProps = (node: Node) => {
    if (node == null) {
        return;
    }
    return Object.entries(node).find(([k]) =>
        k.startsWith("__reactProps$")
    )?.[1];
};

export const findReactState = async (node: Node, criteria: (value: any) => {}, raw = false, tries = 0): Promise<any> => {
    if (node == null) {
        return;
    }
    let fiber = getReactFiber(node);
    if (fiber == null) {
        2
        if (tries > 500) {
            return;
        }
        return new Promise((r) => setTimeout(r, 50)).then(() =>
            findReactState(node, criteria, raw, tries + 1)
        );
    }
    fiber = fiber.return;
    while (fiber != null) {
        let state = fiber.memoizedState;
        while (state != null) {
            let value: any = state.memoizedState;
            if (state.queue?.pending?.hasEagerState) {
                value = state.queue.pending.eagerState;
            } else if (state.baseQueue?.hasEagerState) {
                value = state.baseQueue.eagerState;
            }
            if (value != null && criteria(value)) {
                return raw ? state : value;
            }
            state = state.next;
        }
        fiber = fiber.return;
    }
};

export const findReactContext = async (node: Node, criteria: (value: any) => {}, tries = 0): Promise<any> => {
    if (node == null) {
        return;
    }
    let fiber = getReactFiber(node);
    if (fiber == null) {
        if (tries > 500) {
            return;
        }
        return new Promise((r) => setTimeout(r, 50)).then(() =>
            findReactContext(node, criteria, tries + 1)
        );
    }
    fiber = fiber.return;
    while (fiber != null) {
        let context = fiber.dependencies?.firstContext;
        while (context != null) {
            if (context.memoizedValue != null && criteria(context.memoizedValue)) {
                return context.memoizedValue;
            }
            context = context.next;
        }
        fiber = fiber.return;
    }
};
