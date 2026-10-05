import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Host, RNHostView } from '@expo/ui';
import { Button, Divider, Popover, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, frame, onDisappear, padding, tint } from '@expo/ui/swift-ui/modifiers';
import { haptics } from '../motion';
import { HIT, sys } from '../theme';
import { MapActionTrigger } from './MapActionTrigger';
import type { MapActionsMenuProps } from './MapActionControls';

/** Native popover: bottom arrow attaches above the trigger, including compact iPhone layouts. */
export function MapActionsMenu({ onFindPause, onToggleTourPause, tourPaused }: MapActionsMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pendingAction = useRef<(() => void) | undefined>(undefined);
  useEffect(
    () => () => {
      pendingAction.current = undefined;
    },
    [],
  );
  const select = (action: () => void) => {
    if (pendingAction.current) return;
    pendingAction.current = action;
    setOpen(false);
  };
  // Popover has no onDismiss, and its state callback skips prop-driven dismissals.
  // Wait for native content disappearance before opening another native presentation.
  const completeSelection = () => {
    const action = pendingAction.current;
    pendingAction.current = undefined;
    action?.();
  };
  const itemModifiers = [
    buttonStyle('plain'),
    tint(sys.label),
    frame({ minHeight: 44, alignment: 'leading' }),
  ];
  return (
    <Host style={{ width: HIT, height: HIT }}>
      <Popover isPresented={open} onIsPresentedChange={setOpen} attachmentAnchor="top" arrowEdge="bottom">
        <Popover.Trigger>
          <RNHostView matchContents>
            <MapActionTrigger
              open={open}
              onPress={() => {
                haptics.select();
                setOpen((current) => !current);
              }}
            />
          </RNHostView>
        </Popover.Trigger>
        <Popover.Content>
          <VStack
            alignment="leading"
            spacing={4}
            modifiers={[padding({ horizontal: 16, vertical: 8 }), onDisappear(completeSelection)]}
          >
            <Button
              label={t('mapActions.findPause')}
              systemImage="cup.and.saucer"
              modifiers={itemModifiers}
              onPress={() => select(onFindPause)}
            />
            {onToggleTourPause ? (
              <>
                <Divider />
                <Button
                  label={t(tourPaused ? 'mapActions.resumeTour' : 'mapActions.pauseTour')}
                  systemImage={tourPaused ? 'play.fill' : 'pause.fill'}
                  modifiers={itemModifiers}
                  onPress={() => select(onToggleTourPause)}
                />
              </>
            ) : null}
          </VStack>
        </Popover.Content>
      </Popover>
    </Host>
  );
}
