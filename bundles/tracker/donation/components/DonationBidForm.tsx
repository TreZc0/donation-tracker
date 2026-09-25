import React from 'react';
import cn from 'classnames';

import { compareBidChild, DonationPostBid, TreeBid } from '@public/apiv2/APITypes';
import { useEventFromRoute } from '@public/apiv2/hooks';
import { useCachedCallback } from '@public/hooks/useCachedCallback';
import { useEventCurrency } from '@public/util/currency';
import Button from '@uikit/Button';
import Checkbox from '@uikit/Checkbox';
import CurrencyInput from '@uikit/CurrencyInput';
import ErrorAlert from '@uikit/ErrorAlert';
import Header from '@uikit/Header';
import ProgressBar from '@uikit/ProgressBar';
import Text from '@uikit/Text';
import TextInput from '@uikit/TextInput';

import { DonationFormEntry } from '@tracker/donation/validateDonation';

import remainingAmount from '../remainingAmount';
import validateBid from '../validateBid';

import styles from './DonationBidForm.mod.css';

type DonationBidFormProps = {
  bids: TreeBid[];
  incentiveId: number;
  donation: DonationFormEntry;
  className?: cn.Argument;
  onSubmit: (bid: DonationPostBid) => void;
  initialBid?: DonationPostBid;
  onCancel: () => void;
};

const DonationBidForm = (props: DonationBidFormProps) => {
  const { bids, incentiveId, className, onSubmit, donation, initialBid, onCancel } = props;
  const { data } = useEventFromRoute();
  const event = data!;

  const eventCurrency = useEventCurrency();

  const availableDonation = React.useMemo(
    () => ({ ...donation, bids: donation.bids.filter(bid => bid !== initialBid) }),
    [donation, initialBid],
  );
  const remainingDonationTotal = Math.max(0, remainingAmount(availableDonation));
  const remainingDonationTotalString = eventCurrency(remainingDonationTotal);

  const [allocatedAmount, setAllocatedAmount] = React.useState(initialBid?.amount ?? remainingDonationTotal);
  const [selectedChoiceId, setSelectedChoiceId] = React.useState<number | null>(
    initialBid && 'id' in initialBid ? initialBid.id : null,
  );
  const [customOptionSelected, setCustomOptionSelected] = React.useState(initialBid != null && 'name' in initialBid);
  const [customOption, setCustomOption] = React.useState(initialBid && 'name' in initialBid ? initialBid.name : '');

  const incentive = bids.find(b => b.id === incentiveId)!;
  const option = incentive.options?.find(o => o.id === selectedChoiceId) ?? null;

  const currentBid = React.useMemo((): DonationPostBid | null => {
    return incentive.options == null || customOptionSelected || selectedChoiceId != null
      ? {
          ...(customOptionSelected
            ? { parent: incentiveId, name: customOption }
            : { id: incentive.options ? selectedChoiceId! : incentiveId }),
          amount: allocatedAmount,
        }
      : null;
  }, [allocatedAmount, customOption, customOptionSelected, incentive.options, incentiveId, selectedChoiceId]);

  const bidValidation = React.useMemo(
    () => (currentBid ? validateBid(event.paypalcurrency, currentBid, incentive, availableDonation, option) : null),
    [event.paypalcurrency, currentBid, incentive, availableDonation, option],
  );

  const handleNewChoice = useCachedCallback(choiceId => {
    setSelectedChoiceId(choiceId);
    setCustomOptionSelected(choiceId == null);
  }, []);

  const handleSubmitBid = React.useCallback(() => {
    if (currentBid && bidValidation == null) {
      onSubmit(currentBid);
    }
  }, [onSubmit, currentBid, bidValidation]);

  const fullGoal = incentive?.goal != null ? incentive.goal + (incentive.chain_remaining ?? 0) : 0;
  const header = incentive.full_name.includes(' -- ')
    ? incentive.full_name.split(' -- ').slice(0, -1).join(' -- ')
    : '';

  return (
    <div className={cn(styles.container, className)}>
      {header && <Header size={Header.Sizes.H4}>{header}</Header>}
      <Header size={Header.Sizes.H5}>{incentive.name}</Header>
      <Text size={Text.Sizes.SIZE_14}>{incentive.description}</Text>
      {incentive.accepted_number && incentive.accepted_number > 1 && (
        <Text size={Text.Sizes.SIZE_14}>Top {incentive.accepted_number} options will be used!</Text>
      )}

      {incentive.goal &&
        (incentive.repeat ? (
          <>
            <Text>
              {`Repeats every ${eventCurrency(incentive.repeat)}! Only ${eventCurrency(incentive.repeat - (incentive.total % incentive.repeat))} to reach the next goal!`}
              <ProgressBar progress={((incentive.total % incentive.repeat) / incentive.repeat) * 100} />
              Total Raised: <span>{eventCurrency(incentive.total)}</span>
            </Text>
          </>
        ) : (
          <>
            {incentive.chain &&
              `${eventCurrency(Math.min(incentive.total, incentive.goal))} / ${eventCurrency(incentive.goal)}`}
            <ProgressBar className={styles.progressBar} progress={(incentive.total / incentive.goal) * 100} />
            {incentive.chain_steps?.map(step => (
              <React.Fragment key={step.id}>
                <Text size={Text.Sizes.SIZE_12}>{step.name}</Text>
                {`${eventCurrency(Math.min(step.total, step.goal))} / ${eventCurrency(step.goal)}`}
                <ProgressBar className={styles.progressBar} progress={(step.total / step.goal) * 100} />
              </React.Fragment>
            ))}
            <Text marginless>
              Total Raised: <span>{`${eventCurrency(incentive.total)} / ${eventCurrency(fullGoal)}`}</span>
            </Text>
          </>
        ))}

      <CurrencyInput
        value={allocatedAmount}
        name="incentiveBidAmount"
        label="Amount to put towards incentive"
        currency={event.paypalcurrency}
        hint={
          <React.Fragment>
            You have <strong>{remainingDonationTotalString}</strong> available for this incentive.
          </React.Fragment>
        }
        onChange={setAllocatedAmount}
        min={0}
        // Validate the balance below: a changing input maximum can crash ReactNumeric
        // while the donation total is being edited. Keep the draft amount intact.
      />

      {incentive.options?.toSorted(compareBidChild).map(option => (
        <Checkbox
          key={option.id}
          checked={selectedChoiceId === option.id}
          contentClassName={styles.choiceLabel}
          look={Checkbox.Looks.DENSE}
          onChange={handleNewChoice(option.id)}>
          <Checkbox.Header>{option.name}</Checkbox.Header>
          <span className={styles.choiceAmount}>{eventCurrency(option.total)}</span>
        </Checkbox>
      ))}

      {incentive.allowuseroptions && (
        <>
          <Checkbox
            label="Nominate a new option!"
            name="incentiveBidNewOption"
            checked={customOptionSelected}
            look={Checkbox.Looks.DENSE}
            onChange={handleNewChoice(null)}
          />
          {customOptionSelected && (
            <TextInput
              value={customOption}
              name="incentiveBidCustomOption"
              placeholder="Enter Option Here"
              onChange={setCustomOption}
              maxLength={incentive.option_max_length ?? undefined}
            />
          )}
        </>
      )}

      <ErrorAlert errors={bidValidation} />

      <Button
        disabled={currentBid == null || bidValidation != null}
        fullwidth
        onClick={handleSubmitBid}
        data-testid="incentiveBidForm-submitBid">
        {initialBid ? 'Save Changes' : 'Add'}
      </Button>
      <Button look={Button.Looks.OUTLINED} fullwidth onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
};

export default DonationBidForm;
