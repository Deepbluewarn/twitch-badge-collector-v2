import { SettingInterface } from "@/interfaces/setting";
import { PlatformAdapter } from "@/platform";
import { applyRatio } from "./layout";

/**
 * Container Class에서 내부적으로 생성하는 클래스
 */
export class Handle {
    handleContainer: HTMLDivElement;
    handle: HTMLDivElement;

    adapter: PlatformAdapter;
    type: SettingInterface['platform'];
    tbcContainer: HTMLElement | null;
    position: SettingInterface['position'] = 'up';
    ratio: number = 0;

    chatRoomSelector: string;

    // 바인딩된 메소드 참조를 저장할 변수
    boundStartDrag: (e: MouseEvent | TouchEvent) => void;
    boundDoDrag: (e: MouseEvent | TouchEvent) => void;
    boundEndDrag: (e: MouseEvent | TouchEvent) => void;

    constructor(adapter: PlatformAdapter, chatRoomSelector: string) {
        this.adapter = adapter;
        this.type = adapter.type;
        this.tbcContainer = document.getElementById(`${this.type}-container`);
        this.chatRoomSelector = chatRoomSelector;

        this.handleContainer = document.createElement('div');
        this.handle = document.createElement('div');
        this.handleContainer.id = "handle-container";
        this.handle.id = "tbc-resize-handle";

        // 메소드 바인딩
        this.boundStartDrag = this.startDrag.bind(this);
        this.boundDoDrag = this.doDrag.bind(this);
        this.boundEndDrag = this.endDrag.bind(this);

        // 이벤트 리스너 추가
        this.handleContainer.addEventListener("mousedown", this.boundStartDrag);
        this.handleContainer.addEventListener("touchstart", this.boundStartDrag);
        this.handleContainer.appendChild(this.handle);
    }

    getHandle() {
        return this.handleContainer;
    }

    startDrag(e: MouseEvent | TouchEvent) {
        e.preventDefault();

        this.tbcContainer = document.getElementById(`${this.type}-container`);

        if (!this.tbcContainer) return;

        this.tbcContainer.classList.add("freeze");

        this.position = Handle.getPosition(this.type);

        window.addEventListener("mousemove", this.boundDoDrag);
        window.addEventListener("touchmove", this.boundDoDrag);
        window.addEventListener("mouseup", this.boundEndDrag);
        window.addEventListener("touchend", this.boundEndDrag);
    };

    doDrag(e: MouseEvent | TouchEvent) {
        const chatListContainer = document.querySelector(this.chatRoomSelector);

        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

        if (chatListContainer) {
            const rect = chatListContainer.getBoundingClientRect();
            this.ratio = this.adapter.computeDragRatio(rect, clientY);
            applyRatio(this.type, this.ratio, this.position);
        }
    };

    endDrag() {
        this.tbcContainer!.classList.remove("freeze");

        browser.storage.local.set({ containerRatio: this.ratio });
        window.removeEventListener("mousemove", this.boundDoDrag);
        window.removeEventListener("touchmove", this.boundDoDrag );
        window.removeEventListener("mouseup", this.boundEndDrag );
        window.removeEventListener("touchend", this.boundEndDrag );
    };

    static getPosition(type: SettingInterface['platform']) {
        const container = document.getElementById(`${type}-container`);

        if(!container) return 'up';

        return container.style.order === "1" ? "up" : "down";
    }

}
