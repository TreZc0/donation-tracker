from unittest import mock

from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import transaction
from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from django.utils import timezone

from tracker.consumers.bids import BidProcessingConsumer
from tracker.models import Bid, Event


class TestBidProcessingConsumer(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create(username='bid_moderator')
        self.user.user_permissions.add(Permission.objects.get(codename='view_bid'))
        self.event = Event.objects.create(
            short='event', name='Event', datetime=timezone.now()
        )
        self.parent = Bid.objects.create(
            name='Name', event=self.event, state='OPENED', allowuseroptions=True
        )
        self.option = Bid.objects.create(
            name='Pending', parent=self.parent, state='PENDING', istarget=True
        )

    def communicator(self):
        communicator = WebsocketCommunicator(
            BidProcessingConsumer.as_asgi(), '/tracker/ws/bid-processing/'
        )
        communicator.scope['user'] = self.user
        return communicator

    async def test_requires_view_bid_permission(self):
        await sync_to_async(self.user.user_permissions.clear)()
        communicator = self.communicator()
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def assert_change_received(self, change):
        communicator = self.communicator()
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        try:
            await sync_to_async(change)()
            self.assertEqual(
                await communicator.receive_json_from(),
                {'type': 'bids_changed', 'event': self.event.pk},
            )
        finally:
            await communicator.disconnect()

    async def test_new_option_broadcasts_to_bid_only_moderator(self):
        await self.assert_change_received(
            lambda: Bid.objects.create(
                name='New option', parent=self.parent, state='PENDING', istarget=True
            )
        )

    async def test_moderation_broadcasts(self):
        self.option.state = 'OPENED'
        await self.assert_change_received(self.option.save)

    async def test_rename_broadcasts(self):
        self.option.name = 'Renamed'
        await self.assert_change_received(self.option.save)

    async def test_deletion_broadcasts(self):
        await self.assert_change_received(self.option.delete)


class TestBidProcessingTransactions(TestCase):
    def setUp(self):
        self.event = Event.objects.create(
            short='event', name='Event', datetime=timezone.now()
        )

    @mock.patch('tracker.consumers.bids.get_channel_layer')
    def test_notifications_wait_for_commit(self, get_layer):
        get_layer.return_value.group_send = mock.AsyncMock()
        with self.captureOnCommitCallbacks(execute=True):
            Bid.objects.create(name='Name', event=self.event)
            get_layer.assert_not_called()
        get_layer.return_value.group_send.assert_awaited_once_with(
            'bid_processing', {'type': 'bids_changed', 'event': self.event.pk}
        )

    @mock.patch('tracker.consumers.bids.get_channel_layer')
    def test_rollback_does_not_notify(self, get_layer):
        with self.captureOnCommitCallbacks(execute=True):
            with transaction.atomic():
                Bid.objects.create(name='Name', event=self.event)
                transaction.set_rollback(True)
        get_layer.assert_not_called()

    @mock.patch('tracker.consumers.bids.get_channel_layer')
    def test_totals_only_save_does_not_notify(self, get_layer):
        bid = Bid.objects.create(name='Name', event=self.event)
        bid.count = 1
        bid.save_base(update_fields=['count'])
        with self.captureOnCommitCallbacks(execute=True):
            bid.count = 2
            bid.save_base(update_fields=['count'])
        get_layer.assert_not_called()

    @mock.patch('tracker.consumers.bids.get_channel_layer')
    def test_first_completed_donation_notifies(self, get_layer):
        get_layer.return_value.group_send = mock.AsyncMock()
        bid = Bid.objects.create(name='Name', event=self.event)
        with self.captureOnCommitCallbacks(execute=True):
            bid.count = 1
            bid.save_base(update_fields=['count'])
        get_layer.return_value.group_send.assert_awaited_once()

    @mock.patch('tracker.consumers.bids.get_channel_layer')
    def test_moving_events_notifies_both_queues(self, get_layer):
        get_layer.return_value.group_send = mock.AsyncMock()
        bid = Bid.objects.create(name='Name', event=self.event)
        other = Event.objects.create(short='other', datetime=timezone.now())
        with self.captureOnCommitCallbacks(execute=True):
            bid.event = other
            bid.save()
        get_layer.return_value.group_send.assert_has_awaits(
            [
                mock.call('bid_processing', {'type': 'bids_changed', 'event': other.pk}),
                mock.call('bid_processing', {'type': 'bids_changed', 'event': self.event.pk}),
            ]
        )

    def test_old_links_redirect_to_processing_app(self):
        user = get_user_model().objects.create_superuser('admin', password='test')
        self.client.force_login(user)
        for event_id in [str(self.event.pk), '@all']:
            for trailing in ['', '/']:
                with self.subTest(event_id=event_id, trailing=trailing):
                    response = self.client.get(
                        reverse(
                            'admin:tracker_ui',
                            kwargs={'extra': f'process_pending_bids/{event_id}{trailing}'},
                        )
                    )
                    self.assertRedirects(
                        response,
                        reverse(
                            'admin:tracker_ui',
                            kwargs={'extra': f'v2/{event_id}/processing/bids'},
                        ),
                        fetch_redirect_response=False,
                    )
