import { useTranslation } from "react-i18next";
import { useArrayFilterContext } from "../../context/ArrayFilter";
import { 
    ArrayFilterListInterface, 
} from "../../interfaces/filter";
import { CustomToolbarItemStyle } from "../datagrid/toolbar";
import { useGlobalSettingContext } from "../../context/GlobalSetting";
import { useCallback, useRef } from "react";
import { useAlertContext } from "../../context/Alert";

export function ImportFilter() {
    const {globalSetting} = useGlobalSettingContext();
    const { arrayFilter, setArrayFilter, addArrayFilter } = useArrayFilterContext();
    const { t } = useTranslation();
    const { addAlert } = useAlertContext();
    const inputRef = useRef<HTMLInputElement>(null);

    /**
     * 
     */
    const modifyFilterListByPlatform = useCallback((filters: ArrayFilterListInterface[]) => {
        const platformFilter = filters.filter((filter) => filter.platform === globalSetting.platform);
        const preservedFilter = arrayFilter.filter((filter) => filter.platform !== globalSetting.platform);

        if(platformFilter.length === 0) {
            addAlert({
                serverity: 'info',
                message: '추가 가능한 플랫폼 필터가 없습니다.',
            })
            return;
        }

        setArrayFilter([]);
        addArrayFilter([...preservedFilter, ...platformFilter]);
    }, [arrayFilter, globalSetting.platform])

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const fileReader = new FileReader();

        if (!event.target.files) return;

        fileReader.readAsText(event.target.files[0], "UTF-8");

        fileReader.onloadend = (e: ProgressEvent<FileReader>) => {
            if (!e.target) return;

            modifyFilterListByPlatform(JSON.parse(e.target.result as string));

            if(inputRef.current) inputRef.current.value = '';
        };
    };
    
    return (
        <>
            <label htmlFor='upload-filter'>
                <CustomToolbarItemStyle direction='row'>
                    <span className="material-icons-round">file_upload</span>
                    <span>{t('common.filter_import')}</span>
                </CustomToolbarItemStyle>
            </label>
            <input ref={inputRef} type='file' accept='.tbc' className='hidden' id='upload-filter' onChange={handleChange}></input>
        </>
    )
}

export function ExportFilter() {
    const { globalSetting } = useGlobalSettingContext();
    const { arrayFilter } = useArrayFilterContext();
    const { t } = useTranslation();

    const today = new Date();
    const year = today.getFullYear();
    const month = ('0' + (today.getMonth() + 1)).slice(-2);
    const day = ('0' + today.getDate()).slice(-2);
    const dateString = year + '-' + month + '-' + day;

    const clickHandler = useCallback(() => {
        const platform = globalSetting.platform;
        const platformFilter = arrayFilter.filter((filter) => filter.platform === platform);
        downloadFile(JSON.stringify(platformFilter), `${dateString}_${platform}_filter_backup.tbc`, 'text/json');
    }, [arrayFilter, globalSetting.platform])

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