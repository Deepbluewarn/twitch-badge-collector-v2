import { Observer } from "../base/observer"
import { ChatInfo } from "@interfaces/chat";

const getReactFiber = (node: Node) => {
    if (node == null) {
        return;
    }
    return Object.entries(node).find(([k]) =>
        k.startsWith("__reactFiber$")
    )?.[1];
};

const getReactProps = (node: Node) => {
    if (node == null) {
        return;
    }
    return Object.entries(node).find(([k]) =>
        k.startsWith("__reactProps$")
    )?.[1];
};

const findReactState = async (node: Node, criteria: (value: any) => {}, raw = false, tries = 0): Promise<any> => {
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

const findReactContext = async (node: Node, criteria: (value: any) => {}, tries = 0): Promise<any> => {
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

const liveObserver = new Observer('.live_chatting_list_wrapper__a5XTV', false);
const vodObserver = new Observer('.vod_chatting_list__+LZHw', false)

const callback = (elem: Element | null, mr?: MutationRecord[]) => {
    console.log(mr);

    if (!mr) return;

    const records = Array.from(mr);

    records.forEach(mr => {
        const addedNodes = mr.addedNodes;
        if (!addedNodes) return;

        addedNodes.forEach((node) => {
            const _props = getReactProps(node);

            console.log('inject chat props: ', _props)
            const chatMessage = _props?.children?.props?.chatMessage;
            const props = _props?.children?.props;

            const time = props?.isReplayChat ? chatMessage?.playerMessageTime : chatMessage?.time;
            const verified = chatMessage?.profile?.verifiedMark;
            const badges = chatMessage?.displayBadgeList;
            const content = chatMessage?.content;

            (node as Element).setAttribute('data-tbc-chat-key', chatMessage?.key);
            (node as Element).setAttribute('data-tbc-chat-time', time);
            (node as Element).setAttribute('data-tbc-chat-verified', verified);
            (node as Element).setAttribute('data-tbc-chat-badges', JSON.stringify(badges.map((e: any) => e.imageSource)));

            const chatInfo: ChatInfo = {
                badges: [],
                textContents: [''],
                loginName: '',
                nickName: '',
            }
        })
    })
}
liveObserver.observe(callback);
vodObserver.observe(callback);
