import { useTranslation } from "react-i18next";
import { useFilterGroupContext } from "@/context/FilterGroup";
import { 
    CompositeFilterElement, 
} from "@/interfaces/filter";
import { useGlobalSettingContext } from "@/context/GlobalSetting";
import { useCallback, useRef } from "react";
import { useAlertContext } from "@/context/Alert";
import { Button, LabelButton } from "@/ui";

export function ImportFilter({ size }: { size?: 'sm' | 'md' } = {}) {
    const {globalSetting} = useGlobalSettingContext();
    const { filterGroup, setFilterGroup, addCompositeFilters } = useFilterGroupContext();
    const { t } = useTranslation();
    const { addAlert } = useAlertContext();
    const inputRef = useRef<HTMLInputElement>(null);

    /**
     * 
     */
    const modifyFilterListByPlatform = useCallback((filters: CompositeFilterElement[]) => {
        const platformFilter = filters.filter((filter) => filter.platform === globalSetting.platform);
        const preservedFilter = filterGroup.filter((filter) => filter.platform !== globalSetting.platform);

        if(platformFilter.length === 0) {
            addAlert({
                serverity: 'info',
                message: t('alert.no_platform_filters'),
            })
            return;
        }

        setFilterGroup([]);
        addCompositeFilters([...preservedFilter, ...platformFilter]);
    }, [filterGroup, globalSetting.platform])

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
            <LabelButton htmlFor="upload-filter" icon="file_upload" size={size}>
                {t('common.filter_import')}
            </LabelButton>
            <input ref={inputRef} type='file' accept='.tbc' className='hidden' id='upload-filter' onChange={handleChange}></input>
        </>
    )
}

export function ExportFilter({ size }: { size?: 'sm' | 'md' } = {}) {
    const { globalSetting } = useGlobalSettingContext();
    const { filterGroup } = useFilterGroupContext();
    const { t } = useTranslation();

    const today = new Date();
    const year = today.getFullYear();
    const month = ('0' + (today.getMonth() + 1)).slice(-2);
    const day = ('0' + today.getDate()).slice(-2);
    const dateString = year + '-' + month + '-' + day;

    const clickHandler = useCallback(() => {
        const platform = globalSetting.platform;
        const platformFilter = filterGroup.filter((filter) => filter.platform === platform);
        downloadFile(JSON.stringify(platformFilter), `${dateString}_${platform}_filter_backup.tbc`, 'text/json');
    }, [filterGroup, globalSetting.platform])

    return (
        <Button icon="file_download" size={size} onClick={clickHandler}>
            {t('common.filter_export')}
        </Button>
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