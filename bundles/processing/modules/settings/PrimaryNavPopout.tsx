import React from 'react';
import cn from 'classnames';
import { Anchor, Button, Card, FormSwitch, Header, Spacer, Stack, Text, usePopout } from '@faulty/gdq-design';

import { useConstants } from '@common/Constants';
import { useEventParam, useMeQuery } from '@public/apiv2/hooks';
import Bars from '@uikit/icons/Bars';

import { ThemeButton } from '@processing/modules/theming/Theming';

import { setUseRelativeTimestamps, useUserPreferencesStore } from './UserPreferencesStore';

import styles from './PrimaryNavPopout.mod.css';

// Public routes are relative to PUBLIC_ROOT; admin routes are relative to ROOT_PATH.
const NavRoutes = {
  HOME: (eventId: string | number) => `event/${eventId}`,
  BIDS: (eventId: string | number) => `bids/${eventId}`,
  DONATIONS: (eventId: string | number) => `donations/${eventId}`,
  DONORS: (eventId: string | number) => `donors/${eventId}`,
  EVENTS: '',
  MILESTONES: (eventId: string | number) => `milestones/${eventId}`,
  PRIZES: (eventId: string | number) => `prizes/${eventId}`,
  RUNS: (eventId: string | number) => `runs/${eventId}`,
  LOGOUT: `user/logout/`,
  SELF_SERVICE: `user/index/`,

  ADMIN_HOME: `/`,
  PROCESS_DONATIONS: (eventId: number) => `v2/${eventId}/processing/donations`,
  PROCESS_BIDS: (eventId: number) => `v2/${eventId}/processing/bids`,
  READ_DONATIONS: (eventId: number) => `v2/${eventId}/processing/read`,
  SCHEDULE_EDITOR: (eventId: number) => `schedule_editor/${eventId}`,
};

function usePath(route: string) {
  const { ROOT_PATH } = useConstants();
  return ROOT_PATH + route;
}

function CurrentUser() {
  const { data: me } = useMeQuery();

  return (
    <div>
      <Text variant="text-xs/normal">Logged in as</Text>
      <Text>
        <strong>{me?.username}</strong>
      </Text>
    </div>
  );
}

function RelativeTimeSwitch() {
  const useRelativeTimestamps = useUserPreferencesStore(state => state.useRelativeTimestamps);

  const handleChange = React.useCallback((isSelected: boolean) => {
    setUseRelativeTimestamps(isSelected);
  }, []);

  return (
    <FormSwitch
      label="Use Relative Timestamps"
      description={
        <>
          {new Date().toDateString()} vs {'"1 hour ago"'}
        </>
      }
      checked={useRelativeTimestamps}
      onChange={handleChange}
    />
  );
}

interface PrimaryNavPopoutProps {
  eventId: number;
}

export function PrimaryNavPopout(props: PrimaryNavPopoutProps) {
  const { eventId } = props;
  const { SWEEPSTAKES_URL, PUBLIC_ROOT } = useConstants();
  const hasPrizes = SWEEPSTAKES_URL !== '';

  return (
    <Card floating className={cn(styles.container, styles.test)}>
      <Stack direction="horizontal" spacing="space-xl" justify="stretch">
        <Stack spacing="space-lg">
          <CurrentUser />
          <Anchor href={PUBLIC_ROOT + NavRoutes.SELF_SERVICE}>Self Service</Anchor>
          <Anchor href={PUBLIC_ROOT + NavRoutes.LOGOUT}>Logout</Anchor>
          <Spacer />
          <Header tag="h2" variant="header-md/normal">
            Settings
          </Header>
          <RelativeTimeSwitch />
          <ThemeButton />
        </Stack>
        <Stack spacing="space-lg">
          <Header tag="h2" variant="header-md/normal">
            Admin
          </Header>
          <Anchor href={usePath(NavRoutes.ADMIN_HOME)}>Admin Home</Anchor>
          <Anchor href={usePath(NavRoutes.PROCESS_DONATIONS(eventId))}>Process Donations</Anchor>
          <Anchor href={usePath(NavRoutes.PROCESS_BIDS(eventId))}>Process Pending Bids</Anchor>
          <Anchor href={usePath(NavRoutes.READ_DONATIONS(eventId))}>Read Donations</Anchor>
          <Anchor href={usePath(NavRoutes.SCHEDULE_EDITOR(eventId))}>Schedule Editor</Anchor>
          <Spacer />
          <Header tag="h2" variant="header-md/normal">
            Public
          </Header>
          <Anchor href={PUBLIC_ROOT + NavRoutes.HOME(eventId)}>Home</Anchor>
          <Anchor href={PUBLIC_ROOT + NavRoutes.RUNS(eventId)}>Runs</Anchor>
          {hasPrizes ? <Anchor href={PUBLIC_ROOT + NavRoutes.PRIZES(eventId)}>Prizes</Anchor> : null}
          <Anchor href={PUBLIC_ROOT + NavRoutes.BIDS(eventId)}>Bids</Anchor>
          <Anchor href={PUBLIC_ROOT + NavRoutes.MILESTONES(eventId)}>Milestones</Anchor>
          <Anchor href={PUBLIC_ROOT + NavRoutes.DONORS(eventId)}>Donors</Anchor>
          <Anchor href={PUBLIC_ROOT + NavRoutes.DONATIONS(eventId)}>Donations</Anchor>
          <Anchor href={PUBLIC_ROOT + NavRoutes.EVENTS}>All Events</Anchor>
        </Stack>
      </Stack>
    </Card>
  );
}

export function PrimaryNavPopoutButton() {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const eventId = useEventParam();
  const [openPopout, isOpen] = usePopout(() => <PrimaryNavPopout eventId={eventId} />, buttonRef, {
    attach: 'right',
    noStyle: true,
  });

  return (
    <Button variant="default/outline" ref={buttonRef} onPress={isOpen ? undefined : openPopout}>
      <Bars />
    </Button>
  );
}
