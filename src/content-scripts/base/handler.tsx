import { SettingInterface } from "@/interfaces/setting";

/**
 * Container Class에서 내부적으로 생성하는 클래스
 */
export class Handle {
    handleContainer: HTMLDivElement;
    handle: HTMLDivElement;

    type: SettingInterface['platform'];
    tbcContainer: HTMLElement | null;
    position: SettingInterface['position'] = 'up';
    ratio: number = 0;

    chatRoomSelector: string;

    // 바인딩된 메소드 참조를 저장할 변수
    boundStartDrag: (e: MouseEvent | TouchEvent) => void;
    boundDoDrag: (e: MouseEvent | TouchEvent) => void;
    boundEndDrag: (e: MouseEvent | TouchEvent) => void;

    constructor(type: SettingInterface['platform'], chatRoomSelector: string) {
        this.type = type;
        this.tbcContainer = document.getElementById(`${type}-container`);
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
        let rectHeigth = 0;

        if (chatListContainer) {
            const rect = chatListContainer.getBoundingClientRect();

            if (this.type === 'chzzk') {
                rectHeigth = rect.height - 77 - 62;

                this.ratio = (1 - (clientY - rect.y - 77) / (rectHeigth)) * 100;
                this.ratio = Math.max(0, Math.min(100, Math.round(this.ratio)));
            } else if (this.type === 'twitch') {
                this.ratio = (1 - (clientY - rect.y) / rect.height) * 100;
                this.ratio = Math.max(0, Math.min(100, Math.round(this.ratio)));
            }
            
            Handle.updateContainerRatio(this.type, this.ratio, this.position);
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

    static updateContainerRatio(
        type: SettingInterface['platform'],
        ratio: number,
        position: SettingInterface["position"],
    ) {
        if (ratio != 0) ratio = ratio ? ratio : 30;

        let orig_size = ratio === 0 ? 1 : ratio === 10 ? 0 : 1;
        let clone_size = ratio === 0 ? 0 : ratio === 10 ? 1 : 0;

        if (1 <= ratio && ratio <= 100) {
            clone_size = parseFloat((ratio * 0.01).toFixed(2));
            orig_size = parseFloat((1 - clone_size).toFixed(2));
        }

        if (position === "up") {
            [orig_size, clone_size] = [clone_size, orig_size];
        }

        const orig = document.getElementById(`tbc-${type}-chat-list-wrapper`);
        const clone = document.getElementById(`${type}-container`);

        if (!orig || !clone) return;

        orig.style.height = `${orig_size * 100}%`;
        clone.style.height = `${clone_size * 100}%`;
    }
}
