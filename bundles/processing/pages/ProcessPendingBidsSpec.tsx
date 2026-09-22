import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { Server } from 'mock-socket';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';

import { Me } from '@public/apiv2/APITypes';
import Endpoints from '@public/apiv2/Endpoints';
import HTTPUtils from '@public/apiv2/HTTPUtils';
import { setRoot } from '@public/apiv2/reducers/apiRoot';
import { trackerApi } from '@public/apiv2/reducers/trackerApi';
import { store } from '@public/apiv2/Store';

import { getFixtureMixedBidsFlat, getFixtureMixedBidsTree } from '@spec/fixtures/bid';
import { getFixturePagedEvent } from '@spec/fixtures/event';

import ProcessPendingBids from './ProcessPendingBids';

describe('ProcessPendingBids', () => {
  let subject: ReturnType<typeof render>;
  let mock: MockAdapter;
  let server: Server;
  let me: Me;
  let tree: ReturnType<typeof getFixtureMixedBidsTree>;
  const socketPath = `${window.location.origin.replace(/^http/, 'ws')}/ws/bid-processing/`;

  beforeEach(() => {
    store.dispatch(trackerApi.util.resetApiState());
    store.dispatch(setRoot({ root: '//testserver/', limit: 500, csrfToken: 'deadbeef' }));
    server = new Server(socketPath);
    mock = new MockAdapter(HTTPUtils.getInstance(), { onNoMatch: 'throwException' });
    me = { username: 'test', staff: true, superuser: false, permissions: ['tracker.view_bid'] };
    tree = getFixtureMixedBidsTree();
    mock.onGet('//testserver/' + Endpoints.ME).reply(() => [200, me]);
    mock.onGet('//testserver/' + Endpoints.EVENTS).reply(200, getFixturePagedEvent());
    mock.onGet(/bids/).reply(() => [200, tree]);
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await Promise.allSettled(store.dispatch(trackerApi.util.getRunningMutationsThunk()));
      store.dispatch(trackerApi.util.resetApiState());
    });
    server.stop();
    mock.restore();
  });

  async function renderPage(eventId = '1') {
    subject = render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[`/v2/${eventId}/processing/bids`]}>
          <Routes>
            <Route path="/v2/:eventId/processing/bids" element={<ProcessPendingBids />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    await subject.findByText('Socket Connected');
    await subject.findByTestId('bid-124');
    await act(async () => {
      await Promise.allSettled(store.dispatch(trackerApi.util.getRunningQueriesThunk()));
    });
    await waitFor(() => {
      if ((subject.getByRole('button', { name: 'Refresh pending bids' }) as HTMLButtonElement).disabled) {
        throw new Error('Still fetching');
      }
    });
  }

  it('shows pending options with parent context and respects permissions', async () => {
    await renderPage();
    expect(subject.getByText('Naming Incentive')).not.toBeNull();
    expect(subject.getByText('Max Option Length: 12')).not.toBeNull();
    expect(subject.queryByTestId('bid-123')).toBeNull();
    expect(subject.queryByRole('button', { name: 'Accept bid' })).toBeNull();
    expect(subject.getByText('1 pending option')).not.toBeNull();
  });

  it('filters the queue by option or parent name', async () => {
    await renderPage();
    fireEvent.change(subject.getByLabelText('Search pending bids'), { target: { value: 'absent' } });
    expect(subject.getByText('No matching pending bids.')).not.toBeNull();
    fireEvent.change(subject.getByLabelText('Search pending bids'), { target: { value: 'naming' } });
    expect(subject.getByTestId('bid-124')).not.toBeNull();
  });

  for (const permission of ['tracker.approve_bid', 'tracker.change_bid'] as const) {
    for (const action of ['accept', 'deny'] as const) {
      it(`${action}s bids with ${permission} and records the completed action`, async () => {
        me.permissions.push(permission);
        await renderPage();
        const response = getFixtureMixedBidsFlat().results.find(bid => bid.id === 124)!;
        mock.onPatch(action === 'accept' ? Endpoints.APPROVE_BID(124) : Endpoints.DENY_BID(124)).reply(200, {
          ...response,
          state: action === 'accept' ? 'OPENED' : 'DENIED',
        });
        fireEvent.click(subject.getByTestId(`action-${action}`));
        expect(await subject.findByText(action === 'accept' ? 'Accepted' : 'Denied')).not.toBeNull();
        expect(subject.queryByTestId('bid-124')).toBeNull();
        expect(mock.history.patch.length).toBe(1);
      });
    }
  }

  it('keeps the row disabled during a request and restores it after failure', async () => {
    me.permissions.push('tracker.approve_bid');
    await renderPage();
    let finish!: (response: [number, object]) => void;
    mock.onPatch(Endpoints.APPROVE_BID(124)).reply(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    fireEvent.click(subject.getByTestId('action-accept'));
    const row = within(subject.getByTestId('bid-124'));
    expect((row.getByTestId('action-deny') as HTMLButtonElement).disabled).toBeTrue();
    expect(row.getByText('Saving...')).not.toBeNull();
    await act(async () => {
      finish([400, { detail: 'Cannot approve this bid.' }]);
    });
    expect(await subject.findByText('Cannot approve this bid.')).not.toBeNull();
    await waitFor(() => {
      if ((row.getByTestId('action-accept') as HTMLButtonElement).disabled) throw new Error('Still saving');
    });
    expect(subject.queryByText('Accepted')).toBeNull();
  });

  it('refreshes when another processor changes bids and ignores other events', async () => {
    await renderPage();
    const requests = mock.history.get.length;
    await act(async () => {
      server.emit('message', JSON.stringify({ type: 'bids_changed', event: 2 }));
    });
    expect(mock.history.get.length).toBe(requests);
    tree = getFixtureMixedBidsTree(undefined, undefined, undefined, undefined, [
      { ...tree.results[1].options![1], id: 125, state: 'PENDING', name: 'New option' },
    ]);
    await act(async () => {
      server.emit('message', JSON.stringify({ type: 'bids_changed', event: 1 }));
    });
    expect(await subject.findByText('New option')).not.toBeNull();
    tree = { count: 0, next: null, previous: null, results: [] };
    await act(async () => {
      server.emit('message', JSON.stringify({ type: 'bids_changed', event: 1 }));
    });
    expect(await subject.findByText('No pending bids.')).not.toBeNull();
  });

  it('supports all events and changes the selected event without keeping stale rows', async () => {
    await renderPage('@all');
    expect(subject.getByRole('heading', { name: 'All Events' })).not.toBeNull();
    tree = { count: 0, next: null, previous: null, results: [] };
    fireEvent.change(subject.getByLabelText('Event'), { target: { value: '1' } });
    expect(await subject.findByText('No pending bids.')).not.toBeNull();
    expect(subject.queryByTestId('bid-124')).toBeNull();
  });

  it('refreshes the all-events queue when any event changes', async () => {
    await renderPage('@all');
    tree = { count: 0, next: null, previous: null, results: [] };
    await act(async () => {
      server.emit('message', JSON.stringify({ type: 'bids_changed', event: 2 }));
    });
    expect(await subject.findByText('No pending bids.')).not.toBeNull();
  });

  it('refetches the queue after the socket reconnects', async () => {
    await renderPage();
    tree = { count: 0, next: null, previous: null, results: [] };
    await act(async () => {
      server.close({ code: 1000, reason: 'Reconnecting', wasClean: true });
      server = new Server(socketPath);
    });
    expect(await subject.findByText('No pending bids.', {}, { timeout: 5000 })).not.toBeNull();
    expect(await subject.findByText('Socket Connected')).not.toBeNull();
  });

  it('allows a manual refresh after a failed fetch', async () => {
    await renderPage();
    mock.onGet(/bids/).reply(500, {});
    fireEvent.click(subject.getByRole('button', { name: 'Refresh pending bids' }));
    expect(await subject.findByTestId('api-errors')).not.toBeNull();
    tree = { count: 0, next: null, previous: null, results: [] };
    mock.onGet(/bids/).reply(() => [200, tree]);
    fireEvent.click(subject.getByRole('button', { name: 'Refresh pending bids' }));
    expect(await subject.findByText('No pending bids.')).not.toBeNull();
  });
});
