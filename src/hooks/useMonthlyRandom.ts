import { useState, useEffect } from 'react';

function getRandomDayOfMonth(baseDate?: Date): Date {
    const today = baseDate ?? new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const remainingDays = daysInMonth - today.getDate();
    const randomDay = Math.floor(Math.random() * remainingDays) + today.getDate() + 1;
    return new Date(today.getFullYear(), today.getMonth(), randomDay);
}

async function getStoredDate(): Promise<number> {
    const res = (await browser.storage.local.get('randomMonthlyDate')).randomMonthlyDate;
    return Number(res ?? 0);
}

async function setStoredDate(date: number) {
    await browser.storage.local.set({ randomMonthlyDate: date })
}

async function getFlag() {
    return (await browser.storage.local.get('hasExecutedThisMonth')).hasExecutedThisMonth;
}

async function setFlag(flag: boolean) {
    await browser.storage.local.set({ hasExecutedThisMonth : flag })
}

export function useMonthlyRandom() {
    const [isDday, setIsDday] = useState(false);

    useEffect(() => {
        async function asyncFn() {
            const today = new Date();
            const storedDate = await getStoredDate();
            const flag = await getFlag();

            if (typeof flag === 'undefined') {
                setStoredDate(getRandomDayOfMonth().getTime());
                setFlag(false);
                return;
            }
    
            if (storedDate === 0 && flag) {
                const nextMonth = new Date();
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                nextMonth.setDate(1);

                setStoredDate(getRandomDayOfMonth(nextMonth).getTime());
                setFlag(false);
            } else {
                const storedDateObj = new Date(storedDate);
                if (today.getTime() >= storedDateObj.getTime() && !flag) {
                    setIsDday(true);
                    setFlag(true);
                    setStoredDate(0);
                }
            }
        }
        asyncFn();
    }, []);

    return { isDday, setIsDday };
}
