import React from 'react';
import cn from 'classnames';

import { DonationPostBid, TreeBid } from '@public/apiv2/APITypes';
import { useCachedCallback } from '@public/hooks/useCachedCallback';
import Button from '@uikit/Button';
import Clickable from '@uikit/Clickable';
import Header from '@uikit/Header';
import Text from '@uikit/Text';
import TextInput from '@uikit/TextInput';

import { DonationFormEntry } from '@tracker/donation/validateDonation';

import remainingAmount from '../remainingAmount';
import DonationBidForm from './DonationBidForm';
import DonationBids from './DonationBids';

import styles from './DonationIncentives.mod.css';

type DonationIncentivesProps = {
  bids: TreeBid[];
  donation: DonationFormEntry;
  addBid: (bid: DonationPostBid) => void;
  deleteBid: (bid: DonationPostBid) => void;
  editBid: (original: DonationPostBid, replacement: DonationPostBid) => void;
  className?: cn.Argument;
};

const DonationIncentives = (props: DonationIncentivesProps) => {
  const { addBid, className, bids, donation, deleteBid, editBid } = props;

  const [search, setSearch] = React.useState('');
  const [selectedIncentiveId, setSelectedIncentiveId] = React.useState<number | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [editingBid, setEditingBid] = React.useState<DonationPostBid | null>(null);
  const setShowFormTrue = React.useCallback(() => setShowForm(true), []);
  const findIncentive = React.useCallback(
    (bid: DonationPostBid) =>
      bids.find(incentive =>
        'parent' in bid
          ? incentive.id === bid.parent
          : incentive.id === bid.id || incentive.options?.some(option => option.id === bid.id),
      ),
    [bids],
  );
  const assignedIds = new Set(donation.bids.map(bid => findIncentive(bid)?.id));
  const availableIncentives = bids.filter(bid => !assignedIds.has(bid.id));
  const searchResults = availableIncentives.filter(b => b.full_name.includes(search));
  const canAddBid = remainingAmount(donation) > 0 && availableIncentives.length > 0;

  const closeForm = React.useCallback(() => {
    setSelectedIncentiveId(null);
    setEditingBid(null);
    setShowForm(false);
  }, []);

  const handleEditBid = React.useCallback(
    (bid: DonationPostBid) => {
      const incentive = findIncentive(bid);
      if (incentive) {
        setEditingBid(bid);
        setSelectedIncentiveId(incentive.id);
        setShowForm(true);
      }
    },
    [findIncentive],
  );

  const handleDeleteBid = React.useCallback(
    (bid: DonationPostBid) => {
      if (bid === editingBid) closeForm();
      deleteBid(bid);
    },
    [editingBid, closeForm, deleteBid],
  );

  const handleSubmitBid = React.useCallback(
    (bid: DonationPostBid) => {
      if (editingBid) {
        editBid(editingBid, bid);
      } else {
        addBid(bid);
      }
      closeForm();
    },
    [addBid, editBid, editingBid, closeForm],
  );

  const selectIncentive = useCachedCallback(resultId => setSelectedIncentiveId(resultId), []);

  return (
    <div className={cn(className)}>
      <DonationBids
        className={styles.bids}
        bids={bids}
        donation={donation}
        deleteBid={handleDeleteBid}
        editBid={handleEditBid}
      />

      {editingBid && selectedIncentiveId != null && (
        <DonationBidForm
          key={`edit-${donation.bids.indexOf(editingBid)}`}
          bids={bids}
          incentiveId={selectedIncentiveId}
          donation={donation}
          initialBid={editingBid}
          onSubmit={handleSubmitBid}
          onCancel={closeForm}
        />
      )}
      {!editingBid &&
        (showForm ? (
          <div className={styles.incentives}>
            <div className={styles.left}>
              <TextInput value={search} onChange={setSearch} name="filter" placeholder="Filter Incentives" marginless />
              <div className={styles.results}>
                {searchResults.map(result => (
                  <Clickable
                    className={cn(styles.result, {
                      [styles.resultSelected]: selectedIncentiveId === result.id,
                    })}
                    key={result.id}
                    onClick={selectIncentive(result.id)}
                    data-testid={`incentiveform-incentive-${result.id}`}>
                    {result.full_name.includes(' -- ') && (
                      <Header size={Header.Sizes.H5} marginless oneline>
                        {result.full_name.split(' -- ').slice(0, -1).join(' -- ')}
                      </Header>
                    )}
                    <Text size={Text.Sizes.SIZE_14} marginless oneline>
                      {result.name}
                      {result.chain_steps && ` (${result.chain_steps.length + 1} steps)`}
                    </Text>
                  </Clickable>
                ))}
                {searchResults.length === 0 && <Text>No incentives available.</Text>}
              </div>
              {selectedIncentiveId == null && (
                <Button look={Button.Looks.OUTLINED} onClick={closeForm}>
                  Cancel
                </Button>
              )}
            </div>

            {selectedIncentiveId != null ? (
              <DonationBidForm
                key={selectedIncentiveId} // reset the form if the incentive changes
                bids={bids}
                className={styles.right}
                incentiveId={selectedIncentiveId}
                donation={donation}
                onSubmit={handleSubmitBid}
                onCancel={closeForm}
              />
            ) : (
              <div className={styles.right} />
            )}
          </div>
        ) : (
          <Button
            disabled={!canAddBid}
            look={Button.Looks.OUTLINED}
            fullwidth
            onClick={setShowFormTrue}
            data-testid="addincentives-button">
            {donation.bids.length > 0 ? 'Add Another Incentive' : 'Add Incentives'}
          </Button>
        ))}
    </div>
  );
};

export default DonationIncentives;
