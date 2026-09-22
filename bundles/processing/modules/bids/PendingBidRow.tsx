import React from 'react';
import cn from 'classnames';
import { Anchor, Button, Stack, Text, useTooltip } from '@faulty/gdq-design';

import { useConstants } from '@common/Constants';
import { BidChild } from '@public/apiv2/APITypes';
import Approve from '@uikit/icons/Approve';
import Deny from '@uikit/icons/Deny';
import Exclamation from '@uikit/icons/Exclamation';

import styles from '../../pages/ProcessPendingBids.mod.css';

interface PendingBidRowProps {
  bid: BidChild;
  maxLength?: number | null;
  canProcess: boolean;
  isSaving: boolean;
  onAction: (bid: BidChild, action: 'accept' | 'deny') => Promise<void>;
}

export default function PendingBidRow({ bid, maxLength, canProcess, isSaving, onAction }: PendingBidRowProps) {
  const { ADMIN_ROOT } = useConstants();
  // Python's length validation counts Unicode code points, not UTF-16 code units.
  const nameLength = Array.from(bid.name).length;
  const isTooLong = maxLength != null && maxLength > 0 && nameLength > maxLength;
  const [acceptTooltip] = useTooltip<HTMLButtonElement>('Accept bid');
  const [denyTooltip] = useTooltip<HTMLButtonElement>('Deny bid');
  const accept = React.useCallback(() => onAction(bid, 'accept'), [bid, onAction]);
  const deny = React.useCallback(() => onAction(bid, 'deny'), [bid, onAction]);

  return (
    <div
      className={cn(styles.row, { [styles.overLimit]: isTooLong })}
      data-testid={`bid-${bid.id}`}
      aria-busy={isSaving}>
      <div className={styles.bidName}>
        <Anchor href={`${ADMIN_ROOT}bid/${bid.id}/change/`}>{bid.name}</Anchor>
        {isTooLong && (
          <Text variant="text-sm/warning" className={styles.lengthWarning}>
            <Exclamation aria-hidden="true" />
            <span>
              Too long: {nameLength}/{maxLength} characters
            </span>
          </Text>
        )}
      </div>
      <Text variant="text-sm/secondary" role="status">
        {isSaving ? 'Saving...' : 'Pending'}
      </Text>
      {canProcess && (
        <Stack direction="horizontal" wrap={false} className={styles.actions}>
          <Button
            {...acceptTooltip}
            aria-label="Accept bid"
            data-testid="action-accept"
            variant="success/outline"
            isDisabled={isSaving}
            onPress={accept}>
            <Approve />
          </Button>
          <Button
            {...denyTooltip}
            aria-label="Deny bid"
            data-testid="action-deny"
            variant="danger/outline"
            isDisabled={isSaving}
            onPress={deny}>
            <Deny />
          </Button>
        </Stack>
      )}
    </div>
  );
}
