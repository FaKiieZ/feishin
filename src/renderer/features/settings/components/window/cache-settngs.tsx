import { closeAllModals, openModal } from '@mantine/modals';
import { useQueryClient } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import { Button } from '/@/shared/components/button/button';
import { ConfirmModal } from '/@/shared/components/modal/modal';
import { toast } from '/@/shared/components/toast/toast';

const browser = isElectron() ? window.api.browser : null;

export const CacheSettings = memo(() => {
    const [isClearing, setIsClearing] = useState(false);
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    const clearCache = useCallback(
        async (full: boolean) => {
            setIsClearing(true);

            try {
                queryClient.clear();

                if (full && browser) {
                    await browser.clearCache();
                }

                toast.success({
                    message: t('setting.clearCacheSuccess', { postProcess: 'sentenceCase' }),
                });
            } catch (error) {
                console.error(error);
                toast.error({ message: (error as Error).message });
            }

            setIsClearing(false);
            closeAllModals();
        },
        [queryClient, t],
    );

    const clearBrowserData = useCallback(async () => {
        setIsClearing(true);

        try {
            queryClient.clear();

            if (browser) {
                await browser.clearBrowserData();
            }

            toast.success({
                message:
                    'Browser data cleared successfully. This should resolve Google login issues.',
            });
        } catch (error) {
            console.error(error);
            toast.error({ message: (error as Error).message });
        }

        setIsClearing(false);
        closeAllModals();
    }, [queryClient, browser]);

    const openResetConfirmModal = (type: 'browserData' | 'cache' | 'query') => {
        let onConfirm: () => void;
        let title: string;
        let message: string;

        switch (type) {
            case 'browserData':
                onConfirm = clearBrowserData;
                title = 'Clear All Browser Data';
                message =
                    'This will clear all browser data including cookies, local storage, and authentication data. This should resolve Google login issues. Are you sure?';
                break;
            case 'cache':
                onConfirm = () => clearCache(true);
                title = t('setting.clearCache', { postProcess: 'sentenceCase' });
                message = t('common.areYouSure', { postProcess: 'sentenceCase' });
                break;
            case 'query':
                onConfirm = () => clearCache(false);
                title = t('setting.clearQueryCache', { postProcess: 'sentenceCase' });
                message = t('common.areYouSure', { postProcess: 'sentenceCase' });
                break;
        }

        openModal({
            children: <ConfirmModal onConfirm={onConfirm}>{message}</ConfirmModal>,
            title,
        });
    };

    const options: SettingOption[] = [
        {
            control: (
                <Button
                    disabled={isClearing}
                    onClick={() => openResetConfirmModal('query')}
                    size="compact-md"
                    variant="filled"
                >
                    {t('common.clear', { postProcess: 'sentenceCase' })}
                </Button>
            ),
            description: t('setting.clearQueryCache', {
                context: 'description',
                postProcess: 'sentenceCase',
            }),
            title: t('setting.clearQueryCache', { postProcess: 'sentenceCase' }),
        },
        {
            control: (
                <Button
                    disabled={isClearing}
                    onClick={() => openResetConfirmModal('cache')}
                    size="compact-md"
                    variant="filled"
                >
                    {t('common.clear', { postProcess: 'sentenceCase' })}
                </Button>
            ),
            description: t('setting.clearCache', {
                context: 'description',
                postProcess: 'sentenceCase',
            }),
            isHidden: !browser,
            title: t('setting.clearCache', { postProcess: 'sentenceCase' }),
        },
        {
            control: (
                <Button
                    color="red"
                    disabled={isClearing}
                    onClick={() => openResetConfirmModal('browserData')}
                    size="compact-md"
                    variant="filled"
                >
                    {t('common.clear', { postProcess: 'sentenceCase' })}
                </Button>
            ),
            description:
                'Clear all browser data including cookies, local storage, session storage, and authentication data. Use this to resolve Google login issues.',
            isHidden: !browser,
            title: 'Clear All Browser Data',
        },
    ];

    const handleOpenApplicationDirectory = async () => {
        if (isElectron() && window.api?.utils) {
            await window.api.utils.openApplicationDirectory();
        }
    };

    return (
        <>
            <SettingsSection
                options={options}
                title={t('page.setting.cache', { postProcess: 'sentenceCase' })}
            />
            {isElectron() && (
                <Button onClick={handleOpenApplicationDirectory} variant="default">
                    {t('action.openApplicationDirectory', {
                        postProcess: 'sentenceCase',
                    })}
                </Button>
            )}
        </>
    );
});
