import React from 'react';
import { ArrayFilterInterface } from '@/interfaces/filter';
import { useGlobalSettingContext } from '../../context/GlobalSetting';
import { Paper, Typography, Box } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface SubFilterProps {
	filter?: ArrayFilterInterface;
}

const SubFilter: React.FC<SubFilterProps> = ({ filter }) => {
	const { globalSetting } = useGlobalSettingContext();
    const { t } = useTranslation();
	if (!filter) return null;

	// 배지 필터 UI
	if (filter.category === 'badge') {
		return (
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
				<Paper variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '74px' }}>
					{filter.value ? (
						globalSetting.platform === 'twitch' ? (
							<img
								style={{ width: '24px', height: '24px' }}
								src={`https://static-cdn.jtvnw.net/badges/v1/${filter.value}/1`}
								srcSet={`https://static-cdn.jtvnw.net/badges/v1/${filter.value}/1 1x, https://static-cdn.jtvnw.net/badges/v1/${filter.value}/2 2x, https://static-cdn.jtvnw.net/badges/v1/${filter.value}/3 4x`}
								alt={filter.badgeName || 'badge'}
							/>
						) : (
							<img
								style={{ width: '24px', height: '24px' }}
								src={filter.value}
								alt={filter.badgeName || 'badge'}
							/>
						)
					) : (
						<Typography>배지 없음</Typography>
					)}
				</Paper>
				<Box>
					<Typography variant="caption" color="text.secondary">배지 이름</Typography>
					<Typography variant="body2">{filter.badgeName || '이름 없음'}</Typography>
				</Box>
				<Box>
					<Typography variant="caption" color="text.secondary">조건</Typography>
					<Typography variant="body2">{t(`filter.category.${filter.type}`)}</Typography>
				</Box>
			</Box>
		);
	}

	// 닉네임/키워드 필터 UI
	if (filter.category === 'name' || filter.category === 'keyword') {
		return (
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
				<Box>
					<Typography variant="caption" color="text.secondary">
						{filter.category === 'name' ? '닉네임' : '키워드'}
					</Typography>
					<Typography variant="body2">{filter.value || '값 없음'}</Typography>
				</Box>
				<Box>
					<Typography variant="caption" color="text.secondary">조건</Typography>
					<Typography variant="body2">{t(`filter.category.${filter.type}`)}</Typography>
				</Box>
			</Box>
		);
	}

	// 기타 필터는 무시
	return null;
};

export default SubFilter;
