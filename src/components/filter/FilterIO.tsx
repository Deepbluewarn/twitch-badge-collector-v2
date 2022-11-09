import React from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useAlertContext } from "../../context/Alert";
import { useArrayFilterContext } from "../../context/ArrayFilter";
import { 
    ArrayFilterInterface, 
    ArrayFilterListInterface, 
    ArrayFilterCategoryArr, 
    CategoryArr, 
    FilterJsonInterface, 
    TypeArr 
} from "../../interfaces/filter";
import { getErrorMessage } from "../../utils";
import { CustomToolbarItemStyle } from "../../style/toolbar";

export function ImportFilter() {
    const { addAlert } = useAlertContext();
    const { setArrayFilter, addArrayFilter } = useArrayFilterContext();
    const { t } = useTranslation();

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const fileReader = new FileReader();

        if (!event.target.files) return;

        fileReader.readAsText(event.target.files[0], "UTF-8");

        fileReader.onloadend = (e: ProgressEvent<FileReader>) => {
            if (!e.target) return;

            const filterRes: ArrayFilterListInterface[] = [];

            try {
                const filterJson: FilterJsonInterface[] | ArrayFilterListInterface[] = JSON.parse(e.target.result as string);

                // v1 버전의 필터 호환.
                const is_v1 = (filterJson as FilterJsonInterface[]).some(f => f.version);

                for (let filter of filterJson) {
                    const newArrayFilter = {} as ArrayFilterListInterface;

                    if(is_v1){
                        const v1_filter = filter as FilterJsonInterface;
                        const category = v1_filter.category;
                        let newCategory = '';

                        if (v1_filter.version || v1_filter.date) {
                            continue;
                        }
                        if (!CategoryArr.includes(category)) {
                            throw new Error('백업 파일에 카테고리 항목이 존재하지 않습니다.');
                        }
                        if (!TypeArr.includes(v1_filter.filter_type)) {
                            throw new Error('백업 파일에 필터 유형 항목이 존재하지 않습니다.');
                        }
                        if (!v1_filter.filter_id || !v1_filter.note || !v1_filter.value) {
                            throw new Error('백업 파일에 일부 항목이 누락되었습니다.');
                        }

                        if(category === 'badge_uuid'){
                            newCategory = 'badge';
                        }else if(category === 'login_name'){
                            newCategory = 'name';
                        }

                        newArrayFilter.filterType = v1_filter.filter_type;
                        newArrayFilter.id = nanoid();

                        newArrayFilter.filters = [{
                            category: newCategory,
                            id: v1_filter.filter_id,
                            type: 'include',
                            value: v1_filter.value,
                            badgeName: v1_filter.note
                        }] as ArrayFilterInterface[];
                    }else{
                        const v2_filter = filter as ArrayFilterListInterface;

                        if (!TypeArr.includes(v2_filter.filterType)) {
                            throw new Error(`필터 유형이 유효하지 않습니다. 필터 유형 : ${v2_filter.filterType}`);
                        }
                        if (!v2_filter.id) {
                            throw new Error(`필터 ID 값이 누락되었습니다.`);
                        }
    
                        newArrayFilter.filterType = v2_filter.filterType;
                        newArrayFilter.id = v2_filter.id;
    
                        const filters = [] as ArrayFilterInterface[];
    
                        for (let f of v2_filter.filters) {
                            if (!ArrayFilterCategoryArr.includes(f.category)) {
                                throw new Error(`필터 카테고리 항목이 유효하지 않습니다. 필터 카테고리 : ${f.category}`);
                            }
                            if (!TypeArr.includes(f.type)) {
                                throw new Error(`필터 유형 항목이 유효하지 않습니다. 필터 유형 : ${f.type}`);
                            }
                            if (!f.id || !f.value) {
                                throw new Error(`필터에 ID 값 또는 필터 내용이 누락되었습니다.`);
                            }
                            filters.push({
                                category: f.category,
                                id: f.id,
                                type: f.type,
                                value: f.value,
                                badgeName: f.badgeName
                            });
                        }
                        newArrayFilter.filters = filters;
                    }
                    filterRes.push(newArrayFilter);
                }

                setArrayFilter([]);
                addArrayFilter([...filterRes]);
            } catch (e) {
                addAlert({
                    message: getErrorMessage(e),
                    serverity: 'error'
                });
            }
        };
    }
    return (
        <>
            <label htmlFor='upload-filter'>
                <CustomToolbarItemStyle direction='row'>
                    <span className="material-icons-round">file_upload</span>
                    <span>{t('common.filter_import')}</span>
                </CustomToolbarItemStyle>
            </label>
            <input type='file' accept='.tbc' className='hidden' id='upload-filter' onChange={handleChange}></input>
        </>
    )
}

export function ExportFilter() {
    const { arrayFilter } = useArrayFilterContext();
    const { t } = useTranslation();

    const today = new Date();
    const year = today.getFullYear();
    const month = ('0' + (today.getMonth() + 1)).slice(-2);
    const day = ('0' + today.getDate()).slice(-2);
    const dateString = year + '-' + month + '-' + day;

    const clickHandler = () => {
        downloadFile(JSON.stringify(arrayFilter), `${dateString}_filter_backup.tbc`, 'text/json');
    }

    return (
        <CustomToolbarItemStyle direction='row' onClick={clickHandler}>
            <span className="material-icons-round">file_download</span>
            <span>{t('common.filter_export')}</span>
        </CustomToolbarItemStyle>
    );
}

const downloadFile = (data: string, fileName: string, fileType: string) => {
    const blob = new Blob([data], { type: fileType });
    const a = document.createElement('a');

    a.download = fileName;
    a.href = window.URL.createObjectURL(blob);

    const clickEvt = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
    });

    a.dispatchEvent(clickEvt);
    a.remove();
}