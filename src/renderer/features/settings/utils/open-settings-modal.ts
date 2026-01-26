import { openContextModal } from '@mantine/modals';

export const openSettingsModal = () => {
    openContextModal({
        innerProps: {},
        modalKey: 'settings',
        overlayProps: {
            opacity: 1,
        },
        size: '60rem',
        styles: {
            content: {
                maxWidth: '90%',
                width: '100%',
            },
        },
        transitionProps: {
            transition: 'pop',
        },
    });
};
