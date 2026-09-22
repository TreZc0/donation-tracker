import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Anchor, Button, Header, Stack, Text, TextInput, useTooltip } from '@faulty/gdq-design';

import { useConstants } from '@common/Constants';
import APIErrorList from '@public/APIErrorList';
import { BidChild } from '@public/apiv2/APITypes';
import {
  allEvents,
  useApproveBidMutation,
  useBidTreeQuery,
  useDenyBidMutation,
  useEventAllParam,
  useEventsQuery,
  usePermission,
} from '@public/apiv2/hooks';
import Spinner from '@public/spinner';
import Title from '@public/Title';
import Refresh from '@uikit/icons/Refresh';

import PendingBidRow from '../modules/bids/PendingBidRow';
import SidebarLayout from '../modules/layout/SidebarLayout';
import ConnectionStatus from '../modules/processing/ConnectionStatus';
import { PrimaryNavPopoutButton } from '../modules/settings/PrimaryNavPopout';
import { ThemeButton } from '../modules/theming/Theming';

import styles from './ProcessPendingBids.mod.css';

type BidAction = 'accept' | 'deny';
type RecentAction = { id: number; name: string; action: BidAction };

function PendingBids({ eventId }: { eventId: number | typeof allEvents }) {
  const { ADMIN_ROOT, ROOT_PATH } = useConstants();
  const navigate = useNavigate();
  const { data: events, error: eventError, isLoading: eventsLoading, refetch: refetchEvents } = useEventsQuery();
  const sortedEvents = React.useMemo(
    () => (events ?? []).toSorted((a, b) => b.datetime.toSeconds() - a.datetime.toSeconds()),
    [events],
  );
  const event = events?.find(event => event.id === eventId);
  const eventName = eventId === allEvents ? 'All Events' : (event?.name ?? 'Loading...');
  const {
    currentData: bids,
    error,
    isFetching,
    refetch,
  } = useBidTreeQuery({
    urlParams: { ...(eventId === allEvents ? {} : { eventId }), feed: 'pending' },
    listen: true,
  });
  const canApprove = usePermission('tracker.approve_bid');
  const canChange = usePermission('tracker.change_bid');
  const [approve, approveResult] = useApproveBidMutation();
  const [deny, denyResult] = useDenyBidMutation();
  const [search, setSearch] = React.useState('');
  const [saving, setSaving] = React.useState<number[]>([]);
  const inFlight = React.useRef(new Set<number>());
  const [history, setHistory] = React.useState<RecentAction[]>([]);
  const [refreshTooltip] = useTooltip<HTMLButtonElement>('Refresh pending bids');
  const refresh = React.useCallback(() => {
    approveResult.reset();
    denyResult.reset();
    refetch();
    if (eventError) refetchEvents();
  }, [approveResult, denyResult, refetch, eventError, refetchEvents]);

  const process = React.useCallback(
    async (bid: BidChild, action: BidAction) => {
      if (inFlight.current.has(bid.id)) return;
      inFlight.current.add(bid.id);
      setSaving(ids => [...ids, bid.id]);
      try {
        await (action === 'accept' ? approve(bid.id) : deny(bid.id)).unwrap();
        setHistory(history => [{ id: bid.id, name: bid.name, action }, ...history].slice(0, 20));
      } catch {
        // Mutation errors are displayed above the queue; the API rolls back the bid.
      } finally {
        inFlight.current.delete(bid.id);
        setSaving(ids => ids.filter(id => id !== bid.id));
      }
    },
    [approve, deny],
  );

  const pending = (bids ?? [])
    .map(bid => ({
      ...bid,
      options: (bid.options ?? []).filter(bid => bid.state === 'PENDING' || saving.includes(bid.id)),
    }))
    .filter(bid => bid.options.length > 0);
  const count = pending.reduce((count, bid) => count + bid.options.length, 0);
  const query = search.trim().toLocaleLowerCase();
  const filtered = pending
    .map(bid => ({
      ...bid,
      options: bid.options.filter(option => `${bid.full_name} ${option.name}`.toLocaleLowerCase().includes(query)),
    }))
    .filter(bid => bid.options.length > 0);

  return (
    <SidebarLayout
      subtitle="Bid Processing"
      header={
        <Stack className={styles.sidebarHeader}>
          <Stack direction="horizontal" justify="space-between" align="center" wrap={false}>
            <div className={styles.heading}>
              <Header tag="h1" variant="header-md/normal">
                {eventName}
              </Header>
              <Text variant="text-sm/normal">Bid Processing</Text>
            </div>
            {eventId !== allEvents ? <PrimaryNavPopoutButton /> : <ThemeButton />}
          </Stack>
          <label className={styles.eventLabel}>
            Event
            <select
              className={styles.eventSelect}
              value={eventId === allEvents ? '@all' : eventId}
              onChange={e => navigate(`/v2/${e.target.value}/processing/bids`)}>
              <option value="@all">All Events</option>
              {sortedEvents.map(event => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
          <Anchor href={ROOT_PATH}>Admin Home</Anchor>
        </Stack>
      }
      sidebar={
        <Stack spacing="space-xl">
          <ConnectionStatus socketPath="bid-processing" subject="bids" refetch={refresh} isFetching={isFetching} />
          <TextInput label="Search pending bids" value={search} onChange={setSearch} />
          <Text aria-live="polite">
            {count} pending {count === 1 ? 'option' : 'options'}
          </Text>
          <Stack>
            <Header tag="h2" variant="header-sm/normal">
              Action History
            </Header>
            {history.length === 0 && <Text variant="text-sm/secondary">No actions yet.</Text>}
            {history.map(item => (
              <div key={item.id} className={styles.historyEntry} data-testid={`bid-history-${item.id}`}>
                <Anchor href={`${ADMIN_ROOT}bid/${item.id}/change/`}>{item.name}</Anchor>
                <Text variant="text-sm/secondary">{item.action === 'accept' ? 'Accepted' : 'Denied'}</Text>
              </div>
            ))}
          </Stack>
        </Stack>
      }>
      <Title>{`${eventName} - Process Pending Bids`}</Title>
      <div className={styles.queueHeader}>
        <Header tag="h2" variant="header-md/normal">
          Pending Bids
        </Header>
        <Button {...refreshTooltip} aria-label="Refresh pending bids" onPress={refresh} isDisabled={isFetching}>
          <Refresh />
        </Button>
      </div>
      <APIErrorList errors={[eventError, error, approveResult.error, denyResult.error]} />
      <Spinner spinning={eventsLoading || (bids == null && isFetching)}>
        {bids != null && !error && filtered.length === 0 && (
          <Text className={styles.empty}>{query ? 'No matching pending bids.' : 'No pending bids.'}</Text>
        )}
        {filtered.map(bid => (
          <section key={bid.id} className={styles.group} aria-label={bid.name}>
            <div className={styles.groupHeader}>
              <Header tag="h3" variant="header-sm/normal">
                <Anchor href={`${ADMIN_ROOT}bid/${bid.id}/change/`}>{bid.full_name}</Anchor>
              </Header>
              {bid.description && <Text variant="text-sm/secondary">{bid.description}</Text>}
              {bid.option_max_length != null && (
                <Text variant="text-sm/secondary">Max Option Length: {bid.option_max_length}</Text>
              )}
            </div>
            {bid.options.map(option => (
              <PendingBidRow
                key={option.id}
                bid={option}
                maxLength={bid.option_max_length}
                canProcess={canApprove || canChange}
                isSaving={saving.includes(option.id)}
                onAction={process}
              />
            ))}
          </section>
        ))}
      </Spinner>
    </SidebarLayout>
  );
}

export default function ProcessPendingBids() {
  const eventId = useEventAllParam();
  return <PendingBids key={eventId === allEvents ? '@all' : eventId} eventId={eventId} />;
}
