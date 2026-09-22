import React from 'react';
import { useParams } from 'react-router-dom';

import { useConstants } from '@common/Constants';
import Spinner from '@public/spinner';

export default function ProcessPendingBids() {
  const { eventId } = useParams();
  const { ROOT_PATH } = useConstants();
  React.useEffect(() => {
    window.location.replace(`${ROOT_PATH}v2/${eventId}/processing/bids`);
  }, [ROOT_PATH, eventId]);
  return <Spinner spinning />;
}
