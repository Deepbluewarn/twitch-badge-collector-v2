// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { ChzzkAdapter } from './chzzk';

const adapter = new ChzzkAdapter();

/** 실제 chzzk wrapper에서 관측된 채팅 아닌 자식들 (라이브 프로브 기준) */
const NON_CHAT = {
    'list_bottom 마커': '<div class="_list_bottom_8lqsk_61"></div>',
    'big_padding 항목': '<div class="_item_8lqsk_7 _big_padding_8lqsk_20"></div>',
    '빈 item': '<div class="_item_8lqsk_7"></div>',
    'popup profile header': '<div class="live_chatting_popup_profile_header__OWnnU"><span class="_text_x">뭔가</span></div>',
    '시스템 안내(문단만)': '<div class="_item_8lqsk_7"><p class="_notice_x">공지</p></div>',
};

afterEach(() => { document.body.innerHTML = ''; });

describe('채팅이 아닌 노드가 새어나가지 않는다', () => {
    for (const [name, html] of Object.entries(NON_CHAT)) {
        it(name, () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'tbc-chzzk-chat-list-wrapper';
            wrapper.innerHTML = html;
            document.body.appendChild(wrapper);
            const node = wrapper.firstElementChild as HTMLElement;
            expect(adapter.extract(node)).toBeUndefined();
        });
    }

    it('도네이션 <p>는 통과해야 한다 (대조군)', () => {
        const wrapper = document.createElement('div');
        wrapper.id = 'tbc-chzzk-chat-list-wrapper';
        wrapper.innerHTML = '<div class="_item_8lqsk_7"><div class="_container_gb6rb_1"><p class="_text_gb6rb_36">치즈 감사</p></div></div>';
        document.body.appendChild(wrapper);
        const info = adapter.extract(wrapper.firstElementChild as HTMLElement);
        expect(info).toBeDefined();
        expect(info!.textContents).toContain('치즈 감사');
    });
});
