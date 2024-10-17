import { findElement, selectElement } from "@utils/utils-common";

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

            this.observer.observe(elem, {
                childList: true,
                subtree: true,
            });
        })
    }
}