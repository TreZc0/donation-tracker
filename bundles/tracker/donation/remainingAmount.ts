import type { DonationFormEntry } from './validateDonation';

// Do arithmetic in cents so the input value and validation use the same balance.
export default function remainingAmount(donation: DonationFormEntry): number {
  const allocatedCents = donation.bids.reduce((total, bid) => total + Math.round(bid.amount * 100), 0);
  return (Math.round((donation.amount ?? 0) * 100) - allocatedCents) / 100;
}
