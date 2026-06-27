import { findElement, selectElement } from "@/utils/utils-common";

export class Observer {
    private observer: MutationObserver | null;
    private selector: string;
    private temporal: boolean;

    constructor(selector: string, temporal: boolean = true) {
        this.observer = null;
        this.selector = selector;
        this.temporal = temporal;
    }

    observe(callback: (elem: Element | null, mr?: MutationRecord[]) => void) {
        if (!this.observer) {
            this.observer = new MutationObserver((mr) => {
                callback(selectElement(this.selector), mr);
                if (this.temporal) {
                    this.observer?.disconnect();
                }
            });
        }

        findElement(this.selector, (elem) => {
            if (!elem) return;
            if (!this.observer) return;

            // selector 매칭 발생 시점에 즉시 1회 callback 호출 — DOM 준비 신호.
            // 호출자가 dup check로 idempotent하게 처리한다는 전제.
            callback(elem, undefined);

            // 이후 mutation도 감시 — chzzk reconcile 등 후속 변경 대응.
            // temporal=true면 첫 mutation에 disconnect, false면 계속.
            this.observer.observe(elem, {
                childList: true,
                subtree: true,
            });
        })
    }
}