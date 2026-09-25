from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from tracker.models import Event


class TestPayPalCancel(TestCase):
    def test_checkout_cancellation_returns_to_original_event(self):
        event = Event.objects.create(
            short='cancel-test',
            name='Cancellation Test',
            datetime=timezone.now(),
            receivername='Test Charity',
            paypalemail='charity@example.com',
            allow_donations=True,
        )
        response = self.client.post(
            reverse('tracker:api_v2:donate-list'),
            {
                'amount': 10,
                'event': event.pk,
                'bids': [],
                'comment': '',
                'email_optin': False,
                'requested_alias': '',
                'requested_email': '',
                'domain': 'PAYPAL',
            },
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        confirmation = self.client.post(response.json()['confirm_url'])
        self.assertEqual(confirmation.status_code, 200)
        cancellation = self.client.get(
            confirmation.context['form'].initial['cancel_return']
        )
        self.assertContains(
            cancellation, f'href="{reverse("tracker:ui:donate", args=(event.pk,))}"'
        )
        self.assertEqual(cancellation.context['event'], event)

    def test_missing_or_unknown_event_keeps_retry_available(self):
        for query in ({}, {'event': 'missing'}, {'event': 'https://example.com'}):
            with self.subTest(query=query):
                response = self.client.get(reverse('tracker:paypal_cancel'), query)
                self.assertContains(
                    response, f'href="{reverse("tracker:donate_current")}"'
                )
                self.assertContains(response, 'The transaction has been cancelled.')
