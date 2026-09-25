import React from 'react';
import cn from 'classnames';

import { DonationPostBid, findBidInTree, TreeBid } from '@public/apiv2/APITypes';
import { useEventCurrency } from '@public/util/currency';
import Button from '@uikit/Button';
import Text from '@uikit/Text';

import { DonationFormEntry } from '@tracker/donation/validateDonation';

import styles from './DonationBids.mod.css';

type BidItemProps = {
  bid: DonationPostBid;
  bids: TreeBid[];
  onDelete: (bid: DonationPostBid) => void;
  onEdit: (bid: DonationPostBid) => void;
};

const BidItem = (props: BidItemProps) => {
  const { bid, bids, onDelete, onEdit } = props;
  const eventCurrency = useEventCurrency();

  const incentive = findBidInTree(bids, 'id' in bid ? bid.id : bid.parent)!;

  const handleDelete = React.useCallback(() => onDelete(bid), [bid, onDelete]);
  const handleEdit = React.useCallback(() => onEdit(bid), [bid, onEdit]);

  return (
    <div className={styles.bid}>
      <div className={styles.bidHeader}>
        <div>
          <Text size={Text.Sizes.SIZE_14} marginless>
            Choice: {`${incentive.full_name}${'name' in bid ? ` -- ${bid.name}` : ''}`}
          </Text>
        </div>
        <div className={styles.allocation}>
          <Text className={styles.bidAmount} size={Text.Sizes.SIZE_20} marginless>
            {eventCurrency(bid.amount)}
          </Text>
          <div className={styles.actions}>
            <Button
              size={Button.Sizes.SMALL}
              look={Button.Looks.OUTLINED}
              onClick={handleEdit}
              data-testid={`donationbid-edit-${'id' in bid ? bid.id : `${bid.parent}-custom`}`}>
              Edit Incentive
            </Button>
            <Button
              size={Button.Sizes.SMALL}
              onClick={handleDelete}
              data-testid={`donationbid-remove-${'id' in bid ? bid.id : `${bid.parent}-custom`}`}>
              Remove Bid
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

type DonationBidsProps = {
  bids: TreeBid[];
  className?: cn.Argument;
  donation: DonationFormEntry;
  deleteBid: (bid: DonationPostBid) => void;
  editBid: (bid: DonationPostBid) => void;
};

const DonationBids = (props: DonationBidsProps) => {
  const { bids, className, donation, deleteBid, editBid } = props;

  return bids.length > 0 ? (
    <div className={cn(styles.container, className)}>
      {donation.bids.map((bid, i) => (
        <BidItem key={i} bid={bid} bids={bids} onDelete={deleteBid} onEdit={editBid} />
      ))}
    </div>
  ) : (
    <></>
  );
};

export default DonationBids;
