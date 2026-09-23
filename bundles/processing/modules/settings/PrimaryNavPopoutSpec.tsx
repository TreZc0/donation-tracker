import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { Provider } from 'react-redux';
import { act, cleanup, render } from '@testing-library/react';

import Constants, { DefaultConstants } from '@common/Constants';
import HTTPUtils from '@public/apiv2/HTTPUtils';
import { trackerApi } from '@public/apiv2/reducers/trackerApi';
import { store } from '@public/apiv2/Store';

import { AppContainer } from '@processing/Theming';

import { PrimaryNavPopout } from './PrimaryNavPopout';

describe('PrimaryNavPopout', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    store.dispatch(trackerApi.util.resetApiState());
    mock = new MockAdapter(HTTPUtils.getInstance());
    mock.onGet().reply(200, { username: 'test', staff: true, superuser: false, permissions: [] });
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await Promise.allSettled(store.dispatch(trackerApi.util.getRunningQueriesThunk()));
      store.dispatch(trackerApi.util.resetApiState());
    });
    mock.restore();
  });

  for (const publicRoot of ['/', '/tracker/', '/marathon/tracker/']) {
    it(`uses ${publicRoot} for public and self service links`, async () => {
      const subject = render(
        <Provider store={store}>
          <Constants.Provider
            value={{
              ...DefaultConstants,
              PUBLIC_ROOT: publicRoot,
              ROOT_PATH: '/admin/tracker/event/ui/',
              SWEEPSTAKES_URL: '/sweepstakes/',
            }}>
            <AppContainer theme="light" accent="blue">
              <PrimaryNavPopout eventId={3} />
            </AppContainer>
          </Constants.Provider>
        </Provider>,
      );
      await subject.findByText('test');

      const links = {
        Home: 'event/3',
        Runs: 'runs/3',
        Prizes: 'prizes/3',
        Bids: 'bids/3',
        Milestones: 'milestones/3',
        Donors: 'donors/3',
        Donations: 'donations/3',
        'All Events': '',
        'Self Service': 'user/index/',
        Logout: 'user/logout/',
      };
      for (const [name, path] of Object.entries(links)) {
        expect(subject.getByRole('link', { name }).getAttribute('href')).toBe(publicRoot + path);
      }
      expect(subject.getByRole('link', { name: 'Process Donations' }).getAttribute('href')).toBe(
        '/admin/tracker/event/ui/v2/3/processing/donations',
      );
    });
  }
});
